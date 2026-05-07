import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const selfhostReadmePath = join(repoRoot, "deploy", "selfhost", "README.md");

describe("self-host GitHub App documentation", () => {
  it("documents the GitHub App setup procedure for self-host operators", () => {
    const readme = readFileSync(selfhostReadmePath, "utf8");

    expect(readme).toContain("GitHub App Setup");
    expect(readme).toContain("GITHUB_APP_ID");
    expect(readme).toContain("GITHUB_APP_PRIVATE_KEY");
    expect(readme).toContain("GITHUB_APP_WEBHOOK_SECRET");
    expect(readme).toContain("GITHUB_APP_CLIENT_ID");
    expect(readme).toContain("GITHUB_APP_CLIENT_SECRET");
    expect(readme).toContain("/v1/github/app/callback");
    expect(readme).toContain("/v1/github/app/webhook");
    expect(readme).toContain("repository_dispatch");
  });
});
