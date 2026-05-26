import type { FastifyInstance } from "fastify";

import {
  getTierCapabilities,
  ImprovementSettingsResponseSchema,
  ImprovementSettingsUpdateSchema,
  type ImprovementSettings,
  type ImprovementSettingsResponse
} from "../../../../packages/shared-types/src/index.js";
import type { ApiDependencies } from "../api-types.js";
import { recordAuditLog, resolveAuditActorType } from "../audit-logging.js";
import { requireRateLimitedProjectAccess } from "../api-helpers.js";
import { ProjectParamsSchema } from "../schemas.js";

function buildDefaultSettings(): ImprovementSettings {
  return {
    automated_improvement_bundles_enabled: true,
    improvement_bundle_sensitivity: "high_confidence"
  };
}

function buildResponse(input: {
  accessMode: ImprovementSettingsResponse["access_mode"];
  cloudAutomationAvailable: boolean;
  settings: ImprovementSettings;
}): ImprovementSettingsResponse {
  return ImprovementSettingsResponseSchema.parse({
    access_mode: input.accessMode,
    cloud_automation_available: input.cloudAutomationAvailable,
    settings: input.settings
  });
}

export function registerImprovementSettingsRoutes(app: FastifyInstance, dependencies: ApiDependencies): void {
  app.get("/v1/projects/:id/improvement-settings", async (request, reply) => {
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

    const accessMode: ImprovementSettingsResponse["access_mode"] =
      auth.access.effective_role === "owner" || auth.access.effective_role === "admin" ? "manage" : "preview";
    const cloudAutomationAvailable = getTierCapabilities(auth.access.organization_plan).cloud_improvement_bundles;

    if (dependencies.improvementSettingsManagement === undefined) {
      return reply.status(200).send(
        buildResponse({
          accessMode,
          cloudAutomationAvailable,
          settings: buildDefaultSettings()
        })
      );
    }

    const settings = await dependencies.improvementSettingsManagement.getImprovementSettingsForProject({
      organization_id: auth.access.organization_id,
      project_id: parsedParams.data.id
    });
    if (settings === null) {
      return reply.status(404).send({ error: "project_not_found" });
    }

    return reply.status(200).send(
      buildResponse({
        accessMode,
        cloudAutomationAvailable,
        settings
      })
    );
  });

  app.patch("/v1/projects/:id/improvement-settings", async (request, reply) => {
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

    const parsedBody = ImprovementSettingsUpdateSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: "invalid_payload" });
    }

    const cloudAutomationAvailable = getTierCapabilities(auth.access.organization_plan).cloud_improvement_bundles;
    if (!cloudAutomationAvailable) {
      return reply.status(403).send({ error: "upgrade_required" });
    }

    if (dependencies.improvementSettingsManagement === undefined) {
      return reply.status(404).send({ error: "improvement_settings_not_available" });
    }

    const settings = await dependencies.improvementSettingsManagement.updateImprovementSettingsForProject({
      organization_id: auth.access.organization_id,
      project_id: parsedParams.data.id,
      update: parsedBody.data
    });
    if (settings === null) {
      await recordAuditLog(dependencies.auditLogging, {
        organization_id: auth.access.organization_id,
        actor_user_id: auth.member.member_id,
        actor_type: resolveAuditActorType(request.headers),
        action: "improvement_settings.update",
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
      action: "improvement_settings.update",
      target_type: "project",
      target_id: parsedParams.data.id,
      status: "success",
      ip_address: request.ip,
      metadata: {
        update_keys: Object.keys(parsedBody.data),
        automated_improvement_bundles_enabled: settings.automated_improvement_bundles_enabled,
        improvement_bundle_sensitivity: settings.improvement_bundle_sensitivity
      }
    });

    return reply.status(200).send(
      buildResponse({
        accessMode: "manage",
        cloudAutomationAvailable,
        settings
      })
    );
  });
}
