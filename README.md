# @stzhu/oxlint-config

Shared TypeScript and React lint configuration built on [Ultracite](https://www.ultracite.ai/providers/oxlint), using Oxlint's native rules and optional ESLint plugins for missing coverage. It follows the modular intent of [@stzhu/eslint-config](https://github.com/stevezhu/eslint-config).

## Install

Requires Node.js 24+ and Oxlint 1.93+. This is an ESM package.

```sh
pnpm add -D @stzhu/oxlint-config oxlint oxfmt oxlint-tsgolint typescript
```

Create `oxlint.config.ts` in a package with `"type": "module"`. Use `oxlint.config.mts` in other packages:

```ts
import { defineConfig } from "@stzhu/oxlint-config";
import react from "@stzhu/oxlint-config/react-web";
import vitest from "@stzhu/oxlint-config/vitest";

export default defineConfig({
  extends: [react, vitest],
  ignorePatterns: ["vendor"],
  options: {
    typeAware: true,
    maxWarnings: 0,
    reportUnusedDisableDirectives: "error",
  },
});
```

`defineConfig()` always includes the core preset. For a framework-free TypeScript project, use `defineConfig({ options: { typeAware: true } })`. Calling it with no arguments remains supported for projects without typed linting. For a server project, add `@stzhu/oxlint-config/node` to `extends`.

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
| `/react` | Shared React, Hooks, and React Compiler rules, without browser globals or DOM/HTML checks. Named components use function declarations, anonymous components use function expressions. |
| `/react-web` | Extends `/react` with browser globals, DOM checks, and JSX accessibility. |
| `/vitest` | Ultracite's native Vitest rules, scoped to test/spec files and `__tests__`, including JS/TS variants. Prefers `test` over `it`. |
| `/storybook` | `eslint-plugin-storybook` recommended rules, scoped to stories and `.storybook/main.*`. |
| `/tailwind` | `eslint-plugin-better-tailwindcss` correctness checks for unknown, conflicting, and concatenated classes. |
| `/lingui` | `eslint-plugin-lingui` recommended checks. |
| `/turbo` | `eslint-plugin-turbo/no-undeclared-env-vars`, using the consumer's `turbo.json`. |
| `/oxfmt` | Ultracite formatting, import sorting, package.json sorting, and Tailwind class sorting. Requires Oxfmt 0.78+. |

The last four lint presets use [Oxlint's JavaScript plugin API](https://oxc.rs/docs/guide/usage/linter/js-plugins), which is currently alpha. Their plugin dependencies are bundled as package dependencies and resolved from this package, so pnpm consumers do not need to install them directly. They run only when their preset is selected. Native React/Hooks/Refresh, import, Node, and Vitest equivalents stay in Oxlint; import and class sorting belong to Oxfmt.

For Vite React applications, opt into native Fast Refresh checks:

```ts
import { reactRefresh } from "@stzhu/oxlint-config/react";
import react from "@stzhu/oxlint-config/react-web";

// Within defineConfig({ ... }):
// extends: [react, reactRefresh]
```

## Type-aware linting

Type-aware linting is the recommended setup for TypeScript projects. Core configures typed rules, but running them requires `oxlint-tsgolint` and a project tsconfig with `strict` or `strictNullChecks`. Install the runner in the consuming workspace:

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
import react from "@stzhu/oxlint-config/react-web";
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

A relative lint `entryPoint` resolves from the plugin's `cwd`, which defaults to the directory where you run Oxlint. Oxfmt's `stylesheet` resolves from its formatter config. See the [monorepo recipe](#tailwind-themes-in-a-monorepo) for separate workspace themes.

## Customization and migration

The wrapper preserves inherited `env`, `globals`, and `ignorePatterns` in declaration order, including nested presets. Oxlint otherwise drops those fields from imported `extends`. Consumer values win; additional ignores append to Ultracite's generated/build/dependency ignores. Negated patterns can re-include files. Oxlint handles rule, native plugin, and override merging. A matching inherited override wins over a root rule; put per-file customizations in a later matching `overrides` entry. See [Oxlint configuration](https://oxc.rs/docs/guide/usage/linter/config).

Core disables browser globals; `/react-web` and `/node` select their environments. `/react` adds shared React checks without enabling a runtime. Split mixed server/browser code with file overrides. Core retains underscore-prefixed unused variable exemptions, permits either TypeScript object definition style, and allows numbers in template expressions. `/react` disables the conflicting general function-expression style rule. Other rules follow Ultracite's defaults, including kebab-case filenames.

### Migrating from the initial 0.1 baseline

These defaults introduce breaking lint-policy changes. Release them as a new 0.x minor, with the following migration steps:

- Web applications should change `/react` imports to `/react-web`. Shared hooks and native components can use `/react`; this does not provide Expo or React Native platform checks. Fast Refresh remains a separate named export from `/react`.
- Typed linting now rejects discarded promises even when prefixed with `void`, including thenables, and checks async callbacks assigned to void-returning JSX props. Handle UI-boundary failures explicitly, for example `onClick={() => { save().catch(reportError); }}`. The error handler should report the failure and update the UI; an empty catch only hides it. APIs typed to accept promises remain supported.
- Vitest retains type safety in tests. Prefer typed fixtures and mocks; put necessary exemptions in a later matching override for specific fixture files.
- Core permits semantic object-key grouping, inline explanations, TODO comments, increment operators, `forEach`, `reduce`, and sequential awaits. Complexity, callback nesting, assertion-count and describe-depth budgets are no longer universal blocking rules. Evaluate project-specific budgets in a separate audit configuration before promoting them to the main gate.

### Project coverage and monorepos

Install lint tools at the monorepo root and run `pnpm exec oxlint` there. Oxlint discovers the nearest config for each file. Each workspace imports the presets it needs and declares its plugin settings in its own config. Keep `options.typeAware` and `options.reportUnusedDisableDirectives` in the root config. Run without `--config` to preserve [nested discovery](https://oxc.rs/docs/guide/usage/linter/nested-config).

Provide discoverable `tsconfig.json` files with deliberately scoped source, config, and test includes. Recommend TypeScript `strict` and `noUncheckedIndexedAccess`; evaluate `exactOptionalPropertyTypes` against each project's APIs. Keep the project's TypeScript check while validating compatibility with Oxlint's optional type-checking mode. This repository type-checks its TS source and configuration files, while its dynamic `.mjs` CLI harness has explicit local exemptions for unsafe-value diagnostics; the published Vitest preset has no such exemptions.

The Turbo plugin discovers `turbo.json` from the invocation's working directory. Run from the monorepo root when using its root Turbo config.

#### Tailwind themes in a monorepo

For example, `apps/storefront` and `apps/admin` each have `src/styles.css` and their own `oxlint.config.mts`. Install the lint dependencies at the root and Tailwind CSS in each app.

```sh
pnpm add -Dw @stzhu/oxlint-config oxlint oxlint-tsgolint typescript @types/node
```

In the repository root's `oxlint.config.mts`, configure the options for the whole lint run.

```ts
import { defineConfig } from "@stzhu/oxlint-config";

export default defineConfig({
  options: { typeAware: true, reportUnusedDisableDirectives: "error" },
});
```

Use this `oxlint.config.mts` in each app. The plugin's `cwd` points to the app so it can resolve the app's Tailwind CSS dependency. The absolute entry point points to the same stylesheet when you run Oxlint from the root or the app.

```ts
import { fileURLToPath } from "node:url";

import { defineConfig } from "@stzhu/oxlint-config";
import reactWeb from "@stzhu/oxlint-config/react-web";
import tailwind from "@stzhu/oxlint-config/tailwind";

export default defineConfig({
  extends: [reactWeb, tailwind],
  settings: {
    "better-tailwindcss": {
      cwd: import.meta.dirname,
      entryPoint: fileURLToPath(new URL("src/styles.css", import.meta.url)),
    },
  },
});
```

Include each lint config in its project's `tsconfig.json`. Add `node` to `compilerOptions.types` for the configs that import `node:url`.

Run `pnpm exec oxlint` from the root to apply each theme and the root typed and suppression policies in one invocation. For a workspace-local run, pass those options on the CLI because the app's config becomes the root for that invocation.

```sh
pnpm --dir apps/storefront exec oxlint --type-aware --report-unused-disable-directives-severity=error
```

Oxfmt owns formatting and import/class ordering; side-effect import sorting remains disabled. Keep optional JS plugins selected individually. Broader Ultracite parity and anti-slop presets should first demonstrate useful additional diagnostics on representative code; native equivalents remain preferred. Do not duplicate a rule between Oxlint and a companion ESLint configuration.

This is a new baseline, not rule-for-rule compatibility with `@stzhu/eslint-config`. There is no Expo preset or import resolver replacement. Expo/React Native platform checks and additional `@eslint-react` rules (such as Web API leak detection) need a separately reviewed plugin/config. Native typed coverage also differs from typescript-eslint. Keep a small companion ESLint config when a needed rule requires a custom parser or TypeScript type information unavailable through Oxlint's JS plugin API. Do not enable both implementations of a rule.

The package pins Ultracite so upstream preset changes are reviewed. Upgrade Oxlint and oxlint-tsgolint as a tested pair. Review effective rule changes and run native, plugin, and packed-consumer compatibility tests before publishing. New blocking diagnostics and preset environment changes require a documented breaking release. Keep consumer tools pinned; test the minimum supported versions and any newly proposed versions before widening peer ranges. Additional native Ultracite framework presets can be supplied in `extends` without copying their rules. Follow [Ultracite's core-plus-framework layering](https://www.ultracite.ai/docs/configuration) and [Oxlint's migration guidance](https://oxc.rs/docs/guide/usage/linter/migrate-from-eslint).

## Development

```sh
pnpm install --frozen-lockfile
pnpm check
```

The checks build ESM and TypeScript declarations, type-check the source and config files, run type-aware linting and formatting, exercise native and JavaScript rules through the real Oxlint CLI, and test a packed consumer. Lint and test each build first so they work independently in a fresh checkout.

GitHub workflows follow the CI, version-bump, and release pattern of `@stzhu/eslint-config`, using the composite actions in `stevezhu/actions@v3`. They run CI on pushes and pull requests to `main`, open a manually selected patch/minor/major version-bump PR, and stage an npm publish when a release is published. The actions select Node.js from `engines.node` in package.json and pnpm from `packageManager` (pnpm 12, which supports staged publishing).

Configure the repository's `NPM_TOKEN` secret for the publish action. Release publishing uses [`pnpm stage publish`](https://pnpm.io/cli/stage); approve the staged package on npmjs.com or with `pnpm stage approve <stage-id>` and 2FA before it becomes public. The stage ID appears in the action logs.
