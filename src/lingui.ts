import { defineConfig } from "oxlint";

import { jsPlugin } from "./js-plugin.js";

export default defineConfig({
  overrides: [
    {
      files: ["**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}"],
      jsPlugins: [jsPlugin("lingui", "eslint-plugin-lingui")],
      rules: {
        "lingui/t-call-in-function": "error",
        "lingui/no-single-tag-to-translate": "warn",
        "lingui/no-single-variables-to-translate": "warn",
        "lingui/no-trans-inside-trans": "warn",
        "lingui/no-expression-in-message": "warn",
      },
    },
  ],
});
