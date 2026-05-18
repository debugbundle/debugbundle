import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";

import {
  queueAllowanceLimitReachedNotification,
  queueAllowanceThresholdNotifications
} from "../../../../packages/storage/src/index.js";
import type { WebhookEventType, WebhookFilters } from "../../../../packages/storage/src/index.js";
import type { ApiDependencies } from "../api-types.js";
import { recordAuditLog, resolveAuditActorType } from "../audit-logging.js";
import { requireRateLimitedProjectAccess } from "../api-helpers.js";
import {
  CreateWebhookBodySchema,
  ProjectScopedQuerySchema,
  UpdateWebhookBodySchema,
  WebhookDeliveriesParamsSchema,
  WebhookDeliveriesQuerySchema,
  WebhookDeliveryRetryParamsSchema,
  WebhookParamsSchema,
  WebhookTestBodySchema,
  WebhooksQuerySchema,
} from "../schemas.js";

function generateWebhookSigningSecret(): string {
  return `dbundle_whsec_${randomBytes(24).toString("hex")}`;
}

function toRetryAfterSeconds(retryAfterMs: number): string {
  return String(Math.max(1, Math.ceil(retryAfterMs / 1_000)));
}

function getQuotaRetryAfterMs(resetAt: string, now: Date): number {
  return Math.max(1_000, new Date(resetAt).getTime() - now.getTime());
}

function normalizeWebhookFilters(filters: {
  environment?: string[] | undefined;
  service?: string[] | undefined;
  severity_min?: "low" | "medium" | "high" | "critical" | undefined;
  bundle_type?: Array<"failure" | "improvement"> | undefined;
  verification?: boolean | undefined;
}): WebhookFilters {
  const normalized: WebhookFilters = {};

  if (filters.environment !== undefined) {
    normalized.environment = filters.environment;
  }
  if (filters.service !== undefined) {
    normalized.service = filters.service;
  }
  if (filters.severity_min !== undefined) {
    normalized.severity_min = filters.severity_min;
  }
  if (filters.bundle_type !== undefined) {
    normalized.bundle_type = filters.bundle_type;
  }
  if (filters.verification !== undefined) {
    normalized.verification = filters.verification;
  }

  return normalized;
}

export function registerWebhookRoutes(app: FastifyInstance, dependencies: ApiDependencies): void {
  app.get("/v1/webhooks", async (request, reply) => {
    const parsedQuery = WebhooksQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.status(400).send({ error: "invalid_query" });
    }

    const auth = await requireRateLimitedProjectAccess(request, reply, dependencies, {
      bucket: "management-read",
      projectId: parsedQuery.data.project_id
    });
    if (auth === null) {
      return;
    }
    if (dependencies.webhookManagement === undefined) {
      return reply.status(404).send({ error: "project_not_found" });
    }

    const webhooks = await dependencies.webhookManagement.listWebhooksForOrganization({
      organization_id: auth.access.organization_id,
      project_id: parsedQuery.data.project_id,
      limit: parsedQuery.data.limit
    });

    if (webhooks === null) {
      return reply.status(404).send({ error: "project_not_found" });
    }

    return reply.status(200).send({ webhooks });
  });

  app.post("/v1/webhooks", async (request, reply) => {
    const parsedBody = CreateWebhookBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: "invalid_payload" });
    }
    const auth = await requireRateLimitedProjectAccess(request, reply, dependencies, {
      bucket: "management-write",
      projectId: parsedBody.data.project_id
    });
    if (auth === null) {
      return;
    }
    if (dependencies.webhookManagement === undefined) {
      return reply.status(404).send({ error: "project_not_found" });
    }

    const signingSecret = generateWebhookSigningSecret();
    const webhook = await dependencies.webhookManagement.createWebhookForOrganization({
      organization_id: auth.access.organization_id,
      project_id: parsedBody.data.project_id,
      created_by_user_id: auth.member.member_id,
      url: parsedBody.data.url,
      signing_secret: signingSecret,
      events: parsedBody.data.events,
      filters: normalizeWebhookFilters(parsedBody.data.filters),
      is_enabled: parsedBody.data.is_enabled
    });

    if (webhook === null) {
      await recordAuditLog(dependencies.auditLogging, {
        organization_id: auth.access.organization_id,
        actor_user_id: auth.member.member_id,
        actor_type: resolveAuditActorType(request.headers),
        action: "webhook.create",
        target_type: "webhook",
        target_id: null,
        status: "failure",
        ip_address: request.ip,
        metadata: {
          project_id: parsedBody.data.project_id,
          event_count: parsedBody.data.events.length,
          has_filters: Object.keys(parsedBody.data.filters).length > 0,
          is_enabled: parsedBody.data.is_enabled,
          reason: "project_not_found"
        }
      });

      return reply.status(404).send({ error: "project_not_found" });
    }

    await recordAuditLog(dependencies.auditLogging, {
      organization_id: auth.access.organization_id,
      actor_user_id: auth.member.member_id,
      actor_type: resolveAuditActorType(request.headers),
      action: "webhook.create",
      target_type: "webhook",
      target_id: webhook.webhook_id,
      status: "success",
      ip_address: request.ip,
      metadata: {
        project_id: webhook.project_id,
        event_count: webhook.events.length,
        has_filters: Object.keys(webhook.filters).length > 0,
        is_enabled: webhook.is_enabled
      }
    });

    return reply.status(201).send({
      webhook: {
        ...webhook,
        signing_secret: signingSecret
      }
    });
  });

  app.get("/v1/webhooks/:id", async (request, reply) => {
    const parsedParams = WebhookParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_webhook_id" });
    }
    const parsedQuery = ProjectScopedQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.status(400).send({ error: "invalid_query" });
    }
    const auth = await requireRateLimitedProjectAccess(request, reply, dependencies, {
      bucket: "management-read",
      projectId: parsedQuery.data.project_id
    });
    if (auth === null) {
      return;
    }
    if (dependencies.webhookManagement === undefined) {
      return reply.status(404).send({ error: "webhook_not_found" });
    }

    const webhook = await dependencies.webhookManagement.getWebhookForOrganization({
      organization_id: auth.access.organization_id,
      project_id: parsedQuery.data.project_id,
      webhook_id: parsedParams.data.id
    });

    if (webhook === null) {
      return reply.status(404).send({ error: "webhook_not_found" });
    }

    return reply.status(200).send({ webhook });
  });

  app.patch("/v1/webhooks/:id", async (request, reply) => {
    const parsedParams = WebhookParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_webhook_id" });
    }
    const parsedQuery = ProjectScopedQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.status(400).send({ error: "invalid_query" });
    }

    const parsedBody = UpdateWebhookBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: "invalid_payload" });
    }
    const auth = await requireRateLimitedProjectAccess(request, reply, dependencies, {
      bucket: "management-write",
      projectId: parsedQuery.data.project_id
    });
    if (auth === null) {
      return;
    }
    if (dependencies.webhookManagement === undefined) {
      return reply.status(404).send({ error: "webhook_not_found" });
    }

    const updateInput: {
      organization_id: string;
      webhook_id: string;
      project_id: string;
      actor_user_id: string;
      actor_role: "owner" | "admin" | "member";
      url?: string;
      events?: WebhookEventType[];
      filters?: WebhookFilters;
      is_enabled?: boolean;
    } = {
      organization_id: auth.access.organization_id,
      webhook_id: parsedParams.data.id,
      project_id: parsedQuery.data.project_id,
      actor_user_id: auth.member.member_id,
      actor_role: auth.access.effective_role
    };

    if (parsedBody.data.url !== undefined) {
      updateInput.url = parsedBody.data.url;
    }
    if (parsedBody.data.events !== undefined) {
      updateInput.events = parsedBody.data.events;
    }
    if (parsedBody.data.filters !== undefined) {
      updateInput.filters = normalizeWebhookFilters(parsedBody.data.filters);
    }
    if (parsedBody.data.is_enabled !== undefined) {
      updateInput.is_enabled = parsedBody.data.is_enabled;
    }

    const webhook = await dependencies.webhookManagement.updateWebhookForOrganization(updateInput);

    if (webhook === null) {
      await recordAuditLog(dependencies.auditLogging, {
        organization_id: auth.access.organization_id,
        actor_user_id: auth.member.member_id,
        actor_type: resolveAuditActorType(request.headers),
        action: "webhook.update",
        target_type: "webhook",
        target_id: parsedParams.data.id,
        status: "failure",
        ip_address: request.ip,
        metadata: {
          update_keys: Object.keys(parsedBody.data),
          reason: "webhook_not_found"
        }
      });

      return reply.status(404).send({ error: "webhook_not_found" });
    }

    await recordAuditLog(dependencies.auditLogging, {
      organization_id: auth.access.organization_id,
      actor_user_id: auth.member.member_id,
      actor_type: resolveAuditActorType(request.headers),
      action: "webhook.update",
      target_type: "webhook",
      target_id: webhook.webhook_id,
      status: "success",
      ip_address: request.ip,
      metadata: {
        update_keys: Object.keys(parsedBody.data),
        event_count: webhook.events.length,
        has_filters: Object.keys(webhook.filters).length > 0,
        is_enabled: webhook.is_enabled
      }
    });

    return reply.status(200).send({ webhook });
  });

  app.delete("/v1/webhooks/:id", async (request, reply) => {
    const parsedParams = WebhookParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_webhook_id" });
    }
    const parsedQuery = ProjectScopedQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.status(400).send({ error: "invalid_query" });
    }
    const auth = await requireRateLimitedProjectAccess(request, reply, dependencies, {
      bucket: "management-write",
      projectId: parsedQuery.data.project_id
    });
    if (auth === null) {
      return;
    }
    if (dependencies.webhookManagement === undefined) {
      return reply.status(404).send({ error: "webhook_not_found" });
    }

    const deleted = await dependencies.webhookManagement.deleteWebhookForOrganization({
      organization_id: auth.access.organization_id,
      project_id: parsedQuery.data.project_id,
      webhook_id: parsedParams.data.id,
      actor_user_id: auth.member.member_id,
      actor_role: auth.access.effective_role
    });

    if (deleted === null) {
      await recordAuditLog(dependencies.auditLogging, {
        organization_id: auth.access.organization_id,
        actor_user_id: auth.member.member_id,
        actor_type: resolveAuditActorType(request.headers),
        action: "webhook.delete",
        target_type: "webhook",
        target_id: parsedParams.data.id,
        status: "failure",
        ip_address: request.ip,
        metadata: {
          reason: "webhook_not_found"
        }
      });

      return reply.status(404).send({ error: "webhook_not_found" });
    }

    await recordAuditLog(dependencies.auditLogging, {
      organization_id: auth.access.organization_id,
      actor_user_id: auth.member.member_id,
      actor_type: resolveAuditActorType(request.headers),
      action: "webhook.delete",
      target_type: "webhook",
      target_id: parsedParams.data.id,
      status: "success",
      ip_address: request.ip,
      metadata: {}
    });

    return reply.status(204).send();
  });

  app.post("/v1/webhooks/:id/test", async (request, reply) => {
    const parsedParams = WebhookParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_webhook_id" });
    }
    const parsedQuery = ProjectScopedQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.status(400).send({ error: "invalid_query" });
    }
    const auth = await requireRateLimitedProjectAccess(request, reply, dependencies, {
      bucket: "management-write",
      projectId: parsedQuery.data.project_id
    });
    if (auth === null) {
      return;
    }
    if (dependencies.webhookTesting === undefined) {
      return reply.status(404).send({ error: "webhook_not_found" });
    }
    const parsedBody = WebhookTestBodySchema.safeParse(request.body ?? {});
    if (!parsedBody.success) {
      return reply.status(400).send({ error: "invalid_payload" });
    }

    const now = new Date();
    let previousWebhookAllowanceUsed: number | null = null;
    let webhookAllowanceLimit: number | null = null;
    let usageWindowStartsAt: string | null = null;
    let usageWindowEndsAt: string | null = null;
    if (dependencies.billingManagement !== undefined) {
      const billingSummary = await dependencies.billingManagement.getBillingSummaryForOrganization({
        organization_id: auth.access.organization_id,
        now: now.toISOString()
      });
      const allowance = billingSummary?.allowances.monthly_webhook_deliveries;
      if (billingSummary !== null && allowance !== undefined && allowance.used + 1 > allowance.limit) {
        if (dependencies.operationalEmailDelivery !== undefined) {
          await queueAllowanceLimitReachedNotification({
            store: dependencies.operationalEmailDelivery,
            project_id: parsedQuery.data.project_id,
            meter: "monthly_webhook_deliveries",
            used: allowance.used,
            limit: allowance.limit,
            usage_window_starts_at: billingSummary.usage_window.starts_at,
            usage_window_ends_at: billingSummary.usage_window.ends_at
          });
        }
        const retryAfterMs = getQuotaRetryAfterMs(billingSummary.usage_window.ends_at, now);
        return reply.header("Retry-After", toRetryAfterSeconds(retryAfterMs)).status(429).send({
          error: "monthly_quota_exceeded",
          retry_after_ms: retryAfterMs
        });
      }

      if (billingSummary !== null && allowance !== undefined) {
        previousWebhookAllowanceUsed = allowance.used;
        webhookAllowanceLimit = allowance.limit;
        usageWindowStartsAt = billingSummary.usage_window.starts_at;
        usageWindowEndsAt = billingSummary.usage_window.ends_at;
      }
    }

    const delivery = await dependencies.webhookTesting.triggerTestDelivery({
      organization_id: auth.access.organization_id,
      project_id: parsedQuery.data.project_id,
      webhook_id: parsedParams.data.id,
      event_type: parsedBody.data.event_type,
      actor_user_id: auth.member.member_id,
      actor_role: auth.access.effective_role
    });

    if (delivery === null) {
      return reply.status(404).send({ error: "webhook_not_found" });
    }

    if (
      previousWebhookAllowanceUsed !== null &&
      webhookAllowanceLimit !== null &&
      dependencies.operationalEmailDelivery !== undefined
    ) {
      await queueAllowanceThresholdNotifications({
        store: dependencies.operationalEmailDelivery,
        project_id: parsedQuery.data.project_id,
        meter: "monthly_webhook_deliveries",
        previous_used: previousWebhookAllowanceUsed,
        next_used: previousWebhookAllowanceUsed + 1,
        limit: webhookAllowanceLimit,
        usage_window_starts_at: usageWindowStartsAt,
        usage_window_ends_at: usageWindowEndsAt
      });
    }

    return reply.status(202).send({ delivery });
  });

  app.get("/v1/webhooks/:id/deliveries", async (request, reply) => {
    const parsedParams = WebhookDeliveriesParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_webhook_id" });
    }
    const parsedQuery = WebhookDeliveriesQuerySchema.merge(ProjectScopedQuerySchema).safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.status(400).send({ error: "invalid_query" });
    }
    const auth = await requireRateLimitedProjectAccess(request, reply, dependencies, {
      bucket: "management-read",
      projectId: parsedQuery.data.project_id
    });
    if (auth === null) {
      return;
    }

    const scopedDeliveries = await dependencies.webhookDelivery.listDeliveriesForWebhookInOrganization({
      webhookId: parsedParams.data.id,
      organizationId: auth.access.organization_id,
      limit: parsedQuery.data.limit
    });

    if (scopedDeliveries === null) {
      return reply.status(404).send({ error: "webhook_not_found" });
    }

    return reply.status(200).send({ deliveries: scopedDeliveries.deliveries });
  });

  app.post("/v1/webhooks/:id/deliveries/:deliveryId/retry", async (request, reply) => {
    const parsedParams = WebhookDeliveryRetryParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_params" });
    }
    const parsedQuery = ProjectScopedQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.status(400).send({ error: "invalid_query" });
    }
    const auth = await requireRateLimitedProjectAccess(request, reply, dependencies, {
      bucket: "management-write",
      projectId: parsedQuery.data.project_id
    });
    if (auth === null) {
      return;
    }
    if (dependencies.webhookDelivery.retryDeliveryForOrganization === undefined) {
      return reply.status(404).send({ error: "delivery_not_found" });
    }

    const result = await dependencies.webhookDelivery.retryDeliveryForOrganization({
      organization_id: auth.access.organization_id,
      project_id: parsedQuery.data.project_id,
      webhook_id: parsedParams.data.id,
      delivery_id: parsedParams.data.deliveryId,
      actor_user_id: auth.member.member_id,
      actor_role: auth.access.effective_role
    });

    if (result === null) {
      return reply.status(404).send({ error: "delivery_not_found" });
    }

    return reply.status(200).send({
      delivery_id: result.delivery_id,
      event_type: result.event_type
    });
  });
}
