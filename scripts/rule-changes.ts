import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { OxlintConfig } from "oxlint";

type RuleMap = Record<string, unknown>;
type RuleSnapshot = Map<string, string>;
type PresetSnapshot = {
  base: string;
  rules: RuleSnapshot;
};
type PackageSnapshot = {
  label: string;
  presets: Map<string, PresetSnapshot>;
};
type Manifest = {
  name: string;
  version: string;
  exports: Record<string, { default: string }> & { ".": { default: string } };
};
type PrintedConfig = {
  rules: RuleMap;
  overrides: { files: string[]; rules: RuleMap }[];
};
type PresetModule = Record<string, unknown> & {
  default?: OxlintConfig;
  defineConfig?: (config?: OxlintConfig) => OxlintConfig;
};

const basePreset = "defineConfig()";

// The built exports, manifests, and CLI output come from the selected releases.
// oxlint-disable-next-line typescript/no-unnecessary-type-parameters, typescript/no-unsafe-type-assertion -- Shape is supplied at the generated-data boundary.
const generated = <Shape>(value: unknown): Shape => value as Shape;

const oxlintPluginNames: Record<string, string> = {
  "@typescript-eslint": "typescript",
  "import-x": "import",
  "jsx-a11y": "jsx_a11y",
  "jsx-a11y-x": "jsx_a11y",
  "react-hooks": "react",
  "react-perf": "react_perf",
};

const printedName = (name: string): string => {
  const [plugin = "", rule] = name.split("/");
  if (rule === undefined) {
    return name;
  }
  if (plugin === "eslint") {
    return rule;
  }
  const mapped = oxlintPluginNames[plugin];
  return mapped === undefined ? name : `${mapped}/${rule}`;
};

const declaredRules = (config: OxlintConfig): RuleMap => {
  const rules: RuleMap = {};
  for (const preset of config.extends ?? []) {
    Object.assign(rules, declaredRules(preset));
  }
  for (const [name, setting] of Object.entries(config.rules ?? {})) {
    rules[printedName(name)] = setting;
  }
  return rules;
};

const stableJson = (value: unknown): string =>
  JSON.stringify(value, (_, entry: unknown) => {
    if (typeof entry === "object" && entry !== null && !Array.isArray(entry)) {
      const fields: RuleMap = generated(entry);
      return Object.fromEntries(
        Object.keys(fields)
          .toSorted()
          .map((key) => [key, fields[key]])
      );
    }
    return entry;
  });

const printRules = (
  oxlint: string,
  cwd: string,
  configFile: string,
  config: OxlintConfig
): RuleSnapshot => {
  writeFileSync(configFile, `export default ${JSON.stringify(config)};\n`);
  const output = execFileSync(
    process.execPath,
    [oxlint, "--config", configFile, "--print-config"],
    {
      cwd,
      encoding: "utf-8",
    }
  );
  const printed = generated<PrintedConfig>(JSON.parse(output));
  const declared = declaredRules(config);
  const rules: RuleSnapshot = new Map();
  for (const [name, severity] of Object.entries(printed.rules)) {
    // Oxlint 1.93 can omit inherited options while printing the selected
    // severity. Add the options from the same config passed to the CLI.
    const options = declared[printedName(name)];
    const setting =
      !Array.isArray(severity) && Array.isArray(options) && options.length > 1
        ? [severity, options.slice(1)]
        : severity;
    rules.set(`Root\t${name}`, stableJson(setting));
  }
  for (const [
    index,
    { files, rules: overrideRules },
  ] of printed.overrides.entries()) {
    const scope = `Override ${index + 1} (${files.join(", ")})`;
    for (const [name, setting] of Object.entries(overrideRules)) {
      rules.set(`${scope}\t${name}`, stableJson(setting));
    }
  }
  return rules;
};

const readPackage = async (
  directory: string,
  configFile: string
): Promise<PackageSnapshot> => {
  const manifestFile = path.join(directory, "package.json");
  const manifest = generated<Manifest>(
    JSON.parse(readFileSync(manifestFile, "utf-8"))
  );
  const require = createRequire(manifestFile);
  const oxlintManifestPath = require.resolve("oxlint/package.json");
  const { version } = generated<Pick<Manifest, "version">>(
    JSON.parse(readFileSync(oxlintManifestPath, "utf-8"))
  );
  const oxlint = path.join(path.dirname(oxlintManifestPath), "bin/oxlint");
  const entry = async (target: string): Promise<PresetModule> => {
    const exported: unknown = await import(
      pathToFileURL(path.resolve(directory, target)).href
    );
    return generated<PresetModule>(exported);
  };
  const { defineConfig } = await entry(manifest.exports["."].default);
  if (!defineConfig) {
    throw new Error(`Missing defineConfig in ${manifestFile}`);
  }
  const presets = new Map<string, PresetSnapshot>([
    [
      basePreset,
      {
        base: basePreset,
        rules: printRules(oxlint, directory, configFile, defineConfig()),
      },
    ],
  ]);

  for (const [subpath, target] of Object.entries(manifest.exports)) {
    if (subpath === "./oxfmt") {
      continue;
    }
    const exported = await entry(target.default);
    const coreAlias = subpath === "./core" || subpath === "./ts";
    for (const [name, value] of Object.entries(exported)) {
      if (typeof value !== "object" || value === null) {
        continue;
      }
      const preset = generated<OxlintConfig>(value);
      const suffix = name === "default" ? "" : `#${name}`;
      const defaultPreset =
        name !== "default" && !coreAlias ? exported.default : undefined;
      const config =
        coreAlias && name === "default"
          ? preset
          : defineConfig({
              extends:
                defaultPreset === undefined
                  ? [preset]
                  : [defaultPreset, preset],
            });
      const presetPath = subpath.slice(1);
      presets.set(`${presetPath}${suffix}`, {
        base: defaultPreset === undefined ? basePreset : presetPath,
        rules: printRules(oxlint, directory, configFile, config),
      });
    }
  }
  return {
    label: `${manifest.name}@${manifest.version} (Oxlint ${version})`,
    presets,
  };
};

const collectChanges = (
  before: PackageSnapshot["presets"],
  after: PackageSnapshot["presets"]
) => {
  const changes = new Map<
    string,
    {
      scope: string;
      name: string;
      previous: string;
      current: string;
      presets: string[];
    }
  >();
  const empty = new Map<string, string>();
  for (const [preset, { base, rules: newer }] of after) {
    // New exports share the candidate's core or subpath defaults.
    const baseline =
      before.get(preset) ??
      (preset === basePreset ? undefined : after.get(base));
    const older = baseline?.rules ?? empty;
    for (const key of new Set([...older.keys(), ...newer.keys()])) {
      const previous = older.get(key) ?? "—";
      const current = newer.get(key) ?? "—";
      if (previous !== current) {
        const changeKey = JSON.stringify([key, previous, current]);
        const [scope = "", name = ""] = key.split("\t");
        const change = changes.get(changeKey) ?? {
          scope,
          name,
          previous,
          current,
          presets: [],
        };
        change.presets.push(preset);
        changes.set(changeKey, change);
      }
    }
  }
  return changes;
};

const code = (value: string) => {
  const ticks = "`".repeat(
    1 + Math.max(0, ...(value.match(/`+/gu) ?? []).map((run) => run.length))
  );
  return `${ticks} ${value.replaceAll("|", "\\|")} ${ticks}`;
};

const printPresetExports = (
  before: PackageSnapshot["presets"],
  after: PackageSnapshot["presets"]
) => {
  const added = [...after.keys()]
    .filter((preset) => preset !== basePreset && !before.has(preset))
    .toSorted();
  const removed = [...before.keys()]
    .filter((preset) => !after.has(preset))
    .toSorted();
  if (added.length === 0 && removed.length === 0) {
    return;
  }
  console.log("## Preset exports\n");
  for (const preset of added) {
    const base = after.get(preset)?.base ?? basePreset;
    console.log(
      `- Added ${code(preset)}. Its rule changes are relative to ${code(base)} in the candidate.`
    );
  }
  for (const preset of removed) {
    console.log(`- Removed ${code(preset)}.`);
  }
  console.log("");
};

const printReport = (before: PackageSnapshot, after: PackageSnapshot) => {
  console.log("# Oxlint rule changes\n");
  console.log(`- Previous: ${before.label}\n- Candidate: ${after.label}\n`);
  console.log(
    "Preset names are relative to the package name. `deny`, `warn` and `allow` are Oxlint's printed severities. A dash means there is no entry in that scope.\n"
  );
  printPresetExports(before.presets, after.presets);
  console.log("## Rule settings\n");
  const changes = collectChanges(before.presets, after.presets);
  if (changes.size === 0) {
    console.log("No rule-level changes.");
    return;
  }
  console.log(
    "| Scope | Rule | Previous | Candidate | Presets |\n| --- | --- | --- | --- | --- |"
  );
  const sorted = [...changes].toSorted(([first], [second]) =>
    first.localeCompare(second, "en")
  );
  for (const [, { scope, name, previous, current, presets }] of sorted) {
    const names = presets.toSorted().map(code).join(", ");
    console.log(
      `| ${code(scope)} | ${code(name)} | ${code(previous)} | ${code(current)} | ${names} |`
    );
  }
};

const [previous] = process.argv.slice(2);
if (previous === undefined || previous === "" || process.argv.length !== 3) {
  throw new Error(
    "Usage: node scripts/rule-changes.ts <built previous checkout | --initial>"
  );
}
const directory = mkdtempSync(path.join(tmpdir(), "oxlint-rule-changes-"));
try {
  const config = path.join(directory, "oxlint.config.mts");
  const before =
    previous === "--initial"
      ? { label: "Initial release", presets: new Map<string, PresetSnapshot>() }
      : await readPackage(path.resolve(previous), config);
  const after = await readPackage(
    fileURLToPath(new URL("../", import.meta.url)),
    config
  );
  printReport(before, after);
} finally {
  rmSync(directory, { force: true, recursive: true });
}
