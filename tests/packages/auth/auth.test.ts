import { describe, expect, it, vi } from "vitest";

import {
  GITHUB_OAUTH_STATE_COOKIE_NAME,
  MEMBER_TOKEN_PREFIX,
  PROJECT_TOKEN_PREFIX,
  SESSION_COOKIE_NAME,
  buildClearedGithubOauthStateCookie,
  buildClearedSessionCookie,
  buildGithubOauthStateCookie,
  buildSessionCookie,
  createAccountDeletionChallengeService,
  createWebSessionAuthService,
  generateEmailAuthCode,
  generateGithubOauthState,
  generateMemberToken,
  generateProjectToken,
  hashPassword,
  hashToken,
  readBearerToken,
  readCookieValue,
  requireMemberToken,
  requireProjectToken,
  validateGithubOauthState,
  validateMemberToken,
  validateProjectToken,
  verifyPassword
} from "../../../packages/auth/src/index.js";
import type { GitHubOAuthClient } from "../../../packages/auth/src/index.js";

function createGitHubOAuthClientMock(overrides: {
  exchangeCodeForIdentity?: GitHubOAuthClient["exchangeCodeForIdentity"];
} = {}): GitHubOAuthClient {
  const exchangeCodeForIdentity =
    overrides.exchangeCodeForIdentity ??
    (async (): Promise<null> => null);

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

describe("auth token primitives", () => {
  it("generates project and member tokens with canonical prefixes", (): void => {
    const project = generateProjectToken("proj_123");
    const member = generateMemberToken("mem_123");

    expect(project.plaintext.startsWith(PROJECT_TOKEN_PREFIX)).toBe(true);
    expect(member.plaintext.startsWith(MEMBER_TOKEN_PREFIX)).toBe(true);
    expect(project.hash).toBe(hashToken(project.plaintext));
    expect(member.hash).toBe(hashToken(member.plaintext));
  });

  it("hashes tokens deterministically with sha256 hex output", (): void => {
    const token = "dbundle_proj_secret";

    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).toHaveLength(64);
    expect(hashToken(token)).not.toBe(token);
  });

  it("validates project and member token guards", async (): Promise<void> => {
    const project = await validateProjectToken("dbundle_proj_abc", () => Promise.resolve({ project_id: "proj_123" }));
    const member = await validateMemberToken(
      "dbundle_mem_abc",
      () => Promise.resolve({ member_id: "mem_123", organization_id: "org_123" })
    );

    expect(project).toEqual({ ok: true, context: { project_id: "proj_123" } });
    expect(member).toEqual({ ok: true, context: { member_id: "mem_123", organization_id: "org_123" } });
  });

  it("rejects invalid, expired, and revoked token contexts", async (): Promise<void> => {
    await expect(validateProjectToken("wrong-prefix", () => Promise.resolve({ project_id: "proj_123" }))).resolves.toEqual({
      ok: false,
      error: "invalid_token",
    });
    await expect(validateMemberToken("dbundle_mem_missing", () => Promise.resolve(null))).resolves.toEqual({
      ok: false,
      error: "invalid_token",
    });
    await expect(
      validateMemberToken("dbundle_mem_revoked", () =>
        Promise.resolve({ member_id: "mem_123", organization_id: "org_123", revoked_at: "2026-03-16T00:00:00.000Z" })
      )
    ).resolves.toEqual({
      ok: false,
      error: "token_revoked",
    });
    await expect(
      validateMemberToken(
        "dbundle_mem_expired",
        () => Promise.resolve({ member_id: "mem_123", organization_id: "org_123", expires_at: "2026-03-16T00:00:00.000Z" }),
        { now: new Date("2026-03-16T00:00:01.000Z") }
      )
    ).resolves.toEqual({
      ok: false,
      error: "token_expired",
    });
  });

  it("enforces project and member token route guards", async (): Promise<void> => {
    const acceptedProject = await requireProjectToken({
      authorizationHeader: "Bearer dbundle_proj_valid",
      resolveByTokenHash: () => Promise.resolve({ project_id: "proj_123" })
    });
    const rejectedProject = await requireProjectToken({
      authorizationHeader: "Bearer dbundle_mem_wrong_scope",
      resolveByTokenHash: () => Promise.resolve({ project_id: "proj_123" })
    });
    const acceptedMember = await requireMemberToken({
      authorizationHeader: "Bearer dbundle_mem_valid",
      resolveByTokenHash: () => Promise.resolve({ member_id: "mem_123", organization_id: "org_123" })
    });
    const rejectedMember = await requireMemberToken({
      authorizationHeader: "Bearer dbundle_proj_wrong_scope",
      resolveByTokenHash: () => Promise.resolve({ member_id: "mem_123", organization_id: "org_123" })
    });

    expect(acceptedProject).toEqual({ ok: true, context: { project_id: "proj_123" } });
    expect(rejectedProject).toEqual({ ok: false, error: "invalid_project_token" });
    expect(acceptedMember).toEqual({ ok: true, context: { member_id: "mem_123", organization_id: "org_123" } });
    expect(rejectedMember).toEqual({ ok: false, error: "invalid_member_token" });
  });

  it("parses bearer headers and cookie values safely", (): void => {
    expect(readBearerToken("Bearer dbundle_proj_abc")).toBe("dbundle_proj_abc");
    expect(readBearerToken("Basic abc")).toBeNull();
    expect(readCookieValue(undefined, SESSION_COOKIE_NAME)).toBeNull();
    expect(readCookieValue(`${SESSION_COOKIE_NAME}=session-secret; theme=light`, SESSION_COOKIE_NAME)).toBe("session-secret");
  });
});

describe("auth email-code and session primitives", () => {
  it("hashes passwords with argon2id and verifies matching plaintext", async (): Promise<void> => {
    const passwordHash = await hashPassword("CorrectHorseBatteryStaple!");

    expect(passwordHash).not.toBe("CorrectHorseBatteryStaple!");
    expect(passwordHash.startsWith("$argon2")).toBe(true);
    expect(await verifyPassword("CorrectHorseBatteryStaple!", passwordHash)).toBe(true);
    expect(await verifyPassword("wrong-password", passwordHash)).toBe(false);
  });

  it("generates six-digit email auth codes with deterministic hashes", (): void => {
    const code = generateEmailAuthCode();

    expect(code.plaintext).toMatch(/^\d{6}$/);
    expect(code.hash).toBe(hashToken(code.plaintext));
  });

  it("builds and clears GitHub oauth cookies with lax semantics", (): void => {
    const now = new Date("2026-03-17T00:00:00.000Z");
    const state = generateGithubOauthState({ now, secret: "github-oauth-secret", lifetimeMs: 10 * 60 * 1000 });

    expect(validateGithubOauthState(state.token, { now, secret: "github-oauth-secret" })).toBe(true);
    expect(buildGithubOauthStateCookie(state.token, state.expires_at)).toContain(`${GITHUB_OAUTH_STATE_COOKIE_NAME}=`);
    expect(buildGithubOauthStateCookie(state.token, state.expires_at)).toContain("SameSite=Lax");
    expect(buildClearedGithubOauthStateCookie()).toContain("Max-Age=0");

    const localCookie = buildGithubOauthStateCookie(state.token, state.expires_at, { secure: false });
    expect(localCookie).not.toContain("Secure");
  });

  it("rejects tampered GitHub oauth states without throwing", (): void => {
    const now = new Date("2026-03-17T00:00:00.000Z");
    const state = generateGithubOauthState({ now, secret: "github-oauth-secret", lifetimeMs: 10 * 60 * 1000 });
    const separatorIndex = state.token.lastIndexOf(".");
    const payloadSegment = state.token.slice(0, separatorIndex);

    expect(validateGithubOauthState(`${payloadSegment}.short`, { now, secret: "github-oauth-secret" })).toBe(false);
    expect(validateGithubOauthState(`${payloadSegment}.tampered-signature-value`, { now, secret: "github-oauth-secret" })).toBe(false);
    expect(validateGithubOauthState(state.token, { now, secret: "wrong-secret" })).toBe(false);
  });

  it("rejects malformed github oauth state payloads and malformed cookie reads", () => {
    expect(validateGithubOauthState("missing-separator", { secret: "github-oauth-secret" })).toBe(false);

    const malformedPayload = `${Buffer.from(JSON.stringify({ nonce: "abc", expires_at: "2026-03-17T00:10:00.000Z", accepted_terms_at: 123 }), "utf8").toString("base64url")}.sig`;
    expect(validateGithubOauthState(malformedPayload, { secret: "github-oauth-secret" })).toBe(false);
    expect(readBearerToken("Bearer")).toBeNull();
    expect(readCookieValue("theme=light; broken-entry", SESSION_COOKIE_NAME)).toBeNull();
  });

  it("requests an email code for new accounts and sends the OTP email", async (): Promise<void> => {
    const now = new Date("2026-03-16T00:00:00.000Z");
    const replaceEmailAuthChallenge = vi.fn().mockResolvedValue({
      challenge_id: "challenge_123",
      email: "owen@example.com",
      accepted_terms_at: now.toISOString(),
      expires_at: "2026-03-16T00:10:00.000Z",
      used_at: null
    });
    const sendEmailAuthCode = vi.fn().mockResolvedValue(undefined);
    const service = createWebSessionAuthService(
      {
        findUserAccountByEmail: vi.fn().mockResolvedValue(null),
        createUserAccount: vi.fn(),
        createSession: vi.fn(),
        resolveSessionByTokenHash: vi.fn(),
        revokeSessionByTokenHash: vi.fn(),
        revokeOtherSessionsForUser: vi.fn().mockResolvedValue(0),
        markUserEmailVerified: vi.fn(),
        replaceEmailAuthChallenge,
        consumeEmailAuthChallenge: vi.fn(),
        upsertGitHubUserAccount: vi.fn(),
        acceptProjectInvite: vi.fn()
      },
      {
        authEmails: {
          sendEmailAuthCode,
          sendProjectInviteEmail: vi.fn().mockResolvedValue(undefined)
        }
      }
    );

    const result = await service.requestEmailCode({
      email: "OWEN@example.com",
      accepted_terms_at: now.toISOString(),
      now
    });

    expect(result).toEqual({ ok: true, code_sent: true });
    expect(replaceEmailAuthChallenge).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "owen@example.com",
        accepted_terms_at: now.toISOString(),
        replaced_at: now.toISOString(),
        expires_at: "2026-03-16T00:10:00.000Z"
      })
    );
    expect(sendEmailAuthCode).toHaveBeenCalledWith({
      email: "owen@example.com",
      code: expect.stringMatching(/^\d{6}$/),
      expires_in_minutes: 10
    });
  });

  it("verifies a code, creates a new account, and issues a verified session", async (): Promise<void> => {
    const now = new Date("2026-03-16T00:00:00.000Z");
    const findUserAccountByEmail = vi.fn().mockResolvedValueOnce(null);
    const createUserAccount = vi.fn().mockResolvedValue({
      user_id: "usr_123",
      email: "owen@example.com",
      email_verified_at: null,
      organization_id: "org_123",
      role: "owner"
    });
    const markUserEmailVerified = vi.fn().mockResolvedValue(true);
    const createSession = vi.fn().mockResolvedValue({
      session_id: "ses_123",
      user_id: "usr_123",
      email: "owen@example.com",
      email_verified_at: now.toISOString(),
      organization_id: "org_123",
      role: "owner",
      created_at: now.toISOString(),
      expires_at: "2026-03-23T00:00:00.000Z",
      revoked_at: null,
      has_email_auth: true,
      has_github_oauth: false
    });
    const consumeEmailAuthChallenge = vi.fn().mockResolvedValue({
      email: "owen@example.com",
      accepted_terms_at: now.toISOString()
    });
    const service = createWebSessionAuthService(
      {
        findUserAccountByEmail,
        createUserAccount,
        createSession,
        resolveSessionByTokenHash: vi.fn(),
        revokeSessionByTokenHash: vi.fn(),
        revokeOtherSessionsForUser: vi.fn().mockResolvedValue(0),
        markUserEmailVerified,
        replaceEmailAuthChallenge: vi.fn(),
        consumeEmailAuthChallenge,
        upsertGitHubUserAccount: vi.fn(),
        acceptProjectInvite: vi.fn()
      }
    );

    const verified = await service.verifyEmailCode({
      email: "OWEN@example.com",
      code: "123456",
      now
    });

    expect(consumeEmailAuthChallenge).toHaveBeenCalledWith({
      email: "owen@example.com",
      code_hash: hashToken("123456"),
      used_at: now.toISOString()
    });
    expect(createUserAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "owen@example.com",
        accepted_terms_at: now.toISOString(),
        created_at: now.toISOString()
      })
    );
    expect(markUserEmailVerified).toHaveBeenCalledWith({
      user_id: "usr_123",
      verified_at: now.toISOString()
    });
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "usr_123",
        organization_id: "org_123",
        auth_method: "email_code"
      })
    );
    expect(verified.ok).toBe(true);
    if (!verified.ok) {
      return;
    }
    expect(verified.created_user).toBe(true);
    expect(verified.session.email).toBe("owen@example.com");
    expect(verified.session_token).toMatch(/^[a-f0-9]{48}$/);
  });

  it("rejects invalid or unapproved email code verification attempts", async (): Promise<void> => {
    const invalidService = createWebSessionAuthService({
      findUserAccountByEmail: vi.fn().mockResolvedValue(null),
      createUserAccount: vi.fn(),
      createSession: vi.fn(),
      resolveSessionByTokenHash: vi.fn(),
      revokeSessionByTokenHash: vi.fn(),
      revokeOtherSessionsForUser: vi.fn().mockResolvedValue(0),
      markUserEmailVerified: vi.fn(),
      replaceEmailAuthChallenge: vi.fn(),
      consumeEmailAuthChallenge: vi.fn().mockResolvedValue(null),
      upsertGitHubUserAccount: vi.fn(),
      acceptProjectInvite: vi.fn()
    });

    await expect(invalidService.verifyEmailCode({ email: "owen@example.com", code: "123456" })).resolves.toEqual({
      ok: false,
      error: "invalid_code"
    });

    const noTermsService = createWebSessionAuthService(
      {
        findUserAccountByEmail: vi.fn().mockResolvedValue(null),
        createUserAccount: vi.fn(),
        createSession: vi.fn(),
        resolveSessionByTokenHash: vi.fn(),
        revokeSessionByTokenHash: vi.fn(),
        revokeOtherSessionsForUser: vi.fn().mockResolvedValue(0),
        markUserEmailVerified: vi.fn(),
        replaceEmailAuthChallenge: vi.fn(),
        consumeEmailAuthChallenge: vi.fn().mockResolvedValue({
          email: "owen@example.com",
          accepted_terms_at: null
        }),
        upsertGitHubUserAccount: vi.fn(),
        acceptProjectInvite: vi.fn()
      }
    );

    await expect(noTermsService.verifyEmailCode({ email: "owen@example.com", code: "123456" })).resolves.toEqual({
      ok: false,
      error: "invalid_code"
    });
  });

  it("creates sessions for existing accounts and preserves established users", async (): Promise<void> => {
    const now = new Date("2026-03-16T00:00:00.000Z");
    const createUserAccount = vi.fn();
    const markUserEmailVerified = vi.fn().mockResolvedValue(true);
    const createSession = vi.fn().mockResolvedValue({
      session_id: "ses_456",
      user_id: "usr_123",
      email: "owen@example.com",
      email_verified_at: now.toISOString(),
      organization_id: "org_123",
      role: "owner",
      created_at: now.toISOString(),
      expires_at: "2026-03-23T00:00:00.000Z",
      revoked_at: null,
      has_email_auth: true,
      has_github_oauth: true
    });
    const service = createWebSessionAuthService({
      findUserAccountByEmail: vi.fn().mockResolvedValue({
        user_id: "usr_123",
        email: "owen@example.com",
        email_verified_at: null,
        organization_id: "org_123",
        role: "owner"
      }),
      createUserAccount,
      createSession,
      resolveSessionByTokenHash: vi.fn(),
      revokeSessionByTokenHash: vi.fn(),
      revokeOtherSessionsForUser: vi.fn().mockResolvedValue(0),
      markUserEmailVerified,
      replaceEmailAuthChallenge: vi.fn(),
      consumeEmailAuthChallenge: vi.fn().mockResolvedValue({
        email: "owen@example.com",
        accepted_terms_at: now.toISOString()
      }),
      upsertGitHubUserAccount: vi.fn(),
      acceptProjectInvite: vi.fn()
    });

    const verified = await service.verifyEmailCode({ email: "owen@example.com", code: "123456", now });

    expect(createUserAccount).not.toHaveBeenCalled();
    expect(markUserEmailVerified).toHaveBeenCalledWith({
      user_id: "usr_123",
      verified_at: now.toISOString()
    });
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "usr_123",
        organization_id: "org_123",
        auth_method: "email_code"
      })
    );
    expect(verified.ok).toBe(true);
    if (!verified.ok) {
      return;
    }
    expect(verified.created_user).toBe(false);
    expect(verified.session.has_github_oauth).toBe(true);
  });

  it("fails closed when email-code verification reaches a suspended account", async (): Promise<void> => {
    const now = new Date("2026-03-16T00:00:00.000Z");
    const service = createWebSessionAuthService({
      findUserAccountByEmail: vi.fn().mockResolvedValue({
        user_id: "usr_123",
        email: "owen@example.com",
        email_verified_at: now.toISOString(),
        organization_id: "org_123",
        role: "owner"
      }),
      createUserAccount: vi.fn(),
      createSession: vi.fn().mockResolvedValue(null),
      resolveSessionByTokenHash: vi.fn(),
      revokeSessionByTokenHash: vi.fn(),
      revokeOtherSessionsForUser: vi.fn().mockResolvedValue(0),
      markUserEmailVerified: vi.fn(),
      replaceEmailAuthChallenge: vi.fn(),
      consumeEmailAuthChallenge: vi.fn().mockResolvedValue({
        email: "owen@example.com",
        accepted_terms_at: now.toISOString()
      }),
      upsertGitHubUserAccount: vi.fn(),
      acceptProjectInvite: vi.fn()
    });

    await expect(service.verifyEmailCode({ email: "owen@example.com", code: "123456", now })).resolves.toEqual({
      ok: false,
      error: "account_suspended"
    });
  });

  it("uses a custom authorize url when github auth is configured with one", async (): Promise<void> => {
    const service = createWebSessionAuthService(
      {
        findUserAccountByEmail: vi.fn(),
        findGitHubUserAccountByProviderUserId: vi.fn(),
        createUserAccount: vi.fn(),
        createSession: vi.fn(),
        resolveSessionByTokenHash: vi.fn(),
        revokeSessionByTokenHash: vi.fn(),
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
          authorizeUrl: "http://localhost:5291/v1/auth/github/mock-authorize",
          stateSecret: "github-oauth-secret",
          client: createGitHubOAuthClientMock()
        }
      }
    );

    const started = await service.beginGithubAuth({
      now: new Date("2026-03-17T00:00:00.000Z")
    });

    expect(started.ok).toBe(true);
    if (!started.ok) {
      return;
    }

    const authorizationUrl = new URL(started.authorization_url);
    expect(authorizationUrl.origin + authorizationUrl.pathname).toBe("http://localhost:5291/v1/auth/github/mock-authorize");
    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe("http://localhost:5291/v1/auth/github/callback");
    expect(authorizationUrl.searchParams.get("state")).toBe(started.state);
  });

  it("begins and completes GitHub auth using oauth state validation and shared session issuance", async (): Promise<void> => {
    const exchangeCodeForIdentity = vi.fn().mockResolvedValue({
      github_user_id: "ghu_123",
      email: "owen@example.com"
    });
    const createSession = vi.fn().mockResolvedValue({
      session_id: "ses_123",
      user_id: "usr_123",
      email: "owen@example.com",
      email_verified_at: "2026-03-17T00:00:00.000Z",
      organization_id: "org_123",
      role: "owner",
      created_at: "2026-03-17T00:00:00.000Z",
      expires_at: "2026-03-24T00:00:00.000Z",
      revoked_at: null,
      has_email_auth: true,
      has_github_oauth: true
    });
    const upsertGitHubUserAccount = vi.fn().mockResolvedValue({
      user_id: "usr_123",
      email: "owen@example.com",
      email_verified_at: "2026-03-17T00:00:00.000Z",
      organization_id: "org_123",
      role: "owner",
      created_user: false
    });
    const service = createWebSessionAuthService(
      {
        findUserAccountByEmail: vi.fn().mockResolvedValue({
          user_id: "usr_123",
          email: "owen@example.com",
          email_verified_at: "2026-03-17T00:00:00.000Z",
          organization_id: "org_123",
          role: "owner"
        }),
        findGitHubUserAccountByProviderUserId: vi.fn().mockResolvedValue(null),
        createUserAccount: vi.fn(),
        createSession,
        resolveSessionByTokenHash: vi.fn(),
        revokeSessionByTokenHash: vi.fn(),
        revokeOtherSessionsForUser: vi.fn().mockResolvedValue(0),
        markUserEmailVerified: vi.fn(),
        replaceEmailAuthChallenge: vi.fn(),
        consumeEmailAuthChallenge: vi.fn(),
        upsertGitHubUserAccount,
        acceptProjectInvite: vi.fn()
      },
      {
        githubOAuth: {
          clientId: "debugbundle-dev-mock-github",
          callbackUrl: "http://localhost:5291/v1/auth/github/callback",
          appRedirectUrl: "http://localhost:5291/auth/github/callback",
          stateSecret: "github-oauth-secret",
          client: createGitHubOAuthClientMock({ exchangeCodeForIdentity })
        }
      }
    );
    const now = new Date("2026-03-17T00:00:00.000Z");

    const started = await service.beginGithubAuth({ now, accepted_terms_at: now.toISOString() });
    expect(started.ok).toBe(true);
    if (!started.ok) {
      return;
    }

    const completed = await service.completeGithubAuth({
      code: "oauth-code",
      state: started.state,
      stateCookieValue: started.state,
      now
    });

    expect(completed.ok).toBe(true);
    if (!completed.ok) {
      return;
    }

    expect(exchangeCodeForIdentity).toHaveBeenCalledWith({ code: "oauth-code" });
    expect(upsertGitHubUserAccount).toHaveBeenCalledWith({
      github_user_id: "ghu_123",
      email: "owen@example.com",
      verified_at: now.toISOString(),
      accepted_terms_at: now.toISOString()
    });
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "usr_123",
        organization_id: "org_123",
        auth_method: "github_oauth"
      })
    );
    expect(completed.redirect_url).toBe("http://localhost:5291/auth/github/callback");
    expect(buildSessionCookie(completed.session_token, completed.session.expires_at)).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(buildClearedSessionCookie()).toContain("Max-Age=0");
  });

  it("creates a GitHub-backed account for a new user", async (): Promise<void> => {
    const exchangeCodeForIdentity = vi.fn().mockResolvedValue({
      github_user_id: "ghu_999",
      email: "outsider@example.com"
    });
    const upsertGitHubUserAccount = vi.fn().mockResolvedValue({
      user_id: "usr_999",
      email: "outsider@example.com",
      email_verified_at: "2026-03-17T00:00:00.000Z",
      organization_id: "org_999",
      role: "owner",
      created_user: true
    });
    const createSession = vi.fn().mockResolvedValue({
      session_id: "ses_999",
      user_id: "usr_999",
      email: "outsider@example.com",
      email_verified_at: "2026-03-17T00:00:00.000Z",
      organization_id: "org_999",
      role: "owner",
      created_at: "2026-03-17T00:00:00.000Z",
      expires_at: "2026-03-24T00:00:00.000Z",
      revoked_at: null,
      has_email_auth: false,
      has_github_oauth: true
    });
    const service = createWebSessionAuthService(
      {
        findUserAccountByEmail: vi.fn().mockResolvedValue(null),
        findGitHubUserAccountByProviderUserId: vi.fn().mockResolvedValue(null),
        createUserAccount: vi.fn(),
        createSession,
        resolveSessionByTokenHash: vi.fn(),
        revokeSessionByTokenHash: vi.fn(),
        revokeOtherSessionsForUser: vi.fn().mockResolvedValue(0),
        markUserEmailVerified: vi.fn(),
        replaceEmailAuthChallenge: vi.fn(),
        consumeEmailAuthChallenge: vi.fn(),
        upsertGitHubUserAccount,
        acceptProjectInvite: vi.fn()
      },
      {
        githubOAuth: {
          clientId: "debugbundle-dev-mock-github",
          callbackUrl: "http://localhost:5291/v1/auth/github/callback",
          appRedirectUrl: "http://localhost:5291/auth/github/callback",
          stateSecret: "github-oauth-secret",
          client: createGitHubOAuthClientMock({ exchangeCodeForIdentity })
        }
      }
    );
    const now = new Date("2026-03-17T00:00:00.000Z");
    const started = await service.beginGithubAuth({ now, accepted_terms_at: now.toISOString() });
    expect(started.ok).toBe(true);
    if (!started.ok) {
      return;
    }

    const completed = await service.completeGithubAuth({
      code: "oauth-code",
      state: started.state,
      stateCookieValue: started.state,
      now
    });

    expect(completed.ok).toBe(true);
    if (!completed.ok) {
      return;
    }
    expect(completed.created_user).toBe(true);
    expect(upsertGitHubUserAccount).toHaveBeenCalledWith({
      github_user_id: "ghu_999",
      email: "outsider@example.com",
      verified_at: now.toISOString(),
      accepted_terms_at: now.toISOString()
    });
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "usr_999",
        organization_id: "org_999",
        auth_method: "github_oauth"
      })
    );
  });

  it("completes GitHub auth without forwarding absent accepted terms state", async (): Promise<void> => {
    const exchangeCodeForIdentity = vi.fn().mockResolvedValue({
      github_user_id: "ghu_124",
      email: "owen@example.com"
    });
    const upsertGitHubUserAccount = vi.fn().mockResolvedValue({
      user_id: "usr_124",
      email: "owen@example.com",
      email_verified_at: "2026-03-17T00:00:00.000Z",
      organization_id: "org_124",
      role: "owner",
      created_user: false
    });
    const createSession = vi.fn().mockResolvedValue({
      session_id: "ses_124",
      user_id: "usr_124",
      email: "owen@example.com",
      email_verified_at: "2026-03-17T00:00:00.000Z",
      organization_id: "org_124",
      role: "owner",
      created_at: "2026-03-17T00:00:00.000Z",
      expires_at: "2026-03-24T00:00:00.000Z",
      revoked_at: null,
      has_email_auth: false,
      has_github_oauth: true
    });
    const service = createWebSessionAuthService(
      {
        findUserAccountByEmail: vi.fn(),
        findGitHubUserAccountByProviderUserId: vi.fn(),
        createUserAccount: vi.fn(),
        createSession,
        resolveSessionByTokenHash: vi.fn(),
        revokeSessionByTokenHash: vi.fn(),
        revokeOtherSessionsForUser: vi.fn().mockResolvedValue(0),
        markUserEmailVerified: vi.fn(),
        replaceEmailAuthChallenge: vi.fn(),
        consumeEmailAuthChallenge: vi.fn(),
        upsertGitHubUserAccount,
        acceptProjectInvite: vi.fn()
      },
      {
        githubOAuth: {
          clientId: "debugbundle-dev-mock-github",
          callbackUrl: "http://localhost:5291/v1/auth/github/callback",
          appRedirectUrl: "http://localhost:5291/auth/github/callback",
          stateSecret: "github-oauth-secret",
          client: createGitHubOAuthClientMock({ exchangeCodeForIdentity })
        }
      }
    );
    const now = new Date("2026-03-17T00:00:00.000Z");
    const started = await service.beginGithubAuth({ now });
    expect(started.ok).toBe(true);
    if (!started.ok) {
      return;
    }

    const completed = await service.completeGithubAuth({
      code: "oauth-code",
      state: started.state,
      stateCookieValue: started.state,
      now
    });

    expect(completed).toMatchObject({
      ok: true,
      accepted_terms_at: null
    });
    expect(upsertGitHubUserAccount).toHaveBeenCalledWith({
      github_user_id: "ghu_124",
      email: "owen@example.com",
      verified_at: now.toISOString()
    });
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "usr_124",
        organization_id: "org_124",
        auth_method: "github_oauth"
      })
    );
  });

  it("fails closed when GitHub auth reaches a suspended account", async (): Promise<void> => {
    const exchangeCodeForIdentity = vi.fn().mockResolvedValue({
      github_user_id: "ghu_123",
      email: "owen@example.com"
    });
    const service = createWebSessionAuthService(
      {
        findUserAccountByEmail: vi.fn().mockResolvedValue({
          user_id: "usr_123",
          email: "owen@example.com",
          email_verified_at: "2026-03-17T00:00:00.000Z",
          organization_id: "org_123",
          role: "owner"
        }),
        findGitHubUserAccountByProviderUserId: vi.fn().mockResolvedValue(null),
        createUserAccount: vi.fn(),
        createSession: vi.fn().mockResolvedValue(null),
        resolveSessionByTokenHash: vi.fn(),
        revokeSessionByTokenHash: vi.fn(),
        revokeOtherSessionsForUser: vi.fn().mockResolvedValue(0),
        markUserEmailVerified: vi.fn(),
        replaceEmailAuthChallenge: vi.fn(),
        consumeEmailAuthChallenge: vi.fn(),
        upsertGitHubUserAccount: vi.fn().mockResolvedValue({
          user_id: "usr_123",
          email: "owen@example.com",
          email_verified_at: "2026-03-17T00:00:00.000Z",
          organization_id: "org_123",
          role: "owner",
          created_user: false
        }),
        acceptProjectInvite: vi.fn()
      },
      {
        githubOAuth: {
          clientId: "debugbundle-dev-mock-github",
          callbackUrl: "http://localhost:5291/v1/auth/github/callback",
          appRedirectUrl: "http://localhost:5291/auth/github/callback",
          stateSecret: "github-oauth-secret",
          client: createGitHubOAuthClientMock({ exchangeCodeForIdentity })
        }
      }
    );
    const now = new Date("2026-03-17T00:00:00.000Z");
    const started = await service.beginGithubAuth({ now, accepted_terms_at: now.toISOString() });
    expect(started.ok).toBe(true);
    if (!started.ok) {
      return;
    }

    await expect(
      service.completeGithubAuth({
        code: "oauth-code",
        state: started.state,
        stateCookieValue: started.state,
        now
      })
    ).resolves.toEqual({
      ok: false,
      error: "account_suspended",
      redirect_url: "http://localhost:5291/auth/github/callback?error=account_suspended"
    });
  });

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
      acceptProjectInvite: vi.fn(),
    });

    await expect(noGithubService.beginGithubAuth()).resolves.toEqual({ ok: false, error: "provider_not_configured" });
    await expect(
      noGithubService.completeGithubAuth({ code: "oauth-code", state: "state", stateCookieValue: "state" })
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
          revoked_at: null,
        }),
        revokeSessionByTokenHash: vi.fn().mockResolvedValue(true),
        revokeOtherSessionsForUser: vi.fn().mockResolvedValue(0),
        markUserEmailVerified: vi.fn(),
        replaceEmailAuthChallenge: vi.fn(),
        consumeEmailAuthChallenge: vi.fn(),
        upsertGitHubUserAccount: vi.fn(),
        acceptProjectInvite: vi.fn(),
      },
      {
        githubOAuth: {
          clientId: "debugbundle-dev-mock-github",
          callbackUrl: "http://localhost:5291/v1/auth/github/callback",
          appRedirectUrl: "http://localhost:5291/auth/github/callback",
          stateSecret: "github-oauth-secret",
          client: createGitHubOAuthClientMock(),
        },
      }
    );

    const inviteService = createWebSessionAuthService(
      {
        findUserAccountByEmail: vi.fn(),
        createUserAccount: vi.fn(),
        createSession: vi.fn(),
        resolveSessionByTokenHash: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValue({
            session_id: "ses_123",
            user_id: "usr_123",
            email: "owen@example.com",
            email_verified_at: "2026-03-17T00:00:00.000Z",
            organization_id: "org_123",
            role: "owner",
            created_at: "2026-03-17T00:00:00.000Z",
            expires_at: "2026-03-23T00:00:00.000Z",
            revoked_at: null,
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
          .mockResolvedValueOnce({ kind: "accepted", membership: { user_id: "usr_123", organization_id: "org_123", role: "member" } }),
      },
      {
        githubOAuth: {
          clientId: "debugbundle-dev-mock-github",
          callbackUrl: "http://localhost:5291/v1/auth/github/callback",
          appRedirectUrl: "http://localhost:5291/auth/github/callback",
          stateSecret: "github-oauth-secret",
          client: createGitHubOAuthClientMock(),
        },
      }
    );

    await expect(inviteService.acceptInviteForSession("session-secret", { token: "dbundle_invite_test", now: new Date("2026-03-17T00:00:00.000Z") })).resolves.toEqual({
      ok: false,
      error: "invalid_session",
    });
    await expect(expiredInviteService.acceptInviteForSession("session-secret", { token: "dbundle_invite_test", now: new Date("2026-03-16T00:00:01.000Z") })).resolves.toEqual({
      ok: false,
      error: "invalid_session",
    });
    await expect(inviteService.acceptInviteForSession("session-secret", { token: "not-an-invite", now: new Date("2026-03-17T00:00:00.000Z") })).resolves.toEqual({
      ok: false,
      error: "invalid_token",
    });
    await expect(inviteService.acceptInviteForSession("session-secret", { token: "dbundle_invite_test", now: new Date("2026-03-17T00:00:00.000Z") })).resolves.toEqual({
      ok: false,
      error: "invite_email_mismatch",
    });
    await expect(inviteService.acceptInviteForSession("session-secret", { token: "dbundle_invite_test", now: new Date("2026-03-17T00:00:00.000Z") })).resolves.toEqual({
      ok: false,
      error: "shared_access_suspended",
    });
    await expect(inviteService.acceptInviteForSession("session-secret", { token: "dbundle_invite_test", now: new Date("2026-03-17T00:00:00.000Z") })).resolves.toEqual({
      ok: true,
      membership: { user_id: "usr_123", organization_id: "org_123", role: "member" },
    });

    await expect(inviteService.resolveSessionByToken("session-secret", { now: new Date("2026-03-17T00:00:00.000Z") })).resolves.toMatchObject({
      session_id: "ses_123",
    });
    await expect(inviteService.revokeSessionByToken("session-secret", { now: new Date("2026-03-17T00:30:00.000Z") })).resolves.toBe(true);
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
