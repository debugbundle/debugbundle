import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { createGitHubAppClient, createGitHubAppClientFromEnv } from "../../../apps/api/src/github-app.js";
import { createGitHubInstallationTokenFixture } from "../../helpers/github-installation-token.js";

function createPrivateKeyPem(): string {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return privateKey.export({ format: "pem", type: "pkcs1" }).toString();
}

describe("github app env", () => {
  it("normalizes escaped private key newlines from env", () => {
    const client = createGitHubAppClientFromEnv({
      GITHUB_APP_ID: "123",
      GITHUB_APP_PRIVATE_KEY: "-----BEGIN RSA PRIVATE KEY-----\\nabc\\n-----END RSA PRIVATE KEY-----",
      GITHUB_APP_WEBHOOK_SECRET: "webhook-secret"
    });

    expect(client).toBeDefined();
  });

  it("builds install URLs from real GitHub app responses that include extra fields", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      Response.json({
        id: 123,
        slug: "debugbundle-automation",
        name: "DebugBundle Automation",
        owner: {
          login: "debugbundle",
          id: 456
        },
        html_url: "https://github.com/apps/debugbundle-automation"
      })
    );
    const client = createGitHubAppClient(
      {
        appId: "123",
        privateKey: createPrivateKeyPem(),
        webhookSecret: "webhook-secret"
      },
      {
        fetchImpl,
        now: () => new Date("2026-05-11T00:00:00.000Z")
      }
    );

    await expect(client.getInstallUrl()).resolves.toBe("https://github.com/apps/debugbundle-automation/installations/new");
    expect(fetchImpl).toHaveBeenCalledWith("https://api.github.com/app", expect.objectContaining({ method: "GET" }));
  });

  it.each(["stateful", "stateless"] as const)(
    "lists repositories with %s GitHub installation tokens",
    async (tokenFormat) => {
      const installationToken = createGitHubInstallationTokenFixture(tokenFormat);
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({
            token: installationToken,
            expires_at: "2026-05-11T01:00:00.000Z",
            permissions: { contents: "read" },
            repository_selection: "selected"
          })
        )
        .mockResolvedValueOnce(
          Response.json({
            total_count: 1,
            repositories: [
              {
                id: 987,
                name: "debugbundle",
                full_name: "debugbundle/debugbundle",
                private: false,
                default_branch: "main",
                owner: {
                  login: "debugbundle",
                  id: 456,
                  type: "Organization"
                },
                permissions: {
                  admin: false,
                  maintain: false,
                  push: true,
                  triage: true,
                  pull: true
                }
              }
            ]
          })
        );
      const client = createGitHubAppClient(
        {
          appId: "123",
          privateKey: createPrivateKeyPem(),
          webhookSecret: "webhook-secret"
        },
        {
          fetchImpl,
          now: () => new Date("2026-05-11T00:00:00.000Z")
        }
      );

      await expect(client.listRepositories({ installationId: 42 })).resolves.toEqual([
        {
          id: 987,
          owner: "debugbundle",
          name: "debugbundle",
          full_name: "debugbundle/debugbundle",
          default_branch: "main",
          private: false
        }
      ]);
      expect(fetchImpl).toHaveBeenCalledWith(
        "https://api.github.com/app/installations/42/access_tokens",
        expect.objectContaining({ method: "POST" })
      );
      expect(fetchImpl).toHaveBeenCalledWith(
        "https://api.github.com/installation/repositories",
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({ authorization: `Bearer ${installationToken}` })
        })
      );
    }
  );
});
