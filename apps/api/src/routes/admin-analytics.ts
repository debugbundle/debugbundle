import type { FastifyInstance, FastifyReply } from "fastify";

import { SESSION_COOKIE_NAME, readCookieValue } from "../../../../packages/auth/src/index.js";
import type { ApiDependencies } from "../api-types.js";
import { hashAuditIdentifier, recordAuditLog } from "../audit-logging.js";

const NOT_FOUND_RESPONSE = { error: "not_found" } as const;
const ACCESS_STATUS_READY_RESPONSE = { status: "ready" } as const;
const ACCESS_STATUS_EMAIL_AUTH_REQUIRED_RESPONSE = { status: "email_auth_required" } as const;

function applyNoStore(reply: FastifyReply): void {
  reply.header("Cache-Control", "no-store");
}

function sendNotFound(reply: FastifyReply): FastifyReply {
  applyNoStore(reply);
  return reply.status(404).send(NOT_FOUND_RESPONSE);
}

export function registerAdminAnalyticsRoutes(app: FastifyInstance, dependencies: ApiDependencies): void {
  app.get("/v1/admin/analytics/access-status", async (request, reply) => {
    if (request.headers.authorization !== undefined || dependencies.webAuth === undefined) {
      return sendNotFound(reply);
    }

    const sessionToken = readCookieValue(request.headers.cookie, SESSION_COOKIE_NAME);
    if (sessionToken === null) {
      return sendNotFound(reply);
    }

    const session = await dependencies.webAuth.resolveSessionByToken(sessionToken);
    if (session === null || dependencies.adminAnalytics === undefined) {
      return sendNotFound(reply);
    }

    if (!dependencies.adminAnalytics.isOperatorAllowed({ email: session.email })) {
      return sendNotFound(reply);
    }

    applyNoStore(reply);

    if (session.email_verified_at === null || session.session_auth_method !== "email_code") {
      return reply.status(200).send(ACCESS_STATUS_EMAIL_AUTH_REQUIRED_RESPONSE);
    }

    return reply.status(200).send(ACCESS_STATUS_READY_RESPONSE);
  });

  app.get("/v1/admin/analytics/summary", async (request, reply) => {
    if (request.headers.authorization !== undefined || dependencies.webAuth === undefined) {
      return sendNotFound(reply);
    }

    const sessionToken = readCookieValue(request.headers.cookie, SESSION_COOKIE_NAME);
    if (sessionToken === null) {
      return sendNotFound(reply);
    }

    const session = await dependencies.webAuth.resolveSessionByToken(sessionToken);
    if (session === null) {
      return sendNotFound(reply);
    }

    const emailHash = hashAuditIdentifier(session.email);

    if (dependencies.adminAnalytics === undefined) {
      await recordAuditLog(dependencies.auditLogging, {
        organization_id: session.organization_id,
        actor_user_id: session.user_id,
        actor_type: "browser_session",
        action: "analytics.admin_summary",
        target_type: "admin_analytics",
        target_id: "summary",
        status: "failure",
        ip_address: request.ip,
        metadata: {
          reason: "analytics_unavailable",
          email_hash: emailHash
        }
      });

      return sendNotFound(reply);
    }

    if (session.email_verified_at === null || session.session_auth_method !== "email_code") {
      await recordAuditLog(dependencies.auditLogging, {
        organization_id: session.organization_id,
        actor_user_id: session.user_id,
        actor_type: "browser_session",
        action: "analytics.admin_summary",
        target_type: "admin_analytics",
        target_id: "summary",
        status: "failure",
        ip_address: request.ip,
        metadata: {
          reason: "email_auth_required",
          email_hash: emailHash
        }
      });

      return sendNotFound(reply);
    }

    if (!dependencies.adminAnalytics.isOperatorAllowed({ email: session.email })) {
      await recordAuditLog(dependencies.auditLogging, {
        organization_id: session.organization_id,
        actor_user_id: session.user_id,
        actor_type: "browser_session",
        action: "analytics.admin_summary",
        target_type: "admin_analytics",
        target_id: "summary",
        status: "failure",
        ip_address: request.ip,
        metadata: {
          reason: "not_allowlisted",
          email_hash: emailHash
        }
      });

      return sendNotFound(reply);
    }

    const summary = await dependencies.adminAnalytics.getSummary({
      now: new Date().toISOString()
    });

    await recordAuditLog(dependencies.auditLogging, {
      organization_id: session.organization_id,
      actor_user_id: session.user_id,
      actor_type: "browser_session",
      action: "analytics.admin_summary",
      target_type: "admin_analytics",
      target_id: "summary",
      status: "success",
      ip_address: request.ip,
      metadata: {
        reason: "success",
        email_hash: emailHash
      }
    });

    applyNoStore(reply);
    return reply.status(200).send({ summary });
  });

  app.get("/v1/admin/analytics/malformed-rejections", async (request, reply) => {
    if (request.headers.authorization !== undefined || dependencies.webAuth === undefined) {
      return sendNotFound(reply);
    }

    const sessionToken = readCookieValue(request.headers.cookie, SESSION_COOKIE_NAME);
    if (sessionToken === null) {
      return sendNotFound(reply);
    }

    const session = await dependencies.webAuth.resolveSessionByToken(sessionToken);
    if (session === null) {
      return sendNotFound(reply);
    }

    const emailHash = hashAuditIdentifier(session.email);

    if (dependencies.adminAnalytics === undefined) {
      await recordAuditLog(dependencies.auditLogging, {
        organization_id: session.organization_id,
        actor_user_id: session.user_id,
        actor_type: "browser_session",
        action: "analytics.admin_malformed_rejections",
        target_type: "admin_analytics",
        target_id: "malformed_rejections",
        status: "failure",
        ip_address: request.ip,
        metadata: {
          reason: "analytics_unavailable",
          email_hash: emailHash
        }
      });

      return sendNotFound(reply);
    }

    if (session.email_verified_at === null || session.session_auth_method !== "email_code") {
      await recordAuditLog(dependencies.auditLogging, {
        organization_id: session.organization_id,
        actor_user_id: session.user_id,
        actor_type: "browser_session",
        action: "analytics.admin_malformed_rejections",
        target_type: "admin_analytics",
        target_id: "malformed_rejections",
        status: "failure",
        ip_address: request.ip,
        metadata: {
          reason: "email_auth_required",
          email_hash: emailHash
        }
      });

      return sendNotFound(reply);
    }

    if (!dependencies.adminAnalytics.isOperatorAllowed({ email: session.email })) {
      await recordAuditLog(dependencies.auditLogging, {
        organization_id: session.organization_id,
        actor_user_id: session.user_id,
        actor_type: "browser_session",
        action: "analytics.admin_malformed_rejections",
        target_type: "admin_analytics",
        target_id: "malformed_rejections",
        status: "failure",
        ip_address: request.ip,
        metadata: {
          reason: "not_allowlisted",
          email_hash: emailHash
        }
      });

      return sendNotFound(reply);
    }

    const breakdown = await dependencies.adminAnalytics.getMalformedRejectionBreakdown({
      now: new Date().toISOString(),
      limit: 10
    });

    await recordAuditLog(dependencies.auditLogging, {
      organization_id: session.organization_id,
      actor_user_id: session.user_id,
      actor_type: "browser_session",
      action: "analytics.admin_malformed_rejections",
      target_type: "admin_analytics",
      target_id: "malformed_rejections",
      status: "success",
      ip_address: request.ip,
      metadata: {
        reason: "success",
        email_hash: emailHash
      }
    });

    applyNoStore(reply);
    return reply.status(200).send({ breakdown });
  });
}
