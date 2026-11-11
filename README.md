# @stzhu/oxlint-config

Shared TypeScript and React lint configuration built on [Ultracite](https://www.ultracite.ai/providers/oxlint), using Oxlint's native rules and optional ESLint plugins for missing coverage. It follows the modular intent of [@stzhu/eslint-config](https://github.com/stevezhu/eslint-config).

## Install

Requires Node.js 24+ and Oxlint 1.93+. This is an ESM package.

```sh
pnpm add -D @stzhu/oxlint-config oxlint oxfmt
```

Create `oxlint.config.ts` in a package with `"type": "module"`. Use `oxlint.config.mts` in other packages:

```ts
import { defineConfig } from "@stzhu/oxlint-config";
import react from "@stzhu/oxlint-config/react";
import vitest from "@stzhu/oxlint-config/vitest";

export default defineConfig({
  extends: [react, vitest],
  ignorePatterns: ["vendor"],
});
```

`defineConfig()` always includes the core preset. For a framework-free TypeScript project, call it with no arguments. For a server project, add `@stzhu/oxlint-config/node` to `extends`.

Create `oxfmt.config.ts` (or `.mts`) separately:

```ts
import shared from "@stzhu/oxlint-config/oxfmt";
import { defineConfig } from "oxfmt";

export default defineConfig({ ...shared });
```

Use the tool CLIs directly; no additional runner or ESLint config is required:

```json
{
  "scripts": {
    "lint": "oxfmt --check . && oxlint --max-warnings=0",
    "fix": "oxfmt --write . && oxlint --fix"
  }
}
```

## Presets

Each subpath default-exports an Oxlint config object for `extends`, except `/oxfmt`, which exports a formatter config.

| Import suffix | Coverage |
| --- | --- |
| `/core` or `/ts` | Ultracite core: JavaScript, TypeScript, imports, Node conventions, promises, JSDoc, Unicorn, and Oxc rules. Included by `defineConfig`. |
| `/node` | Enables Node globals; disables browser globals. |
| `/react` | Ultracite React, Hooks, React Compiler, and JSX accessibility rules; enables browser globals. Named components use function declarations, anonymous components use function expressions. |
| `/vitest` | Ultracite's native Vitest rules, scoped to test/spec files and `__tests__`, including JS/TS variants. Prefers `test` over `it`. |
| `/storybook` | `eslint-plugin-storybook` recommended rules, scoped to stories and `.storybook/main.*`. |
| `/tailwind` | `eslint-plugin-better-tailwindcss` correctness checks for unknown, conflicting, and concatenated classes. |
| `/lingui` | `eslint-plugin-lingui` recommended checks. |
| `/turbo` | `eslint-plugin-turbo/no-undeclared-env-vars`, using the consumer's `turbo.json`. |
| `/oxfmt` | Ultracite formatting, import sorting, package.json sorting, and Tailwind class sorting. Requires Oxfmt 0.78+. |

The last four lint presets use [Oxlint's JavaScript plugin API](https://oxc.rs/docs/guide/usage/linter/js-plugins), which is currently alpha. Their plugin dependencies are bundled as package dependencies and resolved from this package, so pnpm consumers do not need to install them directly. They run only when their preset is selected. Native React/Hooks/Refresh, import, Node, and Vitest equivalents stay in Oxlint; import and class sorting belong to Oxfmt.

For Vite React applications, opt into native Fast Refresh checks:

```ts
import react, { reactRefresh } from "@stzhu/oxlint-config/react";

// Within defineConfig({ ... }):
// extends: [react, reactRefresh]
```

## Type-aware linting

Ultracite core configures typed rules, but running them requires `oxlint-tsgolint` and a project tsconfig with `strict` or `strictNullChecks`. Install the runner in the consuming workspace:

```sh
pnpm add -D oxlint-tsgolint typescript
```

```ts
import { defineConfig } from "@stzhu/oxlint-config";

export default defineConfig({ options: { typeAware: true } });
```

This enables checks such as floating promises and unsafe assignments. Type checking is separate: continue running your project's TypeScript check. The config never changes tsconfig files. See [Ultracite's type-aware setup](https://www.ultracite.ai/docs/configuration) and [Oxlint type-aware linting](https://oxc.rs/docs/guide/usage/linter/type-aware).

## Tailwind CSS v4

Install `tailwindcss` in the consuming workspace and point the linter at the stylesheet that declares your theme:

```ts
import { defineConfig } from "@stzhu/oxlint-config";
import react from "@stzhu/oxlint-config/react";
import tailwind from "@stzhu/oxlint-config/tailwind";

export default defineConfig({
  extends: [react, tailwind],
  settings: {
    "better-tailwindcss": { entryPoint: "./src/styles.css" },
  },
});
```

Configure custom-theme class sorting independently in Oxfmt. Preserve the preset's function list when replacing its Tailwind options:

```ts
import shared from "@stzhu/oxlint-config/oxfmt";
import { defineConfig } from "oxfmt";

export default defineConfig({
  ...shared,
  sortTailwindcss: {
    ...shared.sortTailwindcss,
    stylesheet: "./src/styles.css",
  },
});
```

The lint plugin's entry point resolves from the working directory; Oxfmt's stylesheet resolves from its config. In monorepos with different themes, give each workspace its own config and run lint there.

## Customization and migration

The wrapper preserves inherited `env`, `globals`, and `ignorePatterns` in declaration order, including nested presets. Oxlint otherwise drops those fields from imported `extends`. Consumer values win; additional ignores append to Ultracite's generated/build/dependency ignores. Negated patterns can re-include files. Oxlint handles rule, native plugin, and override merging. A matching inherited override wins over a root rule; put per-file customizations in a later matching `overrides` entry. See [Oxlint configuration](https://oxc.rs/docs/guide/usage/linter/config).

Core disables browser globals; `/react` and `/node` select their environments. Split mixed server/browser code with file overrides. Core retains the old config's underscore-prefixed unused variable exemptions, permits either TypeScript object definition style, allows numbers in template expressions, and allows async JSX event handlers. `/react` disables the conflicting general function-expression style rule. Other rules follow Ultracite's opinionated defaults, including kebab-case filenames.

This is a new baseline, not rule-for-rule compatibility with `@stzhu/eslint-config`. There is no Expo preset or import resolver replacement. Expo/React Native platform checks and additional `@eslint-react` rules (such as Web API leak detection) need a separately reviewed plugin/config. Native typed coverage also differs from typescript-eslint. Keep a small companion ESLint config when a needed rule requires a custom parser or TypeScript type information unavailable through Oxlint's JS plugin API. Do not enable both implementations of a rule.

The package pins Ultracite so upstream preset changes are reviewed. Upgrade it alongside Oxlint and run the compatibility tests before publishing. Additional native Ultracite framework presets can be supplied in `extends` without copying their rules. Follow [Ultracite's core-plus-framework layering](https://www.ultracite.ai/docs/configuration) and [Oxlint's migration guidance](https://oxc.rs/docs/guide/usage/linter/migrate-from-eslint).

## Development

```sh
pnpm install --frozen-lockfile
pnpm check
```

The checks build ESM and TypeScript declarations, lint/format this repository, exercise native and JavaScript rules through the real Oxlint CLI, and test a packed consumer. Lint and test each build first so they work independently in a fresh checkout.

GitHub workflows mirror `@stzhu/eslint-config` and call the reusable workflows in `stevezhu/actions@v1`: CI on pushes and pull requests to `main`, a manually selected patch/minor/major version-bump PR, and npm publishing when a release is published. The shared workflows select Node.js from `engines.node` in package.json. Release publishing requires [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) configured for this repository and its `publish.yml` workflow.
