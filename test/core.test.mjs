import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { defineConfig } from "@stzhu/oxlint-config";
import { coreStyle } from "@stzhu/oxlint-config/core";
import node from "@stzhu/oxlint-config/node";
import react, { reactRefresh, reactStyle } from "@stzhu/oxlint-config/react";
import reactWeb from "@stzhu/oxlint-config/react-web";
import vitest, { vitestStyle } from "@stzhu/oxlint-config/vitest";

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

test("core accepts existing filenames, function declarations, arrays and type imports", () => {
  const files = {
    "Values.ts":
      "export const example = ['hello']; export type Values = Array<string>; export function size(values: Values) { return values.length; }",
    "consumer.ts":
      "import { example, type Values } from './Values.js';\n\nexport const result: Values = example;",
  };
  assert.deepEqual(lint(defineConfig(), files), []);

  const diagnostics = lint(defineConfig({ extends: [coreStyle] }), files);
  assert.ok(hasRule(diagnostics, "array-type"));
  assert.ok(hasRule(diagnostics, "consistent-type-specifier-style"));
  assert.ok(hasRule(diagnostics, "filename-case"));
  assert.ok(hasRule(diagnostics, "func-style"));
});

test("core accepts common syntax in framework callbacks and service classes", () => {
  const files = {
    "service.ts":
      "export class Service { constructor(private readonly id: string) {} public getId() { return this.id; } public getVersion() { return 'v1'; } } export const plugins = ['read'].map(function (name) { return name.length; }); export const version = async () => { return 'v1'; };",
  };
  assert.deepEqual(lint(defineConfig(), files), []);

  const diagnostics = lint(defineConfig({ extends: [coreStyle] }), files);
  assert.ok(hasRule(diagnostics, "parameter-properties"));
  assert.ok(hasRule(diagnostics, "class-methods-use-this"));
  assert.ok(hasRule(diagnostics, "func-names"));
  assert.ok(hasRule(diagnostics, "prefer-arrow-callback"));
  assert.ok(hasRule(diagnostics, "arrow-body-style"));
  assert.ok(hasRule(diagnostics, "require-await"));
});

test("web accepts ID lookups and single-line guards unless core style is enabled", () => {
  const files = {
    "main.ts":
      "const root = document.getElementById('root');\nif (!root) throw new Error('Missing root');\nexport { root };\n",
  };
  assert.deepEqual(lint(defineConfig({ extends: [reactWeb] }), files), []);

  const diagnostics = lint(
    defineConfig({ extends: [reactWeb, coreStyle] }),
    files
  );
  assert.ok(hasRule(diagnostics, "curly"));
  assert.ok(hasRule(diagnostics, "prefer-query-selector"));
});

test("core requires return await where a rejection would bypass the catch", () => {
  const files = {
    "tsconfig.json": JSON.stringify({
      compilerOptions: { strict: true, target: "ES2022" },
      include: ["*.ts"],
    }),
    "forward.ts":
      "export async function forward() { await Promise.resolve(); return Promise.resolve('ready'); }\n",
    "catch-rejection.ts":
      "export async function recover(load: () => Promise<string>) { try { return load(); } catch { return 'fallback'; } }\n",
    "await-rejection.ts":
      "export async function recover(load: () => Promise<string>) { try { return await load(); } catch { return 'fallback'; } }\n",
  };
  const options = { typeAware: true };
  const returnAwaitFiles = (presets) =>
    lint(defineConfig({ extends: presets, options }), files)
      .filter((diagnostic) => diagnostic.code?.includes("(return-await)"))
      .map((diagnostic) => diagnostic.filename)
      .toSorted();

  assert.deepEqual(returnAwaitFiles([]), ["catch-rejection.ts"]);
  assert.deepEqual(returnAwaitFiles([coreStyle]), [
    "catch-rejection.ts",
    "forward.ts",
  ]);
});

test("core allows decorated modules and async handlers while Express 4 checks remain available", () => {
  const files = {
    "links-module.ts":
      "declare const Module: () => ClassDecorator; @Module() export class LinksModule {}",
    "empty.ts": "export class Empty {}",
    "fastify-routes.ts":
      "import fastify from 'fastify';\n\nconst app = fastify(); app.get('/', { schema: {} }, async function (request) { return request.query; });",
    "express-routes.ts":
      "import express from 'express';\n\ndeclare const repository: { load: (id: string) => Promise<string> }; const app = express(); app.get('/', async (request, response) => { const body = await repository.load(request.params.id); response.send(body); });",
  };
  const diagnostics = lint(defineConfig(), files);
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].filename, "empty.ts");
  assert.ok(hasRule(diagnostics, "no-extraneous-class"));

  const express = lint(
    defineConfig({ rules: { "oxc/no-async-endpoint-handlers": "error" } }),
    { "express-routes.ts": files["express-routes.ts"] }
  );
  assert.ok(hasRule(express, "no-async-endpoint-handlers"));
});

test("typed core leaves runtime decorator tokens as value imports and checks empty imports", () => {
  const diagnostics = lint(defineConfig({ options: { typeAware: true } }), {
    "tsconfig.json": JSON.stringify({
      compilerOptions: {
        strict: true,
        target: "ES2022",
        module: "NodeNext",
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
      },
      include: ["*.ts"],
    }),
    "service.ts": "export class Service { public readonly version = 'v1'; }",
    "controller.ts":
      "import { Service } from './service.js';\n\nconst controller = (): ClassDecorator => (target) => target;\n\n@controller()\nexport class Controller { constructor(private readonly service: Service) {} public version() { return this.service.version; } }",
    "empty-import.ts":
      "import { type Service } from './service.js';\n\nexport const version = (service: Service) => service.version;",
  });
  assert.ok(!hasRule(diagnostics, "consistent-type-imports"));
  assert.ok(hasRule(diagnostics, "no-import-type-side-effects"));
});

test("native React allows both component forms and catches Hooks and Fast Refresh violations", () => {
  const config = defineConfig({ extends: [react, reactRefresh] });
  const valid = lint(config, {
    "app.tsx":
      "export function App() { return <div />; } export const Panel = () => <div />;",
  });
  assert.deepEqual(valid, []);
  const invalid = lint(config, {
    "app.tsx":
      "import { useState } from 'react'; export const App = () => { if (Math.random() > 0.5) { useState(0); } return <div />; }; export function helper() { return 1; }",
  });
  assert.ok(!hasRule(invalid, "function-component-definition"));
  assert.ok(hasRule(invalid, "rules-of-hooks"));
  assert.ok(hasRule(invalid, "only-export-components"));
});

test("React style restores JSX conventions and composes with core style", () => {
  const files = {
    "panel.tsx":
      "import React from 'react';\n\nexport const Panel = () => <React.Fragment><div aria-label={'panel'}></div><div /></React.Fragment>; export function App() { return <Panel />; }",
  };
  assert.deepEqual(lint(defineConfig({ extends: [reactWeb] }), files), []);

  const diagnostics = lint(
    defineConfig({ extends: [reactWeb, coreStyle, reactStyle] }),
    files
  );
  assert.ok(hasRule(diagnostics, "function-component-definition"));
  assert.ok(hasRule(diagnostics, "jsx-curly-brace-presence"));
  assert.ok(hasRule(diagnostics, "jsx-fragments"));
  assert.ok(hasRule(diagnostics, "self-closing-comp"));
  assert.ok(!hasRule(diagnostics, "func-style"));
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

test("Vitest makes naming, imports and suite grouping opt-in and scopes them to tests", () => {
  const source = "it('works', () => { expect(1).toBe(1); });";
  const files = { "sample.test.ts": source, "index.ts": source };
  assert.deepEqual(lint(defineConfig({ extends: [vitest] }), files), []);

  const diagnostics = lint(
    defineConfig({ extends: [vitest, vitestStyle] }),
    files
  );
  assert.ok(hasRule(diagnostics, "consistent-test-it"));
  assert.ok(hasRule(diagnostics, "prefer-importing-vitest-globals"));
  assert.ok(hasRule(diagnostics, "require-top-level-describe"));
  assert.ok(
    diagnostics.every((diagnostic) => diagnostic.filename === "sample.test.ts")
  );
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
  const options = { typeAware: true };
  const files = {
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
      "declare const save: () => Promise<void>; declare const reportError: (error: unknown) => void; export const button = <button onClick={() => { save().catch((error: unknown) => { reportError(error); }); }} />;",
    "supported.tsx":
      "declare const Action: (props: { action: () => Promise<void> }) => JSX.Element; export const button = <Action action={async () => { await Promise.resolve(); }} />;",
  };
  const diagnostics = lint(defineConfig({ options }), files);
  const promiseDiagnostics = diagnostics.filter((d) =>
    /no-floating-promises|no-misused-promises/u.test(d.code ?? "")
  );
  assert.deepEqual(promiseDiagnostics.map((d) => d.filename).toSorted(), [
    "handler.tsx",
    "thenable.ts",
    "voided.ts",
  ]);
  assert.ok(
    diagnostics.every((diagnostic) => diagnostic.filename !== "safe.tsx")
  );

  const styleDiagnostics = lint(
    defineConfig({ extends: [coreStyle], options }),
    files
  );
  assert.ok(
    hasRule(
      styleDiagnostics.filter(
        (diagnostic) => diagnostic.filename === "safe.tsx"
      ),
      "prefer-await-to-callbacks"
    )
  );
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
