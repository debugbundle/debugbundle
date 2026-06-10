import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { hash as argon2Hash, verify as argon2Verify, type Options as Argon2Options } from "@node-rs/argon2";

export const PROJECT_TOKEN_PREFIX = "dbundle_proj_";
export const MEMBER_TOKEN_PREFIX = "dbundle_mem_";
export const PROBE_TRIGGER_TOKEN_PREFIX = "dbundle_probe_";
export const SESSION_COOKIE_NAME = "dbundle_session";
export const GITHUB_OAUTH_STATE_COOKIE_NAME = "dbundle_github_oauth_state";
export const GITHUB_APP_INSTALL_STATE_COOKIE_NAME = "dbundle_github_app_install_state";
export const PROJECT_INVITE_TOKEN_PREFIX = "dbundle_invite_";

type Argon2Algorithm = NonNullable<Argon2Options["algorithm"]>;

const ARGON2_OPTIONS: Argon2Options = {
  algorithm: 2 as Argon2Algorithm,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32
};

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
  allowed_origins?: string[] | null;
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
  avatar_object_key?: string | null;
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

export interface ProjectInviteMembership {
  project_id: string;
  user_id: string;
  role: "owner" | "admin" | "member";
  membership_type?: "owner" | "collaborator";
}

export interface IssuedMemberTokenRecord {
  token_id: string;
  user_id: string;
  organization_id: string;
  label: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  expires_at: string | null;
}

export type AcceptProjectInviteStoreResult =
  | {
      kind: "accepted";
      membership: ProjectInviteMembership;
    }
  | {
      kind: "invalid_token" | "email_mismatch" | "shared_access_suspended";
    };

export interface AuthEmailSender {
  sendEmailAuthCode(input: { email: string; code: string; expires_in_minutes: number }): Promise<void>;
  sendProjectInviteEmail(input: { email: string; token: string; inviter_name: string }): Promise<void>;
  sendAccountDeletionOtp?(input: { email: string; code: string; expires_in_minutes: number }): Promise<void>;
}

export interface CookieOptions {
  secure?: boolean;
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

export function isTimingSafeEqualUtf8(expectedValue: string, providedValue: string): boolean {
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

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function deriveOrganizationIdentity(email: string): { organization_name: string; organization_slug: string } {
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

export function generateSessionToken(): string {
  return randomBytes(24).toString("hex");
}

export function isRecordInactive(record: { revoked_at?: string | null; expires_at?: string | null }, now: Date): boolean {
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

export function generateProjectInviteToken(_inviteId: string): { plaintext: string; hash: string } {
  void _inviteId;
  return generateOpaqueToken(PROJECT_INVITE_TOKEN_PREFIX);
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

export function buildGitHubAppInstallStateCookie(state: string, expiresAt: string, options: CookieOptions = {}): string {
  return `${GITHUB_APP_INSTALL_STATE_COOKIE_NAME}=${encodeURIComponent(state)}; ${buildCookieAttributes({ sameSite: "Lax", secure: options.secure })}; Expires=${new Date(expiresAt).toUTCString()}`;
}

export function buildClearedGitHubAppInstallStateCookie(options: CookieOptions = {}): string {
  return `${GITHUB_APP_INSTALL_STATE_COOKIE_NAME}=; ${buildCookieAttributes({ sameSite: "Lax", secure: options.secure })}; Expires=${new Date(0).toUTCString()}; Max-Age=0`;
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

export function isTokenExpired(expiresAt: string | null | undefined, now: Date): boolean {
  if (expiresAt === undefined || expiresAt === null) {
    return false;
  }

  const parsed = Date.parse(expiresAt);
  if (Number.isNaN(parsed)) {
    return true;
  }

  return parsed <= now.getTime();
}

export function isTokenRevoked(revokedAt: string | null | undefined): boolean {
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
