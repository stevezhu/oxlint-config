import { createRequire } from "node:module";

import { defineConfig } from "oxlint";

const require = createRequire(import.meta.url);

// Adapt Lingui's ESLint recommended rules to Oxlint's JS plugin API;
// Ultracite core and native rule categories do not include this plugin.
export default defineConfig({
  overrides: [
    {
      files: ["**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}"],
      jsPlugins: [
        {
          name: "lingui",
          specifier: require.resolve("eslint-plugin-lingui"),
        },
      ],
      rules: {
        // Keep the recommended error: translate inside functions so locale
        // changes do not leave module-level translations stale.
        "lingui/t-call-in-function": "error",
        // Keep the recommended warning: a lone tag has no text to translate.
        "lingui/no-single-tag-to-translate": "warn",
        // Keep the recommended warning: a lone variable has no message text.
        "lingui/no-single-variables-to-translate": "warn",
        // Keep the recommended warning: nested Trans elements split messages.
        "lingui/no-trans-inside-trans": "warn",
        // Keep the recommended warning: use named variables for function calls
        // and member expressions so translation placeholders stay readable.
        "lingui/no-expression-in-message": "warn",
      },
    },
  ],
});
