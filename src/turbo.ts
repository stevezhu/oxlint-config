import { defineConfig } from "oxlint";

import { jsPlugin } from "./js-plugin.js";

// The rule discovers turbo.json from the consumer's cwd. Do not capture the
// plugin's ESLint cache settings while building this shared configuration.
export default defineConfig({
  overrides: [
    {
      files: ["**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}"],
      jsPlugins: [jsPlugin("turbo", "eslint-plugin-turbo")],
      rules: {
        "turbo/no-undeclared-env-vars": "error",
      },
    },
  ],
});
