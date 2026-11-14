import { defineConfig } from "oxlint";
import ultracite from "ultracite/oxlint/react";

export default defineConfig({
  extends: [ultracite],
  env: { browser: true },
  rules: {
    // Ultracite core requires function expressions, which conflicts with the
    // named component declarations required by the next rule.
    "func-style": "off",
    // Preserve the shared config's component style instead of Ultracite's
    // named arrow components; category settings cannot choose these forms.
    "react/function-component-definition": [
      "error",
      {
        namedComponents: "function-declaration",
        unnamedComponents: "function-expression",
      },
    ],
  },
});

/** Add for applications using Vite's React Fast Refresh integration. */
export const reactRefresh = defineConfig({
  plugins: ["react"],
  rules: {
    // Ultracite leaves Fast Refresh checks off; Vite consumers can opt in
    // while allowing constant exports supported by Vite's integration.
    "react/only-export-components": ["error", { allowConstantExport: true }],
  },
});
