import { createHmac, randomBytes } from "node:crypto";

import { DEFAULT_GITHUB_AUTHORIZE_URL, type GitHubOAuthConfig } from "./github-auth-client.js";
import { resolveGitHubAccountForIdentity } from "./github-account-linking.js";
import {
  ORGANIZATION_INVITE_TOKEN_PREFIX,
  type AcceptOrganizationInviteStoreResult,
  type AuthEmailSender,
  type ConsumeEmailAuthChallengeInput,
  type CreateSessionInput,
  type CreateUserAccountInput,
  type EmailAuthChallengeRecord,
  type OrganizationInviteMembership,
  type RevokeOtherSessionsInput,
  type RevokeSessionInput,
  type WebSessionRecord,
  type WebUserAccount,
  buildClearedGithubOauthStateCookie,
  buildGithubOauthStateCookie,
  deriveOrganizationIdentity,
  generateEmailAuthCode,
  generateSessionToken,
  hashToken,
  isTimingSafeEqualUtf8,
  isRecordInactive,
  isTokenExpired,
  normalizeEmail
} from "./primitives.js";

const DEFAULT_SESSION_LIFETIME_MS = 1000 * 60 * 60 * 24 * 7;
const DEFAULT_EMAIL_AUTH_CODE_LIFETIME_MS = 1000 * 60 * 10;
const DEFAULT_GITHUB_OAUTH_STATE_LIFETIME_MS = 1000 * 60 * 10;

export interface WebSessionAuthStore {
  findUserAccountByEmail(email: string): Promise<WebUserAccount | null>;
  findGitHubUserAccountByProviderUserId?(githubUserId: string): Promise<WebUserAccount | null>;
  createUserAccount(input: CreateUserAccountInput): Promise<WebUserAccount | null>;
  createSession(input: CreateSessionInput): Promise<WebSessionRecord | null>;
  resolveSessionByTokenHash(tokenHash: string): Promise<WebSessionRecord | null>;
  revokeSessionByTokenHash(input: RevokeSessionInput): Promise<boolean>;
  revokeOtherSessionsForUser(input: RevokeOtherSessionsInput): Promise<number>;
  markUserEmailVerified(input: { user_id: string; verified_at: string }): Promise<boolean>;
  upsertGitHubUserAccount(input: {
    github_user_id: string;
    email: string;
    verified_at: string;
    accepted_terms_at?: string;
  }): Promise<{
    user_id: string;
    email: string;
    email_verified_at: string | null;
    organization_id: string;
    role: "owner" | "member";
    created_user: boolean;
  }>;
}

export interface EmailAuthChallengeStore {
  replaceEmailAuthChallenge(input: {
    email: string;
    code_hash: string;
    accepted_terms_at: string | null;
    expires_at: string;
    replaced_at: string;
  }): Promise<EmailAuthChallengeRecord>;
  consumeEmailAuthChallenge(input: ConsumeEmailAuthChallengeInput): Promise<{ email: string; accepted_terms_at: string | null } | null>;
}

export interface OrganizationInviteAcceptanceStore {
  acceptOrganizationInvite(input: {
    invite_token_hash: string;
    user_id: string;
    email: string;
    accepted_at: string;
  }): Promise<AcceptOrganizationInviteStoreResult>;
}

export type RequestEmailCodeResult =
  | {
      ok: true;
      code_sent: boolean;
    };

export type VerifyEmailCodeResult =
  | {
      ok: true;
      session_token: string;
      session: WebSessionRecord;
      created_user: boolean;
    }
  | {
      ok: false;
      error: "invalid_code" | "account_suspended";
    };

export type AcceptInviteResult =
  | {
      ok: true;
      membership: OrganizationInviteMembership;
    }
  | {
      ok: false;
      error: "invalid_session" | "invalid_token" | "invite_email_mismatch";
    };

export type BeginGitHubAuthResult =
  | {
      ok: true;
      authorization_url: string;
      state: string;
      expires_at: string;
    }
  | {
      ok: false;
      error: "provider_not_configured";
    };

export type CompleteGitHubAuthResult =
  | {
      ok: true;
      session_token: string;
      session: WebSessionRecord;
      redirect_url: string;
      created_user: boolean;
      accepted_terms_at: string | null;
    }
  | {
      ok: false;
      error:
        | "provider_not_configured"
        | "invalid_oauth_state"
        | "oauth_exchange_failed"
        | "account_signup_disabled"
        | "account_suspended";
      redirect_url?: string;
    };

export interface WebSessionAuthServiceOptions {
  sessionLifetimeMs?: number;
  emailAuthCodeLifetimeMs?: number;
  signupEmailAllowlist?: readonly string[];
  authEmails?: AuthEmailSender;
  githubOAuth?: GitHubOAuthConfig;
}

export interface WebSessionAuthService {
  requestEmailCode(input: { email: string; accepted_terms_at: string; now?: Date }): Promise<RequestEmailCodeResult>;
  verifyEmailCode(input: { email: string; code: string; now?: Date }): Promise<VerifyEmailCodeResult>;
  beginGithubAuth(options?: { now?: Date; accepted_terms_at?: string }): Promise<BeginGitHubAuthResult>;
  completeGithubAuth(input: {
    code: string;
    state: string;
    stateCookieValue: string | null;
    now?: Date;
  }): Promise<CompleteGitHubAuthResult>;
  acceptInviteForSession(sessionToken: string, input: { token: string; now?: Date }): Promise<AcceptInviteResult>;
  resolveSessionByToken(sessionToken: string, options?: { now?: Date }): Promise<WebSessionRecord | null>;
  revokeSessionByToken(sessionToken: string, options?: { now?: Date }): Promise<boolean>;
}

export function generateGithubOauthState(input: {
  now?: Date;
  secret: string;
  lifetimeMs?: number;
  accepted_terms_at?: string;
}): { token: string; expires_at: string } {
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + (input.lifetimeMs ?? DEFAULT_GITHUB_OAUTH_STATE_LIFETIME_MS)).toISOString();
  const payload = {
    nonce: randomBytes(16).toString("hex"),
    expires_at: expiresAt,
    ...(input.accepted_terms_at === undefined ? {} : { accepted_terms_at: input.accepted_terms_at })
  };
  const payloadSegment = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signatureSegment = createHmac("sha256", input.secret).update(payloadSegment, "utf8").digest("base64url");

  return {
    token: `${payloadSegment}.${signatureSegment}`,
    expires_at: expiresAt
  };
}

interface GithubOauthStatePayload {
  nonce: string;
  expires_at: string;
  accepted_terms_at?: string;
}

function parseGithubOauthStatePayload(token: string, secret: string): GithubOauthStatePayload | null {
  const separatorIndex = token.lastIndexOf(".");
  if (separatorIndex <= 0) {
    return null;
  }

  const payloadSegment = token.slice(0, separatorIndex);
  const signatureSegment = token.slice(separatorIndex + 1);
  const expectedSignature = createHmac("sha256", secret).update(payloadSegment, "utf8").digest("base64url");

  if (!isTimingSafeEqualUtf8(expectedSignature, signatureSegment)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadSegment, "base64url").toString("utf8")) as {
      nonce?: string;
      expires_at?: string;
      accepted_terms_at?: string;
    };

    if (typeof payload.nonce !== "string" || payload.nonce.length === 0) {
      return null;
    }
    if (typeof payload.expires_at !== "string") {
      return null;
    }
    if (
      payload.accepted_terms_at !== undefined &&
      (typeof payload.accepted_terms_at !== "string" || Number.isNaN(Date.parse(payload.accepted_terms_at)))
    ) {
      return null;
    }

    return {
      nonce: payload.nonce,
      expires_at: payload.expires_at,
      ...(payload.accepted_terms_at === undefined ? {} : { accepted_terms_at: payload.accepted_terms_at })
    };
  } catch {
    return null;
  }
}

export function validateGithubOauthState(token: string, input: { now?: Date; secret: string }): boolean {
  const payload = parseGithubOauthStatePayload(token, input.secret);
  if (payload === null) {
    return false;
  }

  return !isTokenExpired(payload.expires_at, input.now ?? new Date());
}

function buildGithubAppRedirectUrl(appRedirectUrl: string, error?: string): string {
  if (error === undefined) {
    return appRedirectUrl;
  }

  const url = new URL(appRedirectUrl);
  url.searchParams.set("error", error);
  return url.toString();
}

export function createWebSessionAuthService(
  store: WebSessionAuthStore & EmailAuthChallengeStore & OrganizationInviteAcceptanceStore,
  options: WebSessionAuthServiceOptions = {}
): WebSessionAuthService {
  const sessionLifetimeMs = options.sessionLifetimeMs ?? DEFAULT_SESSION_LIFETIME_MS;
  const emailAuthCodeLifetimeMs = options.emailAuthCodeLifetimeMs ?? DEFAULT_EMAIL_AUTH_CODE_LIFETIME_MS;
  const signupEmailAllowlist =
    options.signupEmailAllowlist === undefined
      ? null
      : new Set(options.signupEmailAllowlist.map((email) => normalizeEmail(email)).filter((email) => email.length > 0));

  function isNewAccountSignupAllowed(email: string): boolean {
    return signupEmailAllowlist === null || signupEmailAllowlist.has(email);
  }

  return {
    async requestEmailCode(input): Promise<RequestEmailCodeResult> {
      const normalizedEmail = normalizeEmail(input.email);
      const existingAccount = await store.findUserAccountByEmail(normalizedEmail);
      if (existingAccount === null && !isNewAccountSignupAllowed(normalizedEmail)) {
        return { ok: true, code_sent: false };
      }

      const now = input.now ?? new Date();
      const authCode = generateEmailAuthCode();
      await store.replaceEmailAuthChallenge({
        email: normalizedEmail,
        code_hash: authCode.hash,
        accepted_terms_at: input.accepted_terms_at,
        expires_at: new Date(now.getTime() + emailAuthCodeLifetimeMs).toISOString(),
        replaced_at: now.toISOString()
      });
      await options.authEmails?.sendEmailAuthCode({
        email: normalizedEmail,
        code: authCode.plaintext,
        expires_in_minutes: Math.round(emailAuthCodeLifetimeMs / 60_000)
      });

      return { ok: true, code_sent: true };
    },

    async verifyEmailCode(input): Promise<VerifyEmailCodeResult> {
      const normalizedEmail = normalizeEmail(input.email);
      const now = input.now ?? new Date();
      const consumed = await store.consumeEmailAuthChallenge({
        email: normalizedEmail,
        code_hash: hashToken(input.code),
        used_at: now.toISOString()
      });
      if (consumed === null) {
        return {
          ok: false,
          error: "invalid_code"
        };
      }

      let account = await store.findUserAccountByEmail(normalizedEmail);
      let createdUser = false;

      if (account === null) {
        if (consumed.accepted_terms_at === null || !isNewAccountSignupAllowed(normalizedEmail)) {
          return {
            ok: false,
            error: "invalid_code"
          };
        }

        account = await store.createUserAccount({
          email: normalizedEmail,
          ...deriveOrganizationIdentity(normalizedEmail),
          accepted_terms_at: consumed.accepted_terms_at,
          created_at: now.toISOString()
        });

        if (account === null) {
          account = await store.findUserAccountByEmail(normalizedEmail);
        }

        createdUser = true;
      }

      if (account === null) {
        return {
          ok: false,
          error: "invalid_code"
        };
      }

      if (account.email_verified_at === null) {
        await store.markUserEmailVerified({
          user_id: account.user_id,
          verified_at: now.toISOString()
        });
        account = {
          ...account,
          email_verified_at: now.toISOString()
        };
      }

      const sessionToken = generateSessionToken();
      const session = await store.createSession({
        user_id: account.user_id,
        organization_id: account.organization_id,
        session_token_hash: hashToken(sessionToken),
        expires_at: new Date(now.getTime() + sessionLifetimeMs).toISOString()
      });
      if (session === null) {
        return {
          ok: false,
          error: "account_suspended"
        };
      }

      return {
        ok: true,
        session_token: sessionToken,
        session,
        created_user: createdUser
      };
    },

    beginGithubAuth(optionsArg = {}): Promise<BeginGitHubAuthResult> {
      const githubOAuth = options.githubOAuth;
      if (githubOAuth === undefined) {
        return Promise.resolve({
          ok: false,
          error: "provider_not_configured"
        });
      }

      const state = generateGithubOauthState({
        secret: githubOAuth.stateSecret,
        ...(optionsArg.now === undefined ? {} : { now: optionsArg.now }),
        ...(githubOAuth.stateLifetimeMs === undefined ? {} : { lifetimeMs: githubOAuth.stateLifetimeMs }),
        ...(optionsArg.accepted_terms_at === undefined ? {} : { accepted_terms_at: optionsArg.accepted_terms_at })
      });
      const authorizationUrl = new URL(githubOAuth.authorizeUrl ?? DEFAULT_GITHUB_AUTHORIZE_URL);
      authorizationUrl.searchParams.set("client_id", githubOAuth.clientId);
      authorizationUrl.searchParams.set("redirect_uri", githubOAuth.callbackUrl);
      authorizationUrl.searchParams.set("scope", "read:user user:email");
      authorizationUrl.searchParams.set("state", state.token);

      return Promise.resolve({
        ok: true,
        authorization_url: authorizationUrl.toString(),
        state: state.token,
        expires_at: state.expires_at
      });
    },

    async completeGithubAuth(input): Promise<CompleteGitHubAuthResult> {
      const githubOAuth = options.githubOAuth;
      if (githubOAuth === undefined) {
        return {
          ok: false,
          error: "provider_not_configured"
        };
      }

      const now = input.now ?? new Date();
      if (
        input.stateCookieValue === null ||
        input.stateCookieValue !== input.state ||
        !validateGithubOauthState(input.state, { now, secret: githubOAuth.stateSecret })
      ) {
        return {
          ok: false,
          error: "invalid_oauth_state",
          redirect_url: buildGithubAppRedirectUrl(githubOAuth.appRedirectUrl, "invalid_oauth_state")
        };
      }

      const statePayload = parseGithubOauthStatePayload(input.state, githubOAuth.stateSecret);
      if (statePayload === null || isTokenExpired(statePayload.expires_at, now)) {
        return {
          ok: false,
          error: "invalid_oauth_state",
          redirect_url: buildGithubAppRedirectUrl(githubOAuth.appRedirectUrl, "invalid_oauth_state")
        };
      }

      const identity = await githubOAuth.client.exchangeCodeForIdentity({ code: input.code });
      if (identity === null) {
        return {
          ok: false,
          error: "oauth_exchange_failed",
          redirect_url: buildGithubAppRedirectUrl(githubOAuth.appRedirectUrl, "oauth_exchange_failed")
        };
      }

      const resolvedAccount = await resolveGitHubAccountForIdentity({
        store,
        identity,
        verified_at: now.toISOString(),
        ...(statePayload.accepted_terms_at === undefined ? {} : { accepted_terms_at: statePayload.accepted_terms_at }),
        isNewAccountSignupAllowed
      });
      if (!resolvedAccount.ok) {
        return {
          ok: false,
          error: "account_signup_disabled",
          redirect_url: buildGithubAppRedirectUrl(githubOAuth.appRedirectUrl, "signup_disabled")
        };
      }

      const sessionToken = generateSessionToken();
      const session = await store.createSession({
        user_id: resolvedAccount.account.user_id,
        organization_id: resolvedAccount.account.organization_id,
        session_token_hash: hashToken(sessionToken),
        expires_at: new Date(now.getTime() + sessionLifetimeMs).toISOString()
      });
      if (session === null) {
        return {
          ok: false,
          error: "account_suspended",
          redirect_url: buildGithubAppRedirectUrl(githubOAuth.appRedirectUrl, "account_suspended")
        };
      }

      return {
        ok: true,
        session_token: sessionToken,
        session,
        redirect_url: githubOAuth.appRedirectUrl,
        created_user: resolvedAccount.account.created_user,
        accepted_terms_at: statePayload.accepted_terms_at ?? null
      };
    },

    async acceptInviteForSession(sessionToken: string, input): Promise<AcceptInviteResult> {
      const now = input.now ?? new Date();
      const session = await store.resolveSessionByTokenHash(hashToken(sessionToken));
      if (session === null || isRecordInactive(session, now)) {
        return {
          ok: false,
          error: "invalid_session"
        };
      }

      if (!input.token.startsWith(ORGANIZATION_INVITE_TOKEN_PREFIX)) {
        return {
          ok: false,
          error: "invalid_token"
        };
      }

      const accepted = await store.acceptOrganizationInvite({
        invite_token_hash: hashToken(input.token),
        user_id: session.user_id,
        email: session.email,
        accepted_at: now.toISOString()
      });
      if (accepted.kind === "invalid_token") {
        return {
          ok: false,
          error: "invalid_token"
        };
      }
      if (accepted.kind === "email_mismatch") {
        return {
          ok: false,
          error: "invite_email_mismatch"
        };
      }
      if (accepted.kind !== "accepted") {
        return {
          ok: false,
          error: "invalid_token"
        };
      }

      return {
        ok: true,
        membership: accepted.membership
      };
    },

    async resolveSessionByToken(sessionToken: string, options = {}): Promise<WebSessionRecord | null> {
      const session = await store.resolveSessionByTokenHash(hashToken(sessionToken));
      if (session === null) {
        return null;
      }

      if (isRecordInactive(session, options.now ?? new Date())) {
        return null;
      }

      return session;
    },

    async revokeSessionByToken(sessionToken: string, options = {}): Promise<boolean> {
      return store.revokeSessionByTokenHash({
        session_token_hash: hashToken(sessionToken),
        revoked_at: (options.now ?? new Date()).toISOString()
      });
    }
  };
}

export { buildClearedGithubOauthStateCookie, buildGithubOauthStateCookie };
