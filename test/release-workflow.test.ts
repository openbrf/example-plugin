import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

/**
 * Holds the release workflow to its split: a job that can sign an
 * attestation (`id-token: write`) installs and runs none of the lockfile's
 * packages, so code that runs at build time never holds the token that signs.
 */

type Permissions = string | Record<string, string> | undefined;

interface Step {
  uses?: string;
  run?: string;
}

interface Job {
  needs?: string | string[];
  permissions?: Permissions;
  steps?: Step[];
}

interface Workflow {
  permissions?: Permissions;
  jobs: Record<string, Job>;
}

/** Actions that install a package manager or a Node to run dependencies with. */
const SETUP_ACTIONS = ["pnpm/action-setup", "actions/setup-node"];

/** A command that installs or runs what the lockfile holds. */
const DEPENDENCY_COMMAND = /(^|[\s;&|(`$])(pnpm|npm|npx|yarn|corepack|node)\b/m;

function mintsTokens(permissions: Permissions): boolean {
  if (typeof permissions === "string") {
    return permissions === "write-all";
  }
  return permissions?.["id-token"] === "write";
}

/** Every sentence a workflow fails the split with; none when it holds. */
function splitProblems(workflow: Workflow): string[] {
  const problems: string[] = [];
  for (const [id, job] of Object.entries(workflow.jobs)) {
    // A job without its own permissions takes the workflow's.
    if (!mintsTokens(job.permissions ?? workflow.permissions)) {
      continue;
    }
    for (const step of job.steps ?? []) {
      const action = step.uses?.split("@")[0];
      if (action !== undefined && SETUP_ACTIONS.includes(action)) {
        problems.push(`job ${id} can sign attestations and uses ${action}`);
      }
      const command = step.run?.match(DEPENDENCY_COMMAND)?.[2];
      if (command !== undefined) {
        problems.push(`job ${id} can sign attestations and runs ${command}`);
      }
    }
  }
  return problems;
}

const workflow = parse(
  readFileSync(".github/workflows/release.yml", "utf8"),
) as Workflow;

describe("the release workflow", () => {
  it("grants nothing at the top, so each job states what it needs", () => {
    expect(workflow.permissions).toEqual({});
  });

  it("builds with read access only", () => {
    expect(workflow.jobs.build?.permissions).toEqual({ contents: "read" });
  });

  it("attests in a job that needs the build", () => {
    const publish = workflow.jobs.publish;
    expect(mintsTokens(publish?.permissions)).toBe(true);
    expect(publish).toMatchObject({ needs: "build" });
  });

  it("installs and runs none of the lockfile's packages in a job that can sign attestations", () => {
    expect(splitProblems(workflow)).toEqual([]);
  });

  it("refuses a single job that builds where it signs", () => {
    const single: Workflow = {
      permissions: {},
      jobs: {
        release: {
          permissions: { contents: "write", "id-token": "write" },
          steps: [
            {
              uses: "pnpm/action-setup@ea17c68df8912ef543352723c149a84f56e3d413",
            },
            { run: "pnpm install --frozen-lockfile" },
            { run: "mkdir release\nnpm pack --pack-destination release" },
            { uses: "actions/attest-build-provenance@4d101475" },
          ],
        },
      },
    };

    expect(splitProblems(single)).toEqual([
      "job release can sign attestations and uses pnpm/action-setup",
      "job release can sign attestations and runs pnpm",
      "job release can sign attestations and runs npm",
    ]);
  });

  it("refuses a job that takes write-all from the workflow and runs node", () => {
    const inherited: Workflow = {
      permissions: "write-all",
      jobs: { publish: { steps: [{ run: "node scripts/check-package.mjs" }] } },
    };

    expect(splitProblems(inherited)).toEqual([
      "job publish can sign attestations and runs node",
    ]);
  });
});
