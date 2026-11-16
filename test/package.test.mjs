import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
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

test("the packed package works in an isolated pnpm consumer", () => {
  // Keep the consumer outside the checkout so module resolution cannot fall
  // back to this repository's node_modules and hide missing dependencies.
  const directory = mkdtempSync(path.join(tmpdir(), "stzhu-oxlint-package-"));
  const artifacts = path.join(directory, "artifacts");
  const consumer = path.join(directory, "consumer");
  mkdirSync(artifacts);
  mkdirSync(consumer);

  try {
    run("pnpm", ["pack", "--pack-destination", artifacts], root);
    const archive = readdirSync(artifacts).find((file) =>
      file.endsWith(".tgz")
    );
    assert.ok(archive, "pnpm pack should produce a tarball");
    writeFileSync(
      path.join(consumer, "package.json"),
      JSON.stringify({
        private: true,
        type: "module",
        dependencies: {
          [manifest.name]: `file:${path.join(artifacts, archive)}`,
          oxlint: manifest.devDependencies.oxlint,
          oxfmt: manifest.devDependencies.oxfmt,
        },
      })
    );
    // A frozen root installation can fill the content store without caching
    // registry metadata. Allow metadata requests on a fresh CI machine while
    // reusing cached dependencies locally; never run dependency lifecycle scripts.
    run(
      "pnpm",
      [
        "install",
        "--prefer-offline",
        "--ignore-scripts",
        "--no-frozen-lockfile",
      ],
      consumer
    );

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

    const specifiers = Object.keys(manifest.exports).map((subpath) =>
      subpath === "." ? manifest.name : `${manifest.name}${subpath.slice(1)}`
    );
    writeFileSync(
      path.join(consumer, "smoke.mjs"),
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
    writeFileSync(
      path.join(consumer, "types.ts"),
      `${imports.join("\n")}
const config: OxlintConfig = defineConfig({ extends: [${lintPresets.join(", ")}] });
void config;
`
    );
    writeFileSync(
      path.join(consumer, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          module: "NodeNext",
          moduleResolution: "NodeNext",
          strict: true,
          noEmit: true,
          types: [],
        },
        files: ["types.ts"],
      })
    );
    run(
      process.execPath,
      [
        path.join(root, "node_modules/typescript/bin/tsc"),
        "-p",
        "tsconfig.json",
      ],
      consumer
    );

    writeFileSync(
      path.join(consumer, "oxlint.config.mjs"),
      `import { defineConfig } from "${manifest.name}";
import lingui from "${manifest.name}/lingui";
export default defineConfig({ extends: [lingui] });
`
    );
    writeFileSync(
      path.join(consumer, "probe.ts"),
      "export const message = t`Hello`;\n"
    );
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
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
