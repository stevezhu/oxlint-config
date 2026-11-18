import { defineConfig } from "oxlint";
import type { OxlintConfig } from "oxlint";
import ultracite from "ultracite/oxlint/vitest";

const files = ultracite.overrides?.[0]?.files ?? [];
const styleRules = {
  "vitest/consistent-test-it": [
    "error",
    { fn: "test", withinDescribe: "test" },
  ],
  "vitest/prefer-importing-vitest-globals": "error",
  "vitest/require-top-level-describe": "error",
} satisfies NonNullable<OxlintConfig["rules"]>;

/** Add after the Vitest preset to enforce naming, imports and suite grouping. */
export const vitestStyle: OxlintConfig = defineConfig({
  overrides: [{ files, plugins: ["vitest"], rules: styleRules }],
});

export default defineConfig({
  extends: [ultracite],
  overrides: [
    {
      files,
      plugins: ["vitest"],
      rules: {
        ...Object.fromEntries(
          Object.keys(styleRules).map((rule) => [rule, "off" as const])
        ),
        // Assertion counts do not establish test quality; keep correctness rules.
        "vitest/max-expects": "off",
        "vitest/max-nested-describe": "off",
      },
    },
  ],
});
