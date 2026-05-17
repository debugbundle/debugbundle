import type { FastifyInstance } from "fastify";

import {
  getCapturePolicyOverrides,
  CapturePolicyUpdateSchema,
  PRESET_DEFAULTS,
  type CapturePolicyOverrides,
  type CapturePolicyResponse,
  getDefaultPreset,
  resolvePolicy,
  type ResolvedCapturePolicy
} from "../../../../packages/shared-types/src/index.js";
import type { ApiDependencies } from "../api-types.js";
import { recordAuditLog, resolveAuditActorType } from "../audit-logging.js";
import { requireRateLimitedProjectAccess } from "../api-helpers.js";
import { ProjectParamsSchema } from "../schemas.js";

function buildDefaultRecord(plan: string | undefined): ResolvedCapturePolicy {
  const preset = getDefaultPreset(plan);
  return {
    preset,
    ...PRESET_DEFAULTS[preset]
  };
}

function buildDefaultOverrides(): CapturePolicyOverrides {
  return {
    capture_logs: null,
    capture_request_events: null,
    capture_breadcrumbs: null,
    capture_probe_events: null,
    immediate_client_error_statuses: null
  };
}

function buildCapturePolicyResponse(input: {
  accessMode: CapturePolicyResponse["access_mode"];
  resolvedPolicy: ResolvedCapturePolicy;
  recordOverrides?: CapturePolicyOverrides;
}): CapturePolicyResponse {
  return {
    access_mode: input.accessMode,
    policy: input.resolvedPolicy,
    overrides: input.recordOverrides ?? buildDefaultOverrides()
  };
}

export function registerCapturePolicyRoutes(app: FastifyInstance, dependencies: ApiDependencies): void {
  app.get("/v1/projects/:id/capture-policy", async (request, reply) => {
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

    const accessMode: CapturePolicyResponse["access_mode"] =
      auth.access.effective_role === "owner" || auth.access.effective_role === "admin" ? "manage" : "preview";

    if (dependencies.capturePolicyManagement === undefined) {
      return reply.status(200).send(
        buildCapturePolicyResponse({
          accessMode,
          resolvedPolicy: buildDefaultRecord(auth.access.organization_plan)
        })
      );
    }

    const record = await dependencies.capturePolicyManagement.getCapturePolicyForProject({
      organization_id: auth.access.organization_id,
      project_id: parsedParams.data.id
    });

    let policy: ResolvedCapturePolicy;
    if (record !== null) {
      policy = resolvePolicy(record);
    } else {
      policy = buildDefaultRecord(auth.access.organization_plan);
    }

    return reply.status(200).send(
      buildCapturePolicyResponse({
        accessMode,
        resolvedPolicy: policy,
        ...(record === null ? {} : { recordOverrides: getCapturePolicyOverrides(record) })
      })
    );
  });

  app.patch("/v1/projects/:id/capture-policy", async (request, reply) => {
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

    const parsedBody = CapturePolicyUpdateSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: "invalid_payload" });
    }

    if (dependencies.capturePolicyManagement === undefined) {
      return reply.status(404).send({ error: "capture_policy_not_available" });
    }

    const record = await dependencies.capturePolicyManagement.upsertCapturePolicyForProject({
      organization_id: auth.access.organization_id,
      project_id: parsedParams.data.id,
      update: parsedBody.data
    });

    if (record === null) {
      await recordAuditLog(dependencies.auditLogging, {
        organization_id: auth.access.organization_id,
        actor_user_id: auth.member.member_id,
        actor_type: resolveAuditActorType(request.headers),
        action: "capture_policy.update",
        target_type: "capture_policy",
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

    const policy = resolvePolicy(record);

    await recordAuditLog(dependencies.auditLogging, {
      organization_id: auth.access.organization_id,
      actor_user_id: auth.member.member_id,
      actor_type: resolveAuditActorType(request.headers),
      action: "capture_policy.update",
      target_type: "capture_policy",
      target_id: parsedParams.data.id,
      status: "success",
      ip_address: request.ip,
      metadata: {
        update_keys: Object.keys(parsedBody.data),
        preset: policy.preset
      }
    });

    return reply.status(200).send(
      buildCapturePolicyResponse({
        accessMode: "manage",
        resolvedPolicy: policy,
        recordOverrides: getCapturePolicyOverrides(record)
      })
    );
  });
}
