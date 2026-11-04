import { resolveHealthService } from "./project-health-service.js";
import { getRequiredStringField } from "./helpers.js";
import { ruleActorAllowedSql } from "./project-rule-access.js";
import { randomUUID } from "node:crypto";
import { getTierCapabilities } from "../../shared-types/src/index.js";
import type { Queryable } from "./types.js";
import { runInTransaction } from "./transaction.js";
import { LIST_AVAILABILITY_CHECKS_QUERY } from "./availability-check-store-queries.js";
import {
  lockAvailabilityConfiguration,
  getPlanCheckLimit,
  hasAvailabilityActivationCapacity,
  mapAvailabilityCheckRow,
  normalizeAvailabilityCheckPlan,
  projectExistsForAvailabilityChecks
} from "./availability-check-store-helpers.js";
import type {
  AvailabilityCheckDailyRollupRecord,
  AvailabilityCheckRecord,
  AvailabilityCheckResultRecord,
  AvailabilityCheckStore
} from "./availability-check-store-types.js";

export function createAvailabilityCheckManagementStore(
  db: Queryable
): Pick<
  AvailabilityCheckStore,
  | "listChecksForProjectInOrganization"
  | "getCheckForProjectInOrganization"
  | "createCheckForProjectInOrganization"
  | "updateCheckForProjectInOrganization"
  | "deleteCheckForProjectInOrganization"
  | "listResultsForCheckInOrganization"
  | "listDailyRollupsForCheckInOrganization"
> {
  const getCheckForProjectInOrganization = async (
    queryable: Queryable,
    input: {
      organization_id: string;
      project_id: string;
      check_id: string;
      actor_user_id?: string;
    }
  ): Promise<AvailabilityCheckRecord | null> => {
    const result = await queryable.query<Record<string, unknown>>(LIST_AVAILABILITY_CHECKS_QUERY, [
      input.project_id,
      input.organization_id,
      1,
      input.check_id,
      input.actor_user_id ?? null
    ]);

    const row = result.rows[0];
    return row === undefined ? null : mapAvailabilityCheckRow(row);
  };

  return {
    async listChecksForProjectInOrganization(input) {
      const result = await db.query<Record<string, unknown>>(LIST_AVAILABILITY_CHECKS_QUERY, [
        input.project_id,
        input.organization_id,
        input.limit,
        null,
        input.actor_user_id ?? null
      ]);

      if (result.rows.length === 0) {
        const project = await projectExistsForAvailabilityChecks(db, input);
        if (project === null) {
          return null;
        }
      }

      return result.rows.map(mapAvailabilityCheckRow);
    },

    async getCheckForProjectInOrganization(input) {
      return await getCheckForProjectInOrganization(db, input);
    },

    async createCheckForProjectInOrganization(input) {
      return await runInTransaction(db, async (tx) => {
        // Serialize organization capacity checks so concurrent creates cannot exceed plan caps.
        const project = await projectExistsForAvailabilityChecks(tx, {
          organization_id: input.organization_id,
          project_id: input.project_id,
          lock_project: true,
          actor_user_id: input.created_by_user_id
        });
        if (project === null) {
          return "project_not_found";
        }

        const caps = getTierCapabilities(project.organization_plan);
        if (input.interval_seconds < caps.availability_check_min_interval_seconds) {
          return "interval_too_low";
        }

        const countResult = await tx.query<{ count: string }>(
          `
            SELECT COUNT(*)::text AS count
            FROM availability_checks
            WHERE project_id=ANY(debugbundle_project_origins($1::uuid))
              AND deleted_at IS NULL
          `,
          [input.project_id]
        );
        const currentCount = Number(countResult.rows[0]?.count ?? "0");
        if (currentCount >= caps.availability_checks_per_project) {
          return "limit_reached";
        }

        if (
          input.enabled &&
          !(await hasAvailabilityActivationCapacity(tx, {
            organization_id: input.organization_id,
            project_id: input.project_id,
            plan: project.organization_plan
          }))
        ) {
          return "limit_reached";
        }

        const service = await resolveHealthService(tx, {
          view_project_id: input.project_id,
          service_name: input.service_name ?? null
        });
        if (service === "service_scope_conflict")
          throw new Error("health_service_resolution_failed");
        const checkId = randomUUID();
        await tx.query(
          `
            INSERT INTO availability_checks (
              id,
              project_id,
              created_by_user_id,
              name,
              url,
              method,
              expected_status_min,
              expected_status_max,
              timeout_ms,
              interval_seconds,
              failure_threshold,
              recovery_threshold,
              environment,
              service_name,
              enabled,
              status,
              next_check_at,
              service_definition_id,
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
              $8,
              $9,
              $10,
              $11,
              $12,
              $13,
              $14,
              $15,
              'unknown',
              $16::timestamptz,
              $17::uuid,
              now(),
              now()
            )
          `,
          [
            checkId,
            service.origin_project_id,
            input.created_by_user_id,
            input.name,
            input.url,
            input.method,
            input.expected_status_min,
            input.expected_status_max,
            input.timeout_ms,
            input.interval_seconds,
            input.failure_threshold,
            input.recovery_threshold,
            input.environment ?? project.environment_default,
            service.service_name,
            input.enabled,
            input.now,
            service.service_definition_id
          ]
        );

        const created = await getCheckForProjectInOrganization(tx, {
          organization_id: input.organization_id,
          project_id: input.project_id,
          check_id: checkId,
          actor_user_id: input.created_by_user_id
        });

        if (created === null) {
          throw new Error("availability_check_insert_failed");
        }

        return created;
      });
    },

    async updateCheckForProjectInOrganization(input) {
      return await runInTransaction(db, async (tx) => {
        await lockAvailabilityConfiguration(tx, input);

        const existing = await tx.query<Record<string, unknown>>(
          `
            SELECT
              c.id::text AS check_id,
              c.project_id::text AS origin_id,
              c.enabled,
              (
                SELECT COUNT(*)::text
                FROM availability_checks ranked_check
                WHERE ranked_check.project_id=ANY(debugbundle_project_origins($2::uuid))
                  AND ranked_check.deleted_at IS NULL
                  AND (
                    ranked_check.created_at < c.created_at
                    OR (
                      ranked_check.created_at = c.created_at
                      AND ranked_check.id <= c.id
                    )
                  )
              ) AS project_check_rank,
              p.organization_id::text AS organization_id,
              COALESCE(o.plan, 'free') AS organization_plan
            FROM availability_checks c
            JOIN projects p ON p.id = debugbundle_canonical_project(c.project_id)
            JOIN organizations o ON o.id = p.organization_id
            WHERE c.id = $1::uuid
              AND c.project_id=ANY(debugbundle_project_origins($2::uuid))
              AND p.organization_id = $3::uuid
              AND c.deleted_at IS NULL AND ${ruleActorAllowedSql("p.id", "$4::uuid", "p.owner_user_id")}
            LIMIT 1
            FOR UPDATE OF c
          `,
          [input.check_id, input.project_id, input.organization_id, input.actor_user_id ?? null]
        );

        const row = existing.rows[0];
        if (row === undefined) {
          return "check_not_found";
        }

        const caps = getTierCapabilities(normalizeAvailabilityCheckPlan(row["organization_plan"]));
        if (
          input.interval_seconds !== undefined &&
          input.interval_seconds < caps.availability_check_min_interval_seconds
        ) {
          return "interval_too_low";
        }

        if (input.enabled === true && !Boolean(row["enabled"])) {
          const organizationPlan = normalizeAvailabilityCheckPlan(row["organization_plan"]);
          if (
            Number(row["project_check_rank"]) > getPlanCheckLimit(organizationPlan) ||
            !(await hasAvailabilityActivationCapacity(tx, {
              organization_id: input.organization_id,
              project_id: input.project_id,
              plan: organizationPlan
            }))
          ) {
            return "limit_reached";
          }
        }

        const service =
          input.service_name === undefined
            ? undefined
            : await resolveHealthService(tx, {
                view_project_id: input.project_id,
                origin_project_id: getRequiredStringField(row, "origin_id"),
                service_name: input.service_name
              });
        if (service === "service_scope_conflict") return service;
        await tx.query(
          `
            UPDATE availability_checks c
            SET
              name = COALESCE($4, c.name),
              url = COALESCE($5, c.url),
              method = COALESCE($6, c.method),
              expected_status_min = COALESCE($7, c.expected_status_min),
              expected_status_max = COALESCE($8, c.expected_status_max),
              timeout_ms = COALESCE($9, c.timeout_ms),
              interval_seconds = COALESCE($10, c.interval_seconds),
              failure_threshold = COALESCE($11, c.failure_threshold),
              recovery_threshold = COALESCE($12, c.recovery_threshold),
              environment = COALESCE($13, c.environment),
              service_name = CASE
                WHEN $14::boolean THEN $15
                ELSE c.service_name
              END,
              service_definition_id=CASE WHEN $14::boolean THEN $18::uuid ELSE c.service_definition_id END,
              enabled = COALESCE($16, c.enabled),
              next_check_at = CASE
                WHEN COALESCE($16, c.enabled) = true THEN COALESCE(c.next_check_at, $17::timestamptz)
                ELSE c.next_check_at
              END,
              updated_at = now()
            FROM projects p
            WHERE c.id = $1::uuid
              AND c.project_id=ANY(debugbundle_project_origins($2::uuid))
              AND p.id = debugbundle_canonical_project(c.project_id)
              AND p.organization_id = $3::uuid
              AND c.deleted_at IS NULL
          `,
          [
            input.check_id,
            input.project_id,
            input.organization_id,
            input.name ?? null,
            input.url ?? null,
            input.method ?? null,
            input.expected_status_min ?? null,
            input.expected_status_max ?? null,
            input.timeout_ms ?? null,
            input.interval_seconds ?? null,
            input.failure_threshold ?? null,
            input.recovery_threshold ?? null,
            input.environment ?? null,
            input.service_name !== undefined,
            service?.service_name ?? null,
            input.enabled ?? null,
            input.now,
            service?.service_definition_id ?? null
          ]
        );

        const updated = await getCheckForProjectInOrganization(tx, {
          organization_id: input.organization_id,
          project_id: input.project_id,
          check_id: input.check_id,
          ...(input.actor_user_id ? { actor_user_id: input.actor_user_id } : {})
        });
        return updated ?? "check_not_found";
      });
    },

    async deleteCheckForProjectInOrganization(input) {
      const result = await db.query<{ check_id: string }>(
        `
          WITH management_scope AS MATERIALIZED(SELECT debugbundle_begin_project_rule_write($2::uuid))
          UPDATE availability_checks c
          SET deleted_at = $4::timestamptz,
              updated_at = now()
          FROM management_scope CROSS JOIN projects p
          WHERE c.id = $1::uuid
            AND c.project_id=ANY(debugbundle_project_origins($2::uuid))
            AND p.id = debugbundle_canonical_project(c.project_id)
            AND p.organization_id = $3::uuid
            AND c.deleted_at IS NULL AND ${ruleActorAllowedSql("p.id", "$5::uuid", "p.owner_user_id")}
          RETURNING c.id::text AS check_id
        `,
        [
          input.check_id,
          input.project_id,
          input.organization_id,
          input.deleted_at,
          input.actor_user_id ?? null
        ]
      );

      return result.rows.length > 0;
    },

    async listResultsForCheckInOrganization(input) {
      const result = await db.query<AvailabilityCheckResultRecord & Record<string, unknown>>(
        `
          SELECT
            r.id::text AS result_id,
            r.check_id::text AS check_id,
            r.project_id::text AS project_id,
            r.started_at::text AS started_at,
            r.completed_at::text AS completed_at,
            r.duration_ms,
            r.status,
            r.http_status,
            r.error_kind,
            r.error_message,
            r.redirect_count,
            r.checked_url_host,
            r.final_url
          FROM availability_check_results r
          JOIN availability_checks c ON c.id = r.check_id
          JOIN projects p ON p.id = debugbundle_canonical_project(c.project_id)
          WHERE r.check_id = $1::uuid
            AND c.project_id=ANY(debugbundle_project_origins($2::uuid))
            AND p.organization_id = $3::uuid
            AND c.deleted_at IS NULL AND ${ruleActorAllowedSql("p.id", "$5::uuid", "NULL::uuid")}
          ORDER BY r.started_at DESC
          LIMIT $4
        `,
        [
          input.check_id,
          input.project_id,
          input.organization_id,
          input.limit,
          input.actor_user_id ?? null
        ]
      );

      if (result.rows.length === 0) {
        const check = await getCheckForProjectInOrganization(db, {
          organization_id: input.organization_id,
          project_id: input.project_id,
          check_id: input.check_id,
          ...(input.actor_user_id ? { actor_user_id: input.actor_user_id } : {})
        });
        if (check === null) {
          return null;
        }
      }

      return result.rows;
    },

    async listDailyRollupsForCheckInOrganization(input) {
      const result = await db.query<AvailabilityCheckDailyRollupRecord & Record<string, unknown>>(
        `
          SELECT
            d.check_id::text AS check_id,
            d.project_id::text AS project_id,
            d.day::text AS day,
            CASE
              WHEN d.state = 'down' OR cardinality(COALESCE(d.incident_ids, ARRAY[]::uuid[])) > 0 THEN 'down'
              WHEN d.state = 'paused' THEN 'paused'
              WHEN d.failed_checks > 0 OR d.degraded_checks > 0 OR d.state = 'degraded' THEN 'degraded'
              ELSE d.state
            END AS state,
            d.total_checks,
            d.successful_checks,
            d.failed_checks,
            d.degraded_checks,
            d.avg_duration_ms,
            d.first_checked_at::text AS first_checked_at,
            d.last_checked_at::text AS last_checked_at,
            d.downtime_seconds,
            COALESCE(d.incident_ids::text[], ARRAY[]::text[]) AS incident_ids
          FROM availability_check_daily_rollups d
          JOIN availability_checks c ON c.id = d.check_id
          JOIN projects p ON p.id = debugbundle_canonical_project(c.project_id)
          WHERE d.check_id = $1::uuid
            AND c.project_id=ANY(debugbundle_project_origins($2::uuid))
            AND p.organization_id = $3::uuid
            AND c.deleted_at IS NULL AND ${ruleActorAllowedSql("p.id", "$5::uuid", "NULL::uuid")}
          ORDER BY d.day DESC
          LIMIT $4
        `,
        [
          input.check_id,
          input.project_id,
          input.organization_id,
          input.limit,
          input.actor_user_id ?? null
        ]
      );

      if (result.rows.length === 0) {
        const check = await getCheckForProjectInOrganization(db, {
          organization_id: input.organization_id,
          project_id: input.project_id,
          check_id: input.check_id,
          ...(input.actor_user_id ? { actor_user_id: input.actor_user_id } : {})
        });
        if (check === null) {
          return null;
        }
      }

      return result.rows.map((row) => ({
        ...row,
        incident_ids: Array.isArray(row.incident_ids) ? row.incident_ids : []
      }));
    }
  };
}
