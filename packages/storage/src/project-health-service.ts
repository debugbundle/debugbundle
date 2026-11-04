import type { Queryable } from "./types.js";

/** A check's accepted runtime/results namespace is immutable. Canonical names
 * select its original service, without moving history to a different origin. */
export async function resolveHealthService(
  db: Queryable,
  input: {
    view_project_id: string;
    service_name: string | null;
    origin_project_id?: string;
  }
): Promise<
  | { origin_project_id: string; service_name: string | null; service_definition_id: string | null }
  | "service_scope_conflict"
> {
  const origin = input.origin_project_id ?? input.view_project_id;
  if (input.service_name === null)
    return { origin_project_id: origin, service_name: null, service_definition_id: null };
  const found = await db.query<{
    id: string;
    origin_project_id: string;
    input_name: string;
    project_id: string;
  }>(
    `
    SELECT d.id,d.project_id,d.origin_project_id,d.input_name FROM service_project_aliases a JOIN service_definitions d ON d.id=a.service_definition_id
    WHERE a.project_id=$1 AND a.name=$2`,
    [input.view_project_id, input.service_name]
  );
  let definition = found.rows[0];
  if (!definition) {
    // The outer SELECT snapshot cannot read rows inserted by a volatile
    // function in its WHERE clause. Observe first, then read a new snapshot.
    const observed = await db.query<{ id: string }>(
      "SELECT debugbundle_observe_service($1,$2) AS id",
      [origin, input.service_name]
    );
    definition = (
      await db.query<{
        id: string;
        origin_project_id: string;
        input_name: string;
        project_id: string;
      }>(
        `
      SELECT id,project_id,origin_project_id,input_name FROM service_definitions WHERE id=$1`,
        [observed.rows[0]?.id]
      )
    ).rows[0];
  }
  if (!definition) throw new Error("health_service_resolution_failed");
  if (definition.project_id !== input.view_project_id.toLowerCase())
    return "service_scope_conflict";
  if (input.origin_project_id !== undefined && definition.origin_project_id !== origin)
    return "service_scope_conflict";
  return {
    origin_project_id: definition.origin_project_id,
    service_name: definition.input_name,
    service_definition_id: definition.id
  };
}
