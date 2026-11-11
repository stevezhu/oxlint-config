import { defineConfig } from "oxlint";
import type { OxlintConfig } from "oxlint";
import ultracite from "ultracite/oxlint/core";

const core: OxlintConfig = defineConfig({
  ...ultracite,
  env: { browser: false },
  ignorePatterns: ultracite.ignorePatterns,
  overrides: [
    ...(ultracite.overrides ?? []),
    {
      files: ["**/*.config.{js,mjs,cjs,ts,mts,cts}"],
      env: { node: true },
    },
  ],
  rules: {
    ...ultracite.rules,
    "no-unused-vars": [
      "error",
      {
        args: "all",
        argsIgnorePattern: "^_",
        caughtErrors: "all",
        caughtErrorsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
        varsIgnorePattern: "^_",
      },
    ],
    "typescript/consistent-type-definitions": "off",
    "typescript/no-misused-promises": [
      "error",
      { checksVoidReturn: { attributes: false } },
    ],
    "typescript/restrict-template-expressions": [
      "error",
      { allowNumber: true },
    ],
  },
});

export default core;
