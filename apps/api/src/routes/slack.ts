import { type FastifyInstance } from "fastify";

import { readCookieValue } from "../../../../packages/auth/src/index.js";
import { getTierCapabilities } from "../../../../packages/shared-types/src/index.js";
import { decryptIntegrationSecret, encryptIntegrationSecret } from "../../../../packages/storage/src/index.js";
import type { ApiDependencies } from "../api-types.js";
import { recordAuditLog, resolveAuditActorType } from "../audit-logging.js";
import { requireMemberAuth, requireRateLimitedMemberAuth, requireRateLimitedOwnerMemberAuth } from "../api-helpers.js";
import {
  ProjectParamsSchema,
  ProjectSlackDestinationDeleteParamsSchema,
  SlackAppCallbackQuerySchema,
  SlackAppInstallUrlQuerySchema
} from "../schemas.js";
import {
  buildClearedSlackAppInstallStateCookie,
  buildSlackAppInstallStateCookie,
  buildSlackInstallState,
  buildSlackInstallUrl,
  exchangeSlackOAuthCode,
  isMatchingInstallStateCookie,
  normalizeSlackInstallReturnPath,
  readSlackInstallState,
  resolveAppRedirectBaseUrl,
  resolveSlackOAuthConfig,
  shouldUseSecureCookies,
  SLACK_APP_INSTALL_STATE_COOKIE_NAME
} from "../slack-app.js";

function buildRedirectUrl(returnTo: string, status: "success" | "cancelled" | "error", slackDestinationId?: string): string {
  const redirectUrl = new URL(`${resolveAppRedirectBaseUrl()}${returnTo}`);
  redirectUrl.searchParams.set("slack_connect", status);
  if (typeof slackDestinationId === "string" && slackDestinationId.length > 0) {
    redirectUrl.searchParams.set("slack_destination_id", slackDestinationId);
  }
  return redirectUrl.toString();
}

async function ensureSlackIntegrationEnabled(
  dependencies: ApiDependencies,
  organizationId: string
): Promise<boolean> {
  if (dependencies.billingManagement === undefined) {
    return false;
  }

  const summary = await dependencies.billingManagement.getBillingSummaryForOrganization({
    organization_id: organizationId,
    now: new Date().toISOString()
  });

  return summary !== null && getTierCapabilities(summary.plan).slack_integration;
}

function resolveIntegrationEncryptionKey(): string | null {
  const key = process.env["INTEGRATION_SECRET_ENCRYPTION_KEY"]?.trim();
  return key === undefined || key.length === 0 ? null : key;
}

async function deliverSlackTestMessage(webhookUrl: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        text: "[DebugBundle] Slack test message",
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "*DebugBundle Slack test message*"
            }
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: "This confirms DebugBundle can post to the connected Slack channel."
              }
            ]
          }
        ]
      })
    });

    if (response.ok) {
      return { ok: true };
    }

    const errorBody = await response.text().catch(() => "");
    const normalizedBody = errorBody.trim().toLowerCase();
    if (response.status === 404 || response.status === 410 || normalizedBody.includes("channel_not_found")) {
      return { ok: false, error: "slack_destination_unavailable" };
    }
    if (response.status === 403) {
      return { ok: false, error: "slack_destination_forbidden" };
    }
    if (response.status === 429) {
      return { ok: false, error: "slack_rate_limited" };
    }

    return { ok: false, error: "slack_delivery_failed" };
  } catch {
    return { ok: false, error: "slack_delivery_failed" };
  }
}

export function registerSlackRoutes(app: FastifyInstance, dependencies: ApiDependencies): void {
  app.get("/v1/slack/app/install-url", async (request, reply) => {
    const member = await requireRateLimitedOwnerMemberAuth(request, reply, dependencies, "management-write");
    if (member === null) {
      return;
    }
    if (member === "forbidden") {
      return reply.status(403).send({ error: "forbidden" });
    }
    if (dependencies.slackManagement === undefined) {
      return reply.status(503).send({ error: "slack_not_configured" });
    }
    if (!(await ensureSlackIntegrationEnabled(dependencies, member.organization_id))) {
      return reply.status(403).send({ error: "upgrade_required" });
    }

    const parsedQuery = SlackAppInstallUrlQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.status(400).send({ error: "invalid_query" });
    }

    const oauthConfig = resolveSlackOAuthConfig();
    if (oauthConfig === null) {
      return reply.status(503).send({ error: "slack_not_configured" });
    }

    const scopedProject = await dependencies.slackManagement.listSlackDestinationsForProjectInOrganization({
      organization_id: member.organization_id,
      project_id: parsedQuery.data.project_id,
      limit: 1
    });
    if (scopedProject === null) {
      return reply.status(404).send({ error: "project_not_found" });
    }

    const returnTo =
      normalizeSlackInstallReturnPath(parsedQuery.data.return_to) ??
      `/projects/${parsedQuery.data.project_id}/alerts`;
    const installState = buildSlackInstallState({
      organizationId: member.organization_id,
      projectId: parsedQuery.data.project_id,
      returnTo,
      secret: oauthConfig.stateSecret
    });
    const installUrl = buildSlackInstallUrl({
      clientId: oauthConfig.clientId,
      callbackUrl: oauthConfig.callbackUrl,
      state: installState.token
    });

    reply.header(
      "Set-Cookie",
      buildSlackAppInstallStateCookie(installState.token, installState.expires_at, {
        secure: shouldUseSecureCookies()
      })
    );
    return reply.status(200).send({ install_url: installUrl });
  });

  app.get("/v1/slack/app/callback", async (request, reply) => {
    const parsedQuery = SlackAppCallbackQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      reply.header("Set-Cookie", buildClearedSlackAppInstallStateCookie({ secure: shouldUseSecureCookies() }));
      return reply.redirect(buildRedirectUrl("/projects", "error"));
    }

    const oauthConfig = resolveSlackOAuthConfig();
    if (oauthConfig === null || dependencies.slackManagement === undefined) {
      reply.header("Set-Cookie", buildClearedSlackAppInstallStateCookie({ secure: shouldUseSecureCookies() }));
      return reply.redirect(buildRedirectUrl("/projects", "error"));
    }

    const cookieState = readCookieValue(request.headers.cookie, SLACK_APP_INSTALL_STATE_COOKIE_NAME);
    const queryState = parsedQuery.data.state;
    const statePayload =
      typeof queryState === "string" && isMatchingInstallStateCookie(queryState, cookieState)
        ? readSlackInstallState(queryState, oauthConfig.stateSecret)
        : null;
    const returnTo = statePayload?.return_to ?? "/projects";

    reply.header("Set-Cookie", buildClearedSlackAppInstallStateCookie({ secure: shouldUseSecureCookies() }));

    if (parsedQuery.data.error !== undefined) {
      return reply.redirect(buildRedirectUrl(returnTo, "cancelled"));
    }
    if (statePayload === null || parsedQuery.data.code === undefined) {
      return reply.redirect(buildRedirectUrl(returnTo, "error"));
    }

    const scopedProject = await dependencies.slackManagement.listSlackDestinationsForProjectInOrganization({
      organization_id: statePayload.organization_id,
      project_id: statePayload.project_id,
      limit: 1
    });
    if (scopedProject === null) {
      return reply.redirect(buildRedirectUrl(returnTo, "error"));
    }

    const installedByMember = await requireMemberAuth(request.headers, dependencies);
    const installedByMemberId =
      installedByMember?.organization_id === statePayload.organization_id ? installedByMember.member_id : null;
    const encryptionKey = resolveIntegrationEncryptionKey();
    if (encryptionKey === null) {
      return reply.redirect(buildRedirectUrl(returnTo, "error"));
    }

    try {
      const oauthResult = await exchangeSlackOAuthCode({
        code: parsedQuery.data.code,
        clientId: oauthConfig.clientId,
        clientSecret: oauthConfig.clientSecret,
        callbackUrl: oauthConfig.callbackUrl
      });

      const destination = await dependencies.slackManagement.upsertSlackDestinationForOrganization({
        organization_id: statePayload.organization_id,
        slack_team_id: oauthResult.team.id,
        slack_team_name: oauthResult.team.name ?? null,
        slack_channel_id: oauthResult.incoming_webhook.channel_id,
        slack_channel_name: oauthResult.incoming_webhook.channel ?? null,
        webhook_url_ciphertext: encryptIntegrationSecret(oauthResult.incoming_webhook.url, encryptionKey),
        installed_by_member_id: installedByMemberId
      });

      await recordAuditLog(dependencies.auditLogging, {
        organization_id: statePayload.organization_id,
        actor_user_id: installedByMemberId,
        actor_type: resolveAuditActorType(request.headers),
        action: "slack_destination.connect",
        target_type: "slack_destination",
        target_id: destination.slack_destination_id,
        status: "success",
        ip_address: request.ip,
        metadata: {
          project_id: statePayload.project_id,
          slack_team_id: destination.slack_team_id,
          slack_channel_id: destination.slack_channel_id
        }
      });

      return reply.redirect(buildRedirectUrl(returnTo, "success", destination.slack_destination_id));
    } catch (error) {
      await recordAuditLog(dependencies.auditLogging, {
        organization_id: statePayload.organization_id,
        actor_user_id: installedByMemberId,
        actor_type: resolveAuditActorType(request.headers),
        action: "slack_destination.connect",
        target_type: "slack_destination",
        target_id: null,
        status: "failure",
        ip_address: request.ip,
        metadata: {
          project_id: statePayload.project_id,
          reason: error instanceof Error ? error.message : "slack_oauth_failed"
        }
      });

      return reply.redirect(buildRedirectUrl(returnTo, "error"));
    }
  });

  app.get("/v1/projects/:id/slack/destinations", async (request, reply) => {
    const member = await requireRateLimitedMemberAuth(request, reply, dependencies, "management-read");
    if (member === null) {
      return;
    }
    if (dependencies.slackManagement === undefined) {
      return reply.status(503).send({ error: "slack_not_configured" });
    }
    if (!(await ensureSlackIntegrationEnabled(dependencies, member.organization_id))) {
      return reply.status(403).send({ error: "upgrade_required" });
    }

    const parsedParams = ProjectParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_project_id" });
    }

    const destinations = await dependencies.slackManagement.listSlackDestinationsForProjectInOrganization({
      organization_id: member.organization_id,
      project_id: parsedParams.data.id,
      limit: 100
    });
    if (destinations === null) {
      return reply.status(404).send({ error: "project_not_found" });
    }

    return reply.status(200).send({ destinations });
  });

  app.delete("/v1/projects/:id/slack/destinations/:destinationId", async (request, reply) => {
    const member = await requireRateLimitedOwnerMemberAuth(request, reply, dependencies, "management-write");
    if (member === null) {
      return;
    }
    if (member === "forbidden") {
      return reply.status(403).send({ error: "forbidden" });
    }
    if (dependencies.slackManagement === undefined) {
      return reply.status(503).send({ error: "slack_not_configured" });
    }
    if (!(await ensureSlackIntegrationEnabled(dependencies, member.organization_id))) {
      return reply.status(403).send({ error: "upgrade_required" });
    }

    const parsedParams = ProjectSlackDestinationDeleteParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_slack_destination_id" });
    }

    const deleted = await dependencies.slackManagement.deleteSlackDestinationForProjectInOrganization({
      organization_id: member.organization_id,
      project_id: parsedParams.data.id,
      slack_destination_id: parsedParams.data.destinationId
    });

    if (deleted === "destination_in_use") {
      await recordAuditLog(dependencies.auditLogging, {
        organization_id: member.organization_id,
        actor_user_id: member.member_id,
        actor_type: resolveAuditActorType(request.headers),
        action: "slack_destination.delete",
        target_type: "slack_destination",
        target_id: parsedParams.data.destinationId,
        status: "failure",
        ip_address: request.ip,
        metadata: {
          project_id: parsedParams.data.id,
          reason: "destination_in_use"
        }
      });

      return reply.status(409).send({ error: "slack_destination_in_use" });
    }

    if (deleted === null) {
      await recordAuditLog(dependencies.auditLogging, {
        organization_id: member.organization_id,
        actor_user_id: member.member_id,
        actor_type: resolveAuditActorType(request.headers),
        action: "slack_destination.delete",
        target_type: "slack_destination",
        target_id: parsedParams.data.destinationId,
        status: "failure",
        ip_address: request.ip,
        metadata: {
          project_id: parsedParams.data.id,
          reason: "slack_destination_not_found"
        }
      });

      return reply.status(404).send({ error: "slack_destination_not_found" });
    }

    await recordAuditLog(dependencies.auditLogging, {
      organization_id: member.organization_id,
      actor_user_id: member.member_id,
      actor_type: resolveAuditActorType(request.headers),
      action: "slack_destination.delete",
      target_type: "slack_destination",
      target_id: deleted.slack_destination_id,
      status: "success",
      ip_address: request.ip,
      metadata: {
        project_id: parsedParams.data.id
      }
    });

    return reply.status(204).send();
  });

  app.post("/v1/projects/:id/slack/destinations/:destinationId/test", async (request, reply) => {
    const member = await requireRateLimitedOwnerMemberAuth(request, reply, dependencies, "management-write");
    if (member === null) {
      return;
    }
    if (member === "forbidden") {
      return reply.status(403).send({ error: "forbidden" });
    }
    if (dependencies.slackManagement === undefined) {
      return reply.status(503).send({ error: "slack_not_configured" });
    }
    if (!(await ensureSlackIntegrationEnabled(dependencies, member.organization_id))) {
      return reply.status(403).send({ error: "upgrade_required" });
    }

    const parsedParams = ProjectSlackDestinationDeleteParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_slack_destination_id" });
    }

    const scopedProject = await dependencies.slackManagement.listSlackDestinationsForProjectInOrganization({
      organization_id: member.organization_id,
      project_id: parsedParams.data.id,
      limit: 1
    });
    if (scopedProject === null) {
      return reply.status(404).send({ error: "project_not_found" });
    }

    const encryptionKey = resolveIntegrationEncryptionKey();
    if (encryptionKey === null || dependencies.slackManagement.getSlackDestinationSecretForOrganization === undefined) {
      return reply.status(503).send({ error: "slack_not_configured" });
    }

    const destination = await dependencies.slackManagement.getSlackDestinationSecretForOrganization({
      organization_id: member.organization_id,
      slack_destination_id: parsedParams.data.destinationId
    });
    if (destination === null) {
      return reply.status(404).send({ error: "slack_destination_not_found" });
    }

    let webhookUrl: string;
    try {
      webhookUrl = decryptIntegrationSecret(destination.webhook_url_ciphertext, encryptionKey);
    } catch {
      return reply.status(503).send({ error: "slack_not_configured" });
    }

    const deliveryResult = await deliverSlackTestMessage(webhookUrl);
    if (!deliveryResult.ok) {
      await recordAuditLog(dependencies.auditLogging, {
        organization_id: member.organization_id,
        actor_user_id: member.member_id,
        actor_type: resolveAuditActorType(request.headers),
        action: "slack_destination.test",
        target_type: "slack_destination",
        target_id: parsedParams.data.destinationId,
        status: "failure",
        ip_address: request.ip,
        metadata: {
          project_id: parsedParams.data.id,
          reason: deliveryResult.error
        }
      });

      return reply.status(502).send({ error: deliveryResult.error });
    }

    await recordAuditLog(dependencies.auditLogging, {
      organization_id: member.organization_id,
      actor_user_id: member.member_id,
      actor_type: resolveAuditActorType(request.headers),
      action: "slack_destination.test",
      target_type: "slack_destination",
      target_id: parsedParams.data.destinationId,
      status: "success",
      ip_address: request.ip,
      metadata: {
        project_id: parsedParams.data.id
      }
    });

    return reply.status(200).send({ delivered: true });
  });
}
