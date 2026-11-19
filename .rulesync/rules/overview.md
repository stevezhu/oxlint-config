---
root: true
targets: ["*"]
description: "Project overview and general development guidelines"
globs: ["**/*"]
---

## Project context

- Use [README.md](README.md) for package setup, preset entry points, and release workflows.
- Use [docs/project-direction.md](docs/project-direction.md) for project decisions and the downstream integration pilot.

## Development

- Use `pnpm` and `pnpm exec` for repository commands.
- Run `pnpm check` before submitting code changes. It builds the package, checks types and formatting, runs Oxlint, and exercises the presets in consumer fixtures.
- Run `pnpm exec rulesync generate` after editing `.rulesync/` to regenerate the agent files.
