import { compareCanonicalText } from "../../shared-types/src/canonical-text-order.js";
import { ServiceDefinitionNameSchema } from "../../shared-types/src/project-services.js";
import { isSafeProjectMetadataText } from "./project-service-metadata-privacy.js";
import { createHash } from "node:crypto";
import {
  ProjectMergeRequestSchema,
  type ProjectMergeRequest
} from "../../shared-types/src/project-consolidation.js";
export { ProjectMergeRequestSchema } from "../../shared-types/src/project-consolidation.js";
export type {
  ProjectMergeRequest,
  ProjectServiceMapping
} from "../../shared-types/src/project-consolidation.js";

export interface ProjectMergeProjectSnapshot {
  project_id: string;
  project_name?: string;
  organization_id: string;
  owner_user_id: string;
  canonical_project_id: string;
  access_revision: string;
  settings_revision: string;
  settings_categories?: Record<string, string>;
  configuration_revision: string;
  pending_invites: boolean;
  active_operation_id: string | null;
  origin_ids: string[];
  services: Array<{ service_definition_id: string; name: string; origin_project_id?: string }>;
  reserved_names?: string[];
  reserved_inputs?: Array<{
    origin_project_id: string;
    name: string;
    service_definition_id: string;
  }>;
  row_count: number;
}

/** Storage-owned, complete snapshots only; never accept this structure from a client. */
export interface ProjectMergeSnapshot {
  runtime_contract: string;
  inventory_complete: boolean;
  inventory_blockers?: ProjectMergeBlocker[];
  projects: ProjectMergeProjectSnapshot[];
  resource_limits: Array<{ resource: string; count: number; limit: number }>;
}

export interface ProjectMergeBlocker {
  code: string;
  project_id: string | null;
  resource: string | null;
}

export interface ProjectMergePlan extends ProjectMergeRequest {
  plan_version: 1;
  runtime_contract: string;
  plan_digest: string;
  ready: boolean;
  origin_ids: string[];
  observed_rows: number;
  blockers: ProjectMergeBlocker[];
  suggested_service_mappings: ProjectMergeRequest["service_mappings"];
  resource_limits: ProjectMergeSnapshot["resource_limits"];
}

// This is an admission ceiling, not a promise of throughput. Runtime qualification
// must enforce the lock/statement deadline as well as this bounded row count.
export const PROJECT_MERGE_MAX_ROWS = 25_000;

export function projectMergeRevision(value: unknown): string {
  const stable = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(stable);
    if (item !== null && typeof item === "object") {
      return Object.fromEntries(
        Object.entries(item)
          .sort(([a], [b]) => compareCanonicalText(a, b))
          .map(([key, entry]) => [key, stable(entry)])
      );
    }
    return item;
  };
  return createHash("sha256")
    .update(JSON.stringify(stable(value)))
    .digest("hex");
}

/** Pure preview: no credentials, persistence, policy reconciliation or inferred history. */
export function buildProjectMergePlan(
  input: unknown,
  snapshot: ProjectMergeSnapshot,
  actorUserId: string
): ProjectMergePlan {
  const parsed = ProjectMergeRequestSchema.safeParse(input);
  if (!parsed.success) throw new Error("invalid_merge_request");
  const request = parsed.data;
  if (request.service_mappings.some((mapping) => !isSafeProjectMetadataText(mapping.name)))
    throw new Error("invalid_merge_request");
  const sourceIds = [...request.source_project_ids].sort();
  const selectedIds = [request.target_project_id, ...sourceIds];
  const blockers: ProjectMergeBlocker[] = [];
  const block = (
    code: string,
    projectId: string | null = null,
    resource: string | null = null
  ): void => {
    if (
      !blockers.some(
        (b) => b.code === code && b.project_id === projectId && b.resource === resource
      )
    ) {
      blockers.push({ code, project_id: projectId, resource });
    }
  };
  if (!snapshot.inventory_complete) block("inventory_incomplete");
  for (const blocker of snapshot.inventory_blockers ?? [])
    block(blocker.code, blocker.project_id, blocker.resource);
  const projects: ProjectMergeProjectSnapshot[] = [];
  for (const projectId of selectedIds) {
    const project = snapshot.projects.find((p) => p.project_id === projectId);
    if (!project || project.owner_user_id !== actorUserId) block("project_not_found", projectId);
    else projects.push(project);
  }
  const target = projects.find((p) => p.project_id === request.target_project_id);
  for (const project of projects) {
    if (project.canonical_project_id !== project.project_id)
      block("project_consolidated", project.project_id);
    if (project.pending_invites) block("pending_invites", project.project_id);
    if (project.active_operation_id) block("operation_conflict", project.project_id);
    if (target && project.organization_id !== target.organization_id)
      block("account_conflict", project.project_id);
    if (target && project.access_revision !== target.access_revision)
      block("access_conflict", project.project_id);
    if (target && project.settings_revision !== target.settings_revision) {
      const categories = Object.keys(project.settings_categories ?? {}).filter(
        (category) =>
          project.settings_categories?.[category] !== target.settings_categories?.[category]
      );
      block(
        "settings_conflict",
        project.project_id,
        categories.length ? categories.sort().join(",") : null
      );
    }
  }
  const origins = projects.flatMap((p) => p.origin_ids);
  if (origins.length > 1000) block("origin_limit_exceeded");
  if (projects.reduce((total, p) => total + p.services.length, 0) > 1000)
    block("service_limit_exceeded");
  if (new Set(origins).size !== origins.length) block("origin_conflict");
  const mappings = [...request.service_mappings].sort(
    (a, b) =>
      compareCanonicalText(a.source_project_id, b.source_project_id) ||
      compareCanonicalText(a.service_definition_id, b.service_definition_id)
  );
  const names = new Set([
    ...(target?.services.map((s) => s.name) ?? []),
    ...(target?.reserved_names ?? [])
  ]);
  const mappedServices = new Set<string>();
  for (const mapping of mappings) {
    const source = projects.find(
      (p) => p.project_id === mapping.source_project_id && sourceIds.includes(p.project_id)
    );
    const service = source?.services.find(
      (s) => s.service_definition_id === mapping.service_definition_id
    );
    if (
      source?.reserved_inputs?.some(
        (alias) =>
          alias.origin_project_id === service?.origin_project_id &&
          alias.name === mapping.name &&
          alias.service_definition_id !== service?.service_definition_id
      )
    )
      block("service_name_reserved", mapping.source_project_id, mapping.name);
    if (!service) block("invalid_service_mapping", mapping.source_project_id);
    const key = `${mapping.source_project_id}:${mapping.service_definition_id}`;
    if (mappedServices.has(key)) block("duplicate_service_mapping", mapping.source_project_id);
    if (names.has(mapping.name)) block("service_name_conflict", mapping.source_project_id);
    names.add(mapping.name);
    mappedServices.add(key);
  }
  for (const source of projects.filter((p) => sourceIds.includes(p.project_id))) {
    for (const service of source.services) {
      if (!mappedServices.has(`${source.project_id}:${service.service_definition_id}`)) {
        block("service_mapping_required", source.project_id);
      }
    }
  }
  const observedRows = projects.reduce((total, p) => total + p.row_count, 0);
  if (
    !Number.isSafeInteger(observedRows) ||
    observedRows < 0 ||
    observedRows > PROJECT_MERGE_MAX_ROWS
  ) {
    block("supported_size_exceeded");
  }
  for (const limit of snapshot.resource_limits) {
    if (limit.count > limit.limit) block("resource_limit", null, limit.resource);
  }
  blockers.sort(
    (a, b) =>
      compareCanonicalText(a.code, b.code) ||
      compareCanonicalText(a.project_id ?? "", b.project_id ?? "") ||
      compareCanonicalText(a.resource ?? "", b.resource ?? "")
  );
  const canonicalRequest = {
    ...request,
    source_project_ids: sourceIds,
    service_mappings: mappings
  };
  const suggestedNames = new Set([
    ...(target?.services.map((service) => service.name) ?? []),
    ...(target?.reserved_names ?? [])
  ]);
  const suggestions: ProjectMergeRequest["service_mappings"] = [];
  for (const source of [...projects]
    .filter((project) => sourceIds.includes(project.project_id))
    .sort((a, b) => compareCanonicalText(a.project_id, b.project_id))) {
    for (const service of [...source.services].sort((a, b) =>
      compareCanonicalText(a.service_definition_id, b.service_definition_id)
    )) {
      const suggested =
        source.services.length === 1 &&
        source.project_name &&
        isSafeProjectMetadataText(source.project_name) &&
        ServiceDefinitionNameSchema.safeParse(source.project_name).success
          ? source.project_name
          : service.name;
      const base =
        isSafeProjectMetadataText(suggested) &&
        ServiceDefinitionNameSchema.safeParse(suggested.slice(0, 90)).success
          ? suggested.slice(0, 90)
          : `Service ${service.service_definition_id.slice(0, 8)}`;
      let name = base;
      let suffix = 1;
      while (
        suggestedNames.has(name) ||
        source.reserved_inputs?.some(
          (alias) =>
            alias.origin_project_id === service.origin_project_id &&
            alias.name === name &&
            alias.service_definition_id !== service.service_definition_id
        )
      ) {
        name = `${base} (${source.project_id.slice(0, 8)}${suffix === 1 ? "" : `-${suffix}`})`;
        suffix += 1;
      }
      suggestedNames.add(name);
      suggestions.push({
        source_project_id: source.project_id,
        service_definition_id: service.service_definition_id,
        name
      });
    }
  }
  return {
    ...canonicalRequest,
    plan_version: 1,
    runtime_contract: snapshot.runtime_contract,
    plan_digest: projectMergeRevision({
      request: canonicalRequest,
      runtime_contract: snapshot.runtime_contract,
      projects: projects.map((project) => ({
        project_id: project.project_id,
        organization_id: project.organization_id,
        owner_user_id: project.owner_user_id,
        canonical_project_id: project.canonical_project_id,
        access_revision: project.access_revision,
        settings_revision: project.settings_revision,
        configuration_revision: project.configuration_revision,
        pending_invites: project.pending_invites,
        active_operation_id: project.active_operation_id,
        origin_ids: [...project.origin_ids].sort(),
        services: [...project.services].sort((a, b) =>
          compareCanonicalText(a.service_definition_id, b.service_definition_id)
        )
      }))
    }),
    ready: blockers.length === 0,
    origin_ids: [...new Set(origins)].sort(),
    observed_rows: observedRows,
    blockers,
    suggested_service_mappings: suggestions,
    resource_limits: [...snapshot.resource_limits].sort((a, b) =>
      compareCanonicalText(a.resource, b.resource)
    )
  };
}
