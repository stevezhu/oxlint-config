import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
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

const createProject = (context, files, tailwindRoots = ["."]) => {
  const directory = mkdtempSync(path.join(tmpdir(), "stzhu-plugins-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const modules = path.join(directory, "node_modules");
  const sharedPackage = path.join(modules, "@stzhu/oxlint-config");
  mkdirSync(sharedPackage, { recursive: true });
  // Only expose the files included in the published package to config discovery.
  copyFileSync(
    path.join(repository, "package.json"),
    path.join(sharedPackage, "package.json")
  );
  symlinkSync(
    path.join(repository, "dist"),
    path.join(sharedPackage, "dist"),
    "junction"
  );
  for (const root of tailwindRoots) {
    const tailwindModules = path.join(directory, root, "node_modules");
    mkdirSync(tailwindModules, { recursive: true });
    symlinkSync(
      path.join(repository, "node_modules/tailwindcss"),
      path.join(tailwindModules, "tailwindcss"),
      "junction"
    );
  }
  mkdirSync(path.join(modules, "@types"), { recursive: true });
  symlinkSync(
    path.join(repository, "node_modules/@types/node"),
    path.join(modules, "@types/node"),
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

  return directory;
};

const runLint = (directory, args) => {
  const result = spawnSync(
    process.execPath,
    [oxlint, "--format=json", ...args],
    {
      cwd: directory,
      encoding: "utf-8",
      env: {
        ...process.env,
        PATH: `${path.join(repository, "node_modules/.bin")}${path.delimiter}${process.env.PATH ?? ""}`,
      },
    }
  );
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.ok(result.status === 0 || result.status === 1, result.stderr);
  assert.match(result.stdout, /^\s*\{/u, result.stdout);
  return { status: result.status, ...JSON.parse(result.stdout) };
};

const fixture = (context, preset, files, settings = {}) => {
  const config = { ...preset, settings };
  const directory = createProject(context, {
    ...files,
    "oxlint.config.mts": `export default ${JSON.stringify(config)};`,
  });

  return (file) => {
    const output = runLint(directory, [file]);
    assert.equal(output.number_of_files, 1);
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

const assertWorkspacePolicy = (output, roots) => {
  assert.equal(output.status, 1);
  assert.equal(
    output.diagnostics.length,
    roots.length * 3,
    JSON.stringify(output.diagnostics)
  );
  const diagnostics = output.diagnostics.map((diagnostic) => ({
    ...diagnostic,
    filename: diagnostic.filename.replaceAll("\\", "/"),
  }));
  const filesForRule = (rule) =>
    diagnostics
      .filter((diagnostic) => diagnostic.code === rule)
      .map((diagnostic) => diagnostic.filename)
      .toSorted();
  assert.deepEqual(
    filesForRule("better-tailwindcss(no-unknown-classes)"),
    roots.map((root) => `${root}src/foreign.tsx`)
  );
  assert.deepEqual(
    filesForRule("typescript(no-floating-promises)"),
    roots.map((root) => `${root}src/promise.ts`)
  );
  assert.deepEqual(
    diagnostics
      .filter(
        (diagnostic) =>
          /unused .*directive/iu.test(diagnostic.message) &&
          diagnostic.severity === "error"
      )
      .map((diagnostic) => diagnostic.filename)
      .toSorted(),
    roots.map((root) => `${root}src/stale.ts`)
  );
};

test("monorepo lint applies each Tailwind theme and the root typed policy", (context) => {
  const workspaceConfig = `
    import { fileURLToPath } from "node:url";

    import { defineConfig } from "@stzhu/oxlint-config";
    import reactWeb from "@stzhu/oxlint-config/react-web";
    import tailwind from "@stzhu/oxlint-config/tailwind";

    export default defineConfig({
      extends: [reactWeb, tailwind],
      settings: {
        "better-tailwindcss": {
          cwd: import.meta.dirname,
          entryPoint: fileURLToPath(new URL("src/styles.css", import.meta.url)),
        },
      },
    });`;
  const files = {
    "oxlint.config.mts": `import { defineConfig } from "@stzhu/oxlint-config";

      export default defineConfig({
        options: { typeAware: true, reportUnusedDisableDirectives: "error" },
      });`,
    "tsconfig.json": JSON.stringify({
      compilerOptions: { strict: true, module: "NodeNext" },
      include: ["oxlint.config.mts"],
    }),
  };

  const workspaces = ["apps/admin", "apps/storefront"];
  for (const [color, foreign] of [
    ["admin", "storefront"],
    ["storefront", "admin"],
  ]) {
    const workspace = `apps/${color}`;
    files[`${workspace}/oxlint.config.mts`] = workspaceConfig;
    files[`${workspace}/tsconfig.json`] = JSON.stringify({
      compilerOptions: {
        strict: true,
        module: "NodeNext",
        jsx: "preserve",
        types: ["node"],
      },
      include: ["src", "jsx.d.ts", "oxlint.config.mts"],
    });
    files[`${workspace}/jsx.d.ts`] =
      "declare namespace JSX { type Element = { readonly kind?: 'jsx' }; interface IntrinsicElements { div: { className: string }; } }";
    files[`${workspace}/src/styles.css`] =
      `@import "tailwindcss"; @theme { --color-${color}: #123456; }`;
    files[`${workspace}/src/valid.tsx`] =
      `export function View() { return <div className="bg-${color}" />; }`;
    files[`${workspace}/src/foreign.tsx`] =
      `export function View() { return <div className="bg-${foreign}" />; }`;
    files[`${workspace}/src/promise.ts`] =
      "declare const pending: () => PromiseLike<void>; export const settle = () => { pending(); };";
    files[`${workspace}/src/stale.ts`] =
      "// oxlint-disable-next-line no-debugger\nexport const ready = true;";
  }

  const directory = createProject(context, files, workspaces);
  const clean = runLint(
    directory,
    workspaces.map((workspace) => `${workspace}/src/valid.tsx`)
  );
  assert.deepEqual(clean.diagnostics, []);
  assert.equal(clean.status, 0);

  assertWorkspacePolicy(
    runLint(directory, []),
    workspaces.map((workspace) => `${workspace}/`)
  );

  const workspaceRun = runLint(path.join(directory, "apps/storefront"), [
    "--type-aware",
    "--report-unused-disable-directives-severity=error",
  ]);
  assertWorkspacePolicy(workspaceRun, [""]);
});
