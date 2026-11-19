import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

interface Release {
  draft: boolean;
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

const previousRelease = (
  releases: PublishedRelease[],
  tag: string,
  cutoff: PublishedRelease | undefined
) => {
  const others = releases.filter((release) => release.tag_name !== tag);
  if (
    cutoff &&
    others.some((release) => release.published_at === cutoff.published_at)
  ) {
    throw new Error(
      "The candidate shares a publication timestamp with another release. Its predecessor is ambiguous."
    );
  }
  const [previous, second] = others
    .filter((release) => !cutoff || release.published_at < cutoff.published_at)
    .toSorted((left, right) =>
      right.published_at.localeCompare(left.published_at)
    );
  if (previous && previous.published_at === second?.published_at) {
    throw new Error(
      "Two previous releases share a publication timestamp. The predecessor is ambiguous."
    );
  }
  return previous;
};

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

  const history = execFileSync(
    "gh",
    [
      "api",
      "--paginate",
      `repos/${GITHUB_REPOSITORY}/releases?per_page=100`,
      "--jq",
      ".[] | {draft, published_at, tag_name}",
    ],
    { encoding: "utf-8", maxBuffer: Number.POSITIVE_INFINITY }
  ).trim();
  const releases =
    history === ""
      ? []
      : history
          .split("\n")
          .map(parseJSON<Release>)
          .filter(isPublished);
  const cutoff =
    release ?? releases.find(({ tag_name: tag }) => tag === candidate.tag);
  const preceding = previousRelease(releases, candidate.tag, cutoff);
  const previous = preceding && resolveTag(preceding.tag_name);

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

const verify = (generatedPath: string, attachedPath: string) => {
  if (!readFileSync(generatedPath).equals(readFileSync(attachedPath))) {
    throw new Error(
      "The attached rule changes report differs from the report generated for these releases."
    );
  }
};

const [command, first, second] = process.argv.slice(2);
if (command === "metadata" && first === undefined) {
  console.log(JSON.stringify(releaseComparison()));
} else if (
  command === "metadata" &&
  first === "--published" &&
  second === undefined
) {
  console.log(JSON.stringify(releaseComparison(readPublishedEvent())));
} else if (
  command === "verify" &&
  first !== undefined &&
  second !== undefined
) {
  verify(first, second);
} else {
  throw new Error(
    "Use release-report.ts metadata [--published] or release-report.ts verify <generated> <attached>."
  );
}
