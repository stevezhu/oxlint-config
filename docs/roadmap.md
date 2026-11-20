# Roadmap

The goal for `@stzhu/oxlint-config` is to give mixed-runtime TypeScript monorepos a typed lint check they can adopt one workspace at a time and keep through upgrades. Our first measure of success is two independent repositories running the published package in CI. The milestones below reflect our current priorities. The [project direction and operating record](project-direction.md) holds the decisions and pilot results behind them.

## First, get the published package into downstream CI

As of November 20, 2026, the Vite/React web app and Cloudflare Worker in `stevezhu/monorepo-template` pass CI with the Git-pinned `0.2.0` candidate. The pilot caught a dropped promise in each app and an unknown Tailwind class in the web app. Both the release candidate and the downstream migration are in draft. [Release candidate](https://github.com/stevezhu/oxlint-config/pull/10) · [Template pilot](https://github.com/stevezhu/monorepo-template/pull/300)

1. Review the candidate against current `main`, attach the tagged rule-change report and migration notes to the release, and verify a clean install of the approved package from npm.
2. Switch the template from the Git pin to the published version, remove the temporary build permission, and rerun its existing CI. Keep the workspace TypeScript and companion ESLint checks. Verify the root typed lint command still catches the seeded defects and passes after correction.

Count the first adoption when the template migration lands and its default branch passes CI using the registry version.

## Next, repeat the migration in an independent monorepo

Start with the Nest/Next example from the earlier pilot to check a different runtime and workspace layout. Then work with a second maintained repository whose owner can land the check. A compatibility run can uncover problems, while a merged downstream gate establishes adoption. [Earlier pilot results](https://github.com/stevezhu/oxlint-config/pull/3)

From a checkout with working dependencies and a passing typecheck, aim for 15 minutes to the first green typed lint run. Record install time separately, along with config edits, source fixes, suppressions, and the ESLint rules the consumer still needs. If setup exceeds the target, use the slowest step to decide what to simplify. Count the second adoption when its default branch runs the released config in CI and a seeded dropped promise has demonstrated that the gate works.

## Over time, keep upgrades predictable

- Use the template as the first integration check for each release candidate. Test the packed package, examine the effective rule diff, and explain any new blocking diagnostics or changed runtime assumptions in the migration notes. When widening support, exercise both the minimum supported tools and the proposed upgrade. [Release workflow](../README.md#release-rule-changes)
- Change defaults when consumer code shows a defect the rule catches and a valid counterpart it accepts. Check the resulting diagnostics in a downstream workspace. Keep style and formatting opt-in. If an Oxlint upgrade can replace a companion ESLint rule, demonstrate equivalent coverage before recommending its removal.
- Take on another framework when a maintained consumer can show a gap and exercise the proposed preset. For example, an Expo pilot with a reproducible platform-specific defect would give us a reason to prioritize React Native coverage.

## When priorities change

Revisit the order after a downstream adoption, a failed migration, or an upstream change that affects consumers. A release that stops catching the seeded promise takes precedence over expanding to another framework. If both pilots spend most of their setup time on TypeScript project discovery, prioritize that problem and reconsider the 15-minute target with the measurements in hand.

When the evidence changes a priority or the goal itself, update this roadmap and add a short entry to the [operating record](project-direction.md#operating-record) with the evidence, the decision, and what would prompt another review.
