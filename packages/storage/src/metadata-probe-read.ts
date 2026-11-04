import { ProjectProbeError } from "./project-probe-errors.js";
import { SDK_PROBE_DIRECTIVES_MAX_BYTES } from "../../shared-types/src/sdk-config-limits.js";
import type { ProbeActivationRecord, ProbeManagementStore, Queryable } from "./types.js";
import { normalizeOrganizationPlan } from "./metadata-shared.js";

export function createMetadataProbeReads(
  db: Queryable
): Pick<
  ProbeManagementStore,
  "listActiveProbesForProject" | "listActiveProbesForProjectInOrganization"
> {
  return {
    listActiveProbesForProject: (input: {
      project_id: string;
      scope_origin_ids?: string[];
      now: string;
    }) => listSdkProbeDirectives(db, input),
    async listActiveProbesForProjectInOrganization(input: {
      organization_id: string;
      project_id: string;
      now: string;
    }) {
      const project = await db.query<{ organization_plan: string }>(
        `SELECT COALESCE(o.plan,'free') AS organization_plan FROM projects p JOIN organizations o ON o.id=p.organization_id
         WHERE p.id=debugbundle_canonical_project($1::uuid) AND p.organization_id=$2 AND o.suspended_at IS NULL`,
        [input.project_id, input.organization_id]
      );
      if (!project.rows[0]) return null;
      const result = await db.query<ProbeActivationRecord & Record<string, unknown>>(
        `
        SELECT p.id AS activation_id,p.project_id AS origin_project_id,p.service_definition_id,
          COALESCE(p.scope_origin_ids,ARRAY[p.project_id]) AS scope_origin_ids,
          p.label_pattern,COALESCE(a.name,p.service) AS service,p.environment,
          p.expires_at::text,p.trigger_expires_at::text
        FROM probe_activations p LEFT JOIN service_project_aliases a
          ON a.project_id=$1 AND a.service_definition_id=p.service_definition_id AND a.is_current
        WHERE p.project_id=ANY(debugbundle_project_origins($1::uuid)) AND p.deactivated_at IS NULL
          AND p.expires_at>$2::timestamptz ORDER BY p.created_at DESC,p.id LIMIT 1001`,
        [input.project_id, input.now]
      );
      if (result.rows.length > 1000)
        throw new ProjectProbeError("probe_inventory_limit_exceeded", 503);
      return {
        organization_plan: normalizeOrganizationPlan(project.rows[0].organization_plan),
        activations: result.rows
      };
    }
  };
}

/** Project wildcard directives are safe only when they cover the whole credential.
 * Narrower original rules expand to retained service names in the SDK issuer's view. */
export async function listSdkProbeDirectives(
  db: Queryable,
  input: {
    project_id: string;
    scope_origin_ids?: string[];
    now: string;
  }
): Promise<ProbeActivationRecord[]> {
  const origins = input.scope_origin_ids ?? [input.project_id];
  if (origins.length > 1000) throw new Error("project_scope_limit_exceeded");
  const result = await db.query<ProbeActivationRecord & Record<string, unknown>>(
    `
    WITH active AS MATERIALIZED (
      SELECT p.*,COALESCE(p.scope_origin_ids,ARRAY[p.project_id]) AS origins
      FROM probe_activations p WHERE p.project_id=ANY(debugbundle_project_origins(debugbundle_canonical_project($1::uuid)))
        AND p.deactivated_at IS NULL AND p.expires_at>$2::timestamptz
        AND COALESCE(p.scope_origin_ids,ARRAY[p.project_id]) && $3::uuid[]
    ), names AS MATERIALIZED (
      SELECT a.service_definition_id,a.name FROM service_project_aliases a
        WHERE a.project_id=$1 AND NOT(cardinality($3::uuid[])=1 AND $1=ANY($3::uuid[]))
      UNION SELECT a.service_definition_id,a.input_name FROM service_input_aliases a
        WHERE a.origin_project_id=$1 AND cardinality($3::uuid[])=1 AND $1=ANY($3::uuid[])
    ), directives AS (
      SELECT p.id,p.label_pattern,'*' AS service,p.environment,p.expires_at,p.trigger_expires_at,p.created_at
        FROM active p WHERE p.service='*' AND $3::uuid[] <@ p.origins
      UNION
      SELECT p.id,p.label_pattern,n.name,p.environment,p.expires_at,p.trigger_expires_at,p.created_at
        FROM active p JOIN service_definitions d ON d.origin_project_id=ANY(p.origins)
        JOIN names n ON n.service_definition_id=d.id
        WHERE d.origin_project_id=ANY($3::uuid[]) AND
          ((p.service='*' AND NOT($3::uuid[] <@ p.origins)) OR p.service_definition_id=d.id)
    )
    SELECT id AS activation_id,label_pattern,service,environment,expires_at::text,trigger_expires_at::text
      FROM directives ORDER BY created_at DESC,id,service COLLATE "C" LIMIT 5001`,
    [input.project_id, input.now, origins]
  );
  if (
    result.rows.length > 5000 ||
    Buffer.byteLength(JSON.stringify(result.rows)) > SDK_PROBE_DIRECTIVES_MAX_BYTES
  )
    throw new ProjectProbeError("probe_directive_limit_exceeded", 503);
  return result.rows;
}
