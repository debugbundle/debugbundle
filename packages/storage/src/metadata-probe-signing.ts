import { ProjectProbeError } from "./project-probe-errors.js";
import { isSafeProjectMetadataText } from "./project-service-metadata-privacy.js";
import type { Queryable } from "./types.js";

interface ServiceIdentity extends Record<string, unknown> {
  id: string;
  origin_project_id: string;
  input_name: string;
}

/** Select a deployed credential without reading its plaintext. Legacy defaults
 * remain sufficient until an operator explicitly adopts a newer credential. */
export async function resolveProbeSigningContext(
  db: Queryable,
  input: {
    root_id: string;
    origin_id: string;
    activation_origins: string[];
    definition?: ServiceIdentity;
    sdk_project_id?: string;
    sdk_token_id?: string;
    sdk_service?: string;
  }
): Promise<{ project_id: string; origins: string[]; service: string }> {
  let issuer = input.sdk_project_id?.toLowerCase() ?? input.origin_id;
  let origins = [issuer];
  if (input.sdk_token_id !== undefined) {
    const token = (
      await db.query<{ project_id: string; origins: string[] }>(
        `
      SELECT t.project_id,COALESCE(t.scope_origin_ids,ARRAY[t.project_id]) AS origins
      FROM project_tokens t WHERE t.id=$1 AND t.revoked_at IS NULL AND (t.expires_at IS NULL OR t.expires_at>now())
        AND debugbundle_canonical_project(t.project_id)=$2`,
        [input.sdk_token_id, input.root_id]
      )
    ).rows[0];
    if (!token || (input.sdk_project_id !== undefined && issuer !== token.project_id))
      throw new ProjectProbeError("probe_sdk_context_invalid", 400);
    issuer = token.project_id;
    origins = token.origins;
  } else if (input.sdk_project_id !== undefined) {
    const project = (
      await db.query<{ origins: string[] }>(
        `
      SELECT debugbundle_project_origins(id) AS origins FROM projects
      WHERE id=$1 AND debugbundle_canonical_project(id)=$2`,
        [issuer, input.root_id]
      )
    ).rows[0];
    if (!project) throw new ProjectProbeError("probe_sdk_context_invalid", 400);
    origins = project.origins;
  }
  if (
    !origins.length ||
    origins.length > 1000 ||
    !origins.some((id) => input.activation_origins.includes(id))
  )
    throw new ProjectProbeError("probe_scope_invalid", 400);
  if (input.definition && !origins.includes(input.definition.origin_project_id))
    throw new ProjectProbeError("probe_scope_invalid", 400);
  if (!input.definition && !origins.every((id) => input.activation_origins.includes(id)))
    throw new ProjectProbeError("probe_scope_requires_service", 409);
  const legacy = origins.length === 1 && origins[0] === issuer;
  let service =
    input.sdk_service ??
    (input.definition && legacy && issuer === input.origin_id ? input.definition.input_name : "*");
  if (input.definition && input.sdk_service === undefined && service === "*") {
    const alias = (
      await db.query<{ name: string }>(
        `
      SELECT name FROM service_project_aliases WHERE project_id=$1 AND service_definition_id=$2 AND is_current`,
        [issuer, input.definition.id]
      )
    ).rows[0];
    if (!alias) throw new ProjectProbeError("probe_sdk_context_invalid", 400);
    service = alias.name;
  }
  if (!isSafeProjectMetadataText(service))
    throw new ProjectProbeError("probe_sdk_context_invalid", 400);
  if (service !== "*") {
    const match = (
      await db.query<ServiceIdentity>(
        `
      SELECT d.id,d.origin_project_id,d.input_name FROM service_definitions d JOIN (
        SELECT service_definition_id FROM service_input_aliases WHERE origin_project_id=$1 AND input_name=$2 AND $3
        UNION ALL SELECT service_definition_id FROM service_project_aliases WHERE project_id=$1 AND name=$2 AND NOT $3
      ) a ON a.service_definition_id=d.id`,
        [issuer, service, legacy]
      )
    ).rows[0];
    if (
      !match ||
      !origins.includes(match.origin_project_id) ||
      !input.activation_origins.includes(match.origin_project_id) ||
      (input.definition && match.id !== input.definition.id)
    )
      throw new ProjectProbeError("probe_sdk_context_invalid", 400);
  } else if (input.definition) throw new ProjectProbeError("probe_sdk_context_invalid", 400);
  return { project_id: issuer, origins, service };
}
