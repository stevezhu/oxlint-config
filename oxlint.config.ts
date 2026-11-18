import { defineConfig } from "@stzhu/oxlint-config";
import node from "@stzhu/oxlint-config/node";

export default defineConfig({
  extends: [node],
  ignorePatterns: [".test-tmp"],
  options: {
    typeAware: true,
    maxWarnings: 0,
    reportUnusedDisableDirectives: "error",
  },
  overrides: [
    {
      files: ["test/*.test.mjs"],
      // The JS CLI harness deliberately parses arbitrary diagnostic/config JSON.
      // Keep native checks here; typed policy is exercised by strict TS fixtures.
      rules: {
        "typescript/no-unsafe-assignment": "off",
        "typescript/no-unsafe-call": "off",
        "typescript/no-unsafe-member-access": "off",
        "typescript/no-unsafe-return": "off",
        "typescript/no-unsafe-argument": "off",
        "typescript/strict-boolean-expressions": "off",
      },
    },
  ],
});
