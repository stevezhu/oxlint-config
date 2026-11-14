import { defineConfig } from "@stzhu/oxlint-config";
import node from "@stzhu/oxlint-config/node";

export default defineConfig({
  extends: [node],
  ignorePatterns: [".test-tmp"],
  rules: {
    // Keep preset options and package metadata grouped by purpose;
    // Ultracite's alphabetical key ordering would split those groups.
    "sort-keys": "off",
  },
});
