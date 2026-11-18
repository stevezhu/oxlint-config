import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

interface Release {
  draft: boolean;
  id: number;
  published_at: string | null;
  tag_name: string;
}

interface PublishedRelease extends Release {
  published_at: string;
}

interface Revision {
  commit: string;
  tag: string;
}

const run = (command: string, args: string[]) =>
  execFileSync(command, args, { encoding: "utf-8" }).trim();

// oxlint-disable-next-line typescript/no-unnecessary-type-parameters, typescript/no-unsafe-type-assertion -- GitHub supplies the documented REST and event JSON shapes.
const parseJSON = <T>(json: string): T => JSON.parse(json) as T;

const isPublished = (release: Release): release is PublishedRelease =>
  !release.draft && release.published_at !== null;

const comparePublication = (left: PublishedRelease, right: PublishedRelease) =>
  left.published_at.localeCompare(right.published_at) || left.id - right.id;

const resolveTag = (tag: string): Revision => ({
  commit: run("git", [
    "rev-parse",
    "--verify",
    "--end-of-options",
    `refs/tags/${tag}^{commit}`,
  ]),
  tag,
});

const releaseComparison = (release?: PublishedRelease) => {
  const { GITHUB_REF_TYPE, GITHUB_REF_NAME, GITHUB_REPOSITORY, GITHUB_SHA } =
    process.env;
  if (
    GITHUB_REF_TYPE !== "tag" ||
    GITHUB_REF_NAME === undefined ||
    GITHUB_REPOSITORY === undefined
  ) {
    throw new Error("Select the candidate's release tag to compare.");
  }

  const candidate = resolveTag(GITHUB_REF_NAME);
  if (
    candidate.commit !== GITHUB_SHA ||
    run("git", ["rev-parse", "HEAD"]) !== GITHUB_SHA
  ) {
    throw new Error("The candidate tag and checked-out commit must match.");
  }
  if (release && release.tag_name !== candidate.tag) {
    throw new Error("The release event must match the candidate tag.");
  }

  const releases = parseJSON<Release[][]>(
    run("gh", [
      "api",
      "--paginate",
      "--slurp",
      `repos/${GITHUB_REPOSITORY}/releases?per_page=100`,
    ])
  )
    .flat()
    .filter(isPublished);
  const cutoff =
    release ?? releases.find(({ tag_name: tag }) => tag === candidate.tag);
  const [previousRelease] = releases
    .filter(
      (item) =>
        item.tag_name !== candidate.tag &&
        (cutoff === undefined || comparePublication(item, cutoff) < 0)
    )
    .toSorted((left, right) => comparePublication(right, left));
  const previous = previousRelease && resolveTag(previousRelease.tag_name);

  return {
    previousCommit: previous?.commit ?? null,
    footer: [
      `Candidate tag: \`${candidate.tag}\``,
      `Candidate commit: \`${candidate.commit}\``,
      `Previous tag: \`${previous?.tag ?? "(none)"}\``,
      `Previous commit: \`${previous?.commit ?? "(none)"}\``,
    ].join("\n"),
  };
};

const readPublishedEvent = (): PublishedRelease => {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (eventPath === undefined) {
    throw new Error("The release event is required to verify the report.");
  }
  const { action, release } = parseJSON<{ action: string; release: Release }>(
    readFileSync(eventPath, "utf-8")
  );
  if (action !== "published" || !isPublished(release)) {
    throw new Error("Expected a published release event.");
  }
  return release;
};

const verify = (reportPath: string) => {
  const comparison = releaseComparison(readPublishedEvent());
  const report = readFileSync(reportPath, "utf-8").trimEnd();
  if (!report.endsWith(`\n\n${comparison.footer}`)) {
    throw new Error(
      "The report must match the candidate and previous published release."
    );
  }

  const body = report.slice(0, -comparison.footer.length - 2);
  const lines = body.split("\n");
  const [previousSummary, candidateSummary] = lines.slice(2);
  const isInitialReport = previousSummary === "- Previous: Initial release";
  const hasChanges =
    /\n\| Scope \| Rule \| Previous \| Candidate \| Presets \|\n\|[^\n]+\n\|[^\n]+/u.test(
      body
    );
  if (
    !body.startsWith("# Oxlint rule changes\n\n") ||
    previousSummary?.startsWith("- Previous: ") !== true ||
    candidateSummary?.startsWith("- Candidate: ") !== true ||
    isInitialReport !== (comparison.previousCommit === null) ||
    (!hasChanges && !lines.includes("No rule-level changes."))
  ) {
    throw new Error(
      "Attach the complete rule changes report for this comparison."
    );
  }
};

const [command, reportPath] = process.argv.slice(2);
if (command === "metadata") {
  console.log(JSON.stringify(releaseComparison()));
} else if (command === "verify" && reportPath !== undefined) {
  verify(reportPath);
} else {
  throw new Error(
    "Use release-report.ts metadata or release-report.ts verify <report>."
  );
}
