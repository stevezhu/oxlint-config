import type { OxlintConfig } from "oxlint";
import ultracite from "ultracite/oxlint/react";

// DOM APIs and HTML semantics belong to web consumers, not shared React hooks.
const domRules = new Set([
  "react/button-has-type",
  "react/checked-requires-onchange-or-readonly",
  "react/forbid-dom-props",
  "react/iframe-missing-sandbox",
  "react/jsx-no-script-url",
  "react/jsx-no-target-blank",
  "react/no-danger",
  "react/no-danger-with-children",
  "react/no-find-dom-node",
  "react/no-render-return-value",
  "react/no-unknown-property",
  "react/style-prop-object",
  "react/void-dom-elements-no-children",
]);

export const webRules: NonNullable<OxlintConfig["rules"]> = Object.fromEntries(
  Object.entries(ultracite.rules ?? {}).filter(
    ([name]) => name.startsWith("jsx-a11y/") || domRules.has(name)
  )
);
