import { getTierCapabilities } from "../../shared-types/src/index.js";
import type { Queryable } from "./types.js";

/** Same organization -> project -> membership lock order as analytics space management. */
export async function lockAnalyticsWriterProject(
  db: Queryable,
  projectId: string,
  actorUserId: string
): Promise<{ organizationId: string } | null> {
  const located = (
    await db.query<{ organization_id: string }>(
      "SELECT organization_id FROM projects WHERE id=$1::uuid",
      [projectId]
    )
  ).rows[0];
  if (located === undefined) return null;
  const organization = (
    await db.query<{ plan: string }>(
      "SELECT plan FROM organizations WHERE id=$1::uuid AND suspended_at IS NULL FOR UPDATE",
      [located.organization_id]
    )
  ).rows[0];
  if (organization === undefined) return null;
  const project = (
    await db.query<{ owner_user_id: string }>(
      "SELECT owner_user_id FROM projects WHERE id=$1::uuid AND organization_id=$2::uuid FOR UPDATE",
      [projectId, located.organization_id]
    )
  ).rows[0];
  if (project === undefined) return null;
  const member = (
    await db.query<{ suspended_at: Date | null }>(
      "SELECT suspended_at FROM organization_members WHERE organization_id=$1::uuid AND user_id=$2::uuid FOR SHARE",
      [located.organization_id, actorUserId]
    )
  ).rows[0];
  if (member !== undefined && member.suspended_at !== null) return null;
  if (project.owner_user_id === actorUserId)
    return member === undefined ? null : { organizationId: located.organization_id };
  if (!getTierCapabilities(organization.plan).shared_dashboards) return null;
  const collaborator = (
    await db.query<{ role: string }>(
      "SELECT role FROM project_members WHERE project_id=$1::uuid AND user_id=$2::uuid FOR SHARE",
      [projectId, actorUserId]
    )
  ).rows[0];
  return collaborator?.role === "admin" ? { organizationId: located.organization_id } : null;
}
