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
import { isSelfHostMode } from "../../../../packages/shared-types/src/index.js";
import type { ApiDependencies } from "../api-types.js";
import { hashAuditIdentifier, recordAuditLog } from "../audit-logging.js";
import { SMALL_REQUEST_BODY_LIMIT_BYTES } from "../http-limits.js";
import {
  AcceptInviteBodySchema,
  GithubAuthCallbackQuerySchema,
  GithubMockAuthorizeQuerySchema,
  RequestEmailCodeBodySchema,
  VerifyEmailCodeBodySchema
} from "../schemas.js";

const DEV_GITHUB_MOCK_CODE = "debugbundle-dev-mock-code";
const AUTH_RATE_LIMIT_PER_MINUTE = 10;

function toRetryAfterSeconds(retryAfterMs: number): string {
  return String(Math.max(1, Math.ceil(retryAfterMs / 1_000)));
}

function shouldUseSecureCookies(): boolean {
  return process.env["AUTH_COOKIE_SECURE"] !== "false";
}

function isDevGithubMockEnabled(): boolean {
  return process.env["DEV_GITHUB_MOCK_LOGIN"] === "true";
}

function assertDevGithubMockNotEnabledInProduction(): void {
  if (process.env["NODE_ENV"] === "production" && isDevGithubMockEnabled()) {
    throw new Error("dev_github_mock_login_not_allowed_in_production");
  }
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
  }
): {
  session: Omit<typeof session, "has_email_auth" | "has_github_oauth"> & {
    csrf_token: string;
    auth_methods: {
      email: boolean;
      github: boolean;
    };
  };
} {
  const { has_email_auth, has_github_oauth, ...publicSession } = session;

  return {
    session: {
      ...publicSession,
      auth_methods: {
        email: has_email_auth ?? true,
        github: has_github_oauth ?? false
      },
      csrf_token: buildCsrfToken(sessionToken)
    }
  };
}

async function resolveOrganizationPlan(
  organizationId: string,
  dependencies: Pick<ApiDependencies, "billingManagement" | "projectManagement">
): Promise<"free" | "solo" | "team"> {
  const billingSummary = await dependencies.billingManagement?.getBillingSummaryForOrganization({
    organization_id: organizationId,
    now: new Date().toISOString()
  });

  if (billingSummary !== null && billingSummary !== undefined) {
    return billingSummary.plan;
  }

  const projects = await dependencies.projectManagement?.listProjectsForOrganization({
    organization_id: organizationId,
    now: new Date().toISOString(),
    limit: 1
  });

  if (projects?.[0]?.organization_plan === "solo" || projects?.[0]?.organization_plan === "team") {
    return projects[0].organization_plan;
  }

  return "free";
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

    reply.header(
      "Set-Cookie",
      buildSessionCookie(login.session_token, login.session.expires_at, { secure: shouldUseSecureCookies() })
    );
    return reply.status(200).send(
      buildSessionResponse(login.session_token, {
        ...login.session,
        organization_plan: await resolveOrganizationPlan(login.session.organization_id, dependencies)
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
    return reply.redirect(completed.redirect_url);
  });

  app.post("/v1/auth/accept-invite", { bodyLimit: SMALL_REQUEST_BODY_LIMIT_BYTES }, async (request, reply) => {
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

    return reply.status(200).send({
      ...buildSessionResponse(sessionToken, {
        ...session,
        organization_plan: await resolveOrganizationPlan(session.organization_id, dependencies)
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

    reply.header("Set-Cookie", buildClearedSessionCookie({ secure: shouldUseSecureCookies() }));
    return reply.status(200).send({ success: true });
  });
}