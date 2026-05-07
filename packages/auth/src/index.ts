import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { hash as argon2Hash, verify as argon2Verify, type Options as Argon2Options } from "@node-rs/argon2";

export const PROJECT_TOKEN_PREFIX = "dbundle_proj_";
export const MEMBER_TOKEN_PREFIX = "dbundle_mem_";
export const PROBE_TRIGGER_TOKEN_PREFIX = "dbundle_probe_";
export const SESSION_COOKIE_NAME = "dbundle_session";
export const GITHUB_OAUTH_STATE_COOKIE_NAME = "dbundle_github_oauth_state";

const ORGANIZATION_INVITE_TOKEN_PREFIX = "dbundle_invite_";
type Argon2Algorithm = NonNullable<Argon2Options["algorithm"]>;

const ARGON2_OPTIONS: Argon2Options = {
  algorithm: 2 as Argon2Algorithm,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32
};

const DEFAULT_SESSION_LIFETIME_MS = 1000 * 60 * 60 * 4;
const DEFAULT_EMAIL_AUTH_CODE_LIFETIME_MS = 1000 * 60 * 10;
const DEFAULT_GITHUB_OAUTH_STATE_LIFETIME_MS = 1000 * 60 * 10;
const DEFAULT_GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const DEFAULT_GITHUB_ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token";
const DEFAULT_GITHUB_USER_URL = "https://api.github.com/user";
const DEFAULT_GITHUB_EMAILS_URL = "https://api.github.com/user/emails";

export interface ProbeTriggerTokenPayload {
  activation_id: string;
  label_pattern: string;
  service: string;
  environment: string;
  trigger_expires_at: string;
}

export interface ProjectTokenContext {
  project_id: string;
  organization_id?: string;
  organization_plan?: string;
  revoked_at?: string | null;
  expires_at?: string | null;
}

export interface MemberTokenContext {
  member_id: string;
  organization_id: string;
  revoked_at?: string | null;
  expires_at?: string | null;
}

export interface WebSessionRecord {
  session_id: string;
  user_id: string;
  email: string;
  email_verified_at: string | null;
  organization_id: string;
  role: "owner" | "member";
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  has_email_auth?: boolean;
  has_github_oauth?: boolean;
}

export interface CreateSessionInput {
  user_id: string;
  organization_id: string;
  session_token_hash: string;
  expires_at: string;
}

export interface CreateUserAccountInput {
  email: string;
  organization_name: string;
  organization_slug: string;
  accepted_terms_at: string;
  created_at: string;
}

export interface WebUserAccount {
  user_id: string;
  email: string;
  email_verified_at: string | null;
  organization_id: string;
  role: "owner" | "member";
}

export interface GitHubUserAccountResult extends WebUserAccount {
  created_user: boolean;
}

export interface GitHubUserAccountInput {
  github_user_id: string;
  email: string;
  verified_at: string;
  accepted_terms_at?: string;
}

export interface MarkUserEmailVerifiedInput {
  user_id: string;
  verified_at: string;
}

export interface RevokeSessionInput {
  session_token_hash: string;
  revoked_at: string;
}

export interface RevokeOtherSessionsInput {
  user_id: string;
  except_session_token_hash: string;
  revoked_at: string;
}

export interface EmailAuthChallengeRecord {
  challenge_id: string;
  email: string;
  accepted_terms_at: string | null;
  expires_at: string;
  used_at: string | null;
}

export interface ConsumeEmailAuthChallengeInput {
  email: string;
  code_hash: string;
  used_at: string;
}

export interface WebSessionAuthStore {
  findUserAccountByEmail(email: string): Promise<WebUserAccount | null>;
  findGitHubUserAccountByProviderUserId?(githubUserId: string): Promise<WebUserAccount | null>;
  createUserAccount(input: CreateUserAccountInput): Promise<WebUserAccount | null>;
  createSession(input: CreateSessionInput): Promise<WebSessionRecord | null>;
  resolveSessionByTokenHash(tokenHash: string): Promise<WebSessionRecord | null>;
  revokeSessionByTokenHash(input: RevokeSessionInput): Promise<boolean>;
  revokeOtherSessionsForUser(input: RevokeOtherSessionsInput): Promise<number>;
  markUserEmailVerified(input: MarkUserEmailVerifiedInput): Promise<boolean>;
  upsertGitHubUserAccount(input: GitHubUserAccountInput): Promise<GitHubUserAccountResult>;
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

export interface OrganizationInviteMembership {
  user_id: string;
  organization_id: string;
  role: "owner" | "member";
}

export type AcceptOrganizationInviteStoreResult =
  | {
      kind: "accepted";
      membership: OrganizationInviteMembership;
    }
  | {
      kind: "invalid_token" | "email_mismatch";
    };

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

export interface AuthEmailSender {
  sendEmailAuthCode(input: { email: string; code: string; expires_in_minutes: number }): Promise<void>;
  sendOrganizationInviteEmail(input: { email: string; token: string }): Promise<void>;
}

export interface WebSessionAuthServiceOptions {
  sessionLifetimeMs?: number;
  emailAuthCodeLifetimeMs?: number;
  signupEmailAllowlist?: readonly string[];
  authEmails?: AuthEmailSender;
  githubOAuth?: GitHubOAuthConfig;
}

export interface GitHubOAuthIdentity {
  github_user_id: string;
  email: string;
}

export interface GitHubOAuthClient {
  exchangeCodeForIdentity(input: { code: string }): Promise<GitHubOAuthIdentity | null>;
}

export interface GitHubOAuthClientConfig {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  authorizeUrl?: string;
  accessTokenUrl?: string;
  userUrl?: string;
  emailsUrl?: string;
  fetchImplementation?: typeof fetch;
}

export interface GitHubOAuthConfig {
  clientId: string;
  callbackUrl: string;
  appRedirectUrl: string;
  authorizeUrl?: string;
  stateSecret: string;
  stateLifetimeMs?: number;
  client: GitHubOAuthClient;
}

export interface CookieOptions {
  secure?: boolean;
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

export type AuthValidationError = "invalid_token" | "token_expired" | "token_revoked";

export type AuthValidationResult<Context> =
  | {
      ok: true;
      context: Context;
    }
  | {
      ok: false;
      error: AuthValidationError;
    };

export type TokenHashResolver<Context> = (tokenHash: string) => Promise<Context | null>;

export type RequireTokenResult<Context, ErrorCode extends string> =
  | {
      ok: true;
      context: Context;
    }
  | {
      ok: false;
      error: ErrorCode;
    };

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function isTimingSafeEqualUtf8(expectedValue: string, providedValue: string): boolean {
  const expected = Buffer.from(expectedValue, "utf8");
  const provided = Buffer.from(providedValue, "utf8");

  if (expected.length !== provided.length) {
    return false;
  }

  return timingSafeEqual(expected, provided);
}

export function buildCsrfToken(sessionToken: string): string {
  return createHash("sha256").update(`csrf:${sessionToken}`, "utf8").digest("hex");
}

export function isValidCsrfToken(sessionToken: string, csrfToken: string): boolean {
  return isTimingSafeEqualUtf8(buildCsrfToken(sessionToken), csrfToken);
}

export function readRequiredProbeTriggerSecret(env: Record<string, string | undefined> = process.env): string {
  const secret = env["DEBUGBUNDLE_PROBE_TRIGGER_SECRET"]?.trim();

  if (secret === undefined || secret.length === 0) {
    throw new Error("probe_trigger_secret_missing");
  }

  return secret;
}

function generateTokenWithPrefix(prefix: string): { plaintext: string; hash: string } {
  const randomPart = randomBytes(24).toString("hex");
  const plaintext = `${prefix}${randomPart}`;

  return {
    plaintext,
    hash: hashToken(plaintext)
  };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function deriveOrganizationIdentity(email: string): { organization_name: string; organization_slug: string } {
  const localPart = normalizeEmail(email).split("@")[0] ?? "workspace";
  const normalizedBase = localPart
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const base = normalizedBase.length > 0 ? normalizedBase : "workspace";
  const label = base
    .split("-")
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");

  return {
    organization_name: `${label.length > 0 ? label : "Workspace"} Workspace`,
    organization_slug: `${base}-${hashToken(normalizeEmail(email)).slice(0, 8)}`
  };
}

function generateOpaqueToken(prefix = ""): { plaintext: string; hash: string } {
  return generateTokenWithPrefix(prefix);
}

function generateSessionToken(): string {
  return randomBytes(24).toString("hex");
}

function isRecordInactive(record: { revoked_at?: string | null; expires_at?: string | null }, now: Date): boolean {
  return isTokenRevoked(record.revoked_at) || isTokenExpired(record.expires_at, now);
}

export function generateProjectToken(_projectId: string): { plaintext: string; hash: string } {
  void _projectId;
  return generateTokenWithPrefix(PROJECT_TOKEN_PREFIX);
}

export function generateMemberToken(_memberId: string): { plaintext: string; hash: string } {
  void _memberId;
  return generateTokenWithPrefix(MEMBER_TOKEN_PREFIX);
}

export function generateEmailAuthCode(): { plaintext: string; hash: string } {
  const code = String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(6, "0");
  return {
    plaintext: code,
    hash: hashToken(code)
  };
}

export function generateOrganizationInviteToken(_inviteId: string): { plaintext: string; hash: string } {
  void _inviteId;
  return generateOpaqueToken(ORGANIZATION_INVITE_TOKEN_PREFIX);
}

export async function hashPassword(password: string): Promise<string> {
  return argon2Hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  try {
    return await argon2Verify(passwordHash, password);
  } catch {
    return false;
  }
}

function buildCookieAttributes(input: { sameSite: "Strict" | "Lax"; secure: boolean | undefined }): string {
  return `Path=/; HttpOnly; ${input.secure === false ? "" : "Secure; "}SameSite=${input.sameSite}`;
}

export function buildSessionCookie(sessionToken: string, expiresAt: string, options: CookieOptions = {}): string {
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionToken)}; ${buildCookieAttributes({ sameSite: "Strict", secure: options.secure })}; Expires=${new Date(expiresAt).toUTCString()}`;
}

export function buildClearedSessionCookie(options: CookieOptions = {}): string {
  return `${SESSION_COOKIE_NAME}=; ${buildCookieAttributes({ sameSite: "Strict", secure: options.secure })}; Expires=${new Date(0).toUTCString()}; Max-Age=0`;
}

export function buildGithubOauthStateCookie(state: string, expiresAt: string, options: CookieOptions = {}): string {
  return `${GITHUB_OAUTH_STATE_COOKIE_NAME}=${encodeURIComponent(state)}; ${buildCookieAttributes({ sameSite: "Lax", secure: options.secure })}; Expires=${new Date(expiresAt).toUTCString()}`;
}

export function buildClearedGithubOauthStateCookie(options: CookieOptions = {}): string {
  return `${GITHUB_OAUTH_STATE_COOKIE_NAME}=; ${buildCookieAttributes({ sameSite: "Lax", secure: options.secure })}; Expires=${new Date(0).toUTCString()}; Max-Age=0`;
}

export function readCookieValue(cookieHeader: string | undefined, cookieName: string): string | null {
  if (cookieHeader === undefined) {
    return null;
  }

  for (const rawEntry of cookieHeader.split(";")) {
    const separatorIndex = rawEntry.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const name = rawEntry.slice(0, separatorIndex).trim();
    if (name !== cookieName) {
      continue;
    }

    const value = rawEntry.slice(separatorIndex + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  return null;
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
  const payloadSegment = Buffer.from(
    JSON.stringify(payload),
    "utf8"
  ).toString("base64url");
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

export function createGitHubOAuthClient(config: GitHubOAuthClientConfig): GitHubOAuthClient {
  const fetchImplementation = config.fetchImplementation ?? fetch;
  const accessTokenUrl = config.accessTokenUrl ?? DEFAULT_GITHUB_ACCESS_TOKEN_URL;
  const userUrl = config.userUrl ?? DEFAULT_GITHUB_USER_URL;
  const emailsUrl = config.emailsUrl ?? DEFAULT_GITHUB_EMAILS_URL;

  return {
    async exchangeCodeForIdentity(input): Promise<GitHubOAuthIdentity | null> {
      const tokenResponse = await fetchImplementation(accessTokenUrl, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          code: input.code,
          redirect_uri: config.callbackUrl
        })
      });
      if (!tokenResponse.ok) {
        return null;
      }

      const tokenPayload = (await tokenResponse.json()) as { access_token?: string };
      if (typeof tokenPayload.access_token !== "string" || tokenPayload.access_token.length === 0) {
        return null;
      }

      const authorizationHeader = `Bearer ${tokenPayload.access_token}`;
      const userResponse = await fetchImplementation(userUrl, {
        headers: {
          Accept: "application/json",
          Authorization: authorizationHeader,
          "User-Agent": "debugbundle"
        }
      });
      if (!userResponse.ok) {
        return null;
      }

      const userPayload = (await userResponse.json()) as { id?: string | number; email?: string | null };
      const githubUserId = userPayload.id === undefined ? null : String(userPayload.id);
      if (githubUserId === null || githubUserId.length === 0) {
        return null;
      }

      let email = typeof userPayload.email === "string" && userPayload.email.length > 0 ? normalizeEmail(userPayload.email) : null;
      if (email === null) {
        const emailsResponse = await fetchImplementation(emailsUrl, {
          headers: {
            Accept: "application/json",
            Authorization: authorizationHeader,
            "User-Agent": "debugbundle"
          }
        });
        if (!emailsResponse.ok) {
          return null;
        }

        const emailsPayload = (await emailsResponse.json()) as Array<{
          email?: string;
          primary?: boolean;
          verified?: boolean;
        }>;
        const primaryVerifiedEmail = emailsPayload.find(
          (entry) => entry.primary === true && entry.verified === true && typeof entry.email === "string"
        );
        if (primaryVerifiedEmail?.email === undefined) {
          return null;
        }

        email = normalizeEmail(primaryVerifiedEmail.email);
      }

      return {
        github_user_id: githubUserId,
        email
      };
    }
  };
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

      const normalizedEmail = normalizeEmail(identity.email);
      const existingGithubAccount = (await store.findGitHubUserAccountByProviderUserId?.(identity.github_user_id)) ?? null;
      const existingEmailAccount = existingGithubAccount ?? (await store.findUserAccountByEmail(normalizedEmail));

      if (existingGithubAccount === null && existingEmailAccount === null && !isNewAccountSignupAllowed(normalizedEmail)) {
        return {
          ok: false,
          error: "account_signup_disabled",
          redirect_url: buildGithubAppRedirectUrl(githubOAuth.appRedirectUrl, "signup_disabled")
        };
      }

      const account = await store.upsertGitHubUserAccount({
        github_user_id: identity.github_user_id,
        email: normalizedEmail,
        verified_at: now.toISOString(),
        ...(statePayload.accepted_terms_at === undefined ? {} : { accepted_terms_at: statePayload.accepted_terms_at })
      });
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
          error: "account_suspended",
          redirect_url: buildGithubAppRedirectUrl(githubOAuth.appRedirectUrl, "account_suspended")
        };
      }

      return {
        ok: true,
        session_token: sessionToken,
        session,
        redirect_url: githubOAuth.appRedirectUrl,
        created_user: account.created_user,
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

export function deriveProbeTriggerTokenKey(projectId: string): string {
  const secret = readRequiredProbeTriggerSecret();
  return createHmac("sha256", secret).update(projectId, "utf8").digest("hex");
}

export function generateProbeTriggerToken(input: {
  projectId: string;
  payload: ProbeTriggerTokenPayload;
}): { plaintext: string; hash: string; key: string } {
  const key = deriveProbeTriggerTokenKey(input.projectId);
  const payloadSegment = Buffer.from(JSON.stringify(input.payload), "utf8").toString("base64url");
  const signatureSegment = createHmac("sha256", key).update(payloadSegment, "utf8").digest("base64url");
  const plaintext = `${PROBE_TRIGGER_TOKEN_PREFIX}${payloadSegment}.${signatureSegment}`;

  return {
    plaintext,
    hash: hashToken(plaintext),
    key
  };
}

export function readBearerToken(authorizationHeader: string | undefined): string | null {
  if (authorizationHeader === undefined) {
    return null;
  }

  const [scheme, value] = authorizationHeader.split(" ");
  if (scheme !== "Bearer" || value === undefined || value.length === 0) {
    return null;
  }

  return value;
}

function isTokenExpired(expiresAt: string | null | undefined, now: Date): boolean {
  if (expiresAt === undefined || expiresAt === null) {
    return false;
  }

  const parsed = Date.parse(expiresAt);
  if (Number.isNaN(parsed)) {
    return true;
  }

  return parsed <= now.getTime();
}

function isTokenRevoked(revokedAt: string | null | undefined): boolean {
  return revokedAt !== undefined && revokedAt !== null;
}

async function validateToken<Context extends { revoked_at?: string | null; expires_at?: string | null }>(
  token: string,
  expectedPrefix: string,
  resolveByTokenHash: TokenHashResolver<Context>,
  now: Date
): Promise<AuthValidationResult<Context>> {
  if (!token.startsWith(expectedPrefix)) {
    return {
      ok: false,
      error: "invalid_token"
    };
  }

  const resolved = await resolveByTokenHash(hashToken(token));
  if (resolved === null) {
    return {
      ok: false,
      error: "invalid_token"
    };
  }

  if (isTokenRevoked(resolved.revoked_at)) {
    return {
      ok: false,
      error: "token_revoked"
    };
  }

  if (isTokenExpired(resolved.expires_at, now)) {
    return {
      ok: false,
      error: "token_expired"
    };
  }

  return {
    ok: true,
    context: resolved
  };
}

export async function validateProjectToken(
  token: string,
  resolveByTokenHash: TokenHashResolver<ProjectTokenContext>,
  options: { now?: Date } = {}
): Promise<AuthValidationResult<ProjectTokenContext>> {
  return validateToken(token, PROJECT_TOKEN_PREFIX, resolveByTokenHash, options.now ?? new Date());
}

export async function validateMemberToken(
  token: string,
  resolveByTokenHash: TokenHashResolver<MemberTokenContext>,
  options: { now?: Date } = {}
): Promise<AuthValidationResult<MemberTokenContext>> {
  return validateToken(token, MEMBER_TOKEN_PREFIX, resolveByTokenHash, options.now ?? new Date());
}

export async function requireProjectToken(input: {
  authorizationHeader: string | undefined;
  resolveByTokenHash: TokenHashResolver<ProjectTokenContext>;
  now?: Date;
}): Promise<RequireTokenResult<ProjectTokenContext, "invalid_project_token">> {
  const token = readBearerToken(input.authorizationHeader);
  if (token === null) {
    return {
      ok: false,
      error: "invalid_project_token"
    };
  }

  const validated =
    input.now === undefined
      ? await validateProjectToken(token, input.resolveByTokenHash)
      : await validateProjectToken(token, input.resolveByTokenHash, { now: input.now });
  if (!validated.ok) {
    return {
      ok: false,
      error: "invalid_project_token"
    };
  }

  return validated;
}

export async function requireMemberToken(input: {
  authorizationHeader: string | undefined;
  resolveByTokenHash: TokenHashResolver<MemberTokenContext>;
  now?: Date;
}): Promise<RequireTokenResult<MemberTokenContext, "invalid_member_token">> {
  const token = readBearerToken(input.authorizationHeader);
  if (token === null) {
    return {
      ok: false,
      error: "invalid_member_token"
    };
  }

  const validated =
    input.now === undefined
      ? await validateMemberToken(token, input.resolveByTokenHash)
      : await validateMemberToken(token, input.resolveByTokenHash, { now: input.now });
  if (!validated.ok) {
    return {
      ok: false,
      error: "invalid_member_token"
    };
  }

  return validated;
}
