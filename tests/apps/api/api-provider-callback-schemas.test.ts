import { describe, expect, it } from "vitest";

import {
  GithubAuthCallbackQuerySchema,
  GitHubAppCallbackQuerySchema,
  SlackAppCallbackQuerySchema
} from "../../../apps/api/src/schemas.js";

describe("third-party provider callback query schemas", () => {
  it("accepts and strips provider query extensions from every callback", (): void => {
    const githubAuth = GithubAuthCallbackQuerySchema.parse({
      code: "oauth-code",
      state: "oauth-state",
      iss: "https://github.com/login/oauth",
      provider_extension: "ignored"
    });
    const githubApp = GitHubAppCallbackQuerySchema.parse({
      installation_id: "123",
      setup_action: "install",
      state: "install-state",
      provider_extension: "ignored"
    });
    const slackApp = SlackAppCallbackQuerySchema.parse({
      code: "oauth-code",
      state: "oauth-state",
      error_description: "ignored"
    });

    expect(githubAuth).toEqual({
      code: "oauth-code",
      state: "oauth-state",
      iss: "https://github.com/login/oauth"
    });
    expect(githubApp).toEqual({
      installation_id: 123,
      setup_action: "install",
      state: "install-state"
    });
    expect(slackApp).toEqual({
      code: "oauth-code",
      state: "oauth-state"
    });
  });

  it("still rejects invalid security-sensitive or consumed callback fields", (): void => {
    expect(
      GithubAuthCallbackQuerySchema.safeParse({
        code: "oauth-code",
        state: "oauth-state",
        iss: "https://attacker.example/login/oauth"
      }).success
    ).toBe(false);
    expect(
      GithubAuthCallbackQuerySchema.safeParse({
        code: ["oauth-code", "replacement-code"],
        state: "oauth-state"
      }).success
    ).toBe(false);
    expect(
      GitHubAppCallbackQuerySchema.safeParse({
        installation_id: ["123", "456"],
        state: "install-state"
      }).success
    ).toBe(false);
    expect(
      SlackAppCallbackQuerySchema.safeParse({
        code: ["oauth-code", "replacement-code"],
        state: "oauth-state"
      }).success
    ).toBe(false);
  });
});
