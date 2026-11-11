import { defineConfig } from "oxlint";
import ultracite from "ultracite/oxlint/vitest";

export default defineConfig({
  extends: [ultracite],
  overrides: [
    {
      files: ultracite.overrides?.[0].files ?? [],
      rules: {
        "vitest/consistent-test-it": [
          "error",
          { fn: "test", withinDescribe: "test" },
        ],
        "typescript/no-unsafe-assignment": "off",
      },
    },
  ],
});
