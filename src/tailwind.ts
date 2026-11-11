import { defineConfig } from "oxlint";

import { jsPlugin } from "./js-plugin.js";

// Use the correctness preset; Oxfmt owns class ordering and whitespace.
// Set settings["better-tailwindcss"].entryPoint on the root consumer config.
export default defineConfig({
  overrides: [
    {
      files: ["**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}"],
      jsPlugins: [
        jsPlugin("better-tailwindcss", "eslint-plugin-better-tailwindcss"),
      ],
      rules: {
        "better-tailwindcss/no-concatenated-classes": "error",
        "better-tailwindcss/no-conflicting-classes": "error",
        "better-tailwindcss/no-unknown-classes": "error",
      },
    },
  ],
});
