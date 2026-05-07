import type { FastifyInstance } from "fastify";

import { getTierCapabilities } from "../../../../packages/shared-types/src/index.js";
import type { ApiDependencies } from "../api-types.js";
import { requireRateLimitedMemberAuth } from "../api-helpers.js";
import { ProjectParamsSchema, ProbeActivateBodySchema, ProbeDeactivateBodySchema } from "../schemas.js";

function toRetryAfterSeconds(retryAfterMs: number): string {
  return String(Math.max(1, Math.ceil(retryAfterMs / 1_000)));
}

function getQuotaRetryAfterMs(resetAt: string, now: Date): number {
  return Math.max(1_000, new Date(resetAt).getTime() - now.getTime());
}

export function registerProbeRoutes(app: FastifyInstance, dependencies: ApiDependencies): void {
  app.post("/v1/projects/:id/probes/activate", async (request, reply) => {
    const member = await requireRateLimitedMemberAuth(request, reply, dependencies, "management-write");
    if (member === null) {
      return;
    }
    if (dependencies.probeManagement === undefined) {
      return reply.status(404).send({ error: "project_not_found" });
    }

    const parsedParams = ProjectParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_project_id" });
    }
    const parsedBody = ProbeActivateBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: "invalid_payload" });
    }

    const now = new Date();
    if (dependencies.billingManagement !== undefined) {
      const billingSummary = await dependencies.billingManagement.getBillingSummaryForOrganization({
        organization_id: member.organization_id,
        now: now.toISOString()
      });

      if (billingSummary !== null && !getTierCapabilities(billingSummary.plan).remote_probes) {
        return reply.status(403).send({ error: "upgrade_required" });
      }

      const allowance = billingSummary?.allowances.monthly_remote_activations;
      if (billingSummary !== null && allowance !== undefined && allowance.used + 1 > allowance.limit) {
        const retryAfterMs = getQuotaRetryAfterMs(billingSummary.usage_window.ends_at, now);
        return reply.header("Retry-After", toRetryAfterSeconds(retryAfterMs)).status(429).send({
          error: "monthly_quota_exceeded",
          retry_after_ms: retryAfterMs
        });
      }
    }

    const nowMs = now.getTime();
    const created = await dependencies.probeManagement.createProbeActivationForProjectInOrganization({
      organization_id: member.organization_id,
      project_id: parsedParams.data.id,
      created_by_member_id: member.member_id,
      label_pattern: parsedBody.data.label_pattern,
      service: parsedBody.data.service,
      environment: parsedBody.data.environment,
      expires_at: new Date(nowMs + parsedBody.data.ttl_seconds * 1000).toISOString(),
      trigger_expires_at: new Date(nowMs + parsedBody.data.trigger_ttl_seconds * 1000).toISOString()
    });

    if (created === null) {
      return reply.status(404).send({ error: "project_not_found" });
    }
    if (!getTierCapabilities(created.organization_plan).remote_probes) {
      return reply.status(403).send({ error: "upgrade_required" });
    }
    if (created.concurrent_limit_exceeded) {
      return reply.status(409).send({ error: "concurrent_activation_limit" });
    }

    if (dependencies.cdnPurge !== undefined) {
      await dependencies.cdnPurge(parsedParams.data.id);
    }

    return reply.status(201).send({ activation: created.activation, trigger_token: created.trigger_token });
  });

  app.get("/v1/projects/:id/probes", async (request, reply) => {
    const member = await requireRateLimitedMemberAuth(request, reply, dependencies, "management-read");
    if (member === null) {
      return;
    }
    if (dependencies.probeManagement === undefined) {
      return reply.status(404).send({ error: "project_not_found" });
    }

    const parsedParams = ProjectParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_project_id" });
    }

    const listed = await dependencies.probeManagement.listActiveProbesForProjectInOrganization({
      organization_id: member.organization_id,
      project_id: parsedParams.data.id,
      now: new Date().toISOString()
    });

    if (listed === null) {
      return reply.status(404).send({ error: "project_not_found" });
    }
    if (!getTierCapabilities(listed.organization_plan).remote_probes) {
      return reply.status(403).send({ error: "upgrade_required" });
    }

    return reply.status(200).send({ activations: listed.activations });
  });

  app.post("/v1/projects/:id/probes/deactivate", async (request, reply) => {
    const member = await requireRateLimitedMemberAuth(request, reply, dependencies, "management-write");
    if (member === null) {
      return;
    }
    if (dependencies.probeManagement === undefined) {
      return reply.status(404).send({ error: "project_not_found" });
    }

    const parsedParams = ProjectParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_project_id" });
    }
    const parsedBody = ProbeDeactivateBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: "invalid_payload" });
    }

    const deactivated = await dependencies.probeManagement.deactivateProbeActivationForProjectInOrganization({
      organization_id: member.organization_id,
      project_id: parsedParams.data.id,
      activation_id: parsedBody.data.activation_id,
      deactivated_at: new Date().toISOString()
    });

    if (deactivated === null) {
      return reply.status(404).send({ error: "activation_not_found" });
    }
    if (!getTierCapabilities(deactivated.organization_plan).remote_probes) {
      return reply.status(403).send({ error: "upgrade_required" });
    }

    if (dependencies.cdnPurge !== undefined) {
      await dependencies.cdnPurge(parsedParams.data.id);
    }

    return reply.status(200).send({ deactivated: deactivated.deactivated });
  });
}
