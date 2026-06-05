import { gunzipSync } from "node:zlib";
import { randomUUID } from "node:crypto";

import type { FastifyInstance } from "fastify";

import {
  buildCaptureRuleSuggestions,
  BundleV1Schema,
  CaptureRuleCreateSchema,
  CaptureRuleSuggestionsResponseSchema,
  CreateCaptureRuleFromSuggestionSchema,
  CaptureRuleResponseSchema,
  CaptureRulesResponseSchema,
  CaptureRuleUpdateSchema,
  type CaptureRuleCreate,
  type CaptureRuleResponse,
  type CaptureRuleSuggestionsResponse,
  type CaptureRulesResponse,
  type BundleV1,
} from "../../../../packages/shared-types/src/index.js";
import { buildBundleObjectKey } from "../../../../packages/storage/src/index.js";
import type { ApiDependencies } from "../api-types.js";
import { recordAuditLog, resolveAuditActorType } from "../audit-logging.js";
import {
  isObjectNotFoundError,
  isSharedProjectAccessSuspended,
  requireRateLimitedMemberAuth,
  requireRateLimitedProjectAccess
} from "../api-helpers.js";
import { IncidentParamsSchema, ProjectCaptureRuleParamsSchema, ProjectParamsSchema } from "../schemas.js";

function buildCaptureRulesResponse(input: {
  accessMode: CaptureRulesResponse["access_mode"];
  rules: CaptureRulesResponse["rules"];
}): CaptureRulesResponse {
  return CaptureRulesResponseSchema.parse({
    access_mode: input.accessMode,
    rules: input.rules,
  });
}

function buildCaptureRuleResponse(rule: CaptureRuleResponse["rule"]): CaptureRuleResponse {
  return CaptureRuleResponseSchema.parse({ rule });
}

function buildCaptureRuleSuggestionsResponse(
  input: CaptureRuleSuggestionsResponse
): CaptureRuleSuggestionsResponse {
  return CaptureRuleSuggestionsResponseSchema.parse(input);
}

async function readBundleForCaptureRuleSuggestions(input: {
  dependencies: ApiDependencies;
  organizationId: string;
  incidentId: string;
  projectId: string;
}): Promise<
  | { status: "ready"; bundle: BundleV1 }
  | { status: "pending" }
  | { status: "failed"; reason: string }
> {
  const key = buildBundleObjectKey(input.projectId, input.incidentId);

  try {
    const compressed = await input.dependencies.objectStoreReader.getObject({ key });
    const parsed = BundleV1Schema.safeParse(JSON.parse(gunzipSync(compressed).toString("utf8")));
    if (!parsed.success) {
      return {
        status: "failed",
        reason: "bundle_artifact_invalid"
      };
    }

    return {
      status: "ready",
      bundle: parsed.data
    };
  } catch (error) {
    if (isObjectNotFoundError(error)) {
      const failureReason = await input.dependencies.incidentRetrieval.getBundleFailureReasonForOrganization?.({
        organization_id: input.organizationId,
        incident_id: input.incidentId
      });

      if (failureReason === "monthly_quota_exceeded") {
        return {
          status: "failed",
          reason: failureReason
        };
      }

      if (input.dependencies.bundleRegeneration !== undefined) {
        const regenerationQueued = await input.dependencies.bundleRegeneration.requestRegeneration({
          organization_id: input.organizationId,
          project_id: input.projectId,
          incident_id: input.incidentId
        });

        if (!regenerationQueued) {
          return {
            status: "failed",
            reason: "bundle_source_unavailable"
          };
        }
      }

      return {
        status: "pending"
      };
    }

    return {
      status: "failed",
      reason: "bundle_artifact_unavailable"
    };
  }
}

export function registerCaptureRuleRoutes(app: FastifyInstance, dependencies: ApiDependencies): void {
  app.get("/v1/projects/:id/capture-rules", async (request, reply) => {
    const parsedParams = ProjectParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_project_id" });
    }

    const auth = await requireRateLimitedProjectAccess(request, reply, dependencies, {
      bucket: "management-read",
      projectId: parsedParams.data.id,
    });
    if (auth === null) {
      return;
    }

    const accessMode: CaptureRulesResponse["access_mode"] =
      auth.access.effective_role === "owner" || auth.access.effective_role === "admin" ? "manage" : "preview";

    if (dependencies.captureRuleManagement === undefined) {
      return reply.status(200).send(
        buildCaptureRulesResponse({
          accessMode,
          rules: [],
        })
      );
    }

    const rules = await dependencies.captureRuleManagement.listCaptureRulesForProject({
      organization_id: auth.access.organization_id,
      project_id: parsedParams.data.id,
    });

    return reply.status(200).send(
      buildCaptureRulesResponse({
        accessMode,
        rules,
      })
    );
  });

  app.post("/v1/projects/:id/capture-rules", async (request, reply) => {
    const parsedParams = ProjectParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_project_id" });
    }

    const auth = await requireRateLimitedProjectAccess(request, reply, dependencies, {
      bucket: "management-write",
      projectId: parsedParams.data.id,
    });
    if (auth === null) {
      return;
    }
    if (auth.access.effective_role !== "owner" && auth.access.effective_role !== "admin") {
      return reply.status(403).send({ error: "forbidden" });
    }

    const parsedBody = CaptureRuleCreateSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: "invalid_payload" });
    }

    if (dependencies.captureRuleManagement === undefined) {
      return reply.status(404).send({ error: "capture_rules_not_available" });
    }

    const rule = await dependencies.captureRuleManagement.createCaptureRuleForProject({
      organization_id: auth.access.organization_id,
      project_id: parsedParams.data.id,
      id: randomUUID(),
      create: parsedBody.data,
    });

    if (rule === null) {
      await recordAuditLog(dependencies.auditLogging, {
        organization_id: auth.access.organization_id,
        actor_user_id: auth.member.member_id,
        actor_type: resolveAuditActorType(request.headers),
        action: "capture_rule.create",
        target_type: "capture_rule",
        target_id: parsedParams.data.id,
        status: "failure",
        ip_address: request.ip,
        metadata: {
          reason: "project_not_found",
          action: parsedBody.data.action,
          name: parsedBody.data.name,
        },
      });

      return reply.status(404).send({ error: "project_not_found" });
    }

    await recordAuditLog(dependencies.auditLogging, {
      organization_id: auth.access.organization_id,
      actor_user_id: auth.member.member_id,
      actor_type: resolveAuditActorType(request.headers),
      action: "capture_rule.create",
      target_type: "capture_rule",
      target_id: rule.id,
      status: "success",
      ip_address: request.ip,
      metadata: {
        project_id: parsedParams.data.id,
        action: rule.action,
        name: rule.name,
      },
    });

    return reply.status(201).send(buildCaptureRuleResponse(rule));
  });

  app.post("/v1/incidents/:id/capture-rule-suggestion", async (request, reply) => {
    const member = await requireRateLimitedMemberAuth(request, reply, dependencies, "retrieval-read");
    if (member === null) {
      return;
    }

    const parsedParams = IncidentParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_incident_id" });
    }

    const incident = await dependencies.incidentRetrieval.getIncidentForOrganization({
      organization_id: member.organization_id,
      incident_id: parsedParams.data.id
    });
    if (incident === null) {
      return reply.status(404).send({ error: "incident_not_found" });
    }

    const bundle = await readBundleForCaptureRuleSuggestions({
      dependencies,
      organizationId: member.organization_id,
      incidentId: incident.incident_id,
      projectId: incident.project_id
    });

    if (bundle.status === "pending") {
      return reply.status(200).send(
        buildCaptureRuleSuggestionsResponse({
          suggestions: [],
          bundle_status: "pending"
        })
      );
    }

    if (bundle.status === "failed") {
      return reply.status(200).send(
        buildCaptureRuleSuggestionsResponse({
          suggestions: [],
          bundle_status: "failed",
          bundle_reason: bundle.reason
        })
      );
    }

    return reply.status(200).send(
      buildCaptureRuleSuggestionsResponse({
        suggestions: buildCaptureRuleSuggestions({
          incident: {
            incident_id: incident.incident_id,
            project_id: incident.project_id,
            fingerprint: incident.fingerprint,
            fingerprint_version: incident.fingerprint_version,
            title: incident.title,
            occurrence_count: incident.occurrence_count,
            matched_fields: incident.matched_fields
          },
          bundle: bundle.bundle
        }),
        bundle_status: "ready"
      })
    );
  });

  app.post("/v1/incidents/:id/capture-rules", async (request, reply) => {
    const member = await requireRateLimitedMemberAuth(request, reply, dependencies, "management-write");
    if (member === null) {
      return;
    }

    const parsedParams = IncidentParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_incident_id" });
    }

    const parsedBody = CreateCaptureRuleFromSuggestionSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: "invalid_payload" });
    }

    const incident = await dependencies.incidentRetrieval.getIncidentForOrganization({
      organization_id: member.organization_id,
      incident_id: parsedParams.data.id
    });
    if (incident === null) {
      return reply.status(404).send({ error: "incident_not_found" });
    }

    if (dependencies.projectManagement?.resolveProjectAccessForUser === undefined) {
      return reply.status(404).send({ error: "project_not_found" });
    }

    const access = await dependencies.projectManagement.resolveProjectAccessForUser({
      user_id: member.member_id,
      project_id: incident.project_id
    });
    if (access === null) {
      return reply.status(404).send({ error: "project_not_found" });
    }
    if (isSharedProjectAccessSuspended(access)) {
      return reply.status(403).send({ error: "shared_access_suspended" });
    }
    if (access.effective_role !== "owner" && access.effective_role !== "admin") {
      return reply.status(403).send({ error: "forbidden" });
    }
    if (dependencies.captureRuleManagement === undefined) {
      return reply.status(404).send({ error: "capture_rules_not_available" });
    }

    const bundle = await readBundleForCaptureRuleSuggestions({
      dependencies,
      organizationId: member.organization_id,
      incidentId: incident.incident_id,
      projectId: incident.project_id
    });
    if (bundle.status !== "ready") {
      return reply.status(409).send({ error: "capture_rule_suggestion_unavailable" });
    }

    const suggestion = buildCaptureRuleSuggestions({
      incident: {
        incident_id: incident.incident_id,
        project_id: incident.project_id,
        fingerprint: incident.fingerprint,
        fingerprint_version: incident.fingerprint_version,
        title: incident.title,
        occurrence_count: incident.occurrence_count,
        matched_fields: incident.matched_fields
      },
      bundle: bundle.bundle
    }).find((candidate) => candidate.suggestion_id === parsedBody.data.suggestion_id);

    if (suggestion === undefined) {
      return reply.status(404).send({ error: "capture_rule_suggestion_not_found" });
    }

    const create: CaptureRuleCreate = {
      ...suggestion.rule,
      ...(parsedBody.data.name === undefined ? {} : { name: parsedBody.data.name }),
      ...(parsedBody.data.description === undefined ? {} : { description: parsedBody.data.description }),
      ...(parsedBody.data.enabled === undefined ? {} : { enabled: parsedBody.data.enabled }),
      ...(parsedBody.data.expires_at === undefined ? {} : { expires_at: parsedBody.data.expires_at })
    };

    const rule = await dependencies.captureRuleManagement.createCaptureRuleForProject({
      organization_id: member.organization_id,
      project_id: incident.project_id,
      id: randomUUID(),
      create
    });

    if (rule === null) {
      return reply.status(404).send({ error: "project_not_found" });
    }

    await recordAuditLog(dependencies.auditLogging, {
      organization_id: member.organization_id,
      actor_user_id: member.member_id,
      actor_type: resolveAuditActorType(request.headers),
      action: "capture_rule.create_from_suggestion",
      target_type: "capture_rule",
      target_id: rule.id,
      status: "success",
      ip_address: request.ip,
      metadata: {
        incident_id: incident.incident_id,
        project_id: incident.project_id,
        suggestion_id: suggestion.suggestion_id,
        action: rule.action,
        name: rule.name
      }
    });

    return reply.status(201).send(buildCaptureRuleResponse(rule));
  });

  app.patch("/v1/projects/:id/capture-rules/:ruleId", async (request, reply) => {
    const parsedParams = ProjectCaptureRuleParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_rule_id" });
    }

    const auth = await requireRateLimitedProjectAccess(request, reply, dependencies, {
      bucket: "management-write",
      projectId: parsedParams.data.id,
    });
    if (auth === null) {
      return;
    }
    if (auth.access.effective_role !== "owner" && auth.access.effective_role !== "admin") {
      return reply.status(403).send({ error: "forbidden" });
    }

    const parsedBody = CaptureRuleUpdateSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: "invalid_payload" });
    }

    if (dependencies.captureRuleManagement === undefined) {
      return reply.status(404).send({ error: "capture_rules_not_available" });
    }

    const rule = await dependencies.captureRuleManagement.updateCaptureRuleForProject({
      organization_id: auth.access.organization_id,
      project_id: parsedParams.data.id,
      rule_id: parsedParams.data.ruleId,
      update: parsedBody.data,
    });

    if (rule === null) {
      await recordAuditLog(dependencies.auditLogging, {
        organization_id: auth.access.organization_id,
        actor_user_id: auth.member.member_id,
        actor_type: resolveAuditActorType(request.headers),
        action: "capture_rule.update",
        target_type: "capture_rule",
        target_id: parsedParams.data.ruleId,
        status: "failure",
        ip_address: request.ip,
        metadata: {
          reason: "capture_rule_not_found",
          update_keys: Object.keys(parsedBody.data),
        },
      });

      return reply.status(404).send({ error: "capture_rule_not_found" });
    }

    await recordAuditLog(dependencies.auditLogging, {
      organization_id: auth.access.organization_id,
      actor_user_id: auth.member.member_id,
      actor_type: resolveAuditActorType(request.headers),
      action: "capture_rule.update",
      target_type: "capture_rule",
      target_id: parsedParams.data.ruleId,
      status: "success",
      ip_address: request.ip,
      metadata: {
        update_keys: Object.keys(parsedBody.data),
        project_id: parsedParams.data.id,
        action: rule.action,
      },
    });

    return reply.status(200).send(buildCaptureRuleResponse(rule));
  });

  app.delete("/v1/projects/:id/capture-rules/:ruleId", async (request, reply) => {
    const parsedParams = ProjectCaptureRuleParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_rule_id" });
    }

    const auth = await requireRateLimitedProjectAccess(request, reply, dependencies, {
      bucket: "management-write",
      projectId: parsedParams.data.id,
    });
    if (auth === null) {
      return;
    }
    if (auth.access.effective_role !== "owner" && auth.access.effective_role !== "admin") {
      return reply.status(403).send({ error: "forbidden" });
    }

    if (dependencies.captureRuleManagement === undefined) {
      return reply.status(404).send({ error: "capture_rules_not_available" });
    }

    const deleted = await dependencies.captureRuleManagement.deleteCaptureRuleForProject({
      organization_id: auth.access.organization_id,
      project_id: parsedParams.data.id,
      rule_id: parsedParams.data.ruleId,
    });

    await recordAuditLog(dependencies.auditLogging, {
      organization_id: auth.access.organization_id,
      actor_user_id: auth.member.member_id,
      actor_type: resolveAuditActorType(request.headers),
      action: "capture_rule.delete",
      target_type: "capture_rule",
      target_id: parsedParams.data.ruleId,
      status: deleted ? "success" : "failure",
      ip_address: request.ip,
      metadata: {
        project_id: parsedParams.data.id,
        reason: deleted ? null : "capture_rule_not_found",
      },
    });

    if (!deleted) {
      return reply.status(404).send({ error: "capture_rule_not_found" });
    }

    return reply.status(200).send({ success: true });
  });
}
