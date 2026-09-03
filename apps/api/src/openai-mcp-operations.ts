import type {
  OpenAiHostedOperations,
  OpenAiMcpPrincipal
} from "../../../packages/mcp-core/src/index.js";
import {
  buildBundleObjectKey,
  buildImprovementBundleObjectKey,
  buildReproductionObjectKey
} from "../../../packages/storage/src/index.js";

import type { DefaultApiDependencies } from "./default-dependency-types.js";
import {
  artifactManifest,
  buildDashboardUrl,
  isRecord,
  mapDeploy,
  mapHealthCheck,
  mapHealthResult,
  mapHealthRollup,
  mapImprovement,
  mapIncident,
  mapPrimarySignal,
  mapProject,
  mapRedaction,
  mapReproduction,
  mapService,
  parseCompressedArtifact,
  type ArtifactKind,
  type ReadArtifactResult
} from "./openai-mcp-projections.js";
import {
  createOpenAiAnalyticsOperations,
  type OpenAiAnalyticsReadDependencies
} from "./openai-mcp-analytics-operations.js";

export interface OpenAiHostedReadDependencies {
  projectManagement: Pick<
    DefaultApiDependencies["projectManagement"],
    "resolveProjectAccessForUser" | "listProjectsForUser"
  >;
  incidentRetrieval: Pick<
    DefaultApiDependencies["incidentRetrieval"],
    "listIncidentsForOrganization" | "getIncidentForOrganization" | "listServicesForOrganization"
  >;
  improvementManagement: Pick<
    DefaultApiDependencies["improvementManagement"],
    "listImprovementsForOrganization" | "getImprovementForOrganization"
  >;
  availabilityCheckManagement: Pick<
    DefaultApiDependencies["availabilityCheckManagement"],
    | "listChecksForProjectInOrganization"
    | "getCheckForProjectInOrganization"
    | "listResultsForCheckInOrganization"
    | "listDailyRollupsForCheckInOrganization"
  >;
  analyticsMetrics: OpenAiAnalyticsReadDependencies;
  objectStoreReader: Pick<DefaultApiDependencies["objectStoreReader"], "getObject">;
}

interface OffsetCursor {
  offset: number;
}

function inputString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string") {
    throw new Error(`openai_mcp_missing_input:${key}`);
  }
  return value;
}

function optionalString(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  return typeof value === "string" ? value : undefined;
}

function valueString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function inputInteger(input: Record<string, unknown>, key: string, defaultValue: number): number {
  const value = input[key];
  return typeof value === "number" && Number.isInteger(value) ? value : defaultValue;
}

function encodeCursor(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeCursor(value: string | undefined): Record<string, unknown> | undefined {
  if (value === undefined) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!isRecord(parsed)) {
      throw new Error("invalid");
    }
    return parsed;
  } catch {
    throw new Error("openai_mcp_invalid_cursor");
  }
}

function decodeOffsetCursor(value: string | undefined): OffsetCursor {
  const cursor = decodeCursor(value);
  const offset = cursor?.["offset"] ?? 0;
  if (!Number.isInteger(offset) || typeof offset !== "number" || offset < 0 || offset > 1_000) {
    throw new Error("openai_mcp_invalid_cursor");
  }
  return { offset };
}

function paginateOffset<T>(
  items: T[],
  offset: number,
  limit: number
): {
  page: T[];
  nextCursor: string | null;
} {
  const page = items.slice(offset, offset + limit);
  return {
    page,
    nextCursor: items.length > offset + limit ? encodeCursor({ offset: offset + limit }) : null
  };
}

async function requireProjectAccess(
  dependencies: OpenAiHostedReadDependencies,
  principal: OpenAiMcpPrincipal,
  projectId: string
): Promise<void> {
  const resolveAccess = dependencies.projectManagement.resolveProjectAccessForUser;
  if (resolveAccess === undefined) {
    throw new Error("openai_mcp_operation_unavailable:project_access");
  }
  const access = await resolveAccess({
    user_id: principal.userId,
    project_id: projectId
  });
  if (
    access === null ||
    access.organization_id !== principal.organizationId ||
    access.shared_access_suspended === true
  ) {
    throw new Error("openai_mcp_project_not_found");
  }
}

function isObjectMissing(error: unknown): boolean {
  if (!isRecord(error)) {
    return false;
  }
  const metadata = isRecord(error["$metadata"]) ? error["$metadata"] : {};
  return (
    error["name"] === "NoSuchKey" ||
    error["code"] === "NoSuchKey" ||
    metadata["httpStatusCode"] === 404
  );
}

async function readArtifact(
  dependencies: OpenAiHostedReadDependencies,
  key: string
): Promise<ReadArtifactResult> {
  try {
    return parseCompressedArtifact(await dependencies.objectStoreReader.getObject({ key }));
  } catch (error) {
    return isObjectMissing(error)
      ? { status: "missing", body: null }
      : { status: "failed", body: null };
  }
}

function artifactMessage(status: ReadArtifactResult["status"]): string {
  switch (status) {
    case "ready":
      return "The existing bounded artifact is ready.";
    case "missing":
      return "No existing artifact is available. No regeneration was started.";
    case "oversized":
      return "The existing artifact exceeds the OpenAI v1 response bound.";
    default:
      return "The existing artifact could not be read. No regeneration was started.";
  }
}

function bundleArtifact(body: Record<string, unknown>): Record<string, unknown> {
  const summary = isRecord(body["summary"]) ? body["summary"] : {};
  const recommendedAction =
    typeof summary["recommended_action"] === "string" ? [summary["recommended_action"]] : [];
  return {
    bundle_version: Number(body["bundle_version"] ?? 1),
    primary_signal: mapPrimarySignal(body),
    deploy: mapDeploy(body),
    redaction: mapRedaction(body),
    suggested_next_checks: recommendedAction
  };
}

function improvementBundleArtifact(body: Record<string, unknown>): Record<string, unknown> {
  const summary = isRecord(body["summary"]) ? body["summary"] : {};
  return {
    bundle_version: Number(body["bundle_version"] ?? 1),
    summary: {
      title: valueString(summary["title"], "Improvement evidence"),
      description: valueString(summary["description"], "No bounded description is available."),
      likely_cause: typeof summary["likely_cause"] === "string" ? summary["likely_cause"] : null,
      confidence: Number(summary["confidence"] ?? 0),
      recommended_action:
        typeof summary["recommended_action"] === "string" ? summary["recommended_action"] : null,
      severity: summary["severity"] ?? "low",
      error_type: typeof summary["error_type"] === "string" ? summary["error_type"] : null,
      error_message: typeof summary["error_message"] === "string" ? summary["error_message"] : null,
      first_application_frame: isRecord(summary["first_application_frame"])
        ? {
            file:
              typeof summary["first_application_frame"]["file"] === "string"
                ? summary["first_application_frame"]["file"]
                : null,
            line:
              typeof summary["first_application_frame"]["line"] === "number"
                ? summary["first_application_frame"]["line"]
                : null,
            function:
              typeof summary["first_application_frame"]["function"] === "string"
                ? summary["first_application_frame"]["function"]
                : null
          }
        : null
    },
    redaction: mapRedaction(body)
  };
}

function artifactEnvelope(input: {
  idKey: "incident_id" | "improvement_id";
  id: string;
  kind: ArtifactKind;
  read: ReadArtifactResult;
  artifact: Record<string, unknown> | null;
  continuationUrl: string;
  omittedFields: string[];
}): Record<string, unknown> {
  return {
    [input.idKey]: input.id,
    status: input.read.status,
    artifact: input.artifact,
    manifest: artifactManifest(input.kind, input.artifact, input.omittedFields),
    message: artifactMessage(input.read.status),
    continuation_url: input.continuationUrl
  };
}

function record(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

export function createOpenAiHostedOperations(input: {
  dependencies: OpenAiHostedReadDependencies;
  dashboardBaseUrl: string;
}): OpenAiHostedOperations {
  const { dependencies, dashboardBaseUrl } = input;

  return {
    ...createOpenAiAnalyticsOperations({
      analyticsMetrics: dependencies.analyticsMetrics,
      incidentRetrieval: dependencies.incidentRetrieval,
      requireProjectAccess: (principal, projectId) =>
        requireProjectAccess(dependencies, principal, projectId)
    }),
    async list_projects({ principal, input: toolInput }) {
      const limit = inputInteger(toolInput, "limit", 25);
      const cursor = decodeOffsetCursor(optionalString(toolInput, "cursor"));
      const listProjects = dependencies.projectManagement.listProjectsForUser;
      if (listProjects === undefined) {
        throw new Error("openai_mcp_operation_unavailable:list_projects");
      }
      const projects = await listProjects({
        user_id: principal.userId,
        now: new Date().toISOString(),
        limit: Math.min(cursor.offset + limit + 1, 1_001)
      });
      const organizationProjects = projects.filter(
        (project) =>
          project.organization_id === principal.organizationId &&
          project.shared_access_suspended !== true
      );
      const page = paginateOffset(organizationProjects, cursor.offset, limit);
      return {
        projects: page.page.map((project) => mapProject(record(project), dashboardBaseUrl)),
        next_cursor: page.nextCursor,
        empty_state:
          page.page.length === 0 && cursor.offset === 0
            ? {
                message: "No projects are available to this linked DebugBundle account.",
                setup_url: buildDashboardUrl(dashboardBaseUrl, "/?source=openai_plugin")
              }
            : null
      };
    },

    async list_services({ principal, input: toolInput }) {
      const projectId = inputString(toolInput, "projectId");
      await requireProjectAccess(dependencies, principal, projectId);
      const limit = inputInteger(toolInput, "limit", 25);
      const cursor = decodeOffsetCursor(optionalString(toolInput, "cursor"));
      const listServices = dependencies.incidentRetrieval.listServicesForOrganization;
      if (listServices === undefined) {
        throw new Error("openai_mcp_operation_unavailable:list_services");
      }
      const services = await listServices({
        organization_id: principal.organizationId,
        user_id: principal.userId,
        project_id: projectId,
        limit: Math.min(cursor.offset + limit + 1, 1_001)
      });
      if (services === null) {
        throw new Error("openai_mcp_project_not_found");
      }
      const page = paginateOffset(services, cursor.offset, limit);
      return {
        project_id: projectId,
        services: page.page.map((service) => mapService(record(service))),
        next_cursor: page.nextCursor
      };
    },

    async list_incidents({ principal, input: toolInput }) {
      const projectId = inputString(toolInput, "projectId");
      await requireProjectAccess(dependencies, principal, projectId);
      const limit = inputInteger(toolInput, "limit", 25);
      const cursor = decodeCursor(optionalString(toolInput, "cursor"));
      const status = optionalString(toolInput, "status");
      const incidents = await dependencies.incidentRetrieval.listIncidentsForOrganization({
        organization_id: principal.organizationId,
        user_id: principal.userId,
        project_id: projectId,
        limit: limit + 1,
        ...(optionalString(toolInput, "environment") === undefined
          ? {}
          : { environment: optionalString(toolInput, "environment")! }),
        ...(optionalString(toolInput, "service") === undefined
          ? {}
          : { service: optionalString(toolInput, "service")! }),
        ...(status === undefined || status === "all" ? {} : { status: status as "active" }),
        ...(optionalString(toolInput, "severity") === undefined
          ? {}
          : { severity: optionalString(toolInput, "severity") as "low" }),
        ...(optionalString(toolInput, "firstSeenAfter") === undefined
          ? {}
          : { first_seen_after: optionalString(toolInput, "firstSeenAfter")! }),
        ...(optionalString(toolInput, "attentionAfter") === undefined
          ? {}
          : { attention_after: optionalString(toolInput, "attentionAfter")! }),
        ...(cursor === undefined
          ? {}
          : {
              cursor: {
                last_seen_at: inputString(cursor, "last_seen_at"),
                incident_id: inputString(cursor, "incident_id")
              }
            })
      });
      const hasMore = incidents.length > limit;
      const page = incidents.slice(0, limit);
      const last = page.at(-1);
      return {
        project_id: projectId,
        incidents: page.map((incident) => mapIncident(record(incident), dashboardBaseUrl)),
        next_cursor:
          hasMore && last !== undefined
            ? encodeCursor({
                last_seen_at: last.last_seen_at,
                incident_id: last.incident_id
              })
            : null
      };
    },

    async get_incident({ principal, input: toolInput }) {
      const projectId = inputString(toolInput, "projectId");
      const incidentId = inputString(toolInput, "incidentId");
      await requireProjectAccess(dependencies, principal, projectId);
      const incident = await dependencies.incidentRetrieval.getIncidentForOrganization({
        organization_id: principal.organizationId,
        user_id: principal.userId,
        incident_id: incidentId
      });
      if (incident === null || incident.project_id !== projectId) {
        throw new Error("openai_mcp_incident_not_found");
      }
      return { incident: mapIncident(record(incident), dashboardBaseUrl) };
    },

    async get_incident_context({ principal, input: toolInput }) {
      const projectId = inputString(toolInput, "projectId");
      const incidentId = inputString(toolInput, "incidentId");
      await requireProjectAccess(dependencies, principal, projectId);
      const incident = await dependencies.incidentRetrieval.getIncidentForOrganization({
        organization_id: principal.organizationId,
        user_id: principal.userId,
        incident_id: incidentId
      });
      if (incident === null || incident.project_id !== projectId) {
        throw new Error("openai_mcp_incident_not_found");
      }
      const [bundle, reproduction] = await Promise.all([
        readArtifact(dependencies, buildBundleObjectKey(projectId, incidentId)),
        readArtifact(dependencies, buildReproductionObjectKey(projectId, incidentId))
      ]);
      const bundleBody = bundle.body ?? {};
      return {
        incident: mapIncident(record(incident), dashboardBaseUrl),
        primary_signal: mapPrimarySignal(bundleBody),
        bundle_status: bundle.status,
        reproduction_status: reproduction.status,
        deploy: mapDeploy(bundleBody),
        redaction: mapRedaction(bundleBody),
        suggested_next_checks: [
          "Open the incident dashboard to continue if the bounded context is insufficient."
        ],
        continuation_url: buildDashboardUrl(
          dashboardBaseUrl,
          `/projects/${encodeURIComponent(projectId)}/incidents/${encodeURIComponent(incidentId)}`
        )
      };
    },

    async get_bundle({ principal, input: toolInput }) {
      const projectId = inputString(toolInput, "projectId");
      const incidentId = inputString(toolInput, "incidentId");
      await requireProjectAccess(dependencies, principal, projectId);
      const incident = await dependencies.incidentRetrieval.getIncidentForOrganization({
        organization_id: principal.organizationId,
        user_id: principal.userId,
        incident_id: incidentId
      });
      if (incident === null || incident.project_id !== projectId) {
        throw new Error("openai_mcp_incident_not_found");
      }
      const read = await readArtifact(dependencies, buildBundleObjectKey(projectId, incidentId));
      const artifact = read.body === null ? null : bundleArtifact(read.body);
      return artifactEnvelope({
        idKey: "incident_id",
        id: incidentId,
        kind: "bundle",
        read,
        artifact,
        continuationUrl: buildDashboardUrl(
          dashboardBaseUrl,
          `/projects/${encodeURIComponent(projectId)}/incidents/${encodeURIComponent(incidentId)}`
        ),
        omittedFields: ["context.logs", "context.request.headers", "context.request.body"]
      });
    },

    async get_reproduction({ principal, input: toolInput }) {
      const projectId = inputString(toolInput, "projectId");
      const incidentId = inputString(toolInput, "incidentId");
      await requireProjectAccess(dependencies, principal, projectId);
      const incident = await dependencies.incidentRetrieval.getIncidentForOrganization({
        organization_id: principal.organizationId,
        user_id: principal.userId,
        incident_id: incidentId
      });
      if (incident === null || incident.project_id !== projectId) {
        throw new Error("openai_mcp_incident_not_found");
      }
      const read = await readArtifact(
        dependencies,
        buildReproductionObjectKey(projectId, incidentId)
      );
      const artifact = read.body === null ? null : mapReproduction(read.body);
      return artifactEnvelope({
        idKey: "incident_id",
        id: incidentId,
        kind: "reproduction",
        read,
        artifact,
        continuationUrl: buildDashboardUrl(
          dashboardBaseUrl,
          `/projects/${encodeURIComponent(projectId)}/incidents/${encodeURIComponent(incidentId)}`
        ),
        omittedFields: ["request.headers", "request.body", "environment"]
      });
    },

    async list_improvements({ principal, input: toolInput }) {
      const projectId = inputString(toolInput, "projectId");
      await requireProjectAccess(dependencies, principal, projectId);
      const limit = inputInteger(toolInput, "limit", 25);
      const cursor = decodeCursor(optionalString(toolInput, "cursor"));
      const status = optionalString(toolInput, "status");
      const improvements = await dependencies.improvementManagement.listImprovementsForOrganization(
        {
          organization_id: principal.organizationId,
          user_id: principal.userId,
          project_id: projectId,
          limit: limit + 1,
          ...(optionalString(toolInput, "environment") === undefined
            ? {}
            : { environment: optionalString(toolInput, "environment")! }),
          ...(optionalString(toolInput, "service") === undefined
            ? {}
            : { service: optionalString(toolInput, "service")! }),
          ...(status === undefined || status === "all" ? {} : { status: status as "open" }),
          ...(optionalString(toolInput, "severity") === undefined
            ? {}
            : { severity: optionalString(toolInput, "severity") as "low" }),
          ...(optionalString(toolInput, "kind") === undefined
            ? {}
            : { kind: optionalString(toolInput, "kind") as "warning_hotspot" }),
          ...(cursor === undefined
            ? {}
            : {
                cursor: {
                  last_detected_at: inputString(cursor, "last_detected_at"),
                  improvement_id: inputString(cursor, "improvement_id")
                }
              })
        }
      );
      const hasMore = improvements.length > limit;
      const page = improvements.slice(0, limit);
      const last = page.at(-1);
      return {
        project_id: projectId,
        improvements: page.map((entry) => mapImprovement(record(entry), dashboardBaseUrl)),
        next_cursor:
          hasMore && last !== undefined
            ? encodeCursor({
                last_detected_at: last.last_detected_at,
                improvement_id: last.improvement_id
              })
            : null
      };
    },

    async get_improvement({ principal, input: toolInput }) {
      const projectId = inputString(toolInput, "projectId");
      const improvementId = inputString(toolInput, "improvementId");
      await requireProjectAccess(dependencies, principal, projectId);
      const improvement = await dependencies.improvementManagement.getImprovementForOrganization({
        organization_id: principal.organizationId,
        user_id: principal.userId,
        improvement_id: improvementId
      });
      if (improvement === null || improvement.project_id !== projectId) {
        throw new Error("openai_mcp_improvement_not_found");
      }
      const artifact = await readArtifact(
        dependencies,
        buildImprovementBundleObjectKey(projectId, improvementId)
      );
      return {
        improvement: mapImprovement(record(improvement), dashboardBaseUrl),
        evidence_summary: [improvement.summary],
        artifact_status: improvement.bundle_failure_reason !== null ? "failed" : artifact.status
      };
    },

    async get_improvement_bundle({ principal, input: toolInput }) {
      const projectId = inputString(toolInput, "projectId");
      const improvementId = inputString(toolInput, "improvementId");
      await requireProjectAccess(dependencies, principal, projectId);
      const improvement = await dependencies.improvementManagement.getImprovementForOrganization({
        organization_id: principal.organizationId,
        user_id: principal.userId,
        improvement_id: improvementId
      });
      if (improvement === null || improvement.project_id !== projectId) {
        throw new Error("openai_mcp_improvement_not_found");
      }
      const read = await readArtifact(
        dependencies,
        buildImprovementBundleObjectKey(projectId, improvementId)
      );
      const artifact = read.body === null ? null : improvementBundleArtifact(read.body);
      return artifactEnvelope({
        idKey: "improvement_id",
        id: improvementId,
        kind: "improvement_bundle",
        read,
        artifact,
        continuationUrl: buildDashboardUrl(
          dashboardBaseUrl,
          `/projects/${encodeURIComponent(projectId)}/improvements/${encodeURIComponent(improvementId)}`
        ),
        omittedFields: ["context", "evidence", "metadata", "links"]
      });
    },

    async list_health_checks({ principal, input: toolInput }) {
      const projectId = inputString(toolInput, "projectId");
      await requireProjectAccess(dependencies, principal, projectId);
      const limit = inputInteger(toolInput, "limit", 25);
      const cursor = decodeOffsetCursor(optionalString(toolInput, "cursor"));
      const checks =
        await dependencies.availabilityCheckManagement.listChecksForProjectInOrganization({
          organization_id: principal.organizationId,
          project_id: projectId,
          limit: Math.min(cursor.offset + limit + 1, 1_001)
        });
      if (checks === null) {
        throw new Error("openai_mcp_project_not_found");
      }
      const page = paginateOffset(checks, cursor.offset, limit);
      return {
        project_id: projectId,
        checks: page.page.map((check) => mapHealthCheck(record(check), dashboardBaseUrl)),
        next_cursor: page.nextCursor
      };
    },

    async get_health_check({ principal, input: toolInput }) {
      const projectId = inputString(toolInput, "projectId");
      const checkId = inputString(toolInput, "checkId");
      await requireProjectAccess(dependencies, principal, projectId);
      const check = await dependencies.availabilityCheckManagement.getCheckForProjectInOrganization(
        {
          organization_id: principal.organizationId,
          project_id: projectId,
          check_id: checkId
        }
      );
      if (check === null) {
        throw new Error("openai_mcp_health_check_not_found");
      }
      return { check: mapHealthCheck(record(check), dashboardBaseUrl) };
    },

    async list_health_check_results({ principal, input: toolInput }) {
      const projectId = inputString(toolInput, "projectId");
      const checkId = inputString(toolInput, "checkId");
      await requireProjectAccess(dependencies, principal, projectId);
      const limit = inputInteger(toolInput, "limit", 25);
      const lookbackHours = inputInteger(toolInput, "lookbackHours", 24);
      const cursor = decodeOffsetCursor(optionalString(toolInput, "cursor"));
      const results =
        await dependencies.availabilityCheckManagement.listResultsForCheckInOrganization({
          organization_id: principal.organizationId,
          project_id: projectId,
          check_id: checkId,
          limit: Math.min(cursor.offset + limit + 1, 1_001)
        });
      if (results === null) {
        throw new Error("openai_mcp_health_check_not_found");
      }
      const cutoff = Date.now() - lookbackHours * 60 * 60 * 1_000;
      const bounded = results.filter((result) => Date.parse(result.started_at) >= cutoff);
      const page = paginateOffset(bounded, cursor.offset, limit);
      return {
        project_id: projectId,
        check_id: checkId,
        lookback_hours: lookbackHours,
        results: page.page.map((result) => mapHealthResult(record(result))),
        next_cursor: page.nextCursor
      };
    },

    async list_health_check_daily_rollups({ principal, input: toolInput }) {
      const projectId = inputString(toolInput, "projectId");
      const checkId = inputString(toolInput, "checkId");
      await requireProjectAccess(dependencies, principal, projectId);
      const limit = inputInteger(toolInput, "limit", 30);
      const days = inputInteger(toolInput, "days", 30);
      const cursor = decodeOffsetCursor(optionalString(toolInput, "cursor"));
      const rollups =
        await dependencies.availabilityCheckManagement.listDailyRollupsForCheckInOrganization({
          organization_id: principal.organizationId,
          project_id: projectId,
          check_id: checkId,
          limit: Math.min(cursor.offset + limit + 1, 1_001)
        });
      if (rollups === null) {
        throw new Error("openai_mcp_health_check_not_found");
      }
      const cutoff = new Date();
      cutoff.setUTCDate(cutoff.getUTCDate() - days + 1);
      const cutoffDay = cutoff.toISOString().slice(0, 10);
      const bounded = rollups.filter((rollup) => rollup.day >= cutoffDay);
      const page = paginateOffset(bounded, cursor.offset, limit);
      return {
        project_id: projectId,
        check_id: checkId,
        days,
        rollups: page.page.map((rollup) => mapHealthRollup(record(rollup))),
        next_cursor: page.nextCursor
      };
    }
  };
}
