import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import lingui from "@stzhu/oxlint-config/lingui";
import storybook from "@stzhu/oxlint-config/storybook";
import tailwind from "@stzhu/oxlint-config/tailwind";
import turbo from "@stzhu/oxlint-config/turbo";

const require = createRequire(import.meta.url);
const repository = fileURLToPath(new URL("../", import.meta.url));
const oxlint = path.join(
  path.dirname(require.resolve("oxlint/package.json")),
  "bin/oxlint"
);

const fixture = (context, preset, files, settings = {}) => {
  const directory = mkdtempSync(path.join(tmpdir(), "stzhu-plugins-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  symlinkSync(
    path.join(repository, "node_modules"),
    path.join(directory, "node_modules"),
    "junction"
  );
  writeFileSync(
    path.join(directory, "package.json"),
    JSON.stringify({ name: "plugin-probe", private: true, type: "module" })
  );

  for (const [file, content] of Object.entries(files)) {
    const target = path.join(directory, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  }

  const config = { ...preset, settings };
  writeFileSync(
    path.join(directory, "oxlint.config.mts"),
    `export default ${JSON.stringify(config)};`
  );

  return (file) => {
    const result = spawnSync(
      process.execPath,
      [oxlint, "--format", "json", file],
      {
        cwd: directory,
        encoding: "utf-8",
        env: {
          ...process.env,
          PATH: `${path.join(repository, "node_modules/.bin")}${process.platform === "win32" ? ";" : ":"}${process.env.PATH ?? ""}`,
        },
      }
    );
    assert.equal(result.error, undefined);
    assert.equal(result.signal, null);
    assert.ok(result.status === 0 || result.status === 1, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.number_of_files, 1, result.stdout);
    assert.ok(
      output.diagnostics.every((diagnostic) => diagnostic.code),
      JSON.stringify(output.diagnostics)
    );
    return output.diagnostics.map((diagnostic) => diagnostic.code);
  };
};

test("Storybook recommended rules apply to stories and nested config files", (context) => {
  const lint = fixture(context, storybook, {
    "Button.stories.ts": "export const basic = {};",
    "Button.story.tsx": "export const basic = {};",
    "application.ts": "export const basic = {};",
    "Valid.stories.ts":
      "const meta = {}; export default meta; export const Basic = {};",
    "apps/web/.storybook/main.ts":
      'export default { addons: ["@storybook/addon-does-not-exist"] };',
    ".storybook/main.ts": "export default { addons: [] };",
  });

  for (const file of ["Button.stories.ts", "Button.story.tsx"]) {
    const codes = lint(file);
    assert.ok(codes.includes("storybook(default-exports)"));
    assert.ok(codes.includes("storybook(prefer-pascal-case)"));
  }
  assert.deepEqual(lint("application.ts"), []);
  assert.deepEqual(lint("Valid.stories.ts"), []);
  assert.deepEqual(lint(".storybook/main.ts"), []);
  assert.ok(
    lint("apps/web/.storybook/main.ts").includes(
      "storybook(no-uninstalled-addons)"
    )
  );
});

test("Lingui rejects translation calls outside functions", (context) => {
  const lint = fixture(context, lingui, {
    "invalid.ts":
      'import { t } from "@lingui/core/macro"; export const message = t`Hello!`;',
    "valid.ts":
      'import { t } from "@lingui/core/macro"; export const message = () => t`Hello!`;',
  });

  assert.ok(lint("invalid.ts").includes("lingui(t-call-in-function)"));
  assert.deepEqual(lint("valid.ts"), []);
});

test("Turbo reads the consumer turbo.json and checks environment dependencies", (context) => {
  const lint = fixture(context, turbo, {
    "package.json": JSON.stringify({ name: "turbo-probe", private: true }),
    "turbo.json": JSON.stringify({
      tasks: { build: { env: ["DECLARED_SECRET"] } },
    }),
    "invalid.ts": "export const secret = process.env.UNDECLARED_SECRET;",
    "valid.ts": "export const secret = process.env.DECLARED_SECRET;",
  });

  assert.ok(lint("invalid.ts").includes("turbo(no-undeclared-env-vars)"));
  assert.deepEqual(lint("valid.ts"), []);
});

test("Tailwind correctness rules use the consumer stylesheet", (context) => {
  const lint = fixture(
    context,
    tailwind,
    {
      "styles.css": '@import "tailwindcss"; @theme { --color-brand: #123456; }',
      "unknown.tsx":
        'export const View = () => <div className="flex unknown-utility" />;',
      "conflicting.tsx":
        'export const View = () => <div className="flex block" />;',
      "concatenated.tsx":
        'export const View = (shade: string) => <div className={"bg-" + shade} />;',
      "valid.tsx":
        'export const View = () => <div className="flex p-4 bg-brand" />;',
    },
    { "better-tailwindcss": { entryPoint: "./styles.css" } }
  );

  assert.ok(
    lint("unknown.tsx").includes("better-tailwindcss(no-unknown-classes)")
  );
  assert.ok(
    lint("conflicting.tsx").includes(
      "better-tailwindcss(no-conflicting-classes)"
    )
  );
  assert.ok(
    lint("concatenated.tsx").includes(
      "better-tailwindcss(no-concatenated-classes)"
    )
  );
  assert.deepEqual(lint("valid.tsx"), []);
});
