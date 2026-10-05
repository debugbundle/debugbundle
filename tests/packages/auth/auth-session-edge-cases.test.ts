import { describe, expect, it, vi } from "vitest";

import {
  createAccountDeletionChallengeService,
  createWebSessionAuthService,
  hashToken
} from "../../../packages/auth/src/index.js";
import type { GitHubOAuthClient } from "../../../packages/auth/src/index.js";

function createGitHubOAuthClientMock(
  overrides: {
    exchangeCodeForIdentity?: GitHubOAuthClient["exchangeCodeForIdentity"];
  } = {}
): GitHubOAuthClient {
  const exchangeCodeForIdentity =
    overrides.exchangeCodeForIdentity ?? (async (): Promise<null> => null);

  return {
    exchangeCodeForIdentity,
    async resolveIdentityFromAccessToken() {
      return {
        ok: false,
        error: "token_invalid"
      };
    },
    async beginDeviceAuthorization() {
      return {
        ok: false,
        error: "device_flow_disabled"
      };
    },
    async pollDeviceAuthorization() {
      return {
        status: "provider_error"
      };
    }
  };
}

describe("auth session edge cases", () => {
  it("handles provider-not-configured, invalid-state, invite, and session-resolution edge cases", async (): Promise<void> => {
    const noGithubService = createWebSessionAuthService({
      findUserAccountByEmail: vi.fn(),
      createUserAccount: vi.fn(),
      createSession: vi.fn(),
      resolveSessionByTokenHash: vi.fn().mockResolvedValue(null),
      revokeSessionByTokenHash: vi.fn().mockResolvedValue(true),
      revokeOtherSessionsForUser: vi.fn().mockResolvedValue(0),
      markUserEmailVerified: vi.fn(),
      replaceEmailAuthChallenge: vi.fn(),
      consumeEmailAuthChallenge: vi.fn(),
      upsertGitHubUserAccount: vi.fn(),
      acceptProjectInvite: vi.fn()
    });

    await expect(noGithubService.beginGithubAuth()).resolves.toEqual({
      ok: false,
      error: "provider_not_configured"
    });
    await expect(
      noGithubService.completeGithubAuth({
        code: "oauth-code",
        state: "state",
        stateCookieValue: "state"
      })
    ).resolves.toEqual({ ok: false, error: "provider_not_configured" });

    const expiredInviteService = createWebSessionAuthService(
      {
        findUserAccountByEmail: vi.fn(),
        createUserAccount: vi.fn(),
        createSession: vi.fn(),
        resolveSessionByTokenHash: vi.fn().mockResolvedValue({
          session_id: "ses_123",
          user_id: "usr_123",
          email: "owen@example.com",
          email_verified_at: "2026-03-17T00:00:00.000Z",
          organization_id: "org_123",
          role: "owner",
          created_at: "2026-03-17T00:00:00.000Z",
          expires_at: "2026-03-16T00:00:00.000Z",
          revoked_at: null
        }),
        revokeSessionByTokenHash: vi.fn().mockResolvedValue(true),
        revokeOtherSessionsForUser: vi.fn().mockResolvedValue(0),
        markUserEmailVerified: vi.fn(),
        replaceEmailAuthChallenge: vi.fn(),
        consumeEmailAuthChallenge: vi.fn(),
        upsertGitHubUserAccount: vi.fn(),
        acceptProjectInvite: vi.fn()
      },
      {
        githubOAuth: {
          clientId: "debugbundle-dev-mock-github",
          callbackUrl: "http://localhost:5291/v1/auth/github/callback",
          appRedirectUrl: "http://localhost:5291/auth/github/callback",
          stateSecret: "github-oauth-secret",
          client: createGitHubOAuthClientMock()
        }
      }
    );

    const inviteService = createWebSessionAuthService(
      {
        findUserAccountByEmail: vi.fn(),
        createUserAccount: vi.fn(),
        createSession: vi.fn(),
        resolveSessionByTokenHash: vi.fn().mockResolvedValueOnce(null).mockResolvedValue({
          session_id: "ses_123",
          user_id: "usr_123",
          email: "owen@example.com",
          email_verified_at: "2026-03-17T00:00:00.000Z",
          organization_id: "org_123",
          role: "owner",
          created_at: "2026-03-17T00:00:00.000Z",
          expires_at: "2026-03-23T00:00:00.000Z",
          revoked_at: null
        }),
        revokeSessionByTokenHash: vi.fn().mockResolvedValue(true),
        revokeOtherSessionsForUser: vi.fn().mockResolvedValue(0),
        markUserEmailVerified: vi.fn(),
        replaceEmailAuthChallenge: vi.fn(),
        consumeEmailAuthChallenge: vi.fn(),
        upsertGitHubUserAccount: vi.fn(),
        acceptProjectInvite: vi
          .fn()
          .mockResolvedValueOnce({ kind: "email_mismatch" })
          .mockResolvedValueOnce({ kind: "shared_access_suspended" })
          .mockResolvedValueOnce({
            kind: "accepted",
            membership: { user_id: "usr_123", organization_id: "org_123", role: "member" }
          })
      },
      {
        githubOAuth: {
          clientId: "debugbundle-dev-mock-github",
          callbackUrl: "http://localhost:5291/v1/auth/github/callback",
          appRedirectUrl: "http://localhost:5291/auth/github/callback",
          stateSecret: "github-oauth-secret",
          client: createGitHubOAuthClientMock()
        }
      }
    );

    await expect(
      inviteService.acceptInviteForSession("session-secret", {
        token: "dbundle_invite_test",
        now: new Date("2026-03-17T00:00:00.000Z")
      })
    ).resolves.toEqual({
      ok: false,
      error: "invalid_session"
    });
    await expect(
      expiredInviteService.acceptInviteForSession("session-secret", {
        token: "dbundle_invite_test",
        now: new Date("2026-03-16T00:00:01.000Z")
      })
    ).resolves.toEqual({
      ok: false,
      error: "invalid_session"
    });
    await expect(
      inviteService.acceptInviteForSession("session-secret", {
        token: "not-an-invite",
        now: new Date("2026-03-17T00:00:00.000Z")
      })
    ).resolves.toEqual({
      ok: false,
      error: "invalid_token"
    });
    await expect(
      inviteService.acceptInviteForSession("session-secret", {
        token: "dbundle_invite_test",
        now: new Date("2026-03-17T00:00:00.000Z")
      })
    ).resolves.toEqual({
      ok: false,
      error: "invite_email_mismatch"
    });
    await expect(
      inviteService.acceptInviteForSession("session-secret", {
        token: "dbundle_invite_test",
        now: new Date("2026-03-17T00:00:00.000Z")
      })
    ).resolves.toEqual({
      ok: false,
      error: "shared_access_suspended"
    });
    await expect(
      inviteService.acceptInviteForSession("session-secret", {
        token: "dbundle_invite_test",
        now: new Date("2026-03-17T00:00:00.000Z")
      })
    ).resolves.toEqual({
      ok: true,
      membership: { user_id: "usr_123", organization_id: "org_123", role: "member" }
    });

    await expect(
      inviteService.resolveSessionByToken("session-secret", {
        now: new Date("2026-03-17T00:00:00.000Z")
      })
    ).resolves.toMatchObject({
      session_id: "ses_123"
    });
    await expect(
      inviteService.revokeSessionByToken("session-secret", {
        now: new Date("2026-03-17T00:30:00.000Z")
      })
    ).resolves.toBe(true);
  });

  it("requests and verifies a dedicated account deletion OTP without reusing sign-in challenges", async (): Promise<void> => {
    const now = new Date("2026-06-10T10:00:00.000Z");
    const replaceAccountDeletionChallenge = vi.fn().mockResolvedValue(undefined);
    const consumeAccountDeletionChallenge = vi.fn().mockResolvedValue({
      email: "owen@example.com"
    });
    const sendAccountDeletionOtp = vi.fn().mockResolvedValue(undefined);
    const service = createAccountDeletionChallengeService(
      {
        replaceAccountDeletionChallenge,
        consumeAccountDeletionChallenge
      },
      {
        authEmails: {
          sendAccountDeletionOtp
        }
      }
    );

    const requested = await service.requestDeletionOtp({
      organization_id: "org_123",
      user_id: "usr_123",
      email: "OWEN@example.com",
      now
    });
    const verified = await service.verifyDeletionOtp({
      organization_id: "org_123",
      user_id: "usr_123",
      email: "OWEN@example.com",
      code: "123456",
      now
    });

    expect(requested).toEqual({ ok: true, code_sent: true });
    expect(replaceAccountDeletionChallenge).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: "org_123",
        user_id: "usr_123",
        email: "owen@example.com",
        expires_at: "2026-06-10T10:10:00.000Z",
        replaced_at: now.toISOString()
      })
    );
    expect(sendAccountDeletionOtp).toHaveBeenCalledWith({
      email: "owen@example.com",
      code: expect.stringMatching(/^\d{6}$/),
      expires_in_minutes: 10
    });
    expect(consumeAccountDeletionChallenge).toHaveBeenCalledWith({
      organization_id: "org_123",
      user_id: "usr_123",
      email: "owen@example.com",
      code_hash: hashToken("123456"),
      used_at: now.toISOString()
    });
    expect(verified).toEqual({ ok: true });
  });
});
