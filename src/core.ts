import { defineConfig } from "oxlint";
import type { OxlintConfig } from "oxlint";
import ultracite from "ultracite/oxlint/core";

const styleRules = {
  "arrow-body-style": ["error", "as-needed"],
  "class-methods-use-this": "error",
  "func-names": "error",
  "func-style": ["error", "expression", { allowArrowFunctions: true }],
  "import/consistent-type-specifier-style": ["error", "prefer-top-level"],
  "prefer-arrow-callback": "error",
  "require-await": "error",
  "typescript/array-type": "error",
  "typescript/consistent-type-imports": "error",
  "typescript/parameter-properties": "error",
  "unicorn/filename-case": "error",
} satisfies NonNullable<OxlintConfig["rules"]>;

/** Add to projects that want these code and filename conventions enforced. */
export const coreStyle: OxlintConfig = defineConfig({
  plugins: ["import", "typescript", "unicorn"],
  rules: styleRules,
});

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
    ...Object.fromEntries(
      Object.keys(styleRules).map((rule) => [rule, "off" as const])
    ),
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
    // Decorated classes can register framework behaviour without member code.
    "typescript/no-extraneous-class": ["error", { allowWithDecorator: true }],
    // Restrict async endpoint handlers only in projects using Express 4.
    "oxc/no-async-endpoint-handlers": "off",
    // A void expression does not handle rejection. Check JSX callbacks too:
    // UI boundaries must catch failures instead of discarding their promises.
    "typescript/no-floating-promises": [
      "error",
      { ignoreVoid: false, checkThenables: true },
    ],
    "typescript/no-misused-promises": "error",
    // Preserve semantic grouping and explanatory comments. These restrictions
    // encourage mechanical rewrites without establishing correctness.
    "sort-keys": "off",
    "no-inline-comments": "off",
    "no-warning-comments": "off",
    "no-plusplus": "off",
    "unicorn/no-array-for-each": "off",
    "unicorn/no-array-reduce": "off",
    // Ordering, retries, and bounded concurrency can require sequential awaits.
    "no-await-in-loop": "off",
    // Complexity metrics need project-specific budgets, outside the core gate.
    complexity: "off",
    "max-nested-callbacks": "off",
    // Allow numeric interpolation without String() calls, preserving the old
    // config's behavior; category severity settings cannot set this option.
    "typescript/restrict-template-expressions": [
      "error",
      { allowNumber: true },
    ],
  },
});

export default core;
