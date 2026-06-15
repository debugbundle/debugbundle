import type { FastifyInstance, FastifyRequest } from "fastify";

import { getTierCapabilities } from "../../../../packages/shared-types/src/index.js";
import { AvailabilityCheckValidationError } from "../../../../packages/storage/src/index.js";
import type { ApiDependencies } from "../api-types.js";
import { recordAuditLog, resolveAuditActorType } from "../audit-logging.js";
import { requireRateLimitedProjectAccess } from "../api-helpers.js";
import {
  AvailabilityCheckCreateBodySchema,
  AvailabilityCheckTestBodySchema,
  AvailabilityCheckUpdateBodySchema,
  ProjectAvailabilityCheckParamsSchema,
  ProjectParamsSchema,
  TokenListQuerySchema
} from "../schemas.js";

function isProjectManager(role: "owner" | "admin" | "member"): boolean {
  return role === "owner" || role === "admin";
}

function buildAvailabilityLimits(plan: string | undefined): {
  max_checks_per_project: number;
  min_interval_seconds: number;
} {
  const caps = getTierCapabilities(plan);
  return {
    max_checks_per_project: caps.availability_checks_per_project,
    min_interval_seconds: caps.availability_check_min_interval_seconds
  };
}

export function mapAvailabilityValidationError(error: unknown): { status: number; error: string; message?: string } {
  if (error instanceof AvailabilityCheckValidationError) {
    return {
      status: 400,
      error: "invalid_check_target",
      message: error.message
    };
  }

  return {
    status: 500,
    error: "availability_check_execution_failed"
  };
}

function buildUrlAuditMetadata(url: string): Record<string, string> {
  try {
    const parsed = new URL(url);
    return {
      url_host: parsed.host,
      url_path: parsed.pathname
    };
  } catch {
    return {};
  }
}

async function recordAvailabilityAudit(
  request: FastifyRequest,
  dependencies: ApiDependencies,
  input: {
    organization_id: string;
    actor_user_id: string;
    action: string;
    target_id: string | null;
    status: "success" | "failure";
    metadata: Record<string, unknown>;
  }
): Promise<void> {
  await recordAuditLog(dependencies.auditLogging, {
    organization_id: input.organization_id,
    actor_user_id: input.actor_user_id,
    actor_type: resolveAuditActorType(request.headers),
    action: input.action,
    target_type: "availability_check",
    target_id: input.target_id,
    status: input.status,
    ip_address: request.ip,
    metadata: input.metadata
  });
}

export function registerAvailabilityCheckRoutes(
  app: FastifyInstance,
  dependencies: ApiDependencies
): void {
  app.get("/v1/projects/:id/availability-checks", async (request, reply) => {
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
    if (dependencies.availabilityCheckManagement === undefined) {
      return reply.status(404).send({ error: "availability_checks_unavailable" });
    }

    const parsedQuery = TokenListQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.status(400).send({ error: "invalid_query" });
    }

    const checks = await dependencies.availabilityCheckManagement.listChecksForProjectInOrganization({
      organization_id: auth.access.organization_id,
      project_id: parsedParams.data.id,
      limit: parsedQuery.data.limit
    });

    if (checks === null) {
      return reply.status(404).send({ error: "project_not_found" });
    }

    return reply.status(200).send({
      checks,
      limits: buildAvailabilityLimits(auth.access.organization_plan)
    });
  });

  app.get("/v1/projects/:id/availability-checks/:checkId", async (request, reply) => {
    const parsedParams = ProjectAvailabilityCheckParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_check_id" });
    }

    const auth = await requireRateLimitedProjectAccess(request, reply, dependencies, {
      bucket: "management-read",
      projectId: parsedParams.data.id
    });
    if (auth === null) {
      return;
    }
    if (dependencies.availabilityCheckManagement === undefined) {
      return reply.status(404).send({ error: "availability_checks_unavailable" });
    }

    const check = await dependencies.availabilityCheckManagement.getCheckForProjectInOrganization({
      organization_id: auth.access.organization_id,
      project_id: parsedParams.data.id,
      check_id: parsedParams.data.checkId
    });

    if (check === null) {
      return reply.status(404).send({ error: "check_not_found" });
    }

    return reply.status(200).send({
      check,
      limits: buildAvailabilityLimits(auth.access.organization_plan)
    });
  });

  app.post("/v1/projects/:id/availability-checks", async (request, reply) => {
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
    if (!isProjectManager(auth.access.effective_role)) {
      return reply.status(403).send({ error: "forbidden" });
    }
    if (dependencies.availabilityCheckManagement === undefined) {
      return reply.status(404).send({ error: "availability_checks_unavailable" });
    }

    const parsedBody = AvailabilityCheckCreateBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: "invalid_payload" });
    }

    try {
      const created = await dependencies.availabilityCheckManagement.createCheckForProjectInOrganization({
        organization_id: auth.access.organization_id,
        project_id: parsedParams.data.id,
        created_by_user_id: auth.member.member_id,
        name: parsedBody.data.name,
        url: parsedBody.data.url,
        method: parsedBody.data.method,
        expected_status_min: parsedBody.data.expected_status_min,
        expected_status_max: parsedBody.data.expected_status_max,
        timeout_ms: parsedBody.data.timeout_ms,
        interval_seconds: parsedBody.data.interval_seconds,
        failure_threshold: parsedBody.data.failure_threshold,
        recovery_threshold: parsedBody.data.recovery_threshold,
        enabled: parsedBody.data.enabled,
        ...(parsedBody.data.environment === undefined
          ? {}
          : { environment: parsedBody.data.environment }),
        ...(parsedBody.data.service_name === undefined
          ? {}
          : { service_name: parsedBody.data.service_name }),
        now: new Date().toISOString()
      });

      if (created === "project_not_found") {
        await recordAvailabilityAudit(request, dependencies, {
          organization_id: auth.access.organization_id,
          actor_user_id: auth.member.member_id,
          action: "availability_check.create",
          target_id: null,
          status: "failure",
          metadata: {
            project_id: parsedParams.data.id,
            reason: "project_not_found",
            method: parsedBody.data.method,
            interval_seconds: parsedBody.data.interval_seconds,
            ...buildUrlAuditMetadata(parsedBody.data.url)
          }
        });
        return reply.status(404).send({ error: "project_not_found" });
      }
      if (created === "limit_reached") {
        await recordAvailabilityAudit(request, dependencies, {
          organization_id: auth.access.organization_id,
          actor_user_id: auth.member.member_id,
          action: "availability_check.create",
          target_id: null,
          status: "failure",
          metadata: {
            project_id: parsedParams.data.id,
            reason: "limit_reached",
            method: parsedBody.data.method,
            interval_seconds: parsedBody.data.interval_seconds,
            ...buildUrlAuditMetadata(parsedBody.data.url)
          }
        });
        return reply.status(409).send({
          error: "availability_check_limit_reached",
          limits: buildAvailabilityLimits(auth.access.organization_plan)
        });
      }
      if (created === "interval_too_low") {
        await recordAvailabilityAudit(request, dependencies, {
          organization_id: auth.access.organization_id,
          actor_user_id: auth.member.member_id,
          action: "availability_check.create",
          target_id: null,
          status: "failure",
          metadata: {
            project_id: parsedParams.data.id,
            reason: "interval_too_low",
            method: parsedBody.data.method,
            interval_seconds: parsedBody.data.interval_seconds,
            ...buildUrlAuditMetadata(parsedBody.data.url)
          }
        });
        return reply.status(409).send({
          error: "availability_check_interval_too_low",
          limits: buildAvailabilityLimits(auth.access.organization_plan)
        });
      }

      await recordAvailabilityAudit(request, dependencies, {
        organization_id: auth.access.organization_id,
        actor_user_id: auth.member.member_id,
        action: "availability_check.create",
        target_id: created.check_id,
        status: "success",
        metadata: {
          project_id: parsedParams.data.id,
          method: created.method,
          interval_seconds: created.interval_seconds,
          enabled: created.enabled,
          environment: created.environment,
          service_name: created.service_name,
          ...buildUrlAuditMetadata(created.url)
        }
      });

      return reply.status(201).send({ check: created });
    } catch (error) {
      const mapped = mapAvailabilityValidationError(error);
      await recordAvailabilityAudit(request, dependencies, {
        organization_id: auth.access.organization_id,
        actor_user_id: auth.member.member_id,
        action: "availability_check.create",
        target_id: null,
        status: "failure",
        metadata: {
          project_id: parsedParams.data.id,
          reason: mapped.error,
          method: parsedBody.data.method,
          interval_seconds: parsedBody.data.interval_seconds,
          ...buildUrlAuditMetadata(parsedBody.data.url)
        }
      });
      return reply.status(mapped.status).send({
        error: mapped.error,
        ...(mapped.message === undefined ? {} : { message: mapped.message })
      });
    }
  });

  app.patch("/v1/projects/:id/availability-checks/:checkId", async (request, reply) => {
    const parsedParams = ProjectAvailabilityCheckParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_check_id" });
    }

    const auth = await requireRateLimitedProjectAccess(request, reply, dependencies, {
      bucket: "management-write",
      projectId: parsedParams.data.id
    });
    if (auth === null) {
      return;
    }
    if (!isProjectManager(auth.access.effective_role)) {
      return reply.status(403).send({ error: "forbidden" });
    }
    if (dependencies.availabilityCheckManagement === undefined) {
      return reply.status(404).send({ error: "availability_checks_unavailable" });
    }

    const parsedBody = AvailabilityCheckUpdateBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: "invalid_payload" });
    }

    try {
      const updated = await dependencies.availabilityCheckManagement.updateCheckForProjectInOrganization({
        organization_id: auth.access.organization_id,
        project_id: parsedParams.data.id,
        check_id: parsedParams.data.checkId,
        ...(parsedBody.data.name === undefined ? {} : { name: parsedBody.data.name }),
        ...(parsedBody.data.url === undefined ? {} : { url: parsedBody.data.url }),
        ...(parsedBody.data.method === undefined ? {} : { method: parsedBody.data.method }),
        ...(parsedBody.data.expected_status_min === undefined
          ? {}
          : { expected_status_min: parsedBody.data.expected_status_min }),
        ...(parsedBody.data.expected_status_max === undefined
          ? {}
          : { expected_status_max: parsedBody.data.expected_status_max }),
        ...(parsedBody.data.timeout_ms === undefined
          ? {}
          : { timeout_ms: parsedBody.data.timeout_ms }),
        ...(parsedBody.data.interval_seconds === undefined
          ? {}
          : { interval_seconds: parsedBody.data.interval_seconds }),
        ...(parsedBody.data.failure_threshold === undefined
          ? {}
          : { failure_threshold: parsedBody.data.failure_threshold }),
        ...(parsedBody.data.recovery_threshold === undefined
          ? {}
          : { recovery_threshold: parsedBody.data.recovery_threshold }),
        ...(parsedBody.data.environment === undefined
          ? {}
          : { environment: parsedBody.data.environment }),
        ...(parsedBody.data.service_name === undefined
          ? {}
          : { service_name: parsedBody.data.service_name }),
        ...(parsedBody.data.enabled === undefined
          ? {}
          : { enabled: parsedBody.data.enabled }),
        now: new Date().toISOString()
      });

      if (updated === "check_not_found") {
        await recordAvailabilityAudit(request, dependencies, {
          organization_id: auth.access.organization_id,
          actor_user_id: auth.member.member_id,
          action: "availability_check.update",
          target_id: parsedParams.data.checkId,
          status: "failure",
          metadata: {
            project_id: parsedParams.data.id,
            reason: "check_not_found"
          }
        });
        return reply.status(404).send({ error: "check_not_found" });
      }
      if (updated === "interval_too_low") {
        await recordAvailabilityAudit(request, dependencies, {
          organization_id: auth.access.organization_id,
          actor_user_id: auth.member.member_id,
          action: "availability_check.update",
          target_id: parsedParams.data.checkId,
          status: "failure",
          metadata: {
            project_id: parsedParams.data.id,
            reason: "interval_too_low",
            interval_seconds: parsedBody.data.interval_seconds
          }
        });
        return reply.status(409).send({
          error: "availability_check_interval_too_low",
          limits: buildAvailabilityLimits(auth.access.organization_plan)
        });
      }

      await recordAvailabilityAudit(request, dependencies, {
        organization_id: auth.access.organization_id,
        actor_user_id: auth.member.member_id,
        action: "availability_check.update",
        target_id: updated.check_id,
        status: "success",
        metadata: {
          project_id: parsedParams.data.id,
          changed_fields: Object.keys(parsedBody.data).sort(),
          enabled: updated.enabled,
          interval_seconds: updated.interval_seconds,
          ...(parsedBody.data.url === undefined ? {} : buildUrlAuditMetadata(updated.url))
        }
      });

      return reply.status(200).send({ check: updated });
    } catch (error) {
      const mapped = mapAvailabilityValidationError(error);
      await recordAvailabilityAudit(request, dependencies, {
        organization_id: auth.access.organization_id,
        actor_user_id: auth.member.member_id,
        action: "availability_check.update",
        target_id: parsedParams.data.checkId,
        status: "failure",
        metadata: {
          project_id: parsedParams.data.id,
          reason: mapped.error,
          changed_fields: Object.keys(parsedBody.data).sort(),
          ...(parsedBody.data.url === undefined ? {} : buildUrlAuditMetadata(parsedBody.data.url))
        }
      });
      return reply.status(mapped.status).send({
        error: mapped.error,
        ...(mapped.message === undefined ? {} : { message: mapped.message })
      });
    }
  });

  app.delete("/v1/projects/:id/availability-checks/:checkId", async (request, reply) => {
    const parsedParams = ProjectAvailabilityCheckParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_check_id" });
    }

    const auth = await requireRateLimitedProjectAccess(request, reply, dependencies, {
      bucket: "management-write",
      projectId: parsedParams.data.id
    });
    if (auth === null) {
      return;
    }
    if (!isProjectManager(auth.access.effective_role)) {
      return reply.status(403).send({ error: "forbidden" });
    }
    if (dependencies.availabilityCheckManagement === undefined) {
      return reply.status(404).send({ error: "availability_checks_unavailable" });
    }

    const deleted = await dependencies.availabilityCheckManagement.deleteCheckForProjectInOrganization({
      organization_id: auth.access.organization_id,
      project_id: parsedParams.data.id,
      check_id: parsedParams.data.checkId,
      deleted_at: new Date().toISOString()
    });

    if (!deleted) {
      await recordAvailabilityAudit(request, dependencies, {
        organization_id: auth.access.organization_id,
        actor_user_id: auth.member.member_id,
        action: "availability_check.delete",
        target_id: parsedParams.data.checkId,
        status: "failure",
        metadata: {
          project_id: parsedParams.data.id,
          reason: "check_not_found"
        }
      });
      return reply.status(404).send({ error: "check_not_found" });
    }

    await recordAvailabilityAudit(request, dependencies, {
      organization_id: auth.access.organization_id,
      actor_user_id: auth.member.member_id,
      action: "availability_check.delete",
      target_id: parsedParams.data.checkId,
      status: "success",
      metadata: {
        project_id: parsedParams.data.id
      }
    });

    return reply.status(200).send({ deleted: true });
  });

  app.get("/v1/projects/:id/availability-checks/:checkId/results", async (request, reply) => {
    const parsedParams = ProjectAvailabilityCheckParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_check_id" });
    }

    const auth = await requireRateLimitedProjectAccess(request, reply, dependencies, {
      bucket: "management-read",
      projectId: parsedParams.data.id
    });
    if (auth === null) {
      return;
    }
    if (dependencies.availabilityCheckManagement === undefined) {
      return reply.status(404).send({ error: "availability_checks_unavailable" });
    }

    const parsedQuery = TokenListQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.status(400).send({ error: "invalid_query" });
    }

    const results = await dependencies.availabilityCheckManagement.listResultsForCheckInOrganization({
      organization_id: auth.access.organization_id,
      project_id: parsedParams.data.id,
      check_id: parsedParams.data.checkId,
      limit: parsedQuery.data.limit
    });

    if (results === null) {
      return reply.status(404).send({ error: "check_not_found" });
    }

    return reply.status(200).send({ results });
  });

  app.get("/v1/projects/:id/availability-checks/:checkId/daily-rollups", async (request, reply) => {
    const parsedParams = ProjectAvailabilityCheckParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_check_id" });
    }

    const auth = await requireRateLimitedProjectAccess(request, reply, dependencies, {
      bucket: "management-read",
      projectId: parsedParams.data.id
    });
    if (auth === null) {
      return;
    }
    if (dependencies.availabilityCheckManagement === undefined) {
      return reply.status(404).send({ error: "availability_checks_unavailable" });
    }

    const parsedQuery = TokenListQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.status(400).send({ error: "invalid_query" });
    }

    const rollups = await dependencies.availabilityCheckManagement.listDailyRollupsForCheckInOrganization({
      organization_id: auth.access.organization_id,
      project_id: parsedParams.data.id,
      check_id: parsedParams.data.checkId,
      limit: parsedQuery.data.limit
    });

    if (rollups === null) {
      return reply.status(404).send({ error: "check_not_found" });
    }

    return reply.status(200).send({ rollups });
  });

  app.post("/v1/projects/:id/availability-checks/test", async (request, reply) => {
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
    if (!isProjectManager(auth.access.effective_role)) {
      return reply.status(403).send({ error: "forbidden" });
    }
    if (dependencies.availabilityCheckManagement === undefined) {
      return reply.status(404).send({ error: "availability_checks_unavailable" });
    }

    const parsedBody = AvailabilityCheckTestBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: "invalid_payload" });
    }

    try {
      const tested = await dependencies.availabilityCheckManagement.testCheck(parsedBody.data);
      await recordAvailabilityAudit(request, dependencies, {
        organization_id: auth.access.organization_id,
        actor_user_id: auth.member.member_id,
        action: "availability_check.test",
        target_id: null,
        status: "success",
        metadata: {
          project_id: parsedParams.data.id,
          method: parsedBody.data.method,
          result_status: tested.result.status,
          result_http_status: tested.result.http_status,
          ...buildUrlAuditMetadata(tested.normalized_url)
        }
      });
      return reply.status(200).send(tested);
    } catch (error) {
      const mapped = mapAvailabilityValidationError(error);
      await recordAvailabilityAudit(request, dependencies, {
        organization_id: auth.access.organization_id,
        actor_user_id: auth.member.member_id,
        action: "availability_check.test",
        target_id: null,
        status: "failure",
        metadata: {
          project_id: parsedParams.data.id,
          reason: mapped.error,
          method: parsedBody.data.method,
          ...buildUrlAuditMetadata(parsedBody.data.url)
        }
      });
      return reply.status(mapped.status).send({
        error: mapped.error,
        ...(mapped.message === undefined ? {} : { message: mapped.message })
      });
    }
  });
}
