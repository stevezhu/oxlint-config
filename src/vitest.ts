import { defineConfig } from "oxlint";
import ultracite from "ultracite/oxlint/vitest";

export default defineConfig({
  extends: [ultracite],
  overrides: [
    {
      files: ultracite.overrides?.[0]?.files ?? [],
      rules: {
        // Require test() both inside and outside describe(); Ultracite enables
        // the rule with defaults rather than this explicit naming preference.
        "vitest/consistent-test-it": [
          "error",
          { fn: "test", withinDescribe: "test" },
        ],
        // Assertion counts do not establish test quality; keep correctness rules.
        "vitest/max-expects": "off",
        "vitest/max-nested-describe": "off",
      },
    },
  ],
});
