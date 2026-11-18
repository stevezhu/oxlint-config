import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(
  new URL("../scripts/release-report.ts", import.meta.url)
);

const createRelease = (tag, id, day, options = {}) => ({
  draft: false,
  id,
  published_at: `2026-03-${day}T00:00:00Z`,
  tag_name: tag,
  ...options,
});

const makeReport = (footer, previousLabel) =>
  `# Oxlint rule changes\n\n- Previous: ${previousLabel}\n- Candidate: candidate\n\nNo rule-level changes.\n\n${footer}\n`;

test(
  "release reports match the preceding published tag and commit",
  {
    skip: process.platform === "win32" && "Uses a GitHub Actions shell fixture",
  },
  (context) => {
    const cwd = mkdtempSync(path.join(tmpdir(), "oxlint-release-report-"));
    context.after(() => rmSync(cwd, { force: true, recursive: true }));

    const releasesPath = path.join(cwd, "releases.json");
    const eventPath = path.join(cwd, "event.json");
    const reportPath = path.join(cwd, "rule-changes.md");
    writeFileSync(
      path.join(cwd, "gh"),
      '#!/bin/sh\n[ "$*" = "api --paginate --slurp repos/test/repo/releases?per_page=100" ] || exit 1\ncat "$TEST_RELEASES_PATH"\n',
      { mode: 0o700 }
    );

    const git = (...args) =>
      execFileSync(
        "git",
        [
          "-c",
          "user.name=Oxlint Tests",
          "-c",
          "user.email=tests@example.invalid",
          ...args,
        ],
        { cwd, encoding: "utf-8" }
      ).trim();
    const tag = (name) => {
      git("commit", "--quiet", "--allow-empty", "--no-gpg-sign", "-m", name);
      git("tag", "-a", "--no-sign", "-m", name, name);
      return git("rev-parse", "HEAD");
    };
    git("init", "--quiet");
    const older = tag("v0.8.0");
    const previous = tag("v0.9.0-rc.1");
    tag("v0.9.0-draft");
    tag("v0.9.0-unreleased");
    const candidate = tag("v1.0.0");
    tag("v1.1.0");
    git("checkout", "--quiet", "--detach", candidate);

    const run = (...args) =>
      spawnSync(process.execPath, [script, ...args], {
        cwd,
        encoding: "utf-8",
        env: {
          ...process.env,
          GITHUB_EVENT_PATH: eventPath,
          GITHUB_REF_NAME: "v1.0.0",
          GITHUB_REF_TYPE: "tag",
          GITHUB_REPOSITORY: "test/repo",
          GITHUB_SHA: candidate,
          PATH: `${cwd}${path.delimiter}${process.env.PATH ?? ""}`,
          TEST_RELEASES_PATH: releasesPath,
        },
      });
    const metadata = () => {
      const result = run("metadata");
      assert.equal(result.status, 0, result.stderr);
      return JSON.parse(result.stdout);
    };
    const verify = (report, error) => {
      writeFileSync(reportPath, report);
      const result = run("verify", reportPath);
      assert.equal(result.status, error ? 1 : 0, result.stderr);
      if (error) {
        assert.match(result.stderr, error);
      }
    };

    const oldRelease = createRelease("v0.8.0", 1, "01");
    const previousRelease = createRelease("v0.9.0-rc.1", 2, "02", {
      prerelease: true,
    });
    const draft = createRelease("v0.9.0-draft", 3, "03", {
      draft: true,
    });
    const candidateRelease = createRelease("v1.0.0", 4, "04");
    const later = createRelease("v1.1.0", 5, "05");
    writeFileSync(
      eventPath,
      JSON.stringify({ action: "published", release: candidateRelease })
    );

    writeFileSync(releasesPath, JSON.stringify([[draft]]));
    const initial = metadata();
    assert.equal(initial.previousCommit, null);
    verify(makeReport(initial.footer, "Initial release"));

    writeFileSync(
      releasesPath,
      JSON.stringify([[draft, oldRelease], [previousRelease]])
    );
    const comparison = metadata();
    assert.equal(comparison.previousCommit, previous);
    assert.match(comparison.footer, /Previous tag: `v0\.9\.0-rc\.1`/u);

    // Published candidates and later releases cannot replace the original baseline.
    writeFileSync(
      releasesPath,
      JSON.stringify([
        [candidateRelease, draft, oldRelease],
        [later, previousRelease],
      ])
    );
    assert.deepEqual(metadata(), comparison);
    const report = makeReport(comparison.footer, "previous");
    verify(report);
    writeFileSync(
      releasesPath,
      JSON.stringify([
        [draft, oldRelease],
        [later, previousRelease],
      ])
    );
    verify(report);
    verify(comparison.footer, /must match/u);
    verify(
      `# Oxlint rule changes\n\n${comparison.footer}\n`,
      /complete rule changes report/u
    );
    verify(makeReport(initial.footer, "Initial release"), /must match/u);
    verify(report.replace(previous, older), /must match/u);
    verify(report.replace(candidate, older), /must match/u);
  }
);
