import { defineConfig } from "oxlint";

import { jsPlugin } from "./js-plugin.js";

// Ultracite's Oxlint Storybook preset is empty; these are Storybook's
// recommended rules, run through Oxlint's ESLint-compatible plugin API.
export default defineConfig({
  overrides: [
    {
      files: ["**/*.{story,stories}.{js,jsx,ts,tsx,mjs,cjs,mts,cts}"],
      jsPlugins: [jsPlugin("storybook", "eslint-plugin-storybook")],
      rules: {
        "storybook/await-interactions": "error",
        "storybook/context-in-play-function": "error",
        "storybook/default-exports": "error",
        "storybook/hierarchy-separator": "warn",
        "storybook/no-redundant-story-name": "warn",
        "storybook/no-renderer-packages": "error",
        "storybook/prefer-pascal-case": "warn",
        "storybook/story-exports": "error",
        "storybook/use-storybook-expect": "error",
        "storybook/use-storybook-testing-library": "error",
        // CSF render functions and anonymous metadata exports are supported.
        "react/rules-of-hooks": "off",
        "import/no-anonymous-default-export": "off",
        "unicorn/no-anonymous-default-export": "off",
      },
    },
    {
      files: ["**/.storybook/main.{js,cjs,mjs,ts,mts,cts}"],
      jsPlugins: [jsPlugin("storybook", "eslint-plugin-storybook")],
      rules: {
        "storybook/no-uninstalled-addons": "error",
        "unicorn/no-anonymous-default-export": "off",
      },
    },
  ],
});
