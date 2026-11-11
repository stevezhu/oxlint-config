import { defineConfig } from "oxlint";
import ultracite from "ultracite/oxlint/react";

export default defineConfig({
  extends: [ultracite],
  env: { browser: true },
  rules: {
    "func-style": "off",
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
    "react/only-export-components": ["error", { allowConstantExport: true }],
  },
});
