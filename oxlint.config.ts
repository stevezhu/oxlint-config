import { defineConfig } from "@stzhu/oxlint-config";
import node from "@stzhu/oxlint-config/node";

export default defineConfig({
  extends: [node],
  ignorePatterns: [".test-tmp"],
  rules: { "sort-keys": "off" },
});
