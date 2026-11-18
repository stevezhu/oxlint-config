import { defineConfig as oxlintDefineConfig } from "oxlint";
import type { OxlintConfig } from "oxlint";

import core from "./core.js";

export type { OxlintConfig } from "oxlint";

// Oxlint merges rules, plugins, and overrides, but does not inherit these
// root-only fields from imported configs. Preserve their declaration order.
const collectRootFields = (
  config: OxlintConfig,
  ancestors = new Set<OxlintConfig>()
): Pick<OxlintConfig, "env" | "globals" | "ignorePatterns"> => {
  if (ancestors.has(config)) {
    throw new Error("Circular Oxlint config extends");
  }
  ancestors.add(config);
  const inherited = (config.extends ?? []).map((preset) =>
    collectRootFields(preset, ancestors)
  );
  ancestors.delete(config);

  inherited.push(config);

  return {
    env: inherited.reduce<NonNullable<OxlintConfig["env"]>>(
      (env, preset) => Object.assign(env, preset.env),
      {}
    ),
    globals: inherited.reduce<NonNullable<OxlintConfig["globals"]>>(
      (globals, preset) => Object.assign(globals, preset.globals),
      {}
    ),
    ignorePatterns: inherited.flatMap((preset) => preset.ignorePatterns ?? []),
  };
};

/** Compose the shared core and optional presets into a root Oxlint config. */
export const defineConfig = (config: OxlintConfig = {}): OxlintConfig => {
  const combined = { ...config, extends: [core, ...(config.extends ?? [])] };
  return oxlintDefineConfig({ ...combined, ...collectRootFields(combined) });
};
