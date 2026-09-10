import { randomUUID } from "node:crypto";

import { getTierCapabilities } from "../../shared-types/src/index.js";
import type { Queryable } from "./migrations.js";
import type { AvailabilityCheckMethod } from "./availability-check-executor.js";
import {
  availabilityCheckDayBucket,
  computeAvailabilityCheckNextScheduledAt,
  deriveAvailabilityCheckDailyState,
  getEffectiveAvailabilityCheckIntervalSeconds,
  getPlanCheckLimit,
  hasAvailabilityActivationCapacity,
  mapAvailabilityCheckRow,
  normalizeAvailabilityCheckPlan,
  projectExistsForAvailabilityChecks
} from "./availability-check-store-helpers.js";
import {
  CLAIM_DUE_AVAILABILITY_CHECKS_QUERY,
  LIST_AVAILABILITY_CHECKS_QUERY
} from "./availability-check-store-queries.js";
import type {
  AvailabilityCheckDailyRollupRecord,
  AvailabilityCheckHealthStatus,
  AvailabilityCheckRecord,
  AvailabilityCheckResultRecord,
  AvailabilityCheckStore,
  ClaimedAvailabilityCheck
} from "./availability-check-store-types.js";
import { runInTransaction } from "./transaction.js";

export function createPostgresAvailabilityCheckStore(db: Queryable): AvailabilityCheckStore {
  const getCheckForProjectInOrganization = async (
    queryable: Queryable,
    input: {
      organization_id: string;
      project_id: string;
      check_id: string;
    }
  ): Promise<AvailabilityCheckRecord | null> => {
    const result = await queryable.query<Record<string, unknown>>(LIST_AVAILABILITY_CHECKS_QUERY, [
      input.project_id,
      input.organization_id,
      1,
      input.check_id
    ]);

    const row = result.rows[0];
    return row === undefined ? null : mapAvailabilityCheckRow(row);
  };

  const mapClaimedAvailabilityCheck = (row: Record<string, unknown>): ClaimedAvailabilityCheck => {
    const organizationPlan = normalizeAvailabilityCheckPlan(row["organization_plan"]);
    return {
      check_id: String(row["check_id"]),
      project_id: String(row["project_id"]),
      organization_id: String(row["organization_id"]),
      owner_user_id: String(row["owner_user_id"]),
      organization_plan: organizationPlan,
      name: String(row["name"]),
      url: String(row["url"]),
      method: row["method"] as AvailabilityCheckMethod,
      expected_status_min: Number(row["expected_status_min"]),
      expected_status_max: Number(row["expected_status_max"]),
      timeout_ms: Number(row["timeout_ms"]),
      interval_seconds: getEffectiveAvailabilityCheckIntervalSeconds(
        organizationPlan,
        Number(row["interval_seconds"])
      ),
      failure_threshold: Number(row["failure_threshold"]),
      recovery_threshold: Number(row["recovery_threshold"]),
      environment: String(row["environment"]),
      service_name: typeof row["service_name"] === "string" ? row["service_name"] : null,
      due_at: String(row["due_at"]),
      claimed_at: String(row["claimed_at"]),
      linked_incident_id:
        typeof row["linked_incident_id"] === "string" ? row["linked_incident_id"] : null,
      prior_status:
        row["prior_status"] === "passing" || row["prior_status"] === "failing"
          ? row["prior_status"]
          : "unknown",
      consecutive_failures: Number(row["consecutive_failures"]),
      consecutive_successes: Number(row["consecutive_successes"])
    };
  };

  const claimDueChecks = async (input: {
    now: string;
    claim_timeout_before: string;
    limit: number;
  }): Promise<ClaimedAvailabilityCheck[]> => {
    const result = await db.query<Record<string, unknown>>(CLAIM_DUE_AVAILABILITY_CHECKS_QUERY, [
      input.now,
      input.claim_timeout_before,
      input.limit
    ]);

    return result.rows
      .map(mapClaimedAvailabilityCheck)
      .sort(
        (left, right) =>
          left.due_at.localeCompare(right.due_at) || left.check_id.localeCompare(right.check_id)
      );
  };

  return {
    async listChecksForProjectInOrganization(input) {
      const result = await db.query<Record<string, unknown>>(LIST_AVAILABILITY_CHECKS_QUERY, [
        input.project_id,
        input.organization_id,
        input.limit,
        null
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
          lock_project: true
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
            WHERE project_id = $1::uuid
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
              now(),
              now()
            )
          `,
          [
            checkId,
            input.project_id,
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
            input.service_name ?? null,
            input.enabled,
            input.now
          ]
        );

        const created = await getCheckForProjectInOrganization(tx, {
          organization_id: input.organization_id,
          project_id: input.project_id,
          check_id: checkId
        });

        if (created === null) {
          throw new Error("availability_check_insert_failed");
        }

        return created;
      });
    },

    async updateCheckForProjectInOrganization(input) {
      return await runInTransaction(db, async (tx) => {
        const existing = await tx.query<Record<string, unknown>>(
          `
            SELECT
              c.id::text AS check_id,
              c.enabled,
              (
                SELECT COUNT(*)::text
                FROM availability_checks ranked_check
                WHERE ranked_check.project_id = c.project_id
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
            JOIN projects p ON p.id = c.project_id
            JOIN organizations o ON o.id = p.organization_id
            WHERE c.id = $1::uuid
              AND c.project_id = $2::uuid
              AND p.organization_id = $3::uuid
              AND c.deleted_at IS NULL
            LIMIT 1
            FOR UPDATE OF c, p, o
          `,
          [input.check_id, input.project_id, input.organization_id]
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
              enabled = COALESCE($16, c.enabled),
              next_check_at = CASE
                WHEN COALESCE($16, c.enabled) = true THEN COALESCE(c.next_check_at, $17::timestamptz)
                ELSE c.next_check_at
              END,
              updated_at = now()
            FROM projects p
            WHERE c.id = $1::uuid
              AND c.project_id = $2::uuid
              AND p.id = c.project_id
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
            input.service_name ?? null,
            input.enabled ?? null,
            input.now
          ]
        );

        const updated = await getCheckForProjectInOrganization(tx, {
          organization_id: input.organization_id,
          project_id: input.project_id,
          check_id: input.check_id
        });
        return updated ?? "check_not_found";
      });
    },

    async deleteCheckForProjectInOrganization(input) {
      const result = await db.query<{ check_id: string }>(
        `
          UPDATE availability_checks c
          SET deleted_at = $4::timestamptz,
              updated_at = now()
          FROM projects p
          WHERE c.id = $1::uuid
            AND c.project_id = $2::uuid
            AND p.id = c.project_id
            AND p.organization_id = $3::uuid
            AND c.deleted_at IS NULL
          RETURNING c.id::text AS check_id
        `,
        [input.check_id, input.project_id, input.organization_id, input.deleted_at]
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
          JOIN projects p ON p.id = c.project_id
          WHERE r.check_id = $1::uuid
            AND c.project_id = $2::uuid
            AND p.organization_id = $3::uuid
            AND c.deleted_at IS NULL
          ORDER BY r.started_at DESC
          LIMIT $4
        `,
        [input.check_id, input.project_id, input.organization_id, input.limit]
      );

      if (result.rows.length === 0) {
        const check = await getCheckForProjectInOrganization(db, {
          organization_id: input.organization_id,
          project_id: input.project_id,
          check_id: input.check_id
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
              WHEN cardinality(COALESCE(d.incident_ids, ARRAY[]::uuid[])) > 0 THEN 'down'
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
          JOIN projects p ON p.id = c.project_id
          WHERE d.check_id = $1::uuid
            AND c.project_id = $2::uuid
            AND p.organization_id = $3::uuid
            AND c.deleted_at IS NULL
          ORDER BY d.day DESC
          LIMIT $4
        `,
        [input.check_id, input.project_id, input.organization_id, input.limit]
      );

      if (result.rows.length === 0) {
        const check = await getCheckForProjectInOrganization(db, {
          organization_id: input.organization_id,
          project_id: input.project_id,
          check_id: input.check_id
        });
        if (check === null) {
          return null;
        }
      }

      return result.rows.map((row) => ({
        ...row,
        incident_ids: Array.isArray(row.incident_ids) ? row.incident_ids : []
      }));
    },

    async claimNextDueCheck(input) {
      const checks = await claimDueChecks({
        ...input,
        limit: 1
      });

      return checks[0] ?? null;
    },

    async claimDueChecks(input) {
      return await claimDueChecks(input);
    },

    async recordCheckExecution(input) {
      return await runInTransaction(db, async (tx) => {
        const currentResult = await tx.query<Record<string, unknown>>(
          `
            SELECT
              c.id::text AS check_id,
              c.project_id::text AS project_id,
              p.organization_id::text AS organization_id,
              p.owner_user_id::text AS owner_user_id,
              COALESCE(o.plan, 'free') AS organization_plan,
              c.name,
              c.url,
              c.method,
              c.expected_status_min,
              c.expected_status_max,
              c.timeout_ms,
              c.interval_seconds,
              c.failure_threshold,
              c.recovery_threshold,
              c.environment,
              c.service_name,
              c.status,
              c.consecutive_failures,
              c.consecutive_successes,
              c.linked_incident_id::text AS linked_incident_id,
              i.status AS linked_incident_status
            FROM availability_checks c
            JOIN projects p ON p.id = c.project_id
            JOIN organizations o ON o.id = p.organization_id
            LEFT JOIN incidents i ON i.id = c.linked_incident_id
            WHERE c.id = $1::uuid
              AND c.claimed_at = $2::timestamptz
              AND c.next_check_at = $3::timestamptz
              AND c.deleted_at IS NULL
            FOR UPDATE OF c
          `,
          [input.check_id, input.claimed_at, input.scheduled_for]
        );

        const row = currentResult.rows[0];
        if (row === undefined) {
          return null;
        }

        const organizationPlan = normalizeAvailabilityCheckPlan(row["organization_plan"]);
        const claimedCheck: ClaimedAvailabilityCheck = {
          check_id: String(row["check_id"]),
          project_id: String(row["project_id"]),
          organization_id: String(row["organization_id"]),
          owner_user_id: String(row["owner_user_id"]),
          organization_plan: organizationPlan,
          name: String(row["name"]),
          url: String(row["url"]),
          method: row["method"] as AvailabilityCheckMethod,
          expected_status_min: Number(row["expected_status_min"]),
          expected_status_max: Number(row["expected_status_max"]),
          timeout_ms: Number(row["timeout_ms"]),
          interval_seconds: getEffectiveAvailabilityCheckIntervalSeconds(
            organizationPlan,
            Number(row["interval_seconds"])
          ),
          failure_threshold: Number(row["failure_threshold"]),
          recovery_threshold: Number(row["recovery_threshold"]),
          environment: String(row["environment"]),
          service_name: typeof row["service_name"] === "string" ? row["service_name"] : null,
          due_at: input.scheduled_for,
          claimed_at: input.started_at,
          linked_incident_id:
            typeof row["linked_incident_id"] === "string" ? row["linked_incident_id"] : null,
          prior_status:
            row["status"] === "passing" || row["status"] === "failing" ? row["status"] : "unknown",
          consecutive_failures: Number(row["consecutive_failures"]),
          consecutive_successes: Number(row["consecutive_successes"])
        };

        const resultId = randomUUID();
        await tx.query(
          `
            INSERT INTO availability_check_results (
              id,
              check_id,
              project_id,
              started_at,
              completed_at,
              duration_ms,
              status,
              http_status,
              error_kind,
              error_message,
              redirect_count,
              checked_url_host,
              checked_url_path,
              final_url,
              created_at
            )
            VALUES (
              $1::uuid,
              $2::uuid,
              $3::uuid,
              $4::timestamptz,
              $5::timestamptz,
              $6,
              $7,
              $8,
              $9,
              $10,
              $11,
              $12,
              $13,
              $14,
              now()
            )
          `,
          [
            resultId,
            input.check_id,
            claimedCheck.project_id,
            input.started_at,
            input.completed_at,
            input.result.duration_ms,
            input.result.status,
            input.result.http_status,
            input.result.error_kind,
            input.result.error_message,
            input.result.redirect_count,
            input.result.checked_url_host,
            input.result.checked_url_path,
            input.result.final_url
          ]
        );

        const failed = input.result.status !== "success";
        const nextConsecutiveFailures = failed ? claimedCheck.consecutive_failures + 1 : 0;
        const nextConsecutiveSuccesses = failed ? 0 : claimedCheck.consecutive_successes + 1;

        let nextStatus: Exclude<AvailabilityCheckHealthStatus, "paused"> =
          claimedCheck.prior_status;
        if (failed) {
          if (
            claimedCheck.prior_status === "failing" ||
            nextConsecutiveFailures >= claimedCheck.failure_threshold
          ) {
            nextStatus = "failing";
          } else if (claimedCheck.prior_status === "unknown") {
            nextStatus = "unknown";
          } else {
            nextStatus = "passing";
          }
        } else if (
          claimedCheck.prior_status === "failing" &&
          nextConsecutiveSuccesses < claimedCheck.recovery_threshold
        ) {
          nextStatus = "failing";
        } else {
          nextStatus = "passing";
        }

        const linkedIncidentStatus =
          row["linked_incident_status"] === "open" ||
          row["linked_incident_status"] === "resolved" ||
          row["linked_incident_status"] === "regressed"
            ? row["linked_incident_status"]
            : null;

        const emitFailureEvent =
          failed &&
          nextStatus === "failing" &&
          (claimedCheck.prior_status !== "failing" ||
            linkedIncidentStatus === "resolved" ||
            claimedCheck.linked_incident_id === null);

        const resolveIncidentId =
          !failed &&
          claimedCheck.prior_status === "failing" &&
          nextStatus === "passing" &&
          nextConsecutiveSuccesses >= claimedCheck.recovery_threshold &&
          (linkedIncidentStatus === "open" || linkedIncidentStatus === "regressed")
            ? claimedCheck.linked_incident_id
            : null;

        const nextCheckAt = computeAvailabilityCheckNextScheduledAt({
          completed_at: input.completed_at,
          previous_scheduled_for: input.scheduled_for,
          interval_seconds: claimedCheck.interval_seconds
        });

        await tx.query(
          `
            UPDATE availability_checks
            SET
              status = $2,
              consecutive_failures = $3,
              consecutive_successes = $4,
              last_checked_at = $5::timestamptz,
              next_check_at = $6::timestamptz,
              last_result_status = $7,
              last_result_http_status = $8,
              last_result_error_kind = $9,
              last_result_error_message = $10,
              last_result_duration_ms = $11,
              claimed_at = NULL,
              updated_at = now()
            WHERE id = $1::uuid
          `,
          [
            input.check_id,
            nextStatus,
            nextConsecutiveFailures,
            nextConsecutiveSuccesses,
            input.completed_at,
            nextCheckAt,
            input.result.status,
            input.result.http_status,
            input.result.error_kind,
            input.result.error_message,
            input.result.duration_ms
          ]
        );

        const day = availabilityCheckDayBucket(input.completed_at);
        const rollupState = deriveAvailabilityCheckDailyState(input.result);
        await tx.query(
          `
            INSERT INTO availability_check_daily_rollups (
              id,
              check_id,
              project_id,
              day,
              state,
              total_checks,
              successful_checks,
              failed_checks,
              degraded_checks,
              avg_duration_ms,
              first_checked_at,
              last_checked_at,
              downtime_seconds,
              incident_ids,
              created_at,
              updated_at
            )
            VALUES (
              $1::uuid,
              $2::uuid,
              $3::uuid,
              $4::date,
              $5,
              1,
              $6,
              $7,
              $8,
              $9,
              $10::timestamptz,
              $11::timestamptz,
              $12,
              ARRAY[]::uuid[],
              now(),
              now()
            )
            ON CONFLICT (check_id, day)
            DO UPDATE SET
              state = CASE
                WHEN cardinality(COALESCE(availability_check_daily_rollups.incident_ids, ARRAY[]::uuid[])) > 0 THEN 'down'
                WHEN EXCLUDED.state = 'degraded' OR availability_check_daily_rollups.failed_checks > 0 OR availability_check_daily_rollups.degraded_checks > 0 THEN 'degraded'
                WHEN EXCLUDED.state = 'paused' OR availability_check_daily_rollups.state = 'paused' THEN 'paused'
                ELSE 'operational'
              END,
              total_checks = availability_check_daily_rollups.total_checks + 1,
              successful_checks = availability_check_daily_rollups.successful_checks + EXCLUDED.successful_checks,
              failed_checks = availability_check_daily_rollups.failed_checks + EXCLUDED.failed_checks,
              degraded_checks = availability_check_daily_rollups.degraded_checks + EXCLUDED.degraded_checks,
              avg_duration_ms = ROUND(
                (
                  COALESCE(availability_check_daily_rollups.avg_duration_ms, 0) * availability_check_daily_rollups.total_checks
                  + EXCLUDED.avg_duration_ms
                )::numeric / (availability_check_daily_rollups.total_checks + 1)
              )::int,
              first_checked_at = LEAST(availability_check_daily_rollups.first_checked_at, EXCLUDED.first_checked_at),
              last_checked_at = GREATEST(availability_check_daily_rollups.last_checked_at, EXCLUDED.last_checked_at),
              downtime_seconds = availability_check_daily_rollups.downtime_seconds + EXCLUDED.downtime_seconds,
              updated_at = now()
          `,
          [
            randomUUID(),
            input.check_id,
            claimedCheck.project_id,
            day,
            rollupState,
            input.result.status === "success" ? 1 : 0,
            input.result.status === "success" ? 0 : 1,
            rollupState === "degraded" ? 1 : 0,
            input.result.duration_ms,
            input.started_at,
            input.completed_at,
            input.result.status === "success" ? 0 : claimedCheck.interval_seconds
          ]
        );

        return {
          check: claimedCheck,
          result: {
            ...input.result,
            result_id: resultId,
            started_at: input.started_at,
            completed_at: input.completed_at
          },
          next_status: nextStatus,
          emit_failure_event: emitFailureEvent,
          resolve_incident_id: resolveIncidentId
        };
      });
    },

    async linkIncidentToCheck(input) {
      await db.query(
        `
          UPDATE availability_checks
          SET linked_incident_id = $2::uuid,
              updated_at = now()
          WHERE id = $1::uuid
            AND deleted_at IS NULL
        `,
        [input.check_id, input.incident_id]
      );
    },

    async appendIncidentToDailyRollup(input) {
      await db.query(
        `
          UPDATE availability_check_daily_rollups
          SET
            state = 'down',
            incident_ids = ARRAY(
              SELECT DISTINCT incident_id
              FROM unnest(array_append(incident_ids, $4::uuid)) AS incident_id
            ),
            updated_at = now()
          WHERE check_id = $1::uuid
            AND project_id = $2::uuid
            AND day = $3::date
        `,
        [input.check_id, input.project_id, input.day, input.incident_id]
      );
    },

    async purgeExpiredResults(input) {
      const result = await db.query<{ count: string }>(
        `
          WITH deleted AS (
            DELETE FROM availability_check_results
            WHERE completed_at < $1::timestamptz - interval '30 days'
            RETURNING id
          )
          SELECT COUNT(*)::text AS count
          FROM deleted
        `,
        [input.now]
      );

      return Number(result.rows[0]?.count ?? "0");
    },

    async purgeExpiredDailyRollups(input) {
      const result = await db.query<{ count: string }>(
        `
          WITH deleted AS (
            DELETE FROM availability_check_daily_rollups
            WHERE day < ($1::date - 30)
            RETURNING check_id
          )
          SELECT COUNT(*)::text AS count
          FROM deleted
        `,
        [input.now.slice(0, 10)]
      );

      return Number(result.rows[0]?.count ?? "0");
    }
  };
}
