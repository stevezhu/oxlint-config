import { createRequire } from "node:module";

import { defineConfig } from "oxlint";

const require = createRequire(import.meta.url);

// Use the correctness preset; Oxfmt owns class ordering and whitespace.
// Set settings["better-tailwindcss"].entryPoint on the root consumer config.
export default defineConfig({
  overrides: [
    {
      files: ["**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}"],
      jsPlugins: [
        {
          name: "better-tailwindcss",
          specifier: require.resolve("eslint-plugin-better-tailwindcss"),
        },
      ],
      rules: {
        // Port correctness: concatenation hides full class names from Tailwind;
        // native Oxlint categories do not cover this ESLint plugin's rules.
        "better-tailwindcss/no-concatenated-classes": "error",
        // Port correctness: catch competing utilities; leave ordering to Oxfmt
        // instead of also enabling the plugin's recommended stylistic rules.
        "better-tailwindcss/no-conflicting-classes": "error",
        // Port correctness: validate classes against the consumer's theme;
        // Ultracite core does not configure this Tailwind plugin.
        "better-tailwindcss/no-unknown-classes": "error",
      },
    },
  ],
});
