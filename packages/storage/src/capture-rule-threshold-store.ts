import { normalizeResourceRoute } from "../../shared-types/src/browser-resource-routes.js";
import type { CaptureRuleThresholdGroupBy } from "../../shared-types/src/index.js";
import type { Queryable } from "./types.js";

export interface CaptureRuleThresholdWindowEvent {
  event_id: string;
  occurred_at: string;
  resource_route: string | null;
}

export interface EvaluateCaptureRuleThresholdInput {
  project_id: string;
  service_name: string;
  environment: string;
  fingerprint: string;
  event_id: string;
  occurred_at: string;
  received_at: string;
  resource_route?: string | null;
  rule_id: string;
  threshold_count: number;
  threshold_window_seconds: number;
  threshold_group_by: CaptureRuleThresholdGroupBy;
  bucket_key: string;
  rule_updated_at: string;
  acquire_locks?: boolean;
}

export type EvaluateCaptureRuleThresholdResult =
  | { status: "bypass" }
  | { status: "pending"; count: number }
  | {
      status: "crossed";
      prior_events: CaptureRuleThresholdWindowEvent[];
      consumed_event_ids: string[];
    };

export interface CaptureRuleThresholdStore {
  evaluateThresholdGate(
    input: EvaluateCaptureRuleThresholdInput
  ): Promise<EvaluateCaptureRuleThresholdResult>;
  consumeThresholdEvents(input: { event_ids: readonly string[] }): Promise<void>;
  pruneExpiredCaptureRuleThresholdEvents(input: { now: string; limit: number }): Promise<number>;
}

function toIsoString(value: string | Date): string {
  return new Date(value).toISOString();
}

export function createPostgresCaptureRuleThresholdStore(db: Queryable): CaptureRuleThresholdStore {
  return {
    async evaluateThresholdGate(
      input: EvaluateCaptureRuleThresholdInput
    ): Promise<EvaluateCaptureRuleThresholdResult> {
      if (input.acquire_locks !== false) {
        // Lock the threshold bucket before the incident fingerprint in a fixed order to avoid deadlocks.
        await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
          JSON.stringify([
            "capture_rule_threshold",
            input.project_id,
            input.service_name,
            input.environment,
            input.rule_id,
            input.bucket_key
          ])
        ]);
        await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
          JSON.stringify([
            input.project_id,
            input.service_name,
            input.environment,
            input.fingerprint
          ])
        ]);
      }

      const ruleResult = await db.query<{
        enabled: boolean;
        action: string;
        expires_at: string | Date | null;
        threshold_count: number | string | null;
        threshold_window_seconds: number | string | null;
        updated_at: string | Date;
      }>(
        `
          SELECT enabled, action, expires_at, threshold_count, threshold_window_seconds, updated_at
          FROM capture_rules
          WHERE id = $1
          LIMIT 1
        `,
        [input.rule_id]
      );

      const liveRule = ruleResult.rows[0];
      if (
        liveRule === undefined ||
        !liveRule.enabled ||
        liveRule.action !== "threshold" ||
        liveRule.threshold_count === null ||
        liveRule.threshold_window_seconds === null
      ) {
        return { status: "bypass" };
      }

      const receivedMs = Date.parse(input.received_at);
      if (!Number.isFinite(receivedMs)) {
        return { status: "bypass" };
      }

      if (
        liveRule.expires_at !== null &&
        Date.parse(toIsoString(liveRule.expires_at)) <= receivedMs
      ) {
        return { status: "bypass" };
      }

      const existingIncidentResult = await db.query<{
        id: string;
        status: "open" | "resolved" | "regressed";
        resolved_at: string | Date | null;
      }>(
        `
          SELECT i.id, i.status, i.resolved_at
          FROM incidents i
          JOIN services s ON s.id = i.service_id
          WHERE i.project_id = $1
            AND i.environment = $2
            AND s.name = $3
            AND i.fingerprint = $4
          LIMIT 1
        `,
        [input.project_id, input.environment, input.service_name, input.fingerprint]
      );

      const existingIncident = existingIncidentResult.rows[0] ?? null;
      if (
        existingIncident !== null &&
        (existingIncident.status === "open" || existingIncident.status === "regressed")
      ) {
        return { status: "bypass" };
      }

      const effectiveCount = Number(liveRule.threshold_count);
      const effectiveWindowSeconds = Number(liveRule.threshold_window_seconds);
      const jobUpdatedMs = Date.parse(input.rule_updated_at);
      const liveUpdatedMs = Date.parse(toIsoString(liveRule.updated_at));
      // Both updated_at timestamps originate from capture_rules.updated_at (same DB clock).
      // Discard in-flight events ingested before a rule edit instead of counting them under the new policy.
      if (
        Number.isFinite(jobUpdatedMs) &&
        Number.isFinite(liveUpdatedMs) &&
        liveUpdatedMs > jobUpdatedMs
      ) {
        return { status: "pending", count: 0 };
      }

      const resolvedMs =
        existingIncident?.status === "resolved" && existingIncident.resolved_at !== null
          ? Date.parse(toIsoString(existingIncident.resolved_at))
          : Number.NEGATIVE_INFINITY;

      // Events received before an incident was resolved never count toward a new regression.
      if (receivedMs < resolvedMs) {
        return { status: "pending", count: 0 };
      }

      const windowStartIso = new Date(
        Math.max(receivedMs - effectiveWindowSeconds * 1000, resolvedMs)
      ).toISOString();
      const expiresAtIso = new Date(receivedMs + effectiveWindowSeconds * 1000).toISOString();
      const normalizedRoute = normalizeResourceRoute(input.resource_route ?? null);

      await db.query(
        `
          INSERT INTO capture_rule_threshold_events (
            event_id,
            project_id,
            rule_id,
            service_name,
            environment,
            bucket_key,
            resource_route,
            occurred_at,
            received_at,
            expires_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9::timestamptz, $10::timestamptz)
          ON CONFLICT (event_id) DO NOTHING
        `,
        [
          input.event_id,
          input.project_id,
          input.rule_id,
          input.service_name,
          input.environment,
          input.bucket_key,
          normalizedRoute,
          input.occurred_at,
          input.received_at,
          expiresAtIso
        ]
      );

      // Jobs may finish in reverse receipt order. Find the first qualifying window
      // that contains this receipt, then backfill only events from that window.
      const windowResult = await db.query<{
        event_id: string;
        resource_route: string | null;
        occurred_at: string | Date;
      }>(
        `
          WITH nearby AS (
            SELECT event_id, resource_route, occurred_at, received_at
            FROM capture_rule_threshold_events
            WHERE project_id = $1
              AND rule_id = $2
              AND service_name = $3
              AND environment = $4
              AND bucket_key = $5
              AND received_at >= $6::timestamptz
              AND received_at <= $7::timestamptz + make_interval(secs => $8)
          ), measured AS (
            SELECT received_at, count(*) OVER (
              ORDER BY received_at RANGE BETWEEN make_interval(secs => $8) PRECEDING AND CURRENT ROW
            ) AS event_count
            FROM nearby
          ), selected AS (
            SELECT COALESCE(min(received_at), $7::timestamptz) AS window_end
            FROM measured
            WHERE received_at >= $7::timestamptz AND event_count >= $9
          )
          SELECT event_id::text AS event_id, resource_route, occurred_at
          FROM nearby CROSS JOIN selected
          WHERE received_at >= window_end - make_interval(secs => $8)
            AND received_at <= window_end
          ORDER BY occurred_at ASC, event_id ASC
        `,
        [
          input.project_id,
          input.rule_id,
          input.service_name,
          input.environment,
          input.bucket_key,
          windowStartIso,
          input.received_at,
          effectiveWindowSeconds,
          effectiveCount
        ]
      );

      if (windowResult.rows.length < effectiveCount) {
        return { status: "pending", count: windowResult.rows.length };
      }

      const priorEvents: CaptureRuleThresholdWindowEvent[] = [];
      const consumedEventIds: string[] = [];
      for (const row of windowResult.rows) {
        consumedEventIds.push(row.event_id);
        if (row.event_id !== input.event_id) {
          priorEvents.push({
            event_id: row.event_id,
            occurred_at: toIsoString(row.occurred_at),
            resource_route: row.resource_route
          });
        }
      }

      return {
        status: "crossed",
        prior_events: priorEvents,
        consumed_event_ids: consumedEventIds
      };
    },

    async consumeThresholdEvents(input: { event_ids: readonly string[] }): Promise<void> {
      if (input.event_ids.length === 0) {
        return;
      }

      await db.query(
        `
          DELETE FROM capture_rule_threshold_events
          WHERE event_id = ANY($1::uuid[])
        `,
        [input.event_ids]
      );
    },

    async pruneExpiredCaptureRuleThresholdEvents(input: {
      now: string;
      limit: number;
    }): Promise<number> {
      const result = await db.query<{ event_id: string }>(
        `
          DELETE FROM capture_rule_threshold_events
          WHERE event_id IN (
            SELECT event_id
            FROM capture_rule_threshold_events
            WHERE expires_at <= $1::timestamptz
            ORDER BY expires_at ASC, event_id ASC
            LIMIT $2
          )
          RETURNING event_id::text AS event_id
        `,
        [input.now, input.limit]
      );

      return result.rows.length;
    }
  };
}
