import { randomUUID } from "node:crypto";
import { buildBillableIncidentEventsPredicateSql } from "./helpers.js";
import { runInTransaction } from "./transaction.js";
import type {
  PostgresMetadataStore,
  ProjectRecord,
  Queryable,
  DeletedProjectRecord
} from "./types.js";
import {
  buildProjectMetricsWindow,
  buildProjectDayWindow,
  buildProjectMetricsJsonSql,
  alertDeliveriesTableExists,
  alertEmailDigestsTableExists,
  mapProjectRow,
  mapDeletedProjectRow
} from "./metadata-project-shared.js";
import { type PostgresMetadataStoreOptions, recordProjectMetric } from "./metadata-shared.js";

export function createMetadataUserProjects(
  db: Queryable,
  options: PostgresMetadataStoreOptions = {}
): Pick<
  PostgresMetadataStore,
  "createProjectForUser" | "updateProjectForUser" | "deleteProjectForUser"
> {
  const accountAnalyticsStore = options.accountAnalyticsStore;
  return {
    async createProjectForUser(input): Promise<ProjectRecord | null> {
      const createProject = async (queryable: Queryable): Promise<ProjectRecord | null> => {
        try {
          const result = await queryable.query<ProjectRecord & Record<string, unknown>>(
            `
            WITH created_project AS (
              INSERT INTO projects (
                id,
                organization_id,
                owner_user_id,
                name,
                slug,
                environment_default,
                color_tag,
                created_at,
                updated_at
              )
              VALUES (
                $1::uuid,
                $2::uuid,
                $3::uuid,
                $4,
                $5,
                $6,
                $7,
                now(),
                now()
            )
              RETURNING
                id AS project_id,
                organization_id,
                owner_user_id,
                name,
                slug,
                environment_default,
                color_tag,
                created_at,
                updated_at
            )
            , created_weekly_report AS (
              INSERT INTO weekly_report_channels (
                id,
                project_id,
                channel,
                config,
                schedule_day_of_week,
                schedule_hour_of_day,
                schedule_timezone,
                is_enabled,
                created_at,
                updated_at
              )
              SELECT
                $8::uuid,
                cp.project_id,
                'email',
                jsonb_build_object('to', jsonb_build_array(owner_user.email)),
                'monday',
                9,
                $9,
                true,
                now(),
                now()
              FROM created_project cp
              JOIN users owner_user ON owner_user.id = cp.owner_user_id
              RETURNING project_id
            )
            SELECT
              cp.project_id,
              cp.organization_id,
              cp.owner_user_id,
              owner_user.email AS owner_email,
              'owned' AS relationship,
              'private' AS sharing_state,
              'owner' AS effective_role,
              cp.name,
              cp.slug,
              cp.environment_default,
              cp.color_tag,
              COALESCE(o.plan, 'free') AS organization_plan,
              json_build_object(
                'open_incidents', 0,
                'regressed_incidents', 0,
                'attention_incidents_today', 0,
                'opened_incidents_today', 0,
                'opened_incidents_month', 0,
                'monthly_bundle_requests', 0,
                'monthly_raw_ingested_events', 0,
                'retained_bundles', 0,
                'monthly_alert_deliveries', 0
              ) AS metrics,
              cp.created_at::text AS created_at,
              cp.updated_at::text AS updated_at
            FROM created_project cp
            JOIN created_weekly_report cwr ON cwr.project_id = cp.project_id
            JOIN organizations o ON o.id = cp.organization_id
            JOIN users owner_user ON owner_user.id = cp.owner_user_id
          `,
            [
              randomUUID(),
              input.organization_id,
              input.user_id,
              input.name,
              input.slug,
              input.environment_default,
              input.color_tag ?? null,
              randomUUID(),
              input.weekly_report_timezone
            ]
          );

          const project = result.rows[0] === undefined ? null : mapProjectRow(result.rows[0]);
          if (project !== null && accountAnalyticsStore !== undefined) {
            await recordProjectMetric(accountAnalyticsStore, queryable, {
              organization_id: project.organization_id,
              project_id: project.project_id,
              occurred_at: project.created_at,
              metric_key: "project_created"
            });
          }

          return project;
        } catch (error) {
          if (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "23505" &&
            "constraint" in error &&
            error.constraint === "projects_organization_id_slug_key"
          ) {
            return null;
          }

          throw error;
        }
      };

      if (accountAnalyticsStore === undefined) {
        return createProject(db);
      }

      return runInTransaction(db, createProject);
    },

    async updateProjectForUser(input): Promise<ProjectRecord | "slug_taken" | null> {
      try {
        const usageWindow = buildProjectMetricsWindow(new Date().toISOString());
        const dayWindow = buildProjectDayWindow(new Date().toISOString());
        const hasAlertDeliveries = await alertDeliveriesTableExists(db);
        const hasAlertEmailDigests = await alertEmailDigestsTableExists(db);
        const billableIncidentEventsPredicate = buildBillableIncidentEventsPredicateSql({
          planSql:
            "(SELECT COALESCE(o.plan, 'free') FROM organizations o WHERE o.id = up.organization_id)",
          eventClassSql: "ie.event_class"
        });
        const alertDeliveriesSelect =
          hasAlertDeliveries || hasAlertEmailDigests
            ? `
                (
                  SELECT COUNT(*)::int
                  FROM (
                    ${[
                      hasAlertDeliveries
                        ? `
                            SELECT ad.created_at
                            FROM alert_deliveries ad
                            WHERE ad.project_id = up.project_id
                              AND ad.created_at >= $8::timestamptz
                              AND ad.created_at < $9::timestamptz
                          `
                        : null,
                      hasAlertEmailDigests
                        ? `
                            SELECT dig.created_at
                            FROM alert_email_digests dig
                            WHERE dig.project_id = up.project_id
                              AND dig.created_at >= $8::timestamptz
                              AND dig.created_at < $9::timestamptz
                          `
                        : null
                    ]
                      .filter((part): part is string => part !== null)
                      .join("\nUNION ALL\n")}
                  ) AS alert_events
                )
              `
            : "0";
        const result = await db.query<ProjectRecord & Record<string, unknown>>(
          `
            WITH updated_project AS (
              UPDATE projects
              SET
                name = COALESCE($3, name),
                slug = COALESCE($4, slug),
                environment_default = COALESCE($5, environment_default),
                color_tag = CASE WHEN $6::boolean THEN $7::text ELSE color_tag END,
                updated_at = now()
              WHERE id = $2::uuid
                AND (
                  owner_user_id = $1::uuid
                  OR EXISTS (
                    SELECT 1
                    FROM project_members pm
                    WHERE pm.project_id = projects.id
                      AND pm.user_id = $1::uuid
                  )
                )
              RETURNING
                id AS project_id,
                organization_id,
                owner_user_id,
                name,
                slug,
                environment_default,
                color_tag,
                created_at,
                updated_at
            )
            SELECT
              up.project_id,
              up.organization_id,
              up.owner_user_id,
              owner_user.email AS owner_email,
              CASE
                WHEN up.owner_user_id = $1::uuid THEN 'owned'
                ELSE 'shared'
              END AS relationship,
              CASE
                WHEN up.owner_user_id <> $1::uuid THEN 'shared_with_you'
                WHEN EXISTS (
                  SELECT 1
                  FROM project_members shared_members
                  WHERE shared_members.project_id = up.project_id
                )
                  OR EXISTS (
                    SELECT 1
                    FROM project_invites pending_invites
                    WHERE pending_invites.project_id = up.project_id
                      AND pending_invites.accepted_at IS NULL
                      AND pending_invites.canceled_at IS NULL
                      AND pending_invites.expires_at > now()
                  )
                  THEN 'shared_by_you'
                ELSE 'private'
              END AS sharing_state,
              CASE
                WHEN up.owner_user_id = $1::uuid THEN 'owner'
                ELSE (
                  SELECT pm.role
                  FROM project_members pm
                  WHERE pm.project_id = up.project_id
                    AND pm.user_id = $1::uuid
                  LIMIT 1
                )
              END AS effective_role,
              up.name,
              up.slug,
              up.environment_default,
              up.color_tag,
              COALESCE(o.plan, 'free') AS organization_plan,
              ${buildProjectMetricsJsonSql({
                projectIdSql: "up.project_id",
                monthStartsAtSql: "$8",
                monthEndsAtSql: "$9",
                dayStartsAtSql: "$10",
                dayEndsAtSql: "$11",
                billableIncidentEventsPredicate,
                alertDeliveriesSelect
              })} AS metrics,
              up.created_at::text AS created_at,
              up.updated_at::text AS updated_at
            FROM updated_project up
            JOIN organizations o ON o.id = up.organization_id
            JOIN users owner_user ON owner_user.id = up.owner_user_id
          `,
          [
            input.user_id,
            input.project_id,
            input.name ?? null,
            input.slug ?? null,
            input.environment_default ?? null,
            input.color_tag !== undefined,
            input.color_tag ?? null,
            usageWindow.starts_at,
            usageWindow.ends_at,
            dayWindow.starts_at,
            dayWindow.ends_at
          ]
        );

        return result.rows[0] === undefined ? null : mapProjectRow(result.rows[0]);
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "23505" &&
          "constraint" in error &&
          error.constraint === "projects_organization_id_slug_key"
        ) {
          return "slug_taken";
        }

        throw error;
      }
    },

    async deleteProjectForUser(input): Promise<DeletedProjectRecord | null> {
      const deleteProject = async (queryable: Queryable): Promise<DeletedProjectRecord | null> => {
        const result = await queryable.query<DeletedProjectRecord & Record<string, unknown>>(
          `
          WITH deleted_project AS (
            DELETE FROM projects
            WHERE id = $2::uuid
              AND owner_user_id = $1::uuid
            RETURNING
              id AS project_id,
              organization_id,
              owner_user_id,
              name,
              slug,
              environment_default,
              color_tag,
              created_at,
              updated_at
          )
          SELECT
            dp.project_id,
            dp.organization_id,
            dp.owner_user_id,
            owner_user.email AS owner_email,
            'owned' AS relationship,
            'private' AS sharing_state,
            'owner' AS effective_role,
            dp.name,
            dp.slug,
            dp.environment_default,
            dp.color_tag,
            COALESCE(o.plan, 'free') AS organization_plan,
            dp.created_at::text AS created_at,
            dp.updated_at::text AS updated_at
          FROM deleted_project dp
          JOIN organizations o ON o.id = dp.organization_id
          JOIN users owner_user ON owner_user.id = dp.owner_user_id
        `,
          [input.user_id, input.project_id]
        );

        const project = result.rows[0] === undefined ? null : mapDeletedProjectRow(result.rows[0]);
        if (project !== null && accountAnalyticsStore !== undefined) {
          await recordProjectMetric(accountAnalyticsStore, queryable, {
            organization_id: project.organization_id,
            project_id: project.project_id,
            occurred_at: new Date().toISOString(),
            metric_key: "project_deleted"
          });
        }

        return project;
      };

      if (accountAnalyticsStore === undefined) {
        return deleteProject(db);
      }

      return runInTransaction(db, deleteProject);
    }
  };
}
