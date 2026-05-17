import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";

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

    return reply.status(202).send({ delivery });
  });

  app.get("/v1/webhooks/:id/deliveries", async (request, reply) => {
    const parsedParams = WebhookDeliveriesParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_webhook_id" });
    }
    const parsedQuery = WebhookDeliveriesQuerySchema.and(ProjectScopedQuerySchema).safeParse(request.query);
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
