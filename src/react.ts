import { defineConfig } from "oxlint";
import type { OxlintConfig } from "oxlint";
import ultracite from "ultracite/oxlint/react";

import { webRules } from "./react-web-rules.js";

const styleRules = {
  "react/function-component-definition": [
    "error",
    {
      namedComponents: "function-declaration",
      unnamedComponents: "function-expression",
    },
  ],
  "react/jsx-curly-brace-presence": "error",
  "react/jsx-fragments": "error",
  "react/self-closing-comp": "error",
} satisfies NonNullable<OxlintConfig["rules"]>;

/** Add after coreStyle to enforce the package's React component and JSX style. */
export const reactStyle: OxlintConfig = defineConfig({
  plugins: ["react"],
  rules: {
    ...styleRules,
    // Core's expression preference conflicts with component declarations.
    "func-style": "off",
  },
});

const react: OxlintConfig = defineConfig({
  plugins: ["react"],
  rules: {
    ...Object.fromEntries(
      Object.entries(ultracite.rules ?? {}).filter(
        ([name]) => !Object.hasOwn(webRules, name)
      )
    ),
    ...Object.fromEntries(
      Object.keys(styleRules).map((rule) => [rule, "off" as const])
    ),
  },
});

export default react;

/** Add for applications using Vite's React Fast Refresh integration. */
export const reactRefresh = defineConfig({
  plugins: ["react"],
  rules: {
    // Ultracite leaves Fast Refresh checks off; Vite consumers can opt in
    // while allowing constant exports supported by Vite's integration.
    "react/only-export-components": ["error", { allowConstantExport: true }],
  },
});
