import type { FastifyInstance } from "fastify";
import type { WebSessionRecord } from "../../../../packages/auth/src/index.js";

import {
  SESSION_COOKIE_NAME,
  buildClearedSessionCookie,
  readCookieValue,
} from "../../../../packages/auth/src/index.js";
import { buildGravatarAvatarUrl, importUserAvatarFromUrl } from "../../../../packages/storage/src/index.js";

import type { ApiDependencies } from "../api-types.js";
import { enforceRequestRateLimit } from "../api-helpers.js";
import { buildAccountAvatarUrl } from "../avatar-urls.js";
import { hashAuditIdentifier, recordAuditLog } from "../audit-logging.js";
import { SMALL_REQUEST_BODY_LIMIT_BYTES } from "../http-limits.js";
import {
  AccountDeleteBodySchema,
  AccountDeleteRequestOtpBodySchema
} from "../schemas.js";

const ACCOUNT_DELETE_CONFIRMATION_TEXT = "Delete my account";

function shouldUseSecureCookies(): boolean {
  return process.env["AUTH_COOKIE_SECURE"] !== "false";
}

function normalizeDeleteConfirmationText(value: string): string {
  return value.trim();
}

export function registerAccountRoutes(app: FastifyInstance, dependencies: ApiDependencies): void {
  async function resolveBrowserSessionOrReply(cookieHeader: string | undefined): Promise<
    | {
        sessionToken: string;
        session: WebSessionRecord;
      }
    | {
        error: "account_management_not_configured" | "invalid_session";
      }
  > {
    if (dependencies.webAuth === undefined) {
      return { error: "account_management_not_configured" as const };
    }

    const sessionToken = readCookieValue(cookieHeader, SESSION_COOKIE_NAME);
    if (sessionToken === null) {
      return { error: "invalid_session" as const };
    }

    const session = await dependencies.webAuth.resolveSessionByToken(sessionToken, {
      now: new Date(),
    });
    if (session === null) {
      return { error: "invalid_session" as const };
    }

    return { sessionToken, session };
  }

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

  app.get("/v1/account/avatar", async (request, reply) => {
    if (dependencies.accountManagement === undefined) {
      return reply.status(503).send({ error: "account_management_not_configured" });
    }

    const resolved = await resolveBrowserSessionOrReply(request.headers.cookie);
    if ("error" in resolved) {
      return reply.status(resolved.error === "account_management_not_configured" ? 503 : 401).send({ error: resolved.error });
    }

    const avatar = await dependencies.accountManagement.getUserAvatar({
      user_id: resolved.session.user_id,
    });
    if (avatar === null) {
      return reply.status(404).send({ error: "avatar_not_found" });
    }

    const body = await dependencies.objectStoreReader.getObject({
      key: avatar.object_key,
    }).catch(() => null);
    if (body === null) {
      return reply.status(404).send({ error: "avatar_not_found" });
    }

    reply.header("Cache-Control", "private, max-age=300");
    reply.header("Content-Type", avatar.content_type);
    return reply.status(200).send(body);
  });

  app.post("/v1/account/avatar/import-gravatar", async (request, reply) => {
    if (dependencies.accountManagement === undefined || dependencies.objectStoreWriter === undefined) {
      return reply.status(503).send({ error: "account_management_not_configured" });
    }

    const resolved = await resolveBrowserSessionOrReply(request.headers.cookie);
    if ("error" in resolved) {
      return reply.status(resolved.error === "account_management_not_configured" ? 503 : 401).send({ error: resolved.error });
    }

    const imported = await importUserAvatarFromUrl({
      user_id: resolved.session.user_id,
      source: "gravatar",
      url: buildGravatarAvatarUrl(resolved.session.email),
      store: dependencies.accountManagement,
      objectStoreWriter: dependencies.objectStoreWriter,
    });

    if (!imported.ok) {
      if (imported.error === "not_found") {
        return reply.status(404).send({ error: "gravatar_not_found" });
      }

      return reply.status(502).send({ error: "avatar_import_failed" });
    }

    return reply.status(200).send({
      avatar: {
        source: imported.avatar.source,
        avatar_url: buildAccountAvatarUrl(),
        updated_at: imported.avatar.updated_at,
      }
    });
  });

  app.post("/v1/account/delete/request-otp", { bodyLimit: SMALL_REQUEST_BODY_LIMIT_BYTES }, async (request, reply) => {
    if (
      dependencies.webAuth === undefined ||
      dependencies.accountManagement === undefined ||
      dependencies.accountDeletionAuth === undefined
    ) {
      return reply.status(503).send({ error: "account_management_not_configured" });
    }

    const resolved = await resolveBrowserSessionOrReply(request.headers.cookie);
    if ("error" in resolved) {
      return reply.status(resolved.error === "account_management_not_configured" ? 503 : 401).send({ error: resolved.error });
    }

    if (
      !(await enforceRequestRateLimit(request, reply, dependencies, {
        bucket: "management-write",
        subject: `account-delete:${resolved.session.user_id}`
      }))
    ) {
      return;
    }

    if (resolved.session.role !== "owner") {
      return reply.status(403).send({ error: "forbidden" });
    }

    const parsedBody = AccountDeleteRequestOtpBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: "invalid_payload" });
    }

    if (normalizeDeleteConfirmationText(parsedBody.data.confirmation_text) !== ACCOUNT_DELETE_CONFIRMATION_TEXT) {
      await recordAuditLog(dependencies.auditLogging, {
        organization_id: resolved.session.organization_id,
        actor_user_id: resolved.session.user_id,
        actor_type: "browser_session",
        action: "account.delete.otp.request",
        target_type: "account",
        target_id: resolved.session.organization_id,
        status: "failure",
        ip_address: request.ip,
        metadata: {
          reason: "invalid_confirmation"
        }
      });

      return reply.status(400).send({ error: "invalid_confirmation" });
    }

    const requested = await dependencies.accountDeletionAuth.requestDeletionOtp({
      organization_id: resolved.session.organization_id,
      user_id: resolved.session.user_id,
      email: resolved.session.email,
      now: new Date()
    });

    if (!requested.code_sent) {
      await recordAuditLog(dependencies.auditLogging, {
        organization_id: resolved.session.organization_id,
        actor_user_id: resolved.session.user_id,
        actor_type: "browser_session",
        action: "account.delete.otp.request",
        target_type: "account",
        target_id: resolved.session.organization_id,
        status: "failure",
        ip_address: request.ip,
        metadata: {
          reason: "delivery_unavailable",
          email_hash: hashAuditIdentifier(resolved.session.email)
        }
      });

      return reply.status(503).send({ error: "account_deletion_verification_unavailable" });
    }

    await recordAuditLog(dependencies.auditLogging, {
      organization_id: resolved.session.organization_id,
      actor_user_id: resolved.session.user_id,
      actor_type: "browser_session",
      action: "account.delete.otp.request",
      target_type: "account",
      target_id: resolved.session.organization_id,
      status: "success",
      ip_address: request.ip,
      metadata: {
        email_hash: hashAuditIdentifier(resolved.session.email)
      }
    });

    return reply.status(200).send({ success: true });
  });

  app.delete("/v1/account", { bodyLimit: SMALL_REQUEST_BODY_LIMIT_BYTES }, async (request, reply) => {
    if (
      dependencies.webAuth === undefined ||
      dependencies.accountManagement === undefined ||
      dependencies.accountDeletionAuth === undefined
    ) {
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

    if (
      !(await enforceRequestRateLimit(request, reply, dependencies, {
        bucket: "management-write",
        subject: `account-delete:${session.user_id}`
      }))
    ) {
      return;
    }

    if (session.role !== "owner") {
      return reply.status(403).send({ error: "forbidden" });
    }

    const parsedBody = AccountDeleteBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: "invalid_payload" });
    }

    if (normalizeDeleteConfirmationText(parsedBody.data.confirmation_text) !== ACCOUNT_DELETE_CONFIRMATION_TEXT) {
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
          reason: "invalid_confirmation"
        }
      });

      return reply.status(400).send({ error: "invalid_confirmation" });
    }

    const verification = await dependencies.accountDeletionAuth.verifyDeletionOtp({
      organization_id: session.organization_id,
      user_id: session.user_id,
      email: session.email,
      code: parsedBody.data.otp,
      now: new Date()
    });

    if (!verification.ok) {
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
          reason: "invalid_otp",
          email_hash: hashAuditIdentifier(session.email)
        }
      });

      return reply.status(400).send({ error: "invalid_otp" });
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
          reason: "other_owned_organizations_exist"
        }
      });

      return reply.status(409).send({ error: "other_owned_organizations_exist" });
    }

    if (deleted === "other_owned_projects_exist") {
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
          reason: "other_owned_projects_exist"
        }
      });

      return reply.status(409).send({ error: "other_owned_projects_exist" });
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
        email_hash: hashAuditIdentifier(session.email)
      }
    });

    reply.header("Set-Cookie", buildClearedSessionCookie({ secure: shouldUseSecureCookies() }));
    return reply.status(200).send({ account: deleted });
  });
}
