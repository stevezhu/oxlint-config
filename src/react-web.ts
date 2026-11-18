import { defineConfig } from "oxlint";

import { webRules } from "./react-web-rules.js";
import react from "./react.js";

/** React for browsers, including HTML accessibility and DOM-specific checks. */
export default defineConfig({
  extends: [react],
  env: { browser: true },
  plugins: ["jsx-a11y"],
  rules: webRules,
});
