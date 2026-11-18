import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const script = path.join(root, "scripts/rule-changes.ts");

test("the release report finds changes to inherited options and file overrides", (context) => {
  const base = mkdtempSync(path.join(tmpdir(), "oxlint-config-rule-report-"));
  context.after(() => rmSync(base, { recursive: true, force: true }));
  symlinkSync(
    path.join(root, "node_modules"),
    path.join(base, "node_modules"),
    "junction"
  );
  writeFileSync(
    path.join(base, "package.json"),
    JSON.stringify({
      name: "@stzhu/oxlint-config",
      version: "0.0.0",
      type: "module",
      exports: { ".": { default: "./dist/index.js" } },
    })
  );
  mkdirSync(path.join(base, "dist"));
  const core = new URL("../dist/core.js", import.meta.url).href;
  writeFileSync(
    path.join(base, "dist/index.js"),
    `
import core from ${JSON.stringify(core)};
export const defineConfig = () => ({
  extends: [{
    ...core,
    rules: {
      ...core.rules,
      "typescript/no-floating-promises": ["error", { ignoreVoid: true, checkThenables: true }],
    },
    overrides: [{ files: ["**/*.previous.ts"], rules: { "no-console": ["warn", { allow: ["error"] }] } }],
  }],
});
`
  );
  const report = execFileSync(process.execPath, [script, base], {
    encoding: "utf-8",
  });
  const lines = report.split("\n");
  assert.ok(
    lines.some(
      (line) =>
        line.includes("typescript/no-floating-promises") &&
        line.includes('"ignoreVoid":true') &&
        line.includes('"ignoreVoid":false')
    )
  );
  assert.ok(
    lines.some(
      (line) =>
        line.includes("**/*.previous.ts") &&
        line.includes("no-console") &&
        line.includes('["warn",[{"allow":["error"]}]]')
    )
  );
  assert.ok(
    lines.some(
      (line) =>
        line.includes("/react#reactRefresh") &&
        line.includes("react/only-export-components") &&
        line.includes("allowConstantExport")
    )
  );
  assert.ok(
    lines.some(
      (line) =>
        line.includes("/react-web") &&
        line.includes("jsx_a11y/label-has-associated-control") &&
        line.includes("controlComponents")
    )
  );
});
