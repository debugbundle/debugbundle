import type { FastifyInstance } from "fastify";

import { getTierCapabilities } from "../../../../packages/shared-types/src/index.js";
import type { ApiDependencies } from "../api-types.js";
import { recordAuditLog, resolveAuditActorType } from "../audit-logging.js";
import { requireRateLimitedProjectAccess } from "../api-helpers.js";
import {
  AlertParamsSchema,
  AlertsQuerySchema,
  CreateAlertBodySchema,
  ProjectScopedQuerySchema,
  UpdateAlertBodySchema
} from "../schemas.js";

async function ensureScopedSlackDestination(
  dependencies: ApiDependencies,
  input: {
    organization_id: string;
    channel?: "email" | "slack" | "discord" | "webhook";
    config?: Record<string, unknown>;
  }
): Promise<"ok" | "upgrade_required" | "slack_destination_not_found"> {
  if (input.channel !== "slack") {
    return "ok";
  }

  const slackDestinationId = input.config?.["slack_destination_id"];
  if (typeof slackDestinationId !== "string") {
    return "ok";
  }

  if (dependencies.slackManagement === undefined || dependencies.billingManagement === undefined) {
    return "slack_destination_not_found";
  }

  const summary = await dependencies.billingManagement.getBillingSummaryForOrganization({
    organization_id: input.organization_id,
    now: new Date().toISOString()
  });
  if (summary === null || !getTierCapabilities(summary.plan).slack_integration) {
    return "upgrade_required";
  }

  const destination = await dependencies.slackManagement.getSlackDestinationForOrganization({
    organization_id: input.organization_id,
    slack_destination_id: slackDestinationId
  });

  return destination === null ? "slack_destination_not_found" : "ok";
}

export function registerAlertRoutes(app: FastifyInstance, dependencies: ApiDependencies): void {
  app.get("/v1/alerts", async (request, reply) => {
    const parsedQuery = AlertsQuerySchema.safeParse(request.query);
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
    if (dependencies.alertManagement === undefined) {
      return reply.status(404).send({ error: "project_not_found" });
    }

    const alerts = await dependencies.alertManagement.listAlertsForOrganization({
      organization_id: auth.access.organization_id,
      project_id: parsedQuery.data.project_id,
      limit: parsedQuery.data.limit
    });

    if (alerts === null) {
      return reply.status(404).send({ error: "project_not_found" });
    }

    return reply.status(200).send({ alerts });
  });

  app.post("/v1/alerts", async (request, reply) => {
    const parsedBody = CreateAlertBodySchema.safeParse(request.body);
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
    if (dependencies.alertManagement === undefined) {
      return reply.status(404).send({ error: "project_not_found" });
    }
    const scopedSlackDestination = await ensureScopedSlackDestination(dependencies, {
      organization_id: auth.access.organization_id,
      channel: parsedBody.data.channel,
      config: parsedBody.data.config
    });
    if (scopedSlackDestination === "upgrade_required") {
      return reply.status(403).send({ error: "upgrade_required" });
    }
    if (scopedSlackDestination === "slack_destination_not_found") {
      return reply.status(404).send({ error: "slack_destination_not_found" });
    }

    const alertInput: {
      organization_id: string;
      project_id: string;
      created_by_user_id: string;
      service_id?: string;
      channel: "email" | "slack" | "discord" | "webhook";
      condition_type:
        | "new_incident"
        | "incident_regressed"
        | "error_spike"
        | "severity_threshold"
        | "regression_after_deploy";
      severity_min?: "low" | "medium" | "high" | "critical";
      config: Record<string, unknown>;
      is_enabled: boolean;
    } = {
      organization_id: auth.access.organization_id,
      project_id: parsedBody.data.project_id,
      created_by_user_id: auth.member.member_id,
      channel: parsedBody.data.channel,
      condition_type: parsedBody.data.condition_type,
      config: parsedBody.data.config,
      is_enabled: parsedBody.data.is_enabled
    };

    if (parsedBody.data.service_id !== undefined) {
      alertInput.service_id = parsedBody.data.service_id;
    }
    if (parsedBody.data.severity_min !== undefined) {
      alertInput.severity_min = parsedBody.data.severity_min;
    }

    const alert = await dependencies.alertManagement.createAlertForOrganization(alertInput);
    if (alert === null) {
      await recordAuditLog(dependencies.auditLogging, {
        organization_id: auth.access.organization_id,
        actor_user_id: auth.member.member_id,
        actor_type: resolveAuditActorType(request.headers),
        action: "alert.create",
        target_type: "alert",
        target_id: null,
        status: "failure",
        ip_address: request.ip,
        metadata: {
          project_id: parsedBody.data.project_id,
          channel: parsedBody.data.channel,
          condition_type: parsedBody.data.condition_type,
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
      action: "alert.create",
      target_type: "alert",
      target_id: alert.alert_id,
      status: "success",
      ip_address: request.ip,
      metadata: {
        project_id: alert.project_id,
        channel: alert.channel,
        condition_type: alert.condition_type,
        is_enabled: alert.is_enabled
      }
    });

    return reply.status(201).send({ alert });
  });

  app.patch("/v1/alerts/:id", async (request, reply) => {
    const parsedParams = AlertParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_alert_id" });
    }
    const parsedQuery = ProjectScopedQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.status(400).send({ error: "invalid_query" });
    }

    const parsedBody = UpdateAlertBodySchema.safeParse(request.body);
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
    if (dependencies.alertManagement === undefined) {
      return reply.status(404).send({ error: "alert_not_found" });
    }

    const updateConfig =
      "config" in parsedBody.data && parsedBody.data.config !== undefined
        ? (parsedBody.data.config as Record<string, unknown> | null)
        : undefined;
    const scopedSlackDestination = await ensureScopedSlackDestination(dependencies, {
      organization_id: auth.access.organization_id,
      ...(parsedBody.data.channel === undefined ? {} : { channel: parsedBody.data.channel }),
      ...(updateConfig === undefined || updateConfig === null ? {} : { config: updateConfig })
    });
    if (scopedSlackDestination === "upgrade_required") {
      return reply.status(403).send({ error: "upgrade_required" });
    }
    if (scopedSlackDestination === "slack_destination_not_found") {
      return reply.status(404).send({ error: "slack_destination_not_found" });
    }

    const updateInput: {
      organization_id: string;
      alert_id: string;
      project_id: string;
      actor_user_id: string;
      actor_role: "owner" | "admin" | "member";
      service_id?: string | null;
      channel?: "email" | "slack" | "discord" | "webhook";
      condition_type?:
        | "new_incident"
        | "incident_regressed"
        | "error_spike"
        | "severity_threshold"
        | "regression_after_deploy";
      severity_min?: "low" | "medium" | "high" | "critical" | null;
      config?: Record<string, unknown> | null;
      is_enabled?: boolean;
    } = {
      organization_id: auth.access.organization_id,
      alert_id: parsedParams.data.id,
      project_id: parsedQuery.data.project_id,
      actor_user_id: auth.member.member_id,
      actor_role: auth.access.effective_role
    };

    if (Object.prototype.hasOwnProperty.call(parsedBody.data, "service_id")) {
      const serviceId = parsedBody.data.service_id;
      if (serviceId !== undefined) {
        updateInput.service_id = serviceId;
      }
    }
    if (parsedBody.data.channel !== undefined) {
      updateInput.channel = parsedBody.data.channel;
    }
    if (parsedBody.data.condition_type !== undefined) {
      updateInput.condition_type = parsedBody.data.condition_type;
    }
    if (Object.prototype.hasOwnProperty.call(parsedBody.data, "severity_min")) {
      const severityMin = parsedBody.data.severity_min;
      if (severityMin !== undefined) {
        updateInput.severity_min = severityMin;
      }
    }
    if ("config" in parsedBody.data) {
      const { config } = parsedBody.data;
      if (config !== undefined) {
        updateInput.config = config;
      }
    }
    if (parsedBody.data.is_enabled !== undefined) {
      updateInput.is_enabled = parsedBody.data.is_enabled;
    }

    const alert = await dependencies.alertManagement.updateAlertForOrganization(updateInput);
    if (alert === null) {
      await recordAuditLog(dependencies.auditLogging, {
        organization_id: auth.access.organization_id,
        actor_user_id: auth.member.member_id,
        actor_type: resolveAuditActorType(request.headers),
        action: "alert.update",
        target_type: "alert",
        target_id: parsedParams.data.id,
        status: "failure",
        ip_address: request.ip,
        metadata: {
          update_keys: Object.keys(parsedBody.data),
          reason: "alert_not_found"
        }
      });

      return reply.status(404).send({ error: "alert_not_found" });
    }

    await recordAuditLog(dependencies.auditLogging, {
      organization_id: auth.access.organization_id,
      actor_user_id: auth.member.member_id,
      actor_type: resolveAuditActorType(request.headers),
      action: "alert.update",
      target_type: "alert",
      target_id: alert.alert_id,
      status: "success",
      ip_address: request.ip,
      metadata: {
        update_keys: Object.keys(parsedBody.data),
        channel: alert.channel,
        condition_type: alert.condition_type,
        is_enabled: alert.is_enabled
      }
    });

    return reply.status(200).send({ alert });
  });

  app.delete("/v1/alerts/:id", async (request, reply) => {
    const parsedParams = AlertParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_alert_id" });
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
    if (dependencies.alertManagement === undefined) {
      return reply.status(404).send({ error: "alert_not_found" });
    }

    const deleted = await dependencies.alertManagement.deleteAlertForOrganization({
      organization_id: auth.access.organization_id,
      project_id: parsedQuery.data.project_id,
      alert_id: parsedParams.data.id,
      actor_user_id: auth.member.member_id,
      actor_role: auth.access.effective_role
    });
    if (deleted === null) {
      await recordAuditLog(dependencies.auditLogging, {
        organization_id: auth.access.organization_id,
        actor_user_id: auth.member.member_id,
        actor_type: resolveAuditActorType(request.headers),
        action: "alert.delete",
        target_type: "alert",
        target_id: parsedParams.data.id,
        status: "failure",
        ip_address: request.ip,
        metadata: {
          reason: "alert_not_found"
        }
      });

      return reply.status(404).send({ error: "alert_not_found" });
    }

    await recordAuditLog(dependencies.auditLogging, {
      organization_id: auth.access.organization_id,
      actor_user_id: auth.member.member_id,
      actor_type: resolveAuditActorType(request.headers),
      action: "alert.delete",
      target_type: "alert",
      target_id: parsedParams.data.id,
      status: "success",
      ip_address: request.ip,
      metadata: {}
    });

    return reply.status(204).send();
  });
}
