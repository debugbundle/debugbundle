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

  it("requests an email code for allowlisted addresses and sends the OTP email", async (): Promise<void> => {
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
        acceptOrganizationInvite: vi.fn()
      },
      {
        signupEmailAllowlist: ["owen@example.com"],
        authEmails: {
          sendEmailAuthCode,
          sendOrganizationInviteEmail: vi.fn().mockResolvedValue(undefined)
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

  it("does not send a code for non-allowlisted new accounts", async (): Promise<void> => {
    const replaceEmailAuthChallenge = vi.fn();
    const sendEmailAuthCode = vi.fn();
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
        acceptOrganizationInvite: vi.fn()
      },
      {
        signupEmailAllowlist: ["allowlisted@example.com"],
        authEmails: {
          sendEmailAuthCode,
          sendOrganizationInviteEmail: vi.fn().mockResolvedValue(undefined)
        }
      }
    );

    const result = await service.requestEmailCode({
      email: "outsider@example.com",
      accepted_terms_at: "2026-03-16T00:00:00.000Z"
    });

    expect(result).toEqual({ ok: true, code_sent: false });
    expect(replaceEmailAuthChallenge).not.toHaveBeenCalled();
    expect(sendEmailAuthCode).not.toHaveBeenCalled();
  });

  it("verifies a code, creates an allowlisted account, and issues a verified session", async (): Promise<void> => {
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
      expires_at: "2026-03-16T04:00:00.000Z",
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
        acceptOrganizationInvite: vi.fn()
      },
      {
        signupEmailAllowlist: ["owen@example.com"]
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
      acceptOrganizationInvite: vi.fn()
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
        acceptOrganizationInvite: vi.fn()
      },
      {
        signupEmailAllowlist: ["owen@example.com"]
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
      expires_at: "2026-03-16T04:00:00.000Z",
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
      acceptOrganizationInvite: vi.fn()
    });

    const verified = await service.verifyEmailCode({ email: "owen@example.com", code: "123456", now });

    expect(createUserAccount).not.toHaveBeenCalled();
    expect(markUserEmailVerified).toHaveBeenCalledWith({
      user_id: "usr_123",
      verified_at: now.toISOString()
    });
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
      acceptOrganizationInvite: vi.fn()
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
        acceptOrganizationInvite: vi.fn()
      },
      {
        githubOAuth: {
          clientId: "debugbundle-dev-mock-github",
          callbackUrl: "http://localhost:5291/v1/auth/github/callback",
          appRedirectUrl: "http://localhost:5291/auth/github/callback",
          authorizeUrl: "http://localhost:5291/v1/auth/github/mock-authorize",
          stateSecret: "github-oauth-secret",
          client: {
            exchangeCodeForIdentity: vi.fn()
          }
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
      expires_at: "2026-03-17T04:00:00.000Z",
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
        acceptOrganizationInvite: vi.fn()
      },
      {
        githubOAuth: {
          clientId: "debugbundle-dev-mock-github",
          callbackUrl: "http://localhost:5291/v1/auth/github/callback",
          appRedirectUrl: "http://localhost:5291/auth/github/callback",
          stateSecret: "github-oauth-secret",
          client: {
            exchangeCodeForIdentity
          }
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
    expect(completed.redirect_url).toBe("http://localhost:5291/auth/github/callback");
    expect(buildSessionCookie(completed.session_token, completed.session.expires_at)).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(buildClearedSessionCookie()).toContain("Max-Age=0");
  });

  it("rejects GitHub signup for non-allowlisted new accounts", async (): Promise<void> => {
    const exchangeCodeForIdentity = vi.fn().mockResolvedValue({
      github_user_id: "ghu_999",
      email: "outsider@example.com"
    });
    const service = createWebSessionAuthService(
      {
        findUserAccountByEmail: vi.fn().mockResolvedValue(null),
        findGitHubUserAccountByProviderUserId: vi.fn().mockResolvedValue(null),
        createUserAccount: vi.fn(),
        createSession: vi.fn(),
        resolveSessionByTokenHash: vi.fn(),
        revokeSessionByTokenHash: vi.fn(),
        revokeOtherSessionsForUser: vi.fn().mockResolvedValue(0),
        markUserEmailVerified: vi.fn(),
        replaceEmailAuthChallenge: vi.fn(),
        consumeEmailAuthChallenge: vi.fn(),
        upsertGitHubUserAccount: vi.fn(),
        acceptOrganizationInvite: vi.fn()
      },
      {
        signupEmailAllowlist: ["owen@example.com"],
        githubOAuth: {
          clientId: "debugbundle-dev-mock-github",
          callbackUrl: "http://localhost:5291/v1/auth/github/callback",
          appRedirectUrl: "http://localhost:5291/auth/github/callback",
          stateSecret: "github-oauth-secret",
          client: {
            exchangeCodeForIdentity
          }
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
      error: "account_signup_disabled",
      redirect_url: "http://localhost:5291/auth/github/callback?error=signup_disabled"
    });
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
        acceptOrganizationInvite: vi.fn()
      },
      {
        githubOAuth: {
          clientId: "debugbundle-dev-mock-github",
          callbackUrl: "http://localhost:5291/v1/auth/github/callback",
          appRedirectUrl: "http://localhost:5291/auth/github/callback",
          stateSecret: "github-oauth-secret",
          client: {
            exchangeCodeForIdentity
          }
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
});
