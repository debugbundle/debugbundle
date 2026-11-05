import { ALERT_SCOPE_SERVICE_LIMIT } from "../../shared-types/src/alert-scope.js";

/** Both expressions are repository-owned SQL. Never disclose origins outside a
 * retained read view, or reinterpret a frozen origin set as the current closure. */
export function alertScopeProjectionSql(rule: string, view: string): string {
  const origins = `COALESCE(${rule}.scope_origin_ids,ARRAY[${rule}.project_id])`;
  const name = (
    definition: string
  ): string => `COALESCE((SELECT a.name FROM service_project_aliases a
    WHERE a.project_id=${view}::uuid AND a.service_definition_id=${definition}.id AND a.is_current),${definition}.name)`;
  return `CASE WHEN ${origins}<@debugbundle_project_origins(${view}::uuid) THEN (
    WITH eligible AS MATERIALIZED (
      SELECT d.id AS service_definition_id,${name("d")} AS name
      FROM service_definitions d WHERE d.origin_project_id=ANY(${origins})
    ), visible AS (
      SELECT * FROM eligible ORDER BY name COLLATE "C",service_definition_id LIMIT ${ALERT_SCOPE_SERVICE_LIMIT}
    )
    SELECT jsonb_build_object(
      'origin_project_ids',to_jsonb(${origins}),
      'covers_current_project',${origins}@>debugbundle_project_origins(${view}::uuid),
      'services',COALESCE((SELECT jsonb_agg(to_jsonb(v) ORDER BY v.name COLLATE "C",v.service_definition_id) FROM visible v),'[]'::jsonb),
      'service_count',(SELECT count(*) FROM eligible),
      'service_filter',(SELECT jsonb_build_object('service_id',s.id,'service_definition_id',d.id,
          'name',${name("d")},'environment',s.environment)
        FROM services s JOIN service_definitions d ON d.id=s.service_definition_id
        WHERE s.id=${rule}.service_id AND s.project_id=ANY(${origins}))
    )
  ) ELSE NULL END`;
}
