import { createHmac, timingSafeEqual } from "node:crypto";

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import {
  GITHUB_OAUTH_STATE_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  buildCsrfToken,
  buildClearedGithubOauthStateCookie,
  buildGithubOauthStateCookie,
  buildClearedSessionCookie,
  buildSessionCookie,
  readCookieValue
} from "../../../../packages/auth/src/index.js";
import { importUserAvatarFromUrl, type AuditLogActorType } from "../../../../packages/storage/src/index.js";
import { isSelfHostMode } from "../../../../packages/shared-types/src/index.js";
import type { ApiDependencies } from "../api-types.js";
import { buildAccountAvatarUrl } from "../avatar-urls.js";
import { hashAuditIdentifier, recordAuditLog } from "../audit-logging.js";
import { ensureBillingAdminDefaultPlan } from "../billing-admin-helpers.js";
import { SMALL_REQUEST_BODY_LIMIT_BYTES } from "../http-limits.js";
import {
  AcceptInviteBodySchema,
  GithubAuthCallbackQuerySchema,
  GithubDeviceClaimBodySchema,
  GithubDevicePollBodySchema,
  GithubDeviceStartBodySchema,
  GithubMockAuthorizeQuerySchema,
  ReviewAccessQuerySchema,
  GithubTokenExchangeBodySchema,
  RequestEmailCodeBodySchema,
  VerifyEmailCodeBodySchema
} from "../schemas.js";

const DEV_GITHUB_MOCK_CODE = "debugbundle-dev-mock-code";
const AUTH_RATE_LIMIT_PER_MINUTE = 10;
const DEFAULT_GITHUB_BOOTSTRAP_LABEL = "GitHub bootstrap";
const REVIEW_GRANT_COOKIE_NAME = "dbundle_review_grant";
const REVIEW_GRANT_SCOPE = "review_access";
const REVIEW_GRANT_TTL_MS = 1000 * 60 * 60 * 24 * 14;

function toRetryAfterSeconds(retryAfterMs: number): string {
  return String(Math.max(1, Math.ceil(retryAfterMs / 1_000)));
}

function shouldUseSecureCookies(): boolean {
  return process.env["AUTH_COOKIE_SECURE"] !== "false";
}

function buildStrictHttpOnlyCookieAttributes(options: { secure: boolean | undefined }): string {
  return `Path=/; HttpOnly; ${options.secure === false ? "" : "Secure; "}SameSite=Strict`;
}

function buildReviewGrantCookie(secret: string, expiresAt: string, options: { secure: boolean | undefined }): string {
  const value = createHmac("sha256", secret).update(REVIEW_GRANT_SCOPE, "utf8").digest("base64url");
  return `${REVIEW_GRANT_COOKIE_NAME}=${encodeURIComponent(value)}; ${buildStrictHttpOnlyCookieAttributes(options)}; Expires=${new Date(expiresAt).toUTCString()}`;
}

function buildClearedReviewGrantCookie(options: { secure: boolean | undefined }): string {
  return `${REVIEW_GRANT_COOKIE_NAME}=; ${buildStrictHttpOnlyCookieAttributes(options)}; Expires=${new Date(0).toUTCString()}; Max-Age=0`;
}

function readReviewAccessSecret(): string | null {
  const secret = process.env["REVIEW_ACCESS_SECRET"]?.trim();
  return secret === undefined || secret.length === 0 ? null : secret;
}

function timingSafeStringEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function hasValidReviewGrantCookie(cookieHeader: string | undefined, secret: string): boolean {
  const cookieValue = readCookieValue(cookieHeader, REVIEW_GRANT_COOKIE_NAME);
  if (cookieValue === null) {
    return false;
  }

  const expected = createHmac("sha256", secret).update(REVIEW_GRANT_SCOPE, "utf8").digest("base64url");
  return timingSafeStringEquals(cookieValue, expected);
}

function normalizeReviewGrantRedirectPath(path: string | undefined): string {
  if (typeof path !== "string" || path.length === 0 || !path.startsWith("/") || path.startsWith("//")) {
    return "/login";
  }

  return path;
}

function resolveAppRedirectUrl(path: string | undefined): string {
  const appBaseUrl = process.env["APP_BASE_URL"]?.trim() || "http://localhost:5291";
  return new URL(normalizeReviewGrantRedirectPath(path), appBaseUrl).toString();
}

function appendSetCookieHeader(reply: FastifyReply, value: string): void {
  const existing = reply.getHeader("Set-Cookie");
  if (existing === undefined) {
    reply.header("Set-Cookie", value);
    return;
  }

  if (Array.isArray(existing)) {
    reply.header("Set-Cookie", [...existing.map((entry) => String(entry)), value]);
    return;
  }

  reply.header("Set-Cookie", [String(existing), value]);
}

function isDevGithubMockEnabled(): boolean {
  return process.env["DEV_GITHUB_MOCK_LOGIN"] === "true";
}

function assertDevGithubMockNotEnabledInProduction(): void {
  if (process.env["NODE_ENV"] === "production" && isDevGithubMockEnabled()) {
    throw new Error("dev_github_mock_login_not_allowed_in_production");
  }
}

function buildIssuedMemberTokenResponse(token: {
  token_id: string;
  user_id: string;
  organization_id: string;
  label: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  expires_at: string | null;
  plaintext: string;
}): {
  token: {
    token_id: string;
    user_id: string;
    organization_id: string;
    label: string;
    created_at: string;
    last_used_at: string | null;
    revoked_at: string | null;
    expires_at: string | null;
    plaintext: string;
  };
} {
  return {
    token
  };
}

async function recordGitHubBootstrapSuccess(
  dependencies: ApiDependencies,
  request: FastifyRequest,
  input: {
    user_id: string;
    organization_id: string;
    token_id: string;
    created_user: boolean;
    authentication_method: "github_device" | "github_cli";
    email?: string;
  }
): Promise<void> {
  if (input.created_user) {
    await recordAuditLog(dependencies.auditLogging, {
      organization_id: input.organization_id,
      actor_user_id: input.user_id,
      actor_type: "anonymous",
      action: "auth.signup",
      target_type: "user",
      target_id: input.user_id,
      status: "success",
      ip_address: request.ip,
      metadata: {
        created_user: true,
        authentication_method: input.authentication_method,
        acceptance_source: "clickwrap",
        ...(input.email === undefined ? {} : { email_hash: hashAuditIdentifier(input.email) })
      }
    });
  }

  await Promise.all([
    recordAuditLog(dependencies.auditLogging, {
      organization_id: input.organization_id,
      actor_user_id: input.user_id,
      actor_type: "anonymous",
      action: "auth.login",
      target_type: "member_token",
      target_id: input.token_id,
      status: "success",
      ip_address: request.ip,
      metadata: {
        authentication_method: input.authentication_method
      }
    }),
    recordAuditLog(dependencies.auditLogging, {
      organization_id: input.organization_id,
      actor_user_id: input.user_id,
      actor_type: "anonymous",
      action: "token.member.create",
      target_type: "member_token",
      target_id: input.token_id,
      status: "success",
      ip_address: request.ip,
      metadata: {
        authentication_method: input.authentication_method,
        bootstrap: true
      }
    })
  ]);
}

function buildSessionResponse(
  sessionToken: string,
  session: {
    session_id: string;
    user_id: string;
    email: string;
    email_verified_at: string | null;
    organization_id: string;
    organization_plan: "free" | "solo" | "team";
    role: "owner" | "member";
    created_at: string;
    expires_at: string;
    revoked_at: string | null;
    has_email_auth?: boolean;
    has_github_oauth?: boolean;
    avatar_object_key?: string | null;
  },
  options: {
    avatar_url?: string | null;
  } = {}
): {
  session: Omit<typeof session, "has_email_auth" | "has_github_oauth"> & {
    csrf_token: string;
    avatar_url: string | null;
    auth_methods: {
      email: boolean;
      github: boolean;
    };
  };
} {
  const { has_email_auth, has_github_oauth, avatar_object_key, ...publicSession } = session;
  const avatarUrl =
    options.avatar_url !== undefined
      ? options.avatar_url
      : avatar_object_key === null || avatar_object_key === undefined
        ? null
        : buildAccountAvatarUrl();

  return {
    session: {
      ...publicSession,
      avatar_url: avatarUrl,
      auth_methods: {
        email: has_email_auth ?? true,
        github: has_github_oauth ?? false
      },
      csrf_token: buildCsrfToken(sessionToken)
    }
  };
}

async function resolveOrganizationPlan(
  input: {
    organization_id: string;
    user_id: string;
    email: string;
    role: "owner" | "member";
    actor_type: AuditLogActorType;
    ip_address: string;
  },
  dependencies: Pick<ApiDependencies, "auditLogging" | "billingAdmin" | "billingManagement" | "projectManagement">
): Promise<"free" | "solo" | "team"> {
  const now = new Date().toISOString();
  const adminDefault =
    input.role === "owner"
      ? await ensureBillingAdminDefaultPlan({
          organization_id: input.organization_id,
          email: input.email,
          now,
          dependencies
        })
      : undefined;
  if (adminDefault?.default_applied === true) {
    await recordAuditLog(dependencies.auditLogging, {
      organization_id: input.organization_id,
      actor_user_id: input.user_id,
      actor_type: input.actor_type,
      action: "billing.admin_override",
      target_type: "organization",
      target_id: input.organization_id,
      status: "success",
      ip_address: input.ip_address,
      metadata: {
        plan: "team",
        additional_capacity_units: 0,
        reason: "billing_admin_auto_default_team"
      }
    });
  }

  const billingSummary =
    adminDefault?.billing ??
    (await dependencies.billingManagement?.getBillingSummaryForOrganization({
      organization_id: input.organization_id,
      now
    }));

  if (billingSummary !== null && billingSummary !== undefined) {
    return billingSummary.plan;
  }

  const projects = await dependencies.projectManagement?.listProjectsForOrganization({
    organization_id: input.organization_id,
    now: new Date().toISOString(),
    limit: 1
  });

  if (projects?.[0]?.organization_plan === "solo" || projects?.[0]?.organization_plan === "team") {
    return projects[0].organization_plan;
  }

  return "free";
}

async function applyReviewAccessGrant(
  request: FastifyRequest,
  input: {
    organization_id: string;
    user_id: string;
    email: string;
    role: "owner" | "member";
  },
  dependencies: Pick<ApiDependencies, "auditLogging" | "billingAdmin" | "billingManagement">
): Promise<{ plan?: "free" | "solo" | "team"; clear_cookie: boolean }> {
  const secret = readReviewAccessSecret();
  if (secret === null || !hasValidReviewGrantCookie(request.headers.cookie, secret)) {
    return { clear_cookie: false };
  }

  const clear_cookie = true;
  if (input.role !== "owner") {
    await recordAuditLog(dependencies.auditLogging, {
      organization_id: input.organization_id,
      actor_user_id: input.user_id,
      actor_type: "browser_session",
      action: "billing.admin_override",
      target_type: "organization",
      target_id: input.organization_id,
      status: "failure",
      ip_address: request.ip,
      metadata: {
        plan: "team",
        additional_capacity_units: 0,
        reason: "review_access_not_owner"
      }
    });
    return { clear_cookie };
  }

  if (dependencies.billingManagement === undefined || dependencies.billingAdmin === undefined) {
    await recordAuditLog(dependencies.auditLogging, {
      organization_id: input.organization_id,
      actor_user_id: input.user_id,
      actor_type: "browser_session",
      action: "billing.admin_override",
      target_type: "organization",
      target_id: input.organization_id,
      status: "failure",
      ip_address: request.ip,
      metadata: {
        plan: "team",
        additional_capacity_units: 0,
        reason: "review_access_not_available"
      }
    });
    return { clear_cookie };
  }

  const billing = await dependencies.billingManagement.getBillingSummaryForOrganization({
    organization_id: input.organization_id,
    now: new Date().toISOString()
  });
  if (billing === null) {
    await recordAuditLog(dependencies.auditLogging, {
      organization_id: input.organization_id,
      actor_user_id: input.user_id,
      actor_type: "browser_session",
      action: "billing.admin_override",
      target_type: "organization",
      target_id: input.organization_id,
      status: "failure",
      ip_address: request.ip,
      metadata: {
        plan: "team",
        additional_capacity_units: 0,
        reason: "review_access_billing_not_found"
      }
    });
    return { clear_cookie };
  }

  if (billing.plan !== "free") {
    return {
      plan: billing.plan,
      clear_cookie
    };
  }

  const overridden = await dependencies.billingAdmin.overrideOrganizationBilling({
    organization_id: input.organization_id,
    plan: "team",
    additional_capacity_units: 0,
    now: new Date().toISOString()
  });

  if (overridden === "billing_not_found") {
    await recordAuditLog(dependencies.auditLogging, {
      organization_id: input.organization_id,
      actor_user_id: input.user_id,
      actor_type: "browser_session",
      action: "billing.admin_override",
      target_type: "organization",
      target_id: input.organization_id,
      status: "failure",
      ip_address: request.ip,
      metadata: {
        plan: "team",
        additional_capacity_units: 0,
        reason: "review_access_billing_not_found"
      }
    });
    return { clear_cookie };
  }

  await recordAuditLog(dependencies.auditLogging, {
    organization_id: input.organization_id,
    actor_user_id: input.user_id,
    actor_type: "browser_session",
    action: "billing.admin_override",
    target_type: "organization",
    target_id: input.organization_id,
    status: "success",
    ip_address: request.ip,
    metadata: {
      plan: "team",
      additional_capacity_units: 0,
      reason: "review_access"
    }
  });

  return {
    plan: overridden.plan,
    clear_cookie
  };
}

async function resolveOrganizationPlanForRequest(
  request: FastifyRequest,
  input: {
    organization_id: string;
    user_id: string;
    email: string;
    role: "owner" | "member";
    actor_type: AuditLogActorType;
    ip_address: string;
  },
  dependencies: Pick<ApiDependencies, "auditLogging" | "billingAdmin" | "billingManagement" | "projectManagement">
): Promise<{ organization_plan: "free" | "solo" | "team"; clear_review_cookie: boolean }> {
  const reviewGrant = await applyReviewAccessGrant(request, input, dependencies);
  if (reviewGrant.plan !== undefined) {
    return {
      organization_plan: reviewGrant.plan,
      clear_review_cookie: reviewGrant.clear_cookie
    };
  }

  return {
    organization_plan: await resolveOrganizationPlan(input, dependencies),
    clear_review_cookie: reviewGrant.clear_cookie
  };
}

async function enforceAuthRateLimit(
  request: FastifyRequest,
  reply: FastifyReply,
  dependencies: ApiDependencies
): Promise<boolean> {
  if (isSelfHostMode() || dependencies.authRateLimiter === undefined) {
    return true;
  }

  const rateLimit = await dependencies.authRateLimiter.claimRequest({
    ip: request.ip,
    bucket: "auth",
    limit: AUTH_RATE_LIMIT_PER_MINUTE,
    now: new Date().toISOString()
  });

  if (rateLimit.allowed) {
    return true;
  }

  await reply.header("Retry-After", toRetryAfterSeconds(rateLimit.retry_after_ms)).status(429).send({
    error: "rate_limited"
  });
  return false;
}

export function registerAuthRoutes(app: FastifyInstance, dependencies: ApiDependencies): void {
  assertDevGithubMockNotEnabledInProduction();

  const handleReviewAccess = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const secret = readReviewAccessSecret();
    if (secret === null) {
      await reply.status(404).send({ error: "not_found" });
      return;
    }
    if (!(await enforceAuthRateLimit(request, reply, dependencies))) {
      return;
    }
    if (dependencies.billingManagement === undefined || dependencies.billingAdmin === undefined) {
      await reply.status(503).send({ error: "review_access_not_available" });
      return;
    }

    const parsedQuery = ReviewAccessQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      await reply.status(400).send({ error: "invalid_query" });
      return;
    }
    if (!timingSafeStringEquals(parsedQuery.data.token, secret)) {
      await reply.status(404).send({ error: "not_found" });
      return;
    }

    const expiresAt = new Date(Date.now() + REVIEW_GRANT_TTL_MS).toISOString();
    reply.header("Set-Cookie", buildReviewGrantCookie(secret, expiresAt, { secure: shouldUseSecureCookies() }));
    await reply.redirect(resolveAppRedirectUrl(parsedQuery.data.next));
  };

  app.get("/review/access", handleReviewAccess);
  app.get("/v1/auth/review/access", handleReviewAccess);

  app.post("/v1/auth/request-code", { bodyLimit: SMALL_REQUEST_BODY_LIMIT_BYTES }, async (request, reply) => {
    if (!(await enforceAuthRateLimit(request, reply, dependencies))) {
      return;
    }

    if (dependencies.webAuth === undefined) {
      return reply.status(503).send({
        error: "auth_not_configured"
      });
    }

    const parsedBody = RequestEmailCodeBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({
        error: "invalid_payload"
      });
    }

    const now = new Date();
    const acceptedTermsAt = now.toISOString();

    const requested = await dependencies.webAuth.requestEmailCode({
      email: parsedBody.data.email,
      accepted_terms_at: acceptedTermsAt,
      now
    });

    await recordAuditLog(dependencies.auditLogging, {
      organization_id: null,
      actor_user_id: null,
      actor_type: "anonymous",
      action: "auth.email_code.request",
      target_type: "email_auth",
      target_id: null,
      status: "success",
      ip_address: request.ip,
      metadata: {
        email_hash: hashAuditIdentifier(parsedBody.data.email),
        code_sent: requested.code_sent,
        accepted_terms_at: acceptedTermsAt,
        acceptance_source: "clickwrap"
      }
    });

    return reply.status(200).send({ success: true });
  });

  app.post("/v1/auth/verify-code", { bodyLimit: SMALL_REQUEST_BODY_LIMIT_BYTES }, async (request, reply) => {
    if (!(await enforceAuthRateLimit(request, reply, dependencies))) {
      return;
    }

    if (dependencies.webAuth === undefined) {
      return reply.status(503).send({
        error: "auth_not_configured"
      });
    }

    const parsedBody = VerifyEmailCodeBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({
        error: "invalid_payload"
      });
    }

    const login = await dependencies.webAuth.verifyEmailCode({
      email: parsedBody.data.email,
      code: parsedBody.data.code,
      now: new Date()
    });

    if (!login.ok) {
      await recordAuditLog(dependencies.auditLogging, {
        organization_id: null,
        actor_user_id: null,
        actor_type: "anonymous",
        action: "auth.email_code.verify",
        target_type: "session",
        target_id: null,
        status: "failure",
        ip_address: request.ip,
        metadata: {
          email_hash: hashAuditIdentifier(parsedBody.data.email),
          reason: login.error
        }
      });

      return reply.status(login.error === "account_suspended" ? 403 : 400).send({
        error: login.error === "account_suspended" ? "account_suspended" : "invalid_code"
      });
    }

    if (login.created_user) {
      await recordAuditLog(dependencies.auditLogging, {
        organization_id: login.session.organization_id,
        actor_user_id: login.session.user_id,
        actor_type: "anonymous",
        action: "auth.signup",
        target_type: "user",
        target_id: login.session.user_id,
        status: "success",
        ip_address: request.ip,
        metadata: {
          email_hash: hashAuditIdentifier(parsedBody.data.email),
          created_user: true,
          authentication_method: "email_code",
          acceptance_source: "clickwrap"
        }
      });
    }

    await recordAuditLog(dependencies.auditLogging, {
      organization_id: login.session.organization_id,
      actor_user_id: login.session.user_id,
      actor_type: "anonymous",
      action: "auth.login",
      target_type: "session",
      target_id: login.session.session_id,
      status: "success",
      ip_address: request.ip,
      metadata: {
        authentication_method: "email_code"
      }
    });

    const plan = await resolveOrganizationPlanForRequest(
      request,
      {
        organization_id: login.session.organization_id,
        user_id: login.session.user_id,
        email: login.session.email,
        role: login.session.role,
        actor_type: "browser_session",
        ip_address: request.ip
      },
      dependencies
    );

    reply.header("Set-Cookie", buildSessionCookie(login.session_token, login.session.expires_at, { secure: shouldUseSecureCookies() }));
    if (plan.clear_review_cookie) {
      appendSetCookieHeader(reply, buildClearedReviewGrantCookie({ secure: shouldUseSecureCookies() }));
    }
    return reply.status(200).send(
      buildSessionResponse(login.session_token, {
        ...login.session,
        organization_plan: plan.organization_plan
      })
    );
  });

  app.get("/v1/auth/github/start", async (_request, reply) => {
    if (dependencies.webAuth === undefined) {
      return reply.status(503).send({
        error: "auth_not_configured"
      });
    }

    const now = new Date();
    const started = await dependencies.webAuth.beginGithubAuth({
      now,
      accepted_terms_at: now.toISOString()
    });
    if (!started.ok) {
      return reply.status(503).send({
        error: started.error
      });
    }

    reply.header(
      "Set-Cookie",
      buildGithubOauthStateCookie(started.state, started.expires_at, { secure: shouldUseSecureCookies() })
    );
    return reply.redirect(started.authorization_url);
  });

  app.get("/v1/auth/github/mock-authorize", async (request, reply) => {
    if (!isDevGithubMockEnabled()) {
      return reply.status(404).send({
        error: "not_found"
      });
    }

    const parsedQuery = GithubMockAuthorizeQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.status(400).send({
        error: "invalid_query"
      });
    }

    const redirectUrl = new URL(parsedQuery.data.redirect_uri);
    redirectUrl.searchParams.set("code", DEV_GITHUB_MOCK_CODE);
    redirectUrl.searchParams.set("state", parsedQuery.data.state);
    return reply.redirect(redirectUrl.toString());
  });

  app.get("/v1/auth/github/callback", async (request, reply) => {
    if (dependencies.webAuth === undefined) {
      return reply.status(503).send({
        error: "auth_not_configured"
      });
    }

    const parsedQuery = GithubAuthCallbackQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.status(400).send({
        error: "invalid_query"
      });
    }

    const stateCookieValue = readCookieValue(request.headers.cookie, GITHUB_OAUTH_STATE_COOKIE_NAME);
    const completed = await dependencies.webAuth.completeGithubAuth({
      code: parsedQuery.data.code,
      state: parsedQuery.data.state,
      stateCookieValue,
      now: new Date()
    });

    if (!completed.ok) {
      if (completed.redirect_url === undefined) {
        return reply.status(503).send({
          error: completed.error
        });
      }

      reply.header("Set-Cookie", buildClearedGithubOauthStateCookie({ secure: shouldUseSecureCookies() }));
      return reply.redirect(completed.redirect_url);
    }

    if (completed.created_user) {
      await recordAuditLog(dependencies.auditLogging, {
        organization_id: completed.session.organization_id,
        actor_user_id: completed.session.user_id,
        actor_type: "anonymous",
        action: "auth.signup",
        target_type: "user",
        target_id: completed.session.user_id,
        status: "success",
        ip_address: request.ip,
        metadata: {
          email_hash: hashAuditIdentifier(completed.session.email),
          created_user: true,
          authentication_method: "github",
          acceptance_source: "clickwrap",
          ...(completed.accepted_terms_at === null ? {} : { accepted_terms_at: completed.accepted_terms_at })
        }
      });
    }

    await recordAuditLog(dependencies.auditLogging, {
      organization_id: completed.session.organization_id,
      actor_user_id: completed.session.user_id,
      actor_type: "anonymous",
      action: "auth.login",
      target_type: "session",
      target_id: completed.session.session_id,
      status: "success",
      ip_address: request.ip,
      metadata: {
        authentication_method: "github"
      }
    });

    reply.header("Set-Cookie", [
      buildSessionCookie(completed.session_token, completed.session.expires_at, { secure: shouldUseSecureCookies() }),
      buildClearedGithubOauthStateCookie({ secure: shouldUseSecureCookies() })
    ]);

    if (typeof completed.avatar_url === "string" && dependencies.accountManagement !== undefined && dependencies.objectStoreWriter !== undefined) {
      await importUserAvatarFromUrl({
        user_id: completed.session.user_id,
        source: "github",
        url: completed.avatar_url,
        store: dependencies.accountManagement,
        objectStoreWriter: dependencies.objectStoreWriter
      }).catch(() => ({ ok: false as const, error: "fetch_failed" as const }));
    }

    return reply.redirect(completed.redirect_url);
  });

  app.post("/v1/auth/github/device/start", { bodyLimit: SMALL_REQUEST_BODY_LIMIT_BYTES }, async (request, reply) => {
    if (!(await enforceAuthRateLimit(request, reply, dependencies))) {
      return;
    }

    if (dependencies.githubCliAuth === undefined) {
      return reply.status(503).send({
        error: "auth_not_configured"
      });
    }

    const parsedBody = GithubDeviceStartBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({
        error: "invalid_payload"
      });
    }

    const now = new Date();
    const started = await dependencies.githubCliAuth.beginDeviceAuth({
      accepted_terms_at: now.toISOString(),
      now
    });

    if (!started.ok) {
      return reply.status(503).send({
        error:
          started.error === "device_flow_disabled"
            ? "github_device_flow_disabled"
            : started.error === "provider_error"
              ? "github_oauth_unavailable"
              : "auth_not_configured"
      });
    }

    return reply.status(200).send({
      request_id: started.request_id,
      user_code: started.user_code,
      verification_uri: started.verification_uri,
      interval_seconds: started.interval_seconds,
      expires_at: started.expires_at
    });
  });

  app.post("/v1/auth/github/device/poll", { bodyLimit: SMALL_REQUEST_BODY_LIMIT_BYTES }, async (request, reply) => {
    if (!(await enforceAuthRateLimit(request, reply, dependencies))) {
      return;
    }

    if (dependencies.githubCliAuth === undefined) {
      return reply.status(503).send({
        error: "auth_not_configured"
      });
    }

    const parsedBody = GithubDevicePollBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({
        error: "invalid_payload"
      });
    }

    const polled = await dependencies.githubCliAuth.pollDeviceAuth({
      request_id: parsedBody.data.request_id,
      now: new Date()
    });

    if (!polled.ok) {
      return reply.status(polled.error === "request_not_found" ? 404 : 503).send({
        error: polled.error === "request_not_found" ? "github_device_request_not_found" : "auth_not_configured"
      });
    }

    if (polled.status === "pending") {
      return reply.status(200).send({
        status: polled.status,
        interval_seconds: polled.interval_seconds,
        expires_at: polled.expires_at
      });
    }

    if (polled.status === "approved" || polled.status === "claimed") {
      return reply.status(200).send({
        status: polled.status,
        expires_at: polled.expires_at
      });
    }

    if (polled.status === "denied" || polled.status === "expired" || polled.status === "rejected") {
      return reply.status(200).send({
        status: polled.status,
        reason: polled.reason,
        expires_at: polled.expires_at
      });
    }

    return reply.status(500).send({
      error: "internal_error"
    });
  });

  app.post("/v1/auth/github/device/claim", { bodyLimit: SMALL_REQUEST_BODY_LIMIT_BYTES }, async (request, reply) => {
    if (!(await enforceAuthRateLimit(request, reply, dependencies))) {
      return;
    }

    if (dependencies.githubCliAuth === undefined) {
      return reply.status(503).send({
        error: "auth_not_configured"
      });
    }

    const parsedBody = GithubDeviceClaimBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({
        error: "invalid_payload"
      });
    }

    const claimed = await dependencies.githubCliAuth.claimDeviceAuth({
      request_id: parsedBody.data.request_id,
      label: parsedBody.data.label,
      now: new Date()
    });

    if (!claimed.ok) {
      const statusCode = claimed.error === "request_not_found" ? 404 : claimed.error === "provider_not_configured" ? 503 : 409;
      const error =
        claimed.error === "request_not_found"
          ? "github_device_request_not_found"
          : claimed.error === "provider_not_configured"
            ? "auth_not_configured"
            : claimed.error === "pending"
              ? "github_device_auth_pending"
              : claimed.error === "expired"
                ? "github_device_auth_expired"
                : claimed.error === "claimed"
                  ? "github_device_auth_claimed"
                  : "github_device_auth_rejected";

      return reply.status(statusCode).send({ error });
    }

    await recordGitHubBootstrapSuccess(dependencies, request, {
      user_id: claimed.token.user_id,
      organization_id: claimed.token.organization_id,
      token_id: claimed.token.token_id,
      created_user: false,
      authentication_method: "github_device"
    });

    return reply.status(200).send(buildIssuedMemberTokenResponse(claimed.token));
  });

  app.post("/v1/auth/github/token/exchange", { bodyLimit: SMALL_REQUEST_BODY_LIMIT_BYTES }, async (request, reply) => {
    if (!(await enforceAuthRateLimit(request, reply, dependencies))) {
      return;
    }

    if (dependencies.githubCliAuth === undefined) {
      return reply.status(503).send({
        error: "auth_not_configured"
      });
    }

    const parsedBody = GithubTokenExchangeBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({
        error: "invalid_payload"
      });
    }

    const exchanged = await dependencies.githubCliAuth.exchangeGitHubAccessToken({
      github_access_token: parsedBody.data.github_access_token,
      label: parsedBody.data.label || DEFAULT_GITHUB_BOOTSTRAP_LABEL,
      accepted_terms_at: new Date().toISOString(),
      now: new Date()
    });

    if (!exchanged.ok) {
      const statusCode =
        exchanged.error === "provider_not_configured"
          ? 503
          : exchanged.error === "oauth_exchange_failed"
            ? 401
            : exchanged.error === "account_suspended"
              ? 403
              : 400;

      const error =
        exchanged.error === "provider_not_configured"
          ? "auth_not_configured"
          : exchanged.error === "oauth_exchange_failed"
            ? "invalid_github_token"
            : exchanged.error;

      return reply.status(statusCode).send({ error });
    }

    await recordGitHubBootstrapSuccess(dependencies, request, {
      user_id: exchanged.token.user_id,
      organization_id: exchanged.token.organization_id,
      token_id: exchanged.token.token_id,
      created_user: exchanged.created_user,
      authentication_method: "github_cli"
    });

    return reply.status(200).send(buildIssuedMemberTokenResponse(exchanged.token));
  });

  app.post("/v1/auth/project-invite/accept", { bodyLimit: SMALL_REQUEST_BODY_LIMIT_BYTES }, async (request, reply) => {
    if (dependencies.webAuth === undefined) {
      return reply.status(503).send({
        error: "auth_not_configured"
      });
    }

    const parsedBody = AcceptInviteBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({
        error: "invalid_payload"
      });
    }

    const sessionToken = readCookieValue(request.headers.cookie, SESSION_COOKIE_NAME);
    if (sessionToken === null) {
      return reply.status(401).send({
        error: "invalid_session"
      });
    }

    const accepted = await dependencies.webAuth.acceptInviteForSession(sessionToken, {
      token: parsedBody.data.token,
      now: new Date()
    });
    if (!accepted.ok) {
      if (accepted.error === "invalid_session") {
        return reply.status(401).send({ error: "invalid_session" });
      }
      if (accepted.error === "invite_email_mismatch") {
        return reply.status(403).send({ error: "invite_email_mismatch" });
      }

      return reply.status(400).send({ error: "invalid_token" });
    }

    return reply.status(200).send({
      membership: accepted.membership
    });
  });

  app.get("/v1/auth/session", async (request, reply) => {
    if (dependencies.webAuth === undefined) {
      return reply.status(503).send({
        error: "auth_not_configured"
      });
    }

    const sessionToken = readCookieValue(request.headers.cookie, SESSION_COOKIE_NAME);
    if (sessionToken === null) {
      return reply.status(200).send({
        session: null
      });
    }

    const session = await dependencies.webAuth.resolveSessionByToken(sessionToken, {
      now: new Date()
    });
    if (session === null) {
      return reply.status(200).send({
        session: null
      });
    }

    const plan = await resolveOrganizationPlanForRequest(
      request,
      {
        organization_id: session.organization_id,
        user_id: session.user_id,
        email: session.email,
        role: session.role,
        actor_type: "browser_session",
        ip_address: request.ip
      },
      dependencies
    );
    if (plan.clear_review_cookie) {
      appendSetCookieHeader(reply, buildClearedReviewGrantCookie({ secure: shouldUseSecureCookies() }));
    }

    return reply.status(200).send({
      ...buildSessionResponse(sessionToken, {
        ...session,
        organization_plan: plan.organization_plan
      })
    });
  });

  app.post("/v1/auth/logout", async (request, reply) => {
    if (dependencies.webAuth === undefined) {
      return reply.status(503).send({
        error: "auth_not_configured"
      });
    }

    const sessionToken = readCookieValue(request.headers.cookie, SESSION_COOKIE_NAME);
    if (sessionToken === null) {
      return reply.status(401).send({
        error: "invalid_session"
      });
    }

    const revoked = await dependencies.webAuth.revokeSessionByToken(sessionToken, {
      now: new Date()
    });
    if (!revoked) {
      await recordAuditLog(dependencies.auditLogging, {
        organization_id: null,
        actor_user_id: null,
        actor_type: "browser_session",
        action: "auth.logout",
        target_type: "session",
        target_id: null,
        status: "failure",
        ip_address: request.ip,
        metadata: {
          reason: "invalid_session"
        }
      });

      return reply.status(401).send({
        error: "invalid_session"
      });
    }

    await recordAuditLog(dependencies.auditLogging, {
      organization_id: null,
      actor_user_id: null,
      actor_type: "browser_session",
      action: "auth.logout",
      target_type: "session",
      target_id: null,
      status: "success",
      ip_address: request.ip,
      metadata: {}
    });

    reply.header("Set-Cookie", [
      buildClearedSessionCookie({ secure: shouldUseSecureCookies() }),
      buildClearedReviewGrantCookie({ secure: shouldUseSecureCookies() })
    ]);
    return reply.status(200).send({ success: true });
  });
}
