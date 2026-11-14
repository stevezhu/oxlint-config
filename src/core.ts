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
    // Preserve underscore-prefixed unused bindings from @stzhu/eslint-config;
    // Ultracite enables this rule without the explicit ignore patterns.
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
    // Allow both interfaces and type aliases, as @stzhu/eslint-config did;
    // Ultracite's default requires interfaces for object type definitions.
    "typescript/consistent-type-definitions": "off",
    // Allow async JSX event handlers passed to void-returning attributes;
    // Ultracite's default checks those attributes along with other callbacks.
    "typescript/no-misused-promises": [
      "error",
      { checksVoidReturn: { attributes: false } },
    ],
    // Allow numeric interpolation without String() calls, preserving the old
    // config's behavior; category severity settings cannot set this option.
    "typescript/restrict-template-expressions": [
      "error",
      { allowNumber: true },
    ],
  },
});

export default core;
