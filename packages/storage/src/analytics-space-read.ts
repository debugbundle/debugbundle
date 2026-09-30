import { getTierCapabilities, type AnalyticsSpaceRecord } from "../../shared-types/src/index.js";
import type { Queryable } from "./types.js";

export type AnalyticsSpaceRow = Omit<AnalyticsSpaceRecord, "revision" | "created_at"> & {
  revision: string | number;
  created_at: string | Date;
};
export function mapAnalyticsSpace(row: AnalyticsSpaceRow): AnalyticsSpaceRecord {
  return {
    id: row.id,
    organization_id: row.organization_id,
    display_name: row.display_name,
    mode: row.mode,
    project_ids: row.project_ids,
    revision: Number(row.revision),
    created_at: new Date(row.created_at).toISOString(),
    archived: row.archived
  };
}

/** One query authorizes the complete current membership; it never trims unauthorized sources. */
export async function readAnalyticsSpaces(
  db: Queryable,
  actorUserId: string,
  filter: { spaceId: string } | { organizationId: string }
): Promise<AnalyticsSpaceRecord[]> {
  const bySpace = "spaceId" in filter;
  const result = await db.query<
    AnalyticsSpaceRow & { organization_plan: string; owned_only: boolean } & Record<string, unknown>
  >(
    `
    SELECT s.id,s.organization_id,s.display_name,s.mode,s.revision,s.created_at,false AS archived,
      array_agg(sp.project_id ORDER BY sp.project_id) AS project_ids,
      org.plan AS organization_plan,bool_and(p.owner_user_id=$2::uuid) AS owned_only
    FROM analytics_spaces s
    JOIN organizations org ON org.id=s.organization_id AND org.suspended_at IS NULL
    JOIN organization_members om ON om.organization_id=s.organization_id AND om.user_id=$2::uuid AND om.suspended_at IS NULL
    JOIN analytics_space_projects sp ON sp.space_id=s.id
    JOIN projects p ON p.id=sp.project_id AND p.organization_id=s.organization_id
    LEFT JOIN project_members pm ON pm.project_id=p.id AND pm.user_id=$2::uuid
    WHERE ${bySpace ? "s.id" : "s.organization_id"}=$1::uuid AND s.archived_at IS NULL
    GROUP BY s.id,org.plan
    HAVING bool_and(COALESCE(p.owner_user_id=$2::uuid,false) OR pm.user_id IS NOT NULL)
      AND count(*)=(SELECT count(*) FROM analytics_space_projects members WHERE members.space_id=s.id)
    ORDER BY s.id LIMIT 20`,
    [bySpace ? filter.spaceId : filter.organizationId, actorUserId]
  );
  return result.rows
    .filter((row) => row.owned_only || getTierCapabilities(row.organization_plan).shared_dashboards)
    .map(mapAnalyticsSpace);
}
