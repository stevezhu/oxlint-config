import { createRequire } from "node:module";

import { defineConfig } from "oxlint";

const require = createRequire(import.meta.url);

// The rule discovers turbo.json from the consumer's cwd. Do not capture the
// plugin's ESLint cache settings while building this shared configuration.
export default defineConfig({
  overrides: [
    {
      files: ["**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}"],
      jsPlugins: [
        {
          name: "turbo",
          specifier: require.resolve("eslint-plugin-turbo"),
        },
      ],
      rules: {
        // Port Turbo's recommended check without its captured cache settings:
        // env reads must be declared for cache correctness. Ultracite core and
        // native rule categories do not include this ESLint plugin rule.
        "turbo/no-undeclared-env-vars": "error",
      },
    },
  ],
});
