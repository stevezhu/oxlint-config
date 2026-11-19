#!/usr/bin/env bash
set -euo pipefail

comparison=$1
output=$2

install_and_build() (
  cd "$1"
  package_manager=$(node -p "require('./package.json').packageManager")
  npm exec --yes --package="$package_manager" -- pnpm install --frozen-lockfile --ignore-scripts
  npm run build
)

previous_commit=$(jq -r '.previousCommit // empty' "$comparison")
baseline=--initial
if [[ -n "$previous_commit" ]]; then
  baseline=$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/oxlint-release-base.XXXXXX")
  git worktree add --detach "$baseline" "$previous_commit"
  trap 'git worktree remove --force "$baseline"' EXIT
  install_and_build "$baseline"
fi
install_and_build "$PWD"
{
  node scripts/rule-changes.ts "$baseline"
  printf '\n%s\n' "$(jq -r '.footer' "$comparison")"
} > "$output"
