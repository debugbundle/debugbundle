import { describe, expect, it, vi } from "vitest";

import { createGitHubCliAuthService, type GitHubCliAuthStore } from "../../../packages/auth/src/github-cli-auth.js";
import type { GitHubOAuthConfig } from "../../../packages/auth/src/github-auth-client.js";

function createStore(overrides: Partial<GitHubCliAuthStore> = {}): GitHubCliAuthStore {
  return {
    findUserAccountByEmail: vi.fn().mockResolvedValue(null),
    findGitHubUserAccountByProviderUserId: vi.fn().mockResolvedValue(null),
    upsertGitHubUserAccount: vi.fn().mockResolvedValue({
      user_id: "usr_123",
      email: "owen@example.com",
      email_verified_at: "2026-03-17T00:00:00.000Z",
      organization_id: "org_123",
      role: "owner",
      created_user: false,
    }),
    createGitHubDeviceAuthorization: vi.fn().mockImplementation(async (input: Parameters<GitHubCliAuthStore["createGitHubDeviceAuthorization"]>[0]) => ({
      ...input,
      completed_at: null,
      claimed_at: null,
      terminal_error: null,
      user_id: null,
      organization_id: null,
    })),
    getGitHubDeviceAuthorization: vi.fn().mockResolvedValue(null),
    completeGitHubDeviceAuthorization: vi.fn().mockResolvedValue(true),
    setGitHubDeviceAuthorizationTerminalError: vi.fn().mockResolvedValue(true),
    claimGitHubDeviceAuthorizationMemberToken: vi.fn().mockResolvedValue("not_found"),
    issueMemberTokenForUser: vi.fn().mockResolvedValue({
      token_id: "tok_123",
      user_id: "usr_123",
      organization_id: "org_123",
      label: "GitHub bootstrap",
      created_at: "2026-03-17T00:00:00.000Z",
      last_used_at: null,
      revoked_at: null,
      expires_at: null,
    }),
    ...overrides,
  };
}

function createGithubOAuth(overrides: Partial<GitHubOAuthConfig["client"]> = {}): GitHubOAuthConfig {
  return {
    clientId: "github-client-id",
    callbackUrl: "https://api.debugbundle.test/v1/auth/github/callback",
    appRedirectUrl: "https://app.debugbundle.test/auth/github/callback",
    stateSecret: "github-state-secret",
    client: {
      exchangeCodeForIdentity: vi.fn(),
      resolveIdentityFromAccessToken: vi.fn().mockResolvedValue({
        ok: true,
        identity: {
          github_user_id: "ghu_123",
          email: "owen@example.com",
        },
      }),
      beginDeviceAuthorization: vi.fn().mockResolvedValue({
        ok: true,
        device_code: "device-code",
        user_code: "ABCD-EFGH",
        verification_uri: "https://github.com/login/device",
        expires_in: 900,
        interval: 5,
      }),
      pollDeviceAuthorization: vi.fn().mockResolvedValue({ status: "pending", interval_seconds: 7 }),
      ...overrides,
    },
  };
}

describe("github cli auth service", () => {
  it("fails closed when github oauth is not configured", async () => {
    const service = createGitHubCliAuthService(createStore());

    await expect(service.beginDeviceAuth({ accepted_terms_at: "2026-03-17T00:00:00.000Z" })).resolves.toEqual({
      ok: false,
      error: "provider_not_configured",
    });
    await expect(service.pollDeviceAuth({ request_id: "req_123" })).resolves.toEqual({
      ok: false,
      error: "provider_not_configured",
    });
    await expect(service.claimDeviceAuth({ request_id: "req_123", label: "GitHub bootstrap" })).resolves.toEqual({
      ok: false,
      error: "provider_not_configured",
    });
    await expect(
      service.exchangeGitHubAccessToken({
        github_access_token: "gho_123",
        label: "GitHub bootstrap",
        accepted_terms_at: "2026-03-17T00:00:00.000Z",
      })
    ).resolves.toEqual({
      ok: false,
      error: "provider_not_configured",
    });
  });

  it("starts device auth and persists the authorization request", async () => {
    const store = createStore();
    const githubOAuth = createGithubOAuth();
    const service = createGitHubCliAuthService(store, { githubOAuth });

    const started = await service.beginDeviceAuth({
      accepted_terms_at: "2026-03-17T00:00:00.000Z",
      now: new Date("2026-03-17T00:00:00.000Z"),
    });

    expect(started.ok).toBe(true);
    expect(githubOAuth.client.beginDeviceAuthorization).toHaveBeenCalledWith({
      scope: "read:user user:email",
    });
    expect(store.createGitHubDeviceAuthorization).toHaveBeenCalledWith(
      expect.objectContaining({
        device_code: "device-code",
        user_code: "ABCD-EFGH",
        verification_uri: "https://github.com/login/device",
        interval_seconds: 5,
        accepted_terms_at: "2026-03-17T00:00:00.000Z",
      })
    );
  });

  it.each([
    [
      "returns request_not_found when no request exists",
      null,
      { ok: false, error: "request_not_found" },
    ],
    [
      "returns claimed for already-claimed requests",
      {
        request_id: "req_123",
        device_code: "device-code",
        user_code: "ABCD-EFGH",
        verification_uri: "https://github.com/login/device",
        interval_seconds: 5,
        expires_at: "2026-03-17T00:15:00.000Z",
        accepted_terms_at: null,
        created_at: "2026-03-17T00:00:00.000Z",
        completed_at: null,
        claimed_at: "2026-03-17T00:10:00.000Z",
        terminal_error: null,
        user_id: null,
        organization_id: null,
      },
      { ok: true, status: "claimed", expires_at: "2026-03-17T00:15:00.000Z" },
    ],
    [
      "returns approved for completed requests",
      {
        request_id: "req_123",
        device_code: "device-code",
        user_code: "ABCD-EFGH",
        verification_uri: "https://github.com/login/device",
        interval_seconds: 5,
        expires_at: "2026-03-17T00:15:00.000Z",
        accepted_terms_at: null,
        created_at: "2026-03-17T00:00:00.000Z",
        completed_at: "2026-03-17T00:10:00.000Z",
        claimed_at: null,
        terminal_error: null,
        user_id: "usr_123",
        organization_id: "org_123",
      },
      { ok: true, status: "approved", expires_at: "2026-03-17T00:15:00.000Z" },
    ],
    [
      "returns rejected terminal errors without polling github again",
      {
        request_id: "req_123",
        device_code: "device-code",
        user_code: "ABCD-EFGH",
        verification_uri: "https://github.com/login/device",
        interval_seconds: 5,
        expires_at: "2026-03-17T00:15:00.000Z",
        accepted_terms_at: null,
        created_at: "2026-03-17T00:00:00.000Z",
        completed_at: null,
        claimed_at: null,
        terminal_error: "github_email_unavailable",
        user_id: null,
        organization_id: null,
      },
      {
        ok: true,
        status: "rejected",
        reason: "github_email_unavailable",
        expires_at: "2026-03-17T00:15:00.000Z",
      },
    ],
  ])("%s", async (_label, request, expected) => {
    const service = createGitHubCliAuthService(
      createStore({
        getGitHubDeviceAuthorization: vi.fn().mockResolvedValue(request),
      }),
      { githubOAuth: createGithubOAuth() }
    );

    await expect(service.pollDeviceAuth({ request_id: "req_123" })).resolves.toEqual(expected);
  });

  it("maps polled github statuses through pending, terminal, and approved account-resolution paths", async () => {
    const request = {
      request_id: "req_123",
      device_code: "device-code",
      user_code: "ABCD-EFGH",
      verification_uri: "https://github.com/login/device",
      interval_seconds: 5,
      expires_at: "2026-03-18T00:15:00.000Z",
      accepted_terms_at: "2026-03-17T00:00:00.000Z",
      created_at: "2026-03-17T00:00:00.000Z",
      completed_at: null,
      claimed_at: null,
      terminal_error: null,
      user_id: null,
      organization_id: null,
    };

    const pendingStore = createStore({
      getGitHubDeviceAuthorization: vi.fn().mockResolvedValue(request),
    });
    const pendingService = createGitHubCliAuthService(pendingStore, {
      githubOAuth: createGithubOAuth({
        pollDeviceAuthorization: vi.fn().mockResolvedValue({ status: "pending", interval_seconds: 11 }),
      }),
    });
    await expect(
      pendingService.pollDeviceAuth({ request_id: "req_123", now: new Date("2026-03-17T00:05:00.000Z") })
    ).resolves.toEqual({
      ok: true,
      status: "pending",
      interval_seconds: 11,
      expires_at: "2026-03-18T00:15:00.000Z",
    });

    const deniedStore = createStore({
      getGitHubDeviceAuthorization: vi.fn().mockResolvedValue(request),
    });
    const deniedService = createGitHubCliAuthService(deniedStore, {
      githubOAuth: createGithubOAuth({
        pollDeviceAuthorization: vi.fn().mockResolvedValue({ status: "denied" }),
      }),
    });
    await expect(
      deniedService.pollDeviceAuth({ request_id: "req_123", now: new Date("2026-03-17T00:05:00.000Z") })
    ).resolves.toEqual({
      ok: true,
      status: "denied",
      reason: "access_denied",
      expires_at: "2026-03-18T00:15:00.000Z",
    });
    expect(deniedStore.setGitHubDeviceAuthorizationTerminalError).toHaveBeenCalledWith({
      request_id: "req_123",
      terminal_error: "access_denied",
    });

    const rejectedStore = createStore({
      getGitHubDeviceAuthorization: vi.fn().mockResolvedValue(request),
    });
    const rejectedService = createGitHubCliAuthService(rejectedStore, {
      githubOAuth: createGithubOAuth({
        pollDeviceAuthorization: vi.fn().mockResolvedValue({ status: "email_unavailable" }),
      }),
    });
    await expect(
      rejectedService.pollDeviceAuth({ request_id: "req_123", now: new Date("2026-03-17T00:05:00.000Z") })
    ).resolves.toEqual({
      ok: true,
      status: "rejected",
      reason: "github_email_unavailable",
      expires_at: "2026-03-18T00:15:00.000Z",
    });

    const suspendedStore = createStore({
      getGitHubDeviceAuthorization: vi.fn().mockResolvedValue(request),
      completeGitHubDeviceAuthorization: vi.fn().mockResolvedValue(false),
    });
    const suspendedService = createGitHubCliAuthService(suspendedStore, {
      githubOAuth: createGithubOAuth({
        pollDeviceAuthorization: vi.fn().mockResolvedValue({
          status: "approved",
          identity: {
            github_user_id: "ghu_123",
            email: "owen@example.com",
          },
        }),
      }),
    });
    await expect(
      suspendedService.pollDeviceAuth({ request_id: "req_123", now: new Date("2026-03-17T00:05:00.000Z") })
    ).resolves.toEqual({
      ok: true,
      status: "rejected",
      reason: "account_suspended",
      expires_at: "2026-03-18T00:15:00.000Z",
    });

    const approvedStore = createStore({
      getGitHubDeviceAuthorization: vi.fn().mockResolvedValue(request),
    });
    const approvedService = createGitHubCliAuthService(approvedStore, {
      githubOAuth: createGithubOAuth({
        pollDeviceAuthorization: vi.fn().mockResolvedValue({
          status: "approved",
          identity: {
            github_user_id: "ghu_123",
            email: "owen@example.com",
          },
        }),
      }),
    });
    await expect(
      approvedService.pollDeviceAuth({ request_id: "req_123", now: new Date("2026-03-17T00:05:00.000Z") })
    ).resolves.toEqual({
      ok: true,
      status: "approved",
      expires_at: "2026-03-18T00:15:00.000Z",
    });
  });

  it("maps device-token claim outcomes and returns plaintext credentials on success", async () => {
    const notFoundService = createGitHubCliAuthService(
      createStore({
        claimGitHubDeviceAuthorizationMemberToken: vi.fn().mockResolvedValue("not_found"),
      }),
      { githubOAuth: createGithubOAuth() }
    );
    await expect(notFoundService.claimDeviceAuth({ request_id: "req_123", label: "GitHub bootstrap" })).resolves.toEqual({
      ok: false,
      error: "request_not_found",
    });

    const rejectedService = createGitHubCliAuthService(
      createStore({
        claimGitHubDeviceAuthorizationMemberToken: vi.fn().mockResolvedValue("terminal_error"),
      }),
      { githubOAuth: createGithubOAuth() }
    );
    await expect(rejectedService.claimDeviceAuth({ request_id: "req_123", label: "GitHub bootstrap" })).resolves.toEqual({
      ok: false,
      error: "rejected",
    });

    const successService = createGitHubCliAuthService(
      createStore({
        claimGitHubDeviceAuthorizationMemberToken: vi.fn().mockResolvedValue({
          token_id: "tok_123",
          user_id: "usr_123",
          organization_id: "org_123",
          label: "GitHub bootstrap",
          created_at: "2026-03-17T00:00:00.000Z",
          last_used_at: null,
          revoked_at: null,
          expires_at: null,
        }),
      }),
      { githubOAuth: createGithubOAuth() }
    );
    const claimed = await successService.claimDeviceAuth({ request_id: "req_123", label: "GitHub bootstrap" });
    expect(claimed.ok).toBe(true);
    if (claimed.ok) {
      expect(claimed.token.plaintext.startsWith("dbundle_mem_")).toBe(true);
    }
  });

  it("maps github access-token exchange outcomes and issues member tokens on success", async () => {
    const emailUnavailableService = createGitHubCliAuthService(createStore(), {
      githubOAuth: createGithubOAuth({
        resolveIdentityFromAccessToken: vi.fn().mockResolvedValue({ ok: false, error: "email_unavailable" }),
      }),
    });
    await expect(
      emailUnavailableService.exchangeGitHubAccessToken({
        github_access_token: "gho_123",
        label: "GitHub bootstrap",
        accepted_terms_at: "2026-03-17T00:00:00.000Z",
      })
    ).resolves.toEqual({
      ok: false,
      error: "github_email_unavailable",
    });

    const signupDisabledService = createGitHubCliAuthService(
      createStore({
        upsertGitHubUserAccount: vi.fn(),
      }),
      {
        signupEmailAllowlist: ["allowlisted@example.com"],
        githubOAuth: createGithubOAuth({
          resolveIdentityFromAccessToken: vi.fn().mockResolvedValue({
            ok: true,
            identity: {
              github_user_id: "ghu_123",
              email: "outsider@example.com",
            },
          }),
        }),
      }
    );
    await expect(
      signupDisabledService.exchangeGitHubAccessToken({
        github_access_token: "gho_123",
        label: "GitHub bootstrap",
        accepted_terms_at: "2026-03-17T00:00:00.000Z",
      })
    ).resolves.toEqual({
      ok: false,
      error: "account_signup_disabled",
    });

    const successStore = createStore({
      issueMemberTokenForUser: vi.fn().mockResolvedValue({
        token_id: "tok_123",
        user_id: "usr_123",
        organization_id: "org_123",
        label: "GitHub bootstrap",
        created_at: "2026-03-17T00:00:00.000Z",
        last_used_at: null,
        revoked_at: null,
        expires_at: null,
      }),
    });
    const successService = createGitHubCliAuthService(successStore, {
      githubOAuth: createGithubOAuth(),
    });
    const exchanged = await successService.exchangeGitHubAccessToken({
      github_access_token: "gho_123",
      label: "GitHub bootstrap",
      accepted_terms_at: "2026-03-17T00:00:00.000Z",
      now: new Date("2026-03-17T00:00:00.000Z"),
    });

    expect(exchanged.ok).toBe(true);
    if (exchanged.ok) {
      expect(exchanged.token.plaintext.startsWith("dbundle_mem_")).toBe(true);
      expect(exchanged.created_user).toBe(false);
    }
  });
});
