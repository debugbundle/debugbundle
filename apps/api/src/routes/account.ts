import type { FastifyInstance } from "fastify";

import {
  SESSION_COOKIE_NAME,
  buildClearedSessionCookie,
  readCookieValue,
} from "../../../../packages/auth/src/index.js";

import type { ApiDependencies } from "../api-types.js";
import { hashAuditIdentifier, recordAuditLog } from "../audit-logging.js";
import { AccountDeleteBodySchema } from "../schemas.js";

function shouldUseSecureCookies(): boolean {
  return process.env["AUTH_COOKIE_SECURE"] !== "false";
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function registerAccountRoutes(app: FastifyInstance, dependencies: ApiDependencies): void {
  app.get("/v1/account/export", async (request, reply) => {
    if (dependencies.webAuth === undefined || dependencies.accountManagement === undefined) {
      return reply.status(503).send({ error: "account_management_not_configured" });
    }

    const sessionToken = readCookieValue(request.headers.cookie, SESSION_COOKIE_NAME);
    if (sessionToken === null) {
      return reply.status(401).send({ error: "invalid_session" });
    }

    const session = await dependencies.webAuth.resolveSessionByToken(sessionToken, {
      now: new Date(),
    });
    if (session === null) {
      return reply.status(401).send({ error: "invalid_session" });
    }

    if (session.role !== "owner") {
      return reply.status(403).send({ error: "forbidden" });
    }

    const exportedAt = new Date().toISOString();
    const accountExport = await dependencies.accountManagement.exportAccountForOrganization({
      organization_id: session.organization_id,
      user_id: session.user_id,
      exported_at: exportedAt,
    });

    if (accountExport === null) {
      return reply.status(404).send({ error: "account_not_found" });
    }

    const fileSafeDate = exportedAt.slice(0, 10);
    reply.header("Cache-Control", "no-store");
    reply.header(
      "Content-Disposition",
      `attachment; filename="debugbundle-account-export-${fileSafeDate}.json"`,
    );

    return reply.status(200).send(accountExport);
  });

  app.delete("/v1/account", async (request, reply) => {
    if (dependencies.webAuth === undefined || dependencies.accountManagement === undefined) {
      return reply.status(503).send({ error: "account_management_not_configured" });
    }

    const sessionToken = readCookieValue(request.headers.cookie, SESSION_COOKIE_NAME);
    if (sessionToken === null) {
      return reply.status(401).send({ error: "invalid_session" });
    }

    const session = await dependencies.webAuth.resolveSessionByToken(sessionToken, {
      now: new Date(),
    });
    if (session === null) {
      return reply.status(401).send({ error: "invalid_session" });
    }

    if (session.role !== "owner") {
      return reply.status(403).send({ error: "forbidden" });
    }

    const parsedBody = AccountDeleteBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: "invalid_payload" });
    }

    if (normalizeEmail(parsedBody.data.email) !== normalizeEmail(session.email)) {
      await recordAuditLog(dependencies.auditLogging, {
        organization_id: session.organization_id,
        actor_user_id: session.user_id,
        actor_type: "browser_session",
        action: "account.delete",
        target_type: "account",
        target_id: session.organization_id,
        status: "failure",
        ip_address: request.ip,
        metadata: {
          reason: "invalid_confirmation",
          email_hash: hashAuditIdentifier(parsedBody.data.email),
        },
      });

      return reply.status(400).send({ error: "invalid_confirmation" });
    }

    const deletedAt = new Date().toISOString();
    const deleted = await dependencies.accountManagement.deleteAccountForOrganization({
      organization_id: session.organization_id,
      user_id: session.user_id,
      deleted_at: deletedAt,
    });

    if (deleted === null) {
      return reply.status(404).send({ error: "account_not_found" });
    }

    if (deleted === "other_owned_organizations_exist") {
      await recordAuditLog(dependencies.auditLogging, {
        organization_id: session.organization_id,
        actor_user_id: session.user_id,
        actor_type: "browser_session",
        action: "account.delete",
        target_type: "account",
        target_id: session.organization_id,
        status: "failure",
        ip_address: request.ip,
        metadata: {
          reason: "other_owned_organizations_exist",
        },
      });

      return reply.status(409).send({ error: "other_owned_organizations_exist" });
    }

    await recordAuditLog(dependencies.auditLogging, {
      organization_id: null,
      actor_user_id: null,
      actor_type: "browser_session",
      action: "account.delete",
      target_type: "account",
      target_id: null,
      status: "success",
      ip_address: request.ip,
      metadata: {
        deleted_at: deleted.deleted_at,
        organization_id: deleted.organization_id,
        deleted_project_ids: deleted.deleted_project_ids,
        user_deleted: deleted.user_deleted,
        deleted_member_token_count: deleted.deleted_member_token_count,
        email_hash: hashAuditIdentifier(session.email),
      },
    });

    reply.header("Set-Cookie", buildClearedSessionCookie({ secure: shouldUseSecureCookies() }));
    return reply.status(200).send({ account: deleted });
  });
}