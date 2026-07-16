import type { FastifyInstance } from "fastify";

import {
  AnalyticsSettingsResponseSchema,
  AnalyticsSettingsSchema,
  AnalyticsSettingsUpdateSchema,
  getTierCapabilities,
  type AnalyticsSettings,
  type AnalyticsSettingsResponse,
  type AnalyticsSettingsUpdate,
  type TierCapabilities
} from "../../../../packages/shared-types/src/index.js";
import type { ApiDependencies } from "../api-types.js";
import { requireRateLimitedProjectAccess } from "../api-helpers.js";
import { recordAuditLog, resolveAuditActorType } from "../audit-logging.js";
import { ProjectParamsSchema } from "../schemas.js";

function buildDefaultSettings(capabilities: TierCapabilities): AnalyticsSettings {
  return {
    enabled: false,
    privacy_mode: "strict",
    consent_required: false,
    capture_page_views: true,
    capture_route_changes: true,
    capture_actions: false,
    capture_friction_signals: true,
    journey_sample_rate: 0,
    raw_retention_days: 1,
    sample_retention_days: 7,
    hourly_retention_days: capabilities.analytics_hourly_retention_days,
    aggregate_retention_months: 12,
    max_saved_funnels: capabilities.max_analytics_saved_funnels,
    max_custom_dimensions: capabilities.max_analytics_custom_dimensions,
    approved_custom_dimensions: []
  };
}

function buildResponse(input: {
  accessMode: AnalyticsSettingsResponse["access_mode"];
  analyticsAvailable: boolean;
  settings: AnalyticsSettings;
}): AnalyticsSettingsResponse {
  return AnalyticsSettingsResponseSchema.parse({
    access_mode: input.accessMode,
    analytics_available: input.analyticsAvailable,
    settings: input.settings
  });
}

function hasCustomDimensionUpdate(update: AnalyticsSettingsUpdate): boolean {
  return (
    (update.max_custom_dimensions !== undefined && update.max_custom_dimensions > 0) ||
    (update.approved_custom_dimensions !== undefined &&
      update.approved_custom_dimensions.length > 0)
  );
}

function hasIncoherentCustomDimensionLimit(update: AnalyticsSettingsUpdate): boolean {
  return (
    update.max_custom_dimensions !== undefined &&
    update.approved_custom_dimensions !== undefined &&
    update.approved_custom_dimensions.length > update.max_custom_dimensions
  );
}

function requiresCurrentCustomDimensionSettings(update: AnalyticsSettingsUpdate): boolean {
  return (
    (update.max_custom_dimensions !== undefined) !==
    (update.approved_custom_dimensions !== undefined)
  );
}

function exceedsTierAnalyticsSettingsLimits(input: {
  capabilities: TierCapabilities;
  update: AnalyticsSettingsUpdate;
}): boolean {
  const { capabilities, update } = input;
  return (
    (update.max_saved_funnels !== undefined &&
      update.max_saved_funnels > capabilities.max_analytics_saved_funnels) ||
    (update.max_custom_dimensions !== undefined &&
      update.max_custom_dimensions > capabilities.max_analytics_custom_dimensions) ||
    (update.hourly_retention_days !== undefined &&
      update.hourly_retention_days > capabilities.analytics_hourly_retention_days) ||
    (update.approved_custom_dimensions !== undefined &&
      update.approved_custom_dimensions.length > capabilities.max_analytics_custom_dimensions)
  );
}

export function registerAnalyticsSettingsRoutes(
  app: FastifyInstance,
  dependencies: ApiDependencies
): void {
  app.get("/v1/projects/:id/analytics-settings", async (request, reply) => {
    const parsedParams = ProjectParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_project_id" });
    }

    const auth = await requireRateLimitedProjectAccess(request, reply, dependencies, {
      bucket: "management-read",
      projectId: parsedParams.data.id
    });
    if (auth === null) {
      return;
    }

    const accessMode: AnalyticsSettingsResponse["access_mode"] =
      auth.access.effective_role === "owner" || auth.access.effective_role === "admin"
        ? "manage"
        : "preview";
    const capabilities = getTierCapabilities(auth.access.organization_plan);
    const analyticsAvailable = capabilities.analytics_bundle;

    if (dependencies.analyticsSettingsManagement === undefined) {
      return reply.status(200).send(
        buildResponse({
          accessMode,
          analyticsAvailable,
          settings: buildDefaultSettings(capabilities)
        })
      );
    }

    const settings = await dependencies.analyticsSettingsManagement.getAnalyticsSettingsForProject({
      organization_id: auth.access.organization_id,
      project_id: parsedParams.data.id
    });
    if (settings === null) {
      return reply.status(404).send({ error: "project_not_found" });
    }

    return reply.status(200).send(
      buildResponse({
        accessMode,
        analyticsAvailable,
        settings
      })
    );
  });

  app.patch("/v1/projects/:id/analytics-settings", async (request, reply) => {
    const parsedParams = ProjectParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_project_id" });
    }

    const auth = await requireRateLimitedProjectAccess(request, reply, dependencies, {
      bucket: "management-write",
      projectId: parsedParams.data.id
    });
    if (auth === null) {
      return;
    }
    if (auth.access.effective_role !== "owner" && auth.access.effective_role !== "admin") {
      return reply.status(403).send({ error: "forbidden" });
    }

    const parsedBody = AnalyticsSettingsUpdateSchema.safeParse(request.body);
    if (!parsedBody.success || hasIncoherentCustomDimensionLimit(parsedBody.data)) {
      return reply.status(400).send({ error: "invalid_payload" });
    }

    const capabilities = getTierCapabilities(auth.access.organization_plan);
    const analyticsAvailable = capabilities.analytics_bundle;
    if (!analyticsAvailable) {
      return reply.status(403).send({ error: "upgrade_required" });
    }

    if (
      hasCustomDimensionUpdate(parsedBody.data) &&
      capabilities.max_analytics_custom_dimensions === 0
    ) {
      return reply.status(403).send({ error: "upgrade_required" });
    }

    if (exceedsTierAnalyticsSettingsLimits({ capabilities, update: parsedBody.data })) {
      return reply.status(403).send({ error: "upgrade_required" });
    }

    if (dependencies.analyticsSettingsManagement === undefined) {
      return reply.status(404).send({ error: "analytics_settings_not_available" });
    }

    if (requiresCurrentCustomDimensionSettings(parsedBody.data)) {
      const currentSettings =
        await dependencies.analyticsSettingsManagement.getAnalyticsSettingsForProject({
          organization_id: auth.access.organization_id,
          project_id: parsedParams.data.id
        });
      if (currentSettings === null) {
        return reply.status(404).send({ error: "project_not_found" });
      }
      const mergedSettings = AnalyticsSettingsSchema.safeParse({
        ...currentSettings,
        ...parsedBody.data
      });
      if (!mergedSettings.success) {
        return reply.status(400).send({ error: "invalid_payload" });
      }
      if (
        exceedsTierAnalyticsSettingsLimits({
          capabilities,
          update: mergedSettings.data
        })
      ) {
        return reply.status(403).send({ error: "upgrade_required" });
      }
    }

    const settings =
      await dependencies.analyticsSettingsManagement.updateAnalyticsSettingsForProject({
        organization_id: auth.access.organization_id,
        project_id: parsedParams.data.id,
        update: parsedBody.data
      });
    if (settings === null) {
      await recordAuditLog(dependencies.auditLogging, {
        organization_id: auth.access.organization_id,
        actor_user_id: auth.member.member_id,
        actor_type: resolveAuditActorType(request.headers),
        action: "analytics_settings.update",
        target_type: "project",
        target_id: parsedParams.data.id,
        status: "failure",
        ip_address: request.ip,
        metadata: {
          update_keys: Object.keys(parsedBody.data),
          reason: "project_not_found"
        }
      });

      return reply.status(404).send({ error: "project_not_found" });
    }

    await recordAuditLog(dependencies.auditLogging, {
      organization_id: auth.access.organization_id,
      actor_user_id: auth.member.member_id,
      actor_type: resolveAuditActorType(request.headers),
      action: "analytics_settings.update",
      target_type: "project",
      target_id: parsedParams.data.id,
      status: "success",
      ip_address: request.ip,
      metadata: {
        update_keys: Object.keys(parsedBody.data),
        enabled: settings.enabled,
        privacy_mode: settings.privacy_mode,
        journey_sample_rate: settings.journey_sample_rate,
        custom_dimension_count: settings.approved_custom_dimensions.length
      }
    });

    return reply.status(200).send(
      buildResponse({
        accessMode: "manage",
        analyticsAvailable,
        settings
      })
    );
  });
}
