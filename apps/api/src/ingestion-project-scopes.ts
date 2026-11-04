import type { ProjectTokenContext } from "../../../packages/auth/src/index.js";
import type { CredentialServiceResolution } from "../../../packages/storage/src/project-ingestion-scope.js";
import type { ApiDependencies } from "./api-types.js";

export async function resolveIngestionProjectScopes(
  dependencies: ApiDependencies,
  project: ProjectTokenContext,
  names: string[]
): Promise<Map<string, CredentialServiceResolution>> {
  const origins = project.scope_origin_ids ?? [project.project_id];
  const resolve = dependencies.ingestionMetadata.resolveCredentialServiceScopes;
  if (resolve === undefined) {
    if (origins.length !== 1 || origins[0] !== project.project_id)
      throw new Error("service_scope_unavailable");
    return new Map(
      names.map((name) => [
        name,
        { name, origin_project_id: project.project_id, service_aliases: [name] }
      ])
    );
  }
  const result = await resolve({
    project_id: project.project_id,
    scope_origin_ids: origins,
    service_names: names
  });
  const scopes = new Map(
    result.map((service) => [
      service.name,
      {
        ...service,
        origin_project_id:
          service.origin_project_id !== null && origins.includes(service.origin_project_id)
            ? service.origin_project_id
            : null
      }
    ])
  );
  // An incomplete adapter must never silently route missing entries to the target.
  if (names.some((name) => !scopes.has(name))) throw new Error("service_scope_unavailable");
  return scopes;
}
