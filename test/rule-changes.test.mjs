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

test("the release report finds rule changes without repeating inherited rules for new presets", (context) => {
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
      exports: {
        ".": { default: "./dist/index.js" },
        "./legacy": { default: "./dist/legacy.js" },
        "./react": { default: "./dist/react.js" },
      },
    })
  );
  mkdirSync(path.join(base, "dist"));
  const core = new URL("../dist/core.js", import.meta.url).href;
  writeFileSync(
    path.join(base, "dist/index.js"),
    `
import core from ${JSON.stringify(core)};
export const defineConfig = (config = {}) => ({
  ...config,
  extends: [{
    ...core,
    rules: {
      ...core.rules,
      "typescript/no-floating-promises": ["error", { ignoreVoid: true, checkThenables: true }],
    },
    overrides: [{ files: ["**/*.previous.ts"], rules: { "no-console": ["warn", { allow: ["error"] }] } }],
  }, ...(config.extends ?? [])],
});
`
  );
  const react = new URL("../dist/react.js", import.meta.url).href;
  writeFileSync(
    path.join(base, "dist/react.js"),
    `export { default } from ${JSON.stringify(react)};`
  );
  writeFileSync(
    path.join(base, "dist/legacy.js"),
    'export default { rules: { "no-alert": "error" } };'
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
  assert.ok(
    report.includes(
      "- Added ` /react#reactRefresh `. Its rule changes are relative to ` /react ` in the candidate."
    )
  );
  assert.ok(report.includes("- Removed ` /legacy `."));
  const ruleRows = lines.filter((line) => line.startsWith("| "));
  assert.ok(!ruleRows.some((line) => line.includes("/legacy")));
  const refreshRows = ruleRows.filter((line) =>
    line.includes("/react#reactRefresh")
  );
  assert.ok(
    !refreshRows.some((line) =>
      /react\/jsx-key|typescript\/no-floating-promises/u.test(line)
    )
  );
});
