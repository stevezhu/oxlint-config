import { createRequire } from "node:module";

import { defineConfig } from "oxlint";

const require = createRequire(import.meta.url);

// Ultracite's Oxlint Storybook preset is empty; these are Storybook's
// recommended rules, run through Oxlint's ESLint-compatible plugin API.
export default defineConfig({
  overrides: [
    {
      files: ["**/*.{story,stories}.{js,jsx,ts,tsx,mjs,cjs,mts,cts}"],
      jsPlugins: [
        {
          name: "storybook",
          specifier: require.resolve("eslint-plugin-storybook"),
        },
      ],
      rules: {
        // Port Storybook recommended: await interactions so play steps finish.
        "storybook/await-interactions": "error",
        // Port Storybook recommended: pass play context when composing stories.
        "storybook/context-in-play-function": "error",
        // Port Storybook recommended: require the default CSF metadata export.
        "storybook/default-exports": "error",
        // Port Storybook recommended: flag deprecated hierarchy separators.
        "storybook/hierarchy-separator": "warn",
        // Port Storybook recommended: avoid names already inferred from exports.
        "storybook/no-redundant-story-name": "warn",
        // Port Storybook recommended: import from framework, not renderer packages.
        "storybook/no-renderer-packages": "error",
        // Port Storybook recommended: use PascalCase for named story exports.
        "storybook/prefer-pascal-case": "warn",
        // Port Storybook recommended: require at least one named story export.
        "storybook/story-exports": "error",
        // Port Storybook recommended: use instrumented assertions in play functions.
        "storybook/use-storybook-expect": "error",
        // Port Storybook recommended: use instrumented Testing Library helpers.
        "storybook/use-storybook-testing-library": "error",
        // Match Storybook's Hooks exemption for CSF render functions using the
        // native Oxlint rule name instead of ESLint's react-hooks namespace.
        "react/rules-of-hooks": "off",
        // Match Storybook's anonymous metadata exemption using the native
        // import namespace instead of the ESLint preset's import-x namespace.
        "import/no-anonymous-default-export": "off",
        // Ultracite also bans anonymous exports through Unicorn; disable that
        // duplicate restriction so inline CSF metadata remains valid.
        "unicorn/no-anonymous-default-export": "off",
      },
    },
    {
      files: ["**/.storybook/main.{js,cjs,mjs,ts,mts,cts}"],
      jsPlugins: [
        {
          name: "storybook",
          specifier: require.resolve("eslint-plugin-storybook"),
        },
      ],
      rules: {
        // Port Storybook recommended: catch missing addons in main config files.
        "storybook/no-uninstalled-addons": "error",
        // Allow the conventional inline main config export, which Ultracite's
        // general Unicorn restriction would otherwise reject.
        "unicorn/no-anonymous-default-export": "off",
      },
    },
  ],
});
