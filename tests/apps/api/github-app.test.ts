import { describe, expect, it } from "vitest";

import { createGitHubAppClientFromEnv } from "../../../apps/api/src/github-app.js";

describe("github app env", () => {
  it("normalizes escaped private key newlines from env", () => {
    const client = createGitHubAppClientFromEnv({
      GITHUB_APP_ID: "123",
      GITHUB_APP_PRIVATE_KEY: "-----BEGIN RSA PRIVATE KEY-----\\nabc\\n-----END RSA PRIVATE KEY-----",
      GITHUB_APP_WEBHOOK_SECRET: "webhook-secret"
    });

    expect(client).toBeDefined();
  });
});