import { createHmac } from "node:crypto";

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import {
  GITHUB_OAUTH_STATE_COOKIE_NAME,
  buildClearedGithubOauthStateCookie,
  buildGithubOauthStateCookie,
  buildSessionCookie,
  readCookieValue
} from "../../../../packages/auth/src/index.js";
import { importUserAvatarFromUrl } from "../../../../packages/storage/src/index.js";
import type { ApiDependencies } from "../api-types.js";
import { hashAuditIdentifier, recordAuditLog } from "../audit-logging.js";
import { SMALL_REQUEST_BODY_LIMIT_BYTES } from "../http-limits.js";
import {
  GithubAuthCallbackQuerySchema,
  GithubMockAuthorizeQuerySchema,
  GithubSignupStartQuerySchema,
  RequestEmailCodeBodySchema,
  VerifyEmailCodeBodySchema
} from "../schemas.js";

const DEV_GITHUB_MOCK_CODE = "debugbundle-dev-mock-code";
const GITHUB_SIGNUP_TRIAL_COOKIE_NAME = "dbundle_github_signup_trial";

interface BrowserAuthSession {
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
}

interface BrowserAuthRouteHelpers {
  enforceAuthRateLimit(
    request: FastifyRequest,
    reply: FastifyReply,
    dependencies: ApiDependencies
  ): Promise<boolean>;
  resolveOrganizationPlanForRequest(
    request: FastifyRequest,
    input: {
      organization_id: string;
      user_id: string;
      email: string;
      role: "owner" | "member";
      actor_type: "browser_session";
      ip_address: string;
    },
    dependencies: Pick<ApiDependencies, "auditLogging" | "billingAdmin" | "billingManagement" | "projectManagement">
  ): Promise<{ organization_plan: "free" | "solo" | "team"; clear_review_cookie: boolean }>;
  buildSessionResponse(
    sessionToken: string,
    session: BrowserAuthSession,
    options?: {
      avatar_url?: string | null;
    }
  ): {
    session: BrowserAuthSession & {
      csrf_token: string;
      avatar_url: string | null;
      auth_methods: {
        email: boolean;
        github: boolean;
      };
    };
  };
  appendSetCookieHeader(reply: FastifyReply, value: string): void;
  buildClearedReviewGrantCookie(options: { secure: boolean | undefined }): string;
  shouldUseSecureCookies(): boolean;
  isDevGithubMockEnabled(): boolean;
}

function buildLaxHttpOnlyCookieAttributes(options: { secure: boolean | undefined }): string {
  return `Path=/; HttpOnly; ${options.secure === false ? "" : "Secure; "}SameSite=Lax`;
}

function readGithubOauthStateSecret(): string | null {
  const secret = process.env["GITHUB_OAUTH_STATE_SECRET"]?.trim();
  return secret === undefined || secret.length === 0 ? null : secret;
}

function buildGithubSignupTrialCookie(
  trialPlan: "solo" | "team",
  expiresAt: string,
  options: { secure: boolean | undefined }
): string | null {
  const secret = readGithubOauthStateSecret();
  if (secret === null) {
    return null;
  }

  const payload = Buffer.from(
    JSON.stringify({
      trial_plan: trialPlan,
      expires_at: expiresAt
    }),
    "utf8"
  ).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload, "utf8").digest("base64url");
  return `${GITHUB_SIGNUP_TRIAL_COOKIE_NAME}=${encodeURIComponent(`${payload}.${signature}`)}; ${buildLaxHttpOnlyCookieAttributes(options)}; Expires=${new Date(expiresAt).toUTCString()}`;
}

function buildClearedGithubSignupTrialCookie(options: { secure: boolean | undefined }): string {
  return `${GITHUB_SIGNUP_TRIAL_COOKIE_NAME}=; ${buildLaxHttpOnlyCookieAttributes(options)}; Expires=${new Date(0).toUTCString()}; Max-Age=0`;
}

function readGithubSignupTrialPlan(cookieHeader: string | undefined): "solo" | "team" | null {
  const secret = readGithubOauthStateSecret();
  if (secret === null) {
    return null;
  }

  const cookieValue = readCookieValue(cookieHeader, GITHUB_SIGNUP_TRIAL_COOKIE_NAME);
  if (cookieValue === null) {
    return null;
  }

  const delimiterIndex = cookieValue.lastIndexOf(".");
  if (delimiterIndex <= 0 || delimiterIndex === cookieValue.length - 1) {
    return null;
  }

  const payload = cookieValue.slice(0, delimiterIndex);
  const signature = cookieValue.slice(delimiterIndex + 1);
  const expectedSignature = createHmac("sha256", secret).update(payload, "utf8").digest("base64url");
  if (signature !== expectedSignature) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      expires_at?: string;
      trial_plan?: string;
    };
    if (
      (parsed.trial_plan !== "solo" && parsed.trial_plan !== "team") ||
      typeof parsed.expires_at !== "string" ||
      Number.isNaN(Date.parse(parsed.expires_at)) ||
      Date.parse(parsed.expires_at) <= Date.now()
    ) {
      return null;
    }

    return parsed.trial_plan;
  } catch {
    return null;
  }
}

async function startRequestedSignupTrial(
  request: FastifyRequest,
  dependencies: ApiDependencies,
  input: {
    organization_id: string;
    user_id: string;
    target_plan: "solo" | "team";
    source: "email_code" | "github_oauth";
  }
): Promise<void> {
  if (dependencies.billingManagement?.startTrial === undefined) {
    return;
  }

  const startedAt = new Date().toISOString();

  try {
    const result = await dependencies.billingManagement.startTrial({
      organization_id: input.organization_id,
      target_plan: input.target_plan,
      now: startedAt
    });

    if (typeof result === "string") {
      await recordAuditLog(dependencies.auditLogging, {
        organization_id: input.organization_id,
        actor_user_id: input.user_id,
        actor_type: "anonymous",
        action: "billing.trial.start",
        target_type: "organization",
        target_id: input.organization_id,
        status: "failure",
        ip_address: request.ip,
        metadata: {
          target_plan: input.target_plan,
          source: input.source,
          reason: result
        }
      });
      return;
    }

    await recordAuditLog(dependencies.auditLogging, {
      organization_id: input.organization_id,
      actor_user_id: input.user_id,
      actor_type: "anonymous",
      action: "billing.trial.start",
      target_type: "organization",
      target_id: input.organization_id,
      status: "success",
      ip_address: request.ip,
      metadata: {
        target_plan: input.target_plan,
        source: input.source,
        ends_at: result.trial.ends_at
      }
    });
  } catch {
    await recordAuditLog(dependencies.auditLogging, {
      organization_id: input.organization_id,
      actor_user_id: input.user_id,
      actor_type: "anonymous",
      action: "billing.trial.start",
      target_type: "organization",
      target_id: input.organization_id,
      status: "failure",
      ip_address: request.ip,
      metadata: {
        target_plan: input.target_plan,
        source: input.source,
        reason: "billing_service_error"
      }
    });
  }
}

export function registerBrowserAuthRoutes(
  app: FastifyInstance,
  dependencies: ApiDependencies,
  helpers: BrowserAuthRouteHelpers
): void {
  app.post("/v1/auth/request-code", { bodyLimit: SMALL_REQUEST_BODY_LIMIT_BYTES }, async (request, reply) => {
    if (!(await helpers.enforceAuthRateLimit(request, reply, dependencies))) {
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
    if (!(await helpers.enforceAuthRateLimit(request, reply, dependencies))) {
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

      if (parsedBody.data.requested_trial_plan !== undefined) {
        await startRequestedSignupTrial(request, dependencies, {
          organization_id: login.session.organization_id,
          user_id: login.session.user_id,
          target_plan: parsedBody.data.requested_trial_plan,
          source: "email_code"
        });
      }
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

    const plan = await helpers.resolveOrganizationPlanForRequest(
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

    reply.header(
      "Set-Cookie",
      buildSessionCookie(login.session_token, login.session.expires_at, {
        secure: helpers.shouldUseSecureCookies()
      })
    );
    if (plan.clear_review_cookie) {
      helpers.appendSetCookieHeader(
        reply,
        helpers.buildClearedReviewGrantCookie({
          secure: helpers.shouldUseSecureCookies()
        })
      );
    }

    return reply.status(200).send(
      helpers.buildSessionResponse(login.session_token, {
        ...login.session,
        organization_plan: plan.organization_plan
      })
    );
  });

  app.get("/v1/auth/github/start", async (request, reply) => {
    if (dependencies.webAuth === undefined) {
      return reply.status(503).send({
        error: "auth_not_configured"
      });
    }

    const parsedQuery = GithubSignupStartQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.status(400).send({
        error: "invalid_query"
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

    const setCookies = [
      buildGithubOauthStateCookie(started.state, started.expires_at, {
        secure: helpers.shouldUseSecureCookies()
      })
    ];
    const trialCookie =
      parsedQuery.data.trial === undefined
        ? null
        : buildGithubSignupTrialCookie(parsedQuery.data.trial, started.expires_at, {
            secure: helpers.shouldUseSecureCookies()
          });
    if (trialCookie !== null) {
      setCookies.push(trialCookie);
    }

    reply.header("Set-Cookie", setCookies);
    return reply.redirect(started.authorization_url);
  });

  app.get("/v1/auth/github/mock-authorize", async (request, reply) => {
    if (!helpers.isDevGithubMockEnabled()) {
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

      reply.header("Set-Cookie", [
        buildClearedGithubOauthStateCookie({ secure: helpers.shouldUseSecureCookies() }),
        buildClearedGithubSignupTrialCookie({ secure: helpers.shouldUseSecureCookies() })
      ]);
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
          ...(completed.accepted_terms_at === null
            ? {}
            : { accepted_terms_at: completed.accepted_terms_at })
        }
      });

      const requestedTrialPlan = readGithubSignupTrialPlan(request.headers.cookie);
      if (requestedTrialPlan !== null) {
        await startRequestedSignupTrial(request, dependencies, {
          organization_id: completed.session.organization_id,
          user_id: completed.session.user_id,
          target_plan: requestedTrialPlan,
          source: "github_oauth"
        });
      }
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
      buildSessionCookie(completed.session_token, completed.session.expires_at, {
        secure: helpers.shouldUseSecureCookies()
      }),
      buildClearedGithubOauthStateCookie({ secure: helpers.shouldUseSecureCookies() }),
      buildClearedGithubSignupTrialCookie({ secure: helpers.shouldUseSecureCookies() })
    ]);

    if (
      typeof completed.avatar_url === "string" &&
      dependencies.accountManagement !== undefined &&
      dependencies.objectStoreWriter !== undefined
    ) {
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
}
