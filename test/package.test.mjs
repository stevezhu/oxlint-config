import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(
  readFileSync(path.join(root, "package.json"), "utf-8")
);

const run = (command, args, cwd) =>
  execFileSync(command, args, { cwd, encoding: "utf-8", stdio: "pipe" });

// Allow metadata requests on a fresh runner and reuse cached dependencies locally.
const install = (cwd) =>
  run(
    "pnpm",
    ["install", "--prefer-offline", "--ignore-scripts", "--no-frozen-lockfile"],
    cwd
  );

test("the packed package works in an isolated pnpm consumer", () => {
  // Keep the consumer outside the checkout so module resolution cannot fall
  // back to this repository's node_modules and hide missing dependencies.
  const directory = mkdtempSync(path.join(tmpdir(), "stzhu-oxlint-package-"));
  const artifacts = path.join(directory, "artifacts");
  const consumer = path.join(directory, "consumer");
  const writeConsumerFile = (filename, content) =>
    writeFileSync(path.join(consumer, filename), content);
  mkdirSync(artifacts);
  mkdirSync(consumer);

  try {
    run("pnpm", ["pack", "--pack-destination", artifacts], root);
    const archive = readdirSync(artifacts).find((file) =>
      file.endsWith(".tgz")
    );
    assert.ok(archive, "pnpm pack should produce a tarball");
    const consumerManifest = {
      private: true,
      packageManager: manifest.packageManager,
      scripts: { lint: "oxlint" },
      devDependencies: {
        [manifest.name]: `file:${path.join(artifacts, archive)}`,
        oxlint: manifest.devDependencies.oxlint,
        "oxlint-tsgolint": manifest.devDependencies["oxlint-tsgolint"],
        typescript: manifest.devDependencies.typescript,
      },
    };
    writeConsumerFile("package.json", JSON.stringify(consumerManifest));
    install(consumer);

    const consumerRequire = createRequire(path.join(consumer, "package.json"));
    const installedEntry = consumerRequire.resolve(manifest.name);
    assert.equal(
      existsSync(path.resolve(path.dirname(installedEntry), "../src")),
      false
    );
    assert.throws(
      () => consumerRequire.resolve("eslint-plugin-lingui"),
      { code: "MODULE_NOT_FOUND" },
      "the consumer should not need to install the transitive plugin directly"
    );
    assert.throws(
      () => consumerRequire.resolve("oxfmt"),
      { code: "MODULE_NOT_FOUND" },
      "the lint-only quickstart should work without Oxfmt"
    );

    // Match the README quickstart and exercise config discovery from the consumer.
    writeConsumerFile(
      "oxlint.config.mts",
      `import { defineConfig } from "@stzhu/oxlint-config";
import react from "@stzhu/oxlint-config/react-web";
import vitest from "@stzhu/oxlint-config/vitest";

export default defineConfig({
  extends: [react, vitest],
  ignorePatterns: ["vendor"],
  options: {
    typeAware: true,
    maxWarnings: 0,
    reportUnusedDisableDirectives: "error",
  },
});
`
    );
    writeConsumerFile(
      "tsconfig.json",
      JSON.stringify({
        compilerOptions: {
          target: "ES2023",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          strict: true,
          noEmit: true,
          types: [],
        },
        include: ["*.ts", "*.mts"],
      })
    );
    writeConsumerFile("alpha.ts", 'export const alpha = "alpha";\n');
    writeConsumerFile("zebra.ts", 'export const zebra = "zebra";\n');
    writeConsumerFile(
      "valid.ts",
      `import { zebra } from "./zebra.js";
import { alpha } from "./alpha.js";

declare const load: (message: string) => Promise<void>;
export const run = async () => {
  await load(alpha);
  await load(zebra);
};
`
    );
    mkdirSync(path.join(consumer, "vendor"));
    writeConsumerFile("vendor/ignored.ts", "debugger;\n");
    run("pnpm", ["lint"], consumer);
    run("pnpm", ["exec", "tsc", "-p", "tsconfig.json"], consumer);

    writeConsumerFile(
      "floating-promise.ts",
      `declare const load: () => Promise<void>;
export const run = () => {
  load();
};
`
    );
    const typedLint = spawnSync(
      "pnpm",
      ["exec", "oxlint", "floating-promise.ts", "--format=json"],
      { cwd: consumer, encoding: "utf-8" }
    );
    assert.equal(typedLint.status, 1, typedLint.stdout + typedLint.stderr);
    assert.deepEqual(
      JSON.parse(typedLint.stdout).diagnostics.map(({ code }) => code),
      ["typescript(no-floating-promises)"],
      "only a type-aware rule should catch the discarded return value"
    );
    rmSync(path.join(consumer, "floating-promise.ts"));

    writeConsumerFile(
      "package.json",
      JSON.stringify({
        ...consumerManifest,
        type: "module",
        scripts: {
          ...consumerManifest.scripts,
          "format:check": "oxfmt --check .",
          format: "oxfmt --write .",
        },
        devDependencies: {
          ...consumerManifest.devDependencies,
          oxfmt: manifest.devDependencies.oxfmt,
        },
      })
    );
    install(consumer);
    renameSync(
      path.join(consumer, "oxlint.config.mts"),
      path.join(consumer, "oxlint.config.ts")
    );
    writeConsumerFile(
      "oxfmt.config.ts",
      `import shared from "@stzhu/oxlint-config/oxfmt";
import { defineConfig } from "oxfmt";

export default defineConfig({ ...shared });
`
    );
    const format = spawnSync("pnpm", ["exec", "oxfmt", "--check", "valid.ts"], {
      cwd: consumer,
      encoding: "utf-8",
    });
    assert.equal(format.status, 1, format.stdout + format.stderr);
    run("pnpm", ["format"], consumer);
    assert.match(
      readFileSync(path.join(consumer, "valid.ts"), "utf-8"),
      /from "\.\/alpha\.js";\s+import \{ zebra \} from "\.\/zebra\.js";/u,
      "Oxfmt should apply import sorting from the shared preset"
    );
    run("pnpm", ["lint"], consumer);
    run("pnpm", ["format:check"], consumer);

    const specifiers = Object.keys(manifest.exports).map((subpath) =>
      subpath === "." ? manifest.name : `${manifest.name}${subpath.slice(1)}`
    );
    writeConsumerFile(
      "smoke.mjs",
      `for (const specifier of ${JSON.stringify(specifiers)}) {
  const config = await import(specifier);
  if (specifier === ${JSON.stringify(manifest.name)}) {
    if (typeof config.defineConfig !== "function") throw new Error(specifier);
  } else if (!config.default || typeof config.default !== "object") {
    throw new Error(specifier);
  }
}
`
    );
    run(process.execPath, ["smoke.mjs"], consumer);

    const imports = specifiers.map((specifier, index) =>
      index === 0
        ? `import { defineConfig, type OxlintConfig } from ${JSON.stringify(specifier)};`
        : `import preset${index} from ${JSON.stringify(specifier)};`
    );
    const lintPresets = specifiers.flatMap((specifier, index) =>
      index > 0 && !specifier.endsWith("/oxfmt") ? [`preset${index}`] : []
    );
    writeConsumerFile(
      "types.ts",
      `${imports.join("\n")}
const config: OxlintConfig = defineConfig({ extends: [${lintPresets.join(", ")}] });
void config;
`
    );
    run("pnpm", ["exec", "tsc", "-p", "tsconfig.json"], consumer);

    writeConsumerFile(
      "oxlint.config.mjs",
      `import { defineConfig } from "${manifest.name}";
import lingui from "${manifest.name}/lingui";
export default defineConfig({ extends: [lingui] });
`
    );
    writeConsumerFile("probe.ts", "export const message = t`Hello`;\n");
    const lint = spawnSync(
      "pnpm",
      [
        "exec",
        "oxlint",
        "--config",
        "oxlint.config.mjs",
        "probe.ts",
        "--format=json",
      ],
      { cwd: consumer, encoding: "utf-8" }
    );
    assert.equal(lint.status, 1, lint.stdout + lint.stderr);
    const { diagnostics } = JSON.parse(lint.stdout);
    assert.ok(
      diagnostics.some((diagnostic) =>
        diagnostic.code.includes("t-call-in-function")
      ),
      "Oxlint should execute the package's transitive Lingui plugin"
    );

    writeFileSync(
      path.join(consumer, "style-presets.mts"),
      `import { defineConfig, type OxlintConfig } from "@stzhu/oxlint-config";
import { coreStyle } from "@stzhu/oxlint-config/core";
import { reactStyle } from "@stzhu/oxlint-config/react";
import { coreStyle as tsStyle } from "@stzhu/oxlint-config/ts";
import { vitestStyle } from "@stzhu/oxlint-config/vitest";

const styles = [coreStyle, reactStyle, vitestStyle];
const config: OxlintConfig = defineConfig({ extends: styles });
if (coreStyle !== tsStyle || styles.some((style) => !style || !config.extends?.includes(style))) {
  throw new Error("The packed package must expose the named style presets");
}
`
    );
    writeFileSync(
      path.join(consumer, "style-presets.tsconfig.json"),
      JSON.stringify({
        extends: "./tsconfig.json",
        files: ["style-presets.mts"],
        include: [],
      })
    );
    run(process.execPath, ["style-presets.mts"], consumer);
    run(
      process.execPath,
      [
        path.join(root, "node_modules/typescript/bin/tsc"),
        "-p",
        "style-presets.tsconfig.json",
      ],
      consumer
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
