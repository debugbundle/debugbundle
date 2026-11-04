import type { Queryable } from "./types.js";
import type { ProjectMergeProjectSnapshot } from "./project-merge-plan.js";

/** Bound bytes inside Postgres before transferring historical, unbounded names. */
export async function readMergeServiceInventory(
  db: Queryable,
  projectId: string,
  origins: string[]
): Promise<{
  complete: boolean;
  row_count: number;
  services: ProjectMergeProjectSnapshot["services"];
  reserved_names: string[];
  reserved_inputs: NonNullable<ProjectMergeProjectSnapshot["reserved_inputs"]>;
}> {
  const budget = await db.query<{ row_count: number; byte_count: string }>(
    `WITH names AS MATERIALIZED(
   (SELECT name FROM service_definitions WHERE project_id=$1::uuid LIMIT 1001)
   UNION ALL (SELECT name FROM service_project_aliases WHERE project_id=$1::uuid LIMIT 25001)
   UNION ALL (SELECT input_name FROM service_input_aliases WHERE origin_project_id=ANY($2::uuid[]) LIMIT 25001)
 ) SELECT count(*)::int AS row_count,COALESCE(sum(octet_length(name)::bigint*6+128),0)::text AS byte_count FROM names`,
    [projectId, origins]
  );
  const count = budget.rows[0]?.row_count ?? 25001,
    bytes = Number(budget.rows[0]?.byte_count ?? Infinity);
  if (count > 25000 || bytes > 4 * 1024 * 1024)
    return {
      complete: false,
      row_count: count,
      services: [],
      reserved_names: [],
      reserved_inputs: []
    };
  const services = await db.query<{
    service_definition_id: string;
    name: string;
    origin_project_id: string;
  }>(
    `SELECT id AS service_definition_id,name,origin_project_id FROM service_definitions WHERE project_id=$1::uuid ORDER BY id LIMIT 1001`,
    [projectId]
  );
  const aliases = await db.query<{ name: string }>(
    `SELECT name FROM service_project_aliases WHERE project_id=$1::uuid ORDER BY name COLLATE "C" LIMIT 25001`,
    [projectId]
  );
  const inputs = await db.query<{
    origin_project_id: string;
    name: string;
    service_definition_id: string;
  }>(
    `SELECT origin_project_id,input_name AS name,service_definition_id FROM service_input_aliases WHERE origin_project_id=ANY($1::uuid[]) ORDER BY origin_project_id,input_name COLLATE "C" LIMIT 25001`,
    [origins]
  );
  return {
    complete: true,
    row_count: count,
    services: services.rows,
    reserved_names: aliases.rows.map((a) => a.name),
    reserved_inputs: inputs.rows
  };
}
