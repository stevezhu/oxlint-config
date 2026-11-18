import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { defineConfig } from "@stzhu/oxlint-config";
import node from "@stzhu/oxlint-config/node";
import react, { reactRefresh } from "@stzhu/oxlint-config/react";
import reactWeb from "@stzhu/oxlint-config/react-web";
import vitest from "@stzhu/oxlint-config/vitest";

const require = createRequire(import.meta.url);
const { delimiter, dirname, join } = path;
const root = dirname(import.meta.dirname);
const oxlint = join(
  dirname(require.resolve("oxlint/package.json")),
  "bin/oxlint"
);

const lint = (config, files, flags = [], discover = false) => {
  const project = mkdtempSync(join(tmpdir(), "oxlint-config-core-"));
  try {
    writeFileSync(join(project, "package.json"), '{"type":"module"}');
    writeFileSync(
      join(project, "oxlint.config.mts"),
      `export default ${JSON.stringify(config)}`
    );
    for (const [filename, source] of Object.entries(files)) {
      mkdirSync(dirname(join(project, filename)), { recursive: true });
      writeFileSync(join(project, filename), source);
    }
    const result = spawnSync(
      process.execPath,
      [
        oxlint,
        ...(discover ? [] : ["--config", "oxlint.config.mts"]),
        "--format=json",
        "--ignore-pattern=oxlint.config.mts",
        ...flags,
        ".",
      ],
      {
        cwd: project,
        encoding: "utf-8",
        env: {
          ...process.env,
          PATH: `${join(root, "node_modules/.bin")}${delimiter}${process.env.PATH}`,
        },
      }
    );
    assert.ok(result.status === 0 || result.status === 1, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.ok(output.diagnostics, result.stdout);
    return output.diagnostics;
  } finally {
    rmSync(project, { force: true, recursive: true });
  }
};

const hasRule = (diagnostics, rule) =>
  diagnostics.some((diagnostic) => diagnostic.code?.includes(`(${rule})`));

test("core enforces native rules and preserves generated-file ignores", () => {
  const diagnostics = lint(defineConfig(), {
    "index.ts": "debugger;",
    "generated/ignored.ts": "debugger;",
    "dist/ignored.ts": "debugger;",
    "node_modules/ignored.ts": "debugger;",
  });
  assert.ok(hasRule(diagnostics, "no-debugger"));
  assert.ok(
    diagnostics.every((diagnostic) => diagnostic.filename === "index.ts")
  );
});

test("composition retains nested environments, globals, and ignore ordering", () => {
  const config = defineConfig({
    extends: [
      {
        extends: [node],
        globals: { PROJECT_GLOBAL: "readonly" },
        ignorePatterns: ["fixtures/**"],
      },
    ],
    ignorePatterns: ["!fixtures/keep.ts"],
    rules: { "no-undef": "error" },
  });
  assert.equal(config.env.node, true);
  assert.equal(config.globals.PROJECT_GLOBAL, "readonly");
  assert.deepEqual(config.ignorePatterns.slice(-2), [
    "fixtures/**",
    "!fixtures/keep.ts",
  ]);
  const diagnostics = lint(config, {
    "index.ts": "process.cwd(); PROJECT_GLOBAL; window.alert('browser');",
    "fixtures/ignored.ts": "debugger;",
    "fixtures/keep.ts": "debugger;",
  });
  const undefinedMessages = diagnostics.filter((diagnostic) =>
    diagnostic.code?.includes("(no-undef)")
  );
  assert.equal(undefinedMessages.length, 1);
  assert.match(undefinedMessages[0].message, /window/u);
  assert.ok(
    diagnostics.some((diagnostic) => diagnostic.filename === "fixtures/keep.ts")
  );
  assert.ok(
    !diagnostics.some(
      (diagnostic) => diagnostic.filename === "fixtures/ignored.ts"
    )
  );
});

test("root rules and matching overrides can customize inherited rules", () => {
  const diagnostics = lint(
    defineConfig({
      rules: { "no-debugger": "off" },
      overrides: [{ files: ["strict.ts"], rules: { "no-debugger": "error" } }],
    }),
    {
      "index.ts": "debugger;",
      "strict.ts": "debugger;",
    }
  );
  assert.equal(
    diagnostics.filter((diagnostic) =>
      diagnostic.code?.includes("(no-debugger)")
    ).length,
    1
  );
  assert.equal(
    diagnostics.find((diagnostic) => diagnostic.code?.includes("(no-debugger)"))
      .filename,
    "strict.ts"
  );
});

test("native React accepts declarations and catches arrow components and hook misuse", () => {
  const config = defineConfig({ extends: [react, reactRefresh] });
  const valid = lint(config, {
    "app.tsx": "export function App() { return <div />; }",
  });
  assert.deepEqual(valid, []);
  const invalid = lint(config, {
    "app.tsx":
      "import { useState } from 'react'; export const App = () => { if (Math.random() > 0.5) { useState(0); } return <div />; }; export function helper() { return 1; }",
  });
  assert.ok(hasRule(invalid, "function-component-definition"));
  assert.ok(hasRule(invalid, "rules-of-hooks"));
  assert.ok(hasRule(invalid, "only-export-components"));
});

test("Vitest rules apply only to test files, including JavaScript and __tests__", () => {
  const source =
    "import { test, expect } from 'vitest'; test.only('works', () => { expect(1).toBe(1); });";
  const diagnostics = lint(defineConfig({ extends: [vitest] }), {
    "index.ts": source,
    "index.test.js": source,
    "__tests__/nested.ts": source,
  });
  const focused = diagnostics.filter((diagnostic) =>
    diagnostic.code?.includes("(no-focused-tests)")
  );
  assert.equal(focused.length, 2);
  assert.ok(focused.every((diagnostic) => diagnostic.filename !== "index.ts"));
});

test("type-aware opt-in detects a floating promise through the installed runner", () => {
  const diagnostics = lint(defineConfig({ options: { typeAware: true } }), {
    "tsconfig.json": JSON.stringify({
      compilerOptions: { strict: true, target: "ES2022", module: "ESNext" },
      include: ["*.ts"],
    }),
    "index.ts": "export const run = () => { Promise.resolve(1); };",
  });
  assert.ok(hasRule(diagnostics, "no-floating-promises"));
});

test("circular configs fail clearly while shared presets remain reusable", () => {
  const circular = {};
  circular.extends = [circular];
  assert.throws(() => defineConfig(circular), /Circular/u);
  assert.doesNotThrow(() => defineConfig({ extends: [node, node] }));
});

test("typed promise policy checks void, thenables, JSX and safe error handlers", () => {
  const diagnostics = lint(defineConfig({ options: { typeAware: true } }), {
    "tsconfig.json": JSON.stringify({
      compilerOptions: {
        strict: true,
        target: "ES2022",
        module: "ESNext",
        jsx: "preserve",
      },
      include: ["*.ts", "*.tsx"],
    }),
    "types.d.ts":
      "declare namespace JSX { type Element = { readonly kind?: 'jsx' }; interface IntrinsicElements { button: { onClick: () => void }; } }",
    "voided.ts":
      "export const run = () => { void Promise.reject(new Error('failure')); };",
    "thenable.ts":
      "declare const pending: PromiseLike<void>; export const run = () => { pending; };",
    "handler.tsx":
      "export const button = <button onClick={async () => { await Promise.resolve(); }} />;",
    "safe.tsx":
      "declare const save: () => Promise<void>; declare const reportError: (error: unknown) => void; export const button = <button onClick={() => { save().catch(reportError); }} />;",
    "supported.tsx":
      "declare const Action: (props: { action: () => Promise<void> }) => JSX.Element; export const button = <Action action={async () => { await Promise.resolve(); }} />;",
  });
  const promiseDiagnostics = diagnostics.filter((d) =>
    /no-floating-promises|no-misused-promises/u.test(d.code ?? "")
  );
  assert.deepEqual(promiseDiagnostics.map((d) => d.filename).toSorted(), [
    "handler.tsx",
    "thenable.ts",
    "voided.ts",
  ]);
});

test("Vitest preserves typed assignment checks and later fixture overrides", () => {
  const config = defineConfig({
    extends: [vitest],
    options: { typeAware: true },
    overrides: [
      {
        files: ["fixture.test.ts"],
        rules: { "typescript/no-unsafe-assignment": "off" },
      },
    ],
  });
  const source =
    "declare const input: any; export const output: string = input;";
  const diagnostics = lint(config, {
    "tsconfig.json": JSON.stringify({
      compilerOptions: { strict: true },
      include: ["*.ts"],
    }),
    "application.test.ts": source,
    "fixture.test.ts": source,
  });
  assert.deepEqual(
    diagnostics
      .filter((d) => d.code?.includes("(no-unsafe-assignment)"))
      .map((d) => d.filename),
    ["application.test.ts"]
  );
});

test("React web selects browser globals and DOM accessibility independently", () => {
  const files = {
    "view.jsx":
      "window.alert('hello'); export function View() { return <img />; }",
  };
  const shared = lint(
    defineConfig({ extends: [react], rules: { "no-undef": "error" } }),
    files
  );
  const web = lint(
    defineConfig({ extends: [reactWeb], rules: { "no-undef": "error" } }),
    files
  );
  assert.ok(hasRule(shared, "no-undef"));
  assert.ok(!hasRule(shared, "alt-text"));
  assert.ok(!hasRule(web, "no-undef"));
  assert.ok(hasRule(web, "alt-text"));
});

test("core permits semantic grouping, comments and sequential operations", () => {
  const diagnostics = lint(defineConfig(), {
    "operations.ts":
      "export const options = { zebra: 1, alpha: 2 }; // Grouped by purpose\n// TODO: retry policy\nexport const run = async () => { for (let i = 0; i < 2; i++) { await Promise.resolve(i); } [1, 2].forEach((value) => { options.zebra += value; }); return [1, 2].reduce((sum, value) => sum + value, 0); };",
  });
  assert.deepEqual(diagnostics, []);
});

test("nested workspace configs retain root typed policy and independent runtimes", () => {
  const child = defineConfig({
    extends: [reactWeb],
    rules: { "no-undef": "error" },
  });
  const diagnostics = lint(
    defineConfig({
      extends: [node],
      options: { typeAware: true, reportUnusedDisableDirectives: "error" },
      rules: { "no-undef": "error" },
    }),
    {
      "tsconfig.json": JSON.stringify({
        compilerOptions: { strict: true, target: "ES2022" },
        include: ["**/*.ts"],
      }),
      "server.ts":
        "window.alert('invalid'); export const run = () => { Promise.resolve(1); };",
      "web/oxlint.config.mts": `export default ${JSON.stringify(child)}`,
      "web/client.ts":
        "window.alert('valid'); export const run = () => { Promise.resolve(1); };",
    },
    [],
    true
  );
  assert.deepEqual(
    diagnostics
      .filter((d) => d.code?.includes("(no-undef)"))
      .map((d) => d.filename),
    ["server.ts"]
  );
  assert.equal(
    diagnostics.filter((d) => d.code?.includes("(no-floating-promises)"))
      .length,
    2
  );
});

test("root option rejects stale suppressions", () => {
  const config = defineConfig({
    options: { reportUnusedDisableDirectives: "error" },
  });
  const diagnostics = lint(config, {
    "stale.ts":
      "// oxlint-disable-next-line no-debugger\nexport const value = 1;",
    "needed.ts": "// oxlint-disable-next-line no-debugger\ndebugger;",
  });
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].filename, "stale.ts");
  assert.equal(diagnostics[0].severity, "error");
});
