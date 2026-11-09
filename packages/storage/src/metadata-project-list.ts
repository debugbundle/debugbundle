import { isSelfHostMode } from "../../shared-types/src/index.js";
import {
  inheritedProjectActorSql,
  projectActorAllowedSql,
  projectReadScopeSql
} from "./project-read-scope.js";
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
      const params: unknown[] = [
        input.user_id,
        usageWindow.starts_at,
        usageWindow.ends_at,
        dayWindow.starts_at,
        dayWindow.ends_at,
        input.limit,
        ...(input.project_id === undefined ? [] : [input.project_id])
      ];
      const scopeConditions: string[] = [];
      let originIdsSql: string | undefined;
      if (input.origin_project_ids !== undefined) {
        params.push(input.origin_project_ids);
        const allowed = `$${params.length}::uuid[]`;
        originIdsSql = `ARRAY(SELECT origin FROM unnest(debugbundle_project_origins(p.id)) origin WHERE origin=ANY(${allowed}))`;
        scopeConditions.push(`cardinality(${originIdsSql})>0`);
      }
      if (input.organization_scope_id !== undefined) {
        params.push(input.organization_scope_id);
        scopeConditions.push(`canonical_project.organization_id=$${params.length}::uuid`);
      }
      const alertDeliveriesSelect = buildAlertDeliveriesCountSelect({
        hasAlertDeliveries,
        hasAlertEmailDigests,
        ...(originIdsSql === undefined ? {} : { originIdsSql })
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
            COALESCE(debugbundle_project_actor_role(canonical_project.id,$1::uuid,${input.include_organization_grants === true ? "true" : "false"},${isSelfHostMode() ? "true" : "false"}), CASE WHEN canonical_project.owner_user_id=$1::uuid THEN 'owner' ELSE pm.role END) AS effective_role,
            p.name,
            p.slug,
            p.environment_default,
            p.color_tag,
            ${organizationPlanSql} AS organization_plan,
            ${buildProjectMetricsJsonSql({
              projectIdSql: "p.id",
              ...(originIdsSql === undefined ? {} : { originIdsSql }),
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
          WHERE (canonical_project.owner_user_id = $1::uuid OR pm.user_id IS NOT NULL OR ${inheritedProjectActorSql("canonical_project.id", "$1::uuid", input)})
            AND o.suspended_at IS NULL
            AND NOT EXISTS(SELECT 1 FROM organization_members denied WHERE denied.organization_id=o.id AND denied.user_id=$1::uuid AND denied.suspended_at IS NOT NULL)
            ${scopeConditions.map((condition) => `AND ${condition}`).join("\n")}
            AND ${input.project_id === undefined ? "NOT EXISTS(SELECT 1 FROM project_legacy_bindings b WHERE b.legacy_project_id=p.id)" : "p.id=$7::uuid"}
          ORDER BY
            CASE WHEN canonical_project.owner_user_id = $1::uuid THEN 0 ELSE 1 END,
            p.created_at DESC,
            p.id DESC
          LIMIT $6
        `,
        params
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
      const accessParams: unknown[] = [
        input.project_id,
        input.organization_id,
        input.user_id ?? null
      ];
      const scopeConditions: string[] = [];
      if (input.origin_project_ids !== undefined) {
        accessParams.push(input.origin_project_ids);
        scopeConditions.push(
          `debugbundle_project_origins($1::uuid)&&$${accessParams.length}::uuid[]`
        );
      }
      if (input.organization_scope_id !== undefined) {
        accessParams.push(input.organization_scope_id);
        scopeConditions.push(`organization_id=$${accessParams.length}::uuid`);
      }
      const scopedProject = await db.query<{ id: string }>(
        `
          SELECT id
          FROM projects
          WHERE id = debugbundle_canonical_project($1::uuid)
            ${scopeConditions.map((condition) => `AND ${condition}`).join("\n")}
            AND (
              (
                $3::uuid IS NULL
                AND organization_id = $2
              )
              OR (
                $3::uuid IS NOT NULL
                AND ${projectActorAllowedSql("projects.id", "$3::uuid", input)}
              )
            )
          LIMIT 1
        `,
        accessParams
      );

      if (scopedProject.rows[0] === undefined) {
        return null;
      }

      const params: unknown[] = [input.project_id, input.limit, input.offset ?? 0];
      const scopeSql = projectReadScopeSql(params, input, "s.project_id");
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
            ${scopeSql}
          ORDER BY name ASC, s.environment ASC, s.id ASC
          LIMIT $2
          OFFSET $3
        `,
        params
      );

      return result.rows;
    }
  };
}
