import { buildBillableIncidentEventsPredicateSql } from "./helpers.js";
import type {
  PostgresMetadataStore,
  ProjectRecord,
  Queryable,
  ServiceRetrievalRecord
} from "./types.js";
import {
  buildProjectMetricsWindow,
  buildProjectDayWindow,
  buildProjectMetricsJsonSql,
  alertDeliveriesTableExists,
  alertEmailDigestsTableExists,
  buildAlertDeliveriesCountSelect,
  mapProjectRow,
  applySharedAccessSuspension
} from "./metadata-project-shared.js";

export function createMetadataProjectList(
  db: Queryable
): Pick<
  PostgresMetadataStore,
  "listProjectsForUser" | "listProjectsForOrganization" | "listServicesForOrganization"
> {
  return {
    async listProjectsForUser(input): Promise<ProjectRecord[]> {
      const usageWindow = buildProjectMetricsWindow(input.now);
      const dayWindow = buildProjectDayWindow(input.now);
      const hasAlertDeliveries = await alertDeliveriesTableExists(db);
      const hasAlertEmailDigests = await alertEmailDigestsTableExists(db);
      const organizationPlanSql = "COALESCE(o.plan, 'free')";
      const billableIncidentEventsPredicate = buildBillableIncidentEventsPredicateSql({
        planSql: organizationPlanSql,
        eventClassSql: "ie.event_class"
      });
      const alertDeliveriesSelect = buildAlertDeliveriesCountSelect({
        hasAlertDeliveries,
        hasAlertEmailDigests
      });
      const result = await db.query<ProjectRecord & Record<string, unknown>>(
        `
          SELECT
            p.id AS project_id,
            canonical_project.id AS canonical_project_id,
            p.organization_id,
            canonical_project.owner_user_id,
            owner_user.email AS owner_email,
            CASE
              WHEN canonical_project.owner_user_id = $1::uuid THEN 'owned'
              ELSE 'shared'
            END AS relationship,
            CASE
              WHEN canonical_project.owner_user_id <> $1::uuid THEN 'shared_with_you'
              WHEN EXISTS (
                SELECT 1
                FROM project_members shared_members
                WHERE shared_members.project_id = canonical_project.id
              )
                OR EXISTS (
                  SELECT 1
                  FROM project_invites pending_invites
                  WHERE pending_invites.project_id = canonical_project.id
                    AND pending_invites.accepted_at IS NULL
                    AND pending_invites.canceled_at IS NULL
                    AND pending_invites.expires_at > now()
                )
                THEN 'shared_by_you'
              ELSE 'private'
            END AS sharing_state,
            CASE
              WHEN canonical_project.owner_user_id = $1::uuid THEN 'owner'
              ELSE pm.role
            END AS effective_role,
            p.name,
            p.slug,
            p.environment_default,
            p.color_tag,
            ${organizationPlanSql} AS organization_plan,
            ${buildProjectMetricsJsonSql({
              projectIdSql: "p.id",
              monthStartsAtSql: "$2",
              monthEndsAtSql: "$3",
              dayStartsAtSql: "$4",
              dayEndsAtSql: "$5",
              billableIncidentEventsPredicate,
              alertDeliveriesSelect
            })} AS metrics,
            p.created_at::text AS created_at,
            p.updated_at::text AS updated_at
          FROM projects p
          JOIN projects canonical_project ON canonical_project.id=debugbundle_canonical_project(p.id)
          JOIN organizations o ON o.id = canonical_project.organization_id
          JOIN users owner_user ON owner_user.id = canonical_project.owner_user_id
          LEFT JOIN project_members pm
            ON pm.project_id = canonical_project.id
           AND pm.user_id = $1::uuid
          WHERE (canonical_project.owner_user_id = $1::uuid OR pm.user_id IS NOT NULL)
            AND ${input.project_id === undefined ? "NOT EXISTS(SELECT 1 FROM project_legacy_bindings b WHERE b.legacy_project_id=p.id)" : "p.id=$7::uuid"}
          ORDER BY
            CASE WHEN canonical_project.owner_user_id = $1::uuid THEN 0 ELSE 1 END,
            p.created_at DESC,
            p.id DESC
          LIMIT $6
        `,
        [
          input.user_id,
          usageWindow.starts_at,
          usageWindow.ends_at,
          dayWindow.starts_at,
          dayWindow.ends_at,
          input.limit,
          ...(input.project_id === undefined ? [] : [input.project_id])
        ]
      );

      return result.rows.map(mapProjectRow).map(applySharedAccessSuspension);
    },

    async listProjectsForOrganization(input): Promise<ProjectRecord[]> {
      const usageWindow = buildProjectMetricsWindow(input.now);
      const dayWindow = buildProjectDayWindow(input.now);
      const hasAlertDeliveries = await alertDeliveriesTableExists(db);
      const hasAlertEmailDigests = await alertEmailDigestsTableExists(db);
      const organizationPlanSql = "COALESCE(o.plan, 'free')";
      const billableIncidentEventsPredicate = buildBillableIncidentEventsPredicateSql({
        planSql: organizationPlanSql,
        eventClassSql: "ie.event_class"
      });
      const alertDeliveriesSelect = buildAlertDeliveriesCountSelect({
        hasAlertDeliveries,
        hasAlertEmailDigests
      });
      const result = await db.query<ProjectRecord & Record<string, unknown>>(
        `
          SELECT
            p.id AS project_id,
            p.organization_id,
            p.owner_user_id,
            owner_user.email AS owner_email,
            'owned' AS relationship,
            CASE
              WHEN EXISTS (
                SELECT 1
                FROM project_members shared_members
                WHERE shared_members.project_id = p.id
              )
                OR EXISTS (
                  SELECT 1
                  FROM project_invites pending_invites
                  WHERE pending_invites.project_id = p.id
                    AND pending_invites.accepted_at IS NULL
                    AND pending_invites.canceled_at IS NULL
                    AND pending_invites.expires_at > now()
                )
                THEN 'shared_by_you'
              ELSE 'private'
            END AS sharing_state,
            'owner' AS effective_role,
            p.name,
            p.slug,
            p.environment_default,
            p.color_tag,
            ${organizationPlanSql} AS organization_plan,
            ${buildProjectMetricsJsonSql({
              projectIdSql: "p.id",
              monthStartsAtSql: "$2",
              monthEndsAtSql: "$3",
              dayStartsAtSql: "$4",
              dayEndsAtSql: "$5",
              billableIncidentEventsPredicate,
              alertDeliveriesSelect
            })} AS metrics,
            p.created_at::text AS created_at,
            p.updated_at::text AS updated_at
          FROM projects p
          JOIN organizations o ON o.id = p.organization_id
          JOIN users owner_user ON owner_user.id = p.owner_user_id
          WHERE p.organization_id = $1
            AND NOT EXISTS(SELECT 1 FROM project_legacy_bindings b WHERE b.legacy_project_id=p.id)
          ORDER BY p.created_at DESC, p.id DESC
          LIMIT $6
        `,
        [
          input.organization_id,
          usageWindow.starts_at,
          usageWindow.ends_at,
          dayWindow.starts_at,
          dayWindow.ends_at,
          input.limit
        ]
      );

      return result.rows.map(mapProjectRow);
    },

    async listServicesForOrganization(input): Promise<ServiceRetrievalRecord[] | null> {
      const scopedProject = await db.query<{ id: string }>(
        `
          SELECT id
          FROM projects
          WHERE id = debugbundle_canonical_project($1::uuid)
            AND (
              (
                $3::uuid IS NULL
                AND organization_id = $2
              )
              OR (
                $3::uuid IS NOT NULL
                AND (
                  owner_user_id = $3::uuid
                  OR EXISTS (
                    SELECT 1
                    FROM project_members pm
                    WHERE pm.project_id = projects.id
                      AND pm.user_id = $3::uuid
                  )
                )
              )
            )
          LIMIT 1
        `,
        [input.project_id, input.organization_id, input.user_id ?? null]
      );

      if (scopedProject.rows[0] === undefined) {
        return null;
      }

      const result = await db.query<ServiceRetrievalRecord>(
        `
          SELECT
            s.id AS service_id,
            s.project_id,
            s.service_definition_id,
            COALESCE((SELECT a.name FROM service_project_aliases a WHERE a.project_id=$1 AND a.service_definition_id=d.id AND a.is_current),s.name) AS name,
            s.runtime,
            s.framework,
            s.environment
          FROM services s
          JOIN service_definitions d ON d.id=s.service_definition_id
          WHERE s.project_id=ANY(debugbundle_project_origins($1::uuid))
          ORDER BY name ASC, s.environment ASC, s.id ASC
          LIMIT $2
          OFFSET $3
        `,
        [input.project_id, input.limit, input.offset ?? 0]
      );

      return result.rows;
    }
  };
}
