import type { Queryable, RetainedBundleOwnerReference } from "./types.js";

type RetainedBundleOwnerRow = {
  owner_type: RetainedBundleOwnerReference["owner_type"];
  project_id: string;
  incident_id: string | null;
  improvement_opportunity_id: string | null;
} & Record<string, unknown>;

export async function pruneRetainedBundleOwnersForProject(
  db: Queryable,
  input: {
    project_id: string;
    retained_bundle_limit: number;
  }
): Promise<RetainedBundleOwnerReference[]> {
  const result = await db.query<RetainedBundleOwnerRow>(
    `
      WITH organization_scope AS (
        SELECT organization_id
        FROM projects
        WHERE id = $1::uuid
        LIMIT 1
      ),
      bundle_owners AS (
        SELECT
          'incident'::text AS owner_type,
          i.project_id AS project_id,
          i.id AS incident_id,
          NULL::uuid AS improvement_opportunity_id,
          MAX(bg.created_at) AS latest_bundle_created_at
        FROM bundle_generations bg
        JOIN incidents i ON i.id = bg.incident_id
        JOIN projects p ON p.id = i.project_id
        JOIN organization_scope scope ON scope.organization_id = p.organization_id
        GROUP BY i.project_id, i.id

        UNION ALL

        SELECT
          'improvement'::text AS owner_type,
          io.project_id AS project_id,
          NULL::uuid AS incident_id,
          io.id AS improvement_opportunity_id,
          MAX(bg.created_at) AS latest_bundle_created_at
        FROM bundle_generations bg
        JOIN improvement_opportunities io ON io.id = bg.improvement_opportunity_id
        JOIN projects p ON p.id = io.project_id
        JOIN organization_scope scope ON scope.organization_id = p.organization_id
        GROUP BY io.project_id, io.id
      ),
      ranked_bundle_owners AS (
        SELECT
          owner_type,
          project_id,
          incident_id,
          improvement_opportunity_id,
          ROW_NUMBER() OVER (
            ORDER BY latest_bundle_created_at DESC, COALESCE(incident_id, improvement_opportunity_id) DESC
          ) AS bundle_rank
        FROM bundle_owners
      ),
      bundle_owners_to_delete AS (
        SELECT owner_type, project_id, incident_id, improvement_opportunity_id
        FROM ranked_bundle_owners
        WHERE bundle_rank > $2::int
      ),
      deleted_incidents AS (
        DELETE FROM incidents i
        USING bundle_owners_to_delete target
        WHERE i.id = target.incident_id
        RETURNING
          'incident'::text AS owner_type,
          target.project_id::text AS project_id,
          target.incident_id::text AS incident_id,
          NULL::text AS improvement_opportunity_id
      ),
      deleted_improvements AS (
        DELETE FROM improvement_opportunities io
        USING bundle_owners_to_delete target
        WHERE io.id = target.improvement_opportunity_id
        RETURNING
          'improvement'::text AS owner_type,
          target.project_id::text AS project_id,
          NULL::text AS incident_id,
          target.improvement_opportunity_id::text AS improvement_opportunity_id
      )
      SELECT owner_type, project_id, incident_id, improvement_opportunity_id
      FROM deleted_incidents
      UNION ALL
      SELECT owner_type, project_id, incident_id, improvement_opportunity_id
      FROM deleted_improvements
    `,
    [input.project_id, input.retained_bundle_limit]
  );

  return result.rows.map((row): RetainedBundleOwnerReference => (
    (() => {
      if (row.owner_type === "incident") {
        if (row.incident_id === null) {
          throw new Error("invalid_retained_bundle_owner_incident_id");
        }

        return {
          owner_type: "incident",
          project_id: row.project_id,
          incident_id: row.incident_id,
          improvement_opportunity_id: null
        };
      }

      if (row.improvement_opportunity_id === null) {
        throw new Error("invalid_retained_bundle_owner_improvement_id");
      }

      return {
        owner_type: "improvement",
        project_id: row.project_id,
        incident_id: null,
        improvement_opportunity_id: row.improvement_opportunity_id
      };
    })()
  ));
}
