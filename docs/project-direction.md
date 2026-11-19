# Project direction

Make `@stzhu/oxlint-config` the dependable lint baseline for TypeScript monorepos that mix browser, server, and shared code. A team should be able to adopt it one workspace at a time, catch real bugs in CI, and know what an upgrade will change before taking it.

## Goal

Get two independent mixed-runtime monorepos from an existing lint setup to a green typed lint gate using the published package. For a checkout with a working install and typecheck, target 15 minutes to the first green lint run. Record elapsed time, the config and source edits required, and every retained ESLint check or lint exception. Verify that a seeded dropped promise fails CI and that the corrected code passes. Count an adoption after the downstream CI gate lands and runs on the released version.

The first audience is teams already using pnpm and strict TypeScript with React web, server, and shared workspaces. Mixed-runtime adoption exercises package resolution, project discovery, and environment boundaries together. A common baseline pays off when teams can remove duplicated lint setup and still see the checks they depend on.

## Product decisions

- Prioritize actionable correctness checks for asynchronous code, unsafe typing, React Hooks, and browser accessibility. Require a failing example and a passing counterpart for a proposed default rule. Evaluate changes against actual consumer diagnostics before expanding the default gate.
- Build on Ultracite presets and run the Oxlint and Oxfmt CLIs directly. Keep style conventions and the formatter opt-in. Enable JavaScript plugins where they cover a demonstrated gap and exercise their selected preset through the real CLI.
- Keep the root lint invocation and workspace-specific configuration as the standard recipe. Validate typed coverage, preset boundaries, and the behavior of a clean project separately. Keep the consumer's TypeScript check and document any complementary ESLint rules by name.
- Treat release changes as part of the product. Ship effective rule diffs and migration notes with releases. Block new preset or tooling work on a demonstrated consumer need. Revisit Expo and other framework-specific coverage when there is a pilot that needs it.

## Current state

Reviewed `e680a6e` on November 18, 2026. The package has typed promise and unsafe-value checks, separate React and React web presets, and opt-in style presets. Packed consumers exercise public imports and documented config entry points. CI also covers nested typed linting with different Tailwind themes and generation of rule-change reports. [Merged preset changes](https://github.com/stevezhu/oxlint-config/pull/3), [main CI](https://github.com/stevezhu/oxlint-config/actions/runs/44432903828), [setup and release workflow](../README.md).

The previous source-only pilots reduced diagnostics from 153 to 40 in Fastify, 38 to 13 in Vite/Redux, and 28 to 5 in Nest/Next. Each caught a seeded promise defect. Full dependency installs were blocked, so those results establish a reduction in migration noise without measuring the path to green CI. [Pilot results](https://github.com/stevezhu/oxlint-config/pull/3).

Public npm returned 404 for `@stzhu/oxlint-config`. GitHub listed no releases and no repository-level Actions secret named `NPM_TOKEN`. The manifest version is `0.1.0`. Use `0.2.0` for the first release candidate so people who tried development builds can distinguish the revised defaults. A local rule-change report against an empty release history generated successfully.

## Active milestone

Turn the passing local pilot into a release that a consumer can install from npm and use in CI.

1. Review the pilot-backed defaults and prepare the `0.2.0` candidate. The release notes should cover workspace preset selection, the `/react-web` migration, promise rejection handling, and the style opt-ins described below. Generate the tagged rule-change report and attach it to the GitHub release. Confirm publish access for `@stzhu` and provide `NPM_TOKEN` through Actions secrets. Verify a registry install after npm approval. [Staged publish workflow](../.github/workflows/publish.yml), [publish action](https://github.com/stevezhu/actions/blob/v3/npm-publish/action.yaml).
2. In the template, align Oxfmt to 0.78 and the existing `eslint-plugin-oxlint` bridge to 1.93, then put the web and server pilot behind the downstream CI gate using the registry version. Compare the effective ESLint configs for both apps and record each companion rule that contributes coverage before removing any duplicate. Exercise the existing root lint and codegen tasks before extending the migration to other workspaces.
3. Repeat with a second monorepo. Start with the Nest/Next example tested in PR #3 as the second compatibility pilot. Record scoped install time, time to first green, and exceptions. Track a second adoption when another maintained downstream CI gate lands.

## Integration testing

Use the template as the primary downstream integration test repository. For each release candidate, pack the config, verify the template's current `main`, and run the web and server checks in a disposable copy. Record both commit IDs and any consumer changes needed to pass. [stevezhu/monorepo-template](https://github.com/stevezhu/monorepo-template).

### Pilot record

The first local pilot used `stevezhu/monorepo-template` at `13eecab38413536abe7ecf83cc9a481571defe6c` in a temporary snapshot. It covered the Vite/React web app and Cloudflare Worker server app with their actual pinned dependencies. The existing lint commands and TypeScript checks passed. The candidate used Node 26.4.0, pnpm 12.18.0, Oxlint 1.93.0, and oxlint-tsgolint 7.0.2006.

| Run | Result |
| --- | --- |
| Existing typed Oxlint | 0 diagnostics on 17 files in 0.91 s. |
| Packed build from `e680a6e` with workspace configs | 6 diagnostics on 19 files in 1.02 s. Three pointed to a single navigation callback. Three covered braces, the DOM lookup method, and a forwarded promise outside a local error handler. |
| Revised packed build with the navigation fix | 0 diagnostics on 19 files in 0.67 s. Both apps passed TypeScript and existing ESLint checks. |
| Seeded defects and corrections | The root run reported a dropped promise in each app and an unknown Tailwind class in the web app. The corrected run passed on 22 files. |

The pilot informed a proposed change to move mandatory braces, selector API preferences, and the preference for async functions over callback patterns into `coreStyle`. A typed inline `.catch()` handler in a synchronous UI callback had triggered the callback preference. The change limits the default `return await` rule to cases where it affects error handling or cleanup. Consumers can opt into the broader rule with `coreStyle`. [Lint preset changes and regression tests](https://github.com/stevezhu/oxlint-config/pull/8).

The template's existing Oxfmt 0.77 and ESLint bridge 1.92 caused peer warnings when the tarball and Oxlint 1.93 were installed. The pilot kept those existing tools and passed the scoped checks. It used a warm dependency cache and reports command runtimes. End-to-end migration time, full downstream CI, and registry adoption remain to be measured.

The candidate in PR #8 passed `pnpm check` with registry access, including all 29 tests. The repository's packed-consumer test needs access to npm registry metadata.

### Latest verification

On November 18, 2026, the packed candidate `95e19cc435d2685b7656f4d010f20dcf11a860d7` was verified against the template's then-current `main` at `13eecab38413536abe7ecf83cc9a481571defe6c` in a fresh snapshot. The run used Node 26.13.0, pnpm 12.18.0, Oxlint and `eslint-plugin-oxlint` 1.93.0, Oxfmt 0.78.0, and oxlint-tsgolint 7.0.2006. The unmodified navigation callback produced the expected typed diagnostics. After the callback fix, typed lint passed on 19 files and both apps passed TypeScript and ESLint. A seeded dropped promise in each app and an unknown Tailwind class in the web app failed the root lint run. The corrected run passed on 22 files. The peer check still reported warnings in `example-convex` and `example-ext`, which were outside this run's scope.

### Replay the pilot

1. Export the pinned template revision to a temporary directory to replay this pilot, or use the current `main` to verify a new candidate. Install with `pnpm --filter . --filter 'example-web...' --filter 'example-server...' install --frozen-lockfile --ignore-scripts`. Run `pnpm --filter example-server run init` before its `codegen` script so Wrangler generates the example environment's types.
2. Run `pnpm pack` from a checkout that includes the lint changes in PR #8. Install the tarball, `oxlint@1.93.0`, and `oxfmt@0.78.0` as dev dependencies at the template root. Use `eslint-plugin-oxlint@1.93.0` in both pilot apps. Preserve the template's existing root config for the other packages.
3. In `apps/example-web/oxlint.config.ts`, compose `/react-web`, `reactRefresh`, and `/tailwind` with this package's `defineConfig`. Set the Tailwind plugin's `cwd` to `import.meta.dirname` and resolve its entry point to the app's `src/main.css`. In `apps/example-server/oxlint.config.ts`, compose `/node` for tooling and set `env: { node: false, worker: true }` for `src/**/*.{ts,tsx}`. Preserve generated-file ignores in both configs, including `**/*.gen.ts`, `**/_generated/**`, and `**/*.gen.d.ts` for the server.
4. In `apps/example-web/src/default-not-found-fallback.tsx`, make `onGoHome` return void. Handle the rejection from `router.navigate()` by reporting the error and updating the fallback's description so the user can retry.
5. Run the following commands from the temporary template root. To verify coverage, drop a promise in a temporary source file in each app and add an unknown Tailwind class to a temporary web component. Await both promises, replace the unknown class with a valid utility, and verify the lint run passes.

```sh
pnpm exec oxlint --type-aware --max-warnings=0 \
  --report-unused-disable-directives-severity=error apps/example-web apps/example-server
pnpm --filter example-server --filter example-web typecheck
pnpm --filter example-server --filter example-web lint
```

## Operating record

Update this file when evidence changes the direction, when a milestone moves, or when an owner needs to make a decision. Record the commit, commands or CI run, outcome, outstanding work, and the next action. Keep current instructions and detailed technical reference in the [README](../README.md).

| Date | Decision or outcome | Next action |
| --- | --- | --- |
| 2026-11-18 | Prioritized real-consumer adoption and release readiness after synchronizing main. | Ran the web and server pilot on the template. |
| 2026-11-18 | Reached green on the packed pilot with one source fix and no lint suppressions. Typed promise and Tailwind probes passed. | Prepare `0.2.0` and align the downstream tool versions for a reproducible CI migration. |
| 2026-11-18 | Selected `stevezhu/monorepo-template` as the primary integration test repository and repeated the pilot with aligned tool versions in both apps. | Repeat the test on the release candidate and use the result to prepare downstream CI adoption. |
