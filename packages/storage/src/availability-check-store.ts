import { recordReportHealthRecovery } from "./report-health-store.js";
import { createAvailabilityCheckManagementStore } from "./availability-check-management-store.js";
import { randomUUID } from "node:crypto";

import type { Queryable } from "./types.js";
import type { AvailabilityCheckMethod } from "./availability-check-executor.js";
import {
  availabilityCheckDayBucket,
  computeAvailabilityCheckNextScheduledAt,
  deriveAvailabilityCheckDailyState,
  getEffectiveAvailabilityCheckIntervalSeconds,
  normalizeAvailabilityCheckPlan
} from "./availability-check-store-helpers.js";
import { CLAIM_DUE_AVAILABILITY_CHECKS_QUERY } from "./availability-check-store-queries.js";
import type {
  AvailabilityCheckHealthStatus,
  AvailabilityCheckStore,
  ClaimedAvailabilityCheck
} from "./availability-check-store-types.js";
import { runInTransaction } from "./transaction.js";

export function createPostgresAvailabilityCheckStore(db: Queryable): AvailabilityCheckStore {
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
    ...createAvailabilityCheckManagementStore(db),
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

        // A monitor-internal error says nothing about the customer's endpoint.
        const unverified = input.result.status === "internal_error";
        const failed = input.result.status !== "success" && !unverified;
        const nextConsecutiveFailures = unverified
          ? claimedCheck.consecutive_failures
          : failed
            ? claimedCheck.consecutive_failures + 1
            : 0;
        const nextConsecutiveSuccesses = unverified
          ? claimedCheck.consecutive_successes
          : failed
            ? 0
            : claimedCheck.consecutive_successes + 1;

        let nextStatus: Exclude<AvailabilityCheckHealthStatus, "paused"> =
          claimedCheck.prior_status;
        if (unverified) {
          nextStatus = claimedCheck.prior_status;
        } else if (failed) {
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
          !unverified &&
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

        if (
          claimedCheck.prior_status === "failing" &&
          nextStatus === "passing" &&
          input.result.status === "success"
        ) {
          await recordReportHealthRecovery(tx, {
            project_id: claimedCheck.project_id,
            result_id: resultId,
            check_id: input.check_id,
            occurred_at: input.completed_at
          });
        }
        if (!unverified) {
          const day = availabilityCheckDayBucket(input.completed_at);
          const outcomeState = deriveAvailabilityCheckDailyState(input.result);
          // Confirmed failures affect each UTC day, including continuations of an existing incident.
          const rollupState = failed && nextStatus === "failing" ? "down" : outcomeState;
          const continuingIncidentId =
            failed &&
            nextStatus === "failing" &&
            (linkedIncidentStatus === "open" || linkedIncidentStatus === "regressed")
              ? claimedCheck.linked_incident_id
              : null;
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
              CASE WHEN $13::uuid IS NULL THEN ARRAY[]::uuid[] ELSE ARRAY[$13::uuid] END,
              now(),
              now()
            )
            ON CONFLICT (check_id, day)
            DO UPDATE SET
              state = CASE
                WHEN EXCLUDED.state = 'down' OR availability_check_daily_rollups.state = 'down'
                  OR cardinality(COALESCE(availability_check_daily_rollups.incident_ids, ARRAY[]::uuid[])) > 0 THEN 'down'
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
              incident_ids = ARRAY(
                SELECT DISTINCT incident_id
                FROM unnest(COALESCE(availability_check_daily_rollups.incident_ids, ARRAY[]::uuid[]) || EXCLUDED.incident_ids) AS incident_id
              ),
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
              outcomeState === "degraded" ? 1 : 0,
              input.result.duration_ms,
              input.started_at,
              input.completed_at,
              input.result.status === "success" ? 0 : claimedCheck.interval_seconds,
              continuingIncidentId
            ]
          );
        }

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
