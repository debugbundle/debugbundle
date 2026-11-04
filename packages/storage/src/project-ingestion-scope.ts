import type { Queryable } from "./types.js";

export interface CredentialServiceScope {
  project_id: string;
  scope_origin_ids: string[];
  service_names: string[];
}
export interface CredentialServiceResolution {
  name: string;
  origin_project_id: string | null;
  service_aliases?: string[];
}

/** Pure read. Resolve names in the issuing project's retained view, then intersect
 * the immutable credential snapshot before any receipt, object or queue mutation. */
export async function resolveCredentialServiceScopes(
  db: Queryable,
  input: CredentialServiceScope
): Promise<CredentialServiceResolution[]> {
  const names = [...new Set(input.service_names)];
  if (names.length > 1000 || input.scope_origin_ids.length > 1000)
    throw new Error("project_scope_limit_exceeded");
  const result = await db.query<{
    name: string;
    origin_project_id: string;
    service_aliases: string[];
  }>(
    `SELECT a.name,d.origin_project_id,
       ARRAY(SELECT input_name FROM service_input_aliases WHERE service_definition_id=d.id ORDER BY input_name) AS service_aliases
     FROM (
       SELECT name,service_definition_id FROM service_project_aliases WHERE project_id=$1 AND NOT($3::uuid[]=ARRAY[$1::uuid])
       UNION ALL SELECT input_name AS name,service_definition_id FROM service_input_aliases
         WHERE origin_project_id=$1 AND $3::uuid[]=ARRAY[$1::uuid]
     ) a
     JOIN service_definitions d ON d.id=a.service_definition_id
     WHERE a.name=ANY($2::text[])`,
    [input.project_id, names, input.scope_origin_ids]
  );
  const known = new Map(result.rows.map((row) => [row.name, row]));
  return names.map((name) => {
    const service = known.get(name);
    const origin = service?.origin_project_id ?? input.project_id;
    return {
      name,
      origin_project_id: input.scope_origin_ids.includes(origin) ? origin : null,
      service_aliases: service?.service_aliases ?? [name]
    };
  });
}
