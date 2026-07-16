import { createHash } from "node:crypto";

import type {
  AnalyticsCustomDimensions,
  AnalyticsDimensions,
  AnalyticsEventEnvelope
} from "../../shared-types/src/index.js";
import {
  createPostgresAnalyticsCorrelationStore,
  hashAnalyticsCorrelationValue,
  hashAnalyticsSessionSubject
} from "./analytics-correlation-store.js";
import { recordAnalyticsUniqueRollupSubject } from "./analytics-rollup-uniques.js";
import { runInTransaction } from "./transaction.js";
import type { Queryable } from "./types.js";

type AnalyticsBucketGranularity = "hour" | "day";

interface AnalyticsRollupScope {
  projectId: string;
  service: string;
  environment: string;
  bucketStart: string;
  bucketGranularity: AnalyticsBucketGranularity;
  dimensions: Record<string, unknown>;
  dimensionHash: string;
  deviceType: string;
  browserFamily: string | null;
  osFamily: string | null;
  language: string | null;
  countryCode: string | null;
  authState: string;
  traceIdHash: string | null;
  deployId: string | null;
}

interface AnalyticsSessionDeltas {
  sessions: number;
  activeVisitors: number;
  newVisitors: number;
  returningVisitors: number;
  bounces: number;
  exits: number;
  totalDurationMs: number;
  totalPageviews: number;
}

interface AnalyticsRouteDeltas {
  pageviews: number;
  uniqueSessions: number;
  entrances: number;
  exits: number;
  bounces: number;
  durationBucketCounts: Record<string, number>;
}

interface AnalyticsActionDeltas {
  eventCount: number;
  uniqueSessions: number;
}

interface AnalyticsTransitionDeltas {
  transitionCount: number;
  uniqueSessions: number;
}

interface AnalyticsFunnelDeltas {
  sessionsEntered: number;
  sessionsCompleted: number;
}

export interface AnalyticsRollupStore {
  recordAnalyticsEvent(input: {
    project_id: string;
    event: AnalyticsEventEnvelope;
  }): Promise<{ recorded: boolean }>;
}

export function createPostgresAnalyticsRollupStore(db: Queryable): AnalyticsRollupStore {
  return {
    async recordAnalyticsEvent(input) {
      return runInTransaction(db, async (tx) => {
        const ledger = await tx.query<{ event_id: string }>(
          `
            INSERT INTO analytics_ingestion_ledger (
              project_id,
              event_id,
              occurred_at,
              dedupe_key
            )
            VALUES ($1, $2, $3, $4)
            ON CONFLICT DO NOTHING
            RETURNING event_id::text AS event_id
          `,
          [
            input.project_id,
            input.event.event_id,
            input.event.occurred_at,
            buildAnalyticsEventDedupeKey(input.project_id, input.event)
          ]
        );

        if (ledger.rows.length === 0) {
          return { recorded: false };
        }

        const dimensions = buildAnalyticsDimensions(
          input.event.payload.dimensions,
          input.event.payload.custom_dimensions ?? {},
          input.event.correlation.deploy_id
        );
        const dimensionHash = hashStableJson(dimensions);
        const sessionSubjectHash = hashAnalyticsSessionSubject(
          input.project_id,
          input.event.correlation.session_id
        );
        const routeKey = getRouteKey(input.event);
        const transitionKey = getTransitionKey(input.event);
        const actionKey = getActionKey(input.event);
        const funnelSignal = await resolveFunnelSignal(tx, input.project_id, input.event);
        const persistentVisitorHash =
          input.event.correlation.visitor_id_hash ?? input.event.correlation.user_id_hash;
        const visitorSubjectHash = persistentVisitorHash ?? sessionSubjectHash;
        const visitorClassification =
          input.event.payload.kind === "session_start" && persistentVisitorHash !== null
            ? await classifyAnalyticsVisitor(tx, input.project_id, persistentVisitorHash, input.event.occurred_at)
            : null;
        const sessionMetrics = input.event.payload.session;
        const isSessionSummary = input.event.payload.kind === "session_summary";
        const isBounce = isSessionSummary && (sessionMetrics?.pageviews ?? 0) <= 1;

        for (const bucketGranularity of ["hour", "day"] as const) {
          const scope: AnalyticsRollupScope = {
            projectId: input.project_id,
            service: input.event.service.name,
            environment: input.event.service.environment,
            bucketStart: getBucketStart(input.event.occurred_at, bucketGranularity),
            bucketGranularity,
            dimensions,
            dimensionHash,
            deviceType: input.event.payload.dimensions.device_type,
            browserFamily: input.event.payload.dimensions.browser_family,
            osFamily: input.event.payload.dimensions.os_family,
            language: input.event.payload.dimensions.language,
            countryCode: input.event.payload.dimensions.country_code,
            authState: input.event.payload.dimensions.auth_state,
            traceIdHash: hashAnalyticsCorrelationValue(input.event.correlation.trace_id),
            deployId: input.event.correlation.deploy_id
          };

          const sessionSubject = await recordAnalyticsUniqueRollupSubject(tx, {
            ...scope,
            rollupKind: "session",
            rollupKey: "active",
            subjectHash: sessionSubjectHash
          });
          const visitorSubject = await recordAnalyticsUniqueRollupSubject(tx, {
            ...scope,
            rollupKind: "visitor",
            rollupKey: "active",
            subjectHash: visitorSubjectHash
          });
          const newVisitorSubject = visitorClassification === "new"
            ? await recordAnalyticsUniqueRollupSubject(tx, {
                ...scope,
                rollupKind: "new_visitor",
                rollupKey: "active",
                subjectHash: visitorSubjectHash
              })
            : null;
          const returningVisitorSubject = visitorClassification === "returning"
            ? await recordAnalyticsUniqueRollupSubject(tx, {
                ...scope,
                rollupKind: "returning_visitor",
                rollupKey: "active",
                subjectHash: visitorSubjectHash
              })
            : null;
          await upsertSessionRollup(tx, scope, {
            sessions: sessionSubject.inserted ? 1 : 0,
            activeVisitors: visitorSubject.inserted ? 1 : 0,
            newVisitors: newVisitorSubject?.inserted === true ? 1 : 0,
            returningVisitors: returningVisitorSubject?.inserted === true ? 1 : 0,
            bounces: isBounce ? 1 : 0,
            exits: isSessionSummary ? 1 : 0,
            totalDurationMs: isSessionSummary ? (sessionMetrics?.duration_ms ?? 0) : 0,
            totalPageviews: isPageViewLike(input.event) ? 1 : 0
          });

          if (routeKey !== null && isPageViewLike(input.event)) {
            const routeSessionSubject = await recordAnalyticsUniqueRollupSubject(tx, {
              ...scope,
              rollupKind: "route_session",
              rollupKey: routeKey,
              subjectHash: sessionSubjectHash
            });
            await upsertRouteRollup(tx, scope, routeKey, {
              pageviews: 1,
              uniqueSessions: routeSessionSubject.inserted ? 1 : 0,
              entrances: input.event.payload.kind === "page_view" ? 1 : 0,
              exits: 0,
              bounces: 0,
              durationBucketCounts: {}
            });
            if (routeSessionSubject.inserted || routeSessionSubject.correlation_enriched) {
              await createPostgresAnalyticsCorrelationStore(tx).linkAnalyticsRouteSession({
                project_id: scope.projectId,
                service: scope.service,
                environment: scope.environment,
                bucket_start: scope.bucketStart,
                bucket_granularity: scope.bucketGranularity,
                route_key: routeKey,
                dimension_hash: scope.dimensionHash,
                subject_hash: sessionSubjectHash,
                trace_id_hash: scope.traceIdHash
              });
            }
          }

          if (routeKey !== null && isSessionSummary) {
            await upsertRouteRollup(tx, scope, routeKey, {
              pageviews: 0,
              uniqueSessions: 0,
              entrances: 0,
              exits: 1,
              bounces: isBounce ? 1 : 0,
              durationBucketCounts: toDurationBucketCounts(sessionMetrics?.duration_ms ?? 0)
            });
          }

          if (transitionKey !== null) {
            const transitionRollupKey = `${transitionKey.fromRouteKey}|${transitionKey.toRouteKey}`;
            const transitionSessionSubject = await recordAnalyticsUniqueRollupSubject(tx, {
              ...scope,
              rollupKind: "transition_session",
              rollupKey: transitionRollupKey,
              subjectHash: sessionSubjectHash
            });
            await upsertTransitionRollup(tx, scope, transitionKey, {
              transitionCount: 1,
              uniqueSessions: transitionSessionSubject.inserted ? 1 : 0
            });
          }

          if (actionKey !== null) {
            const actionRollupKey = `${actionKey.routeKey}|${actionKey.actionKey}`;
            const actionSessionSubject = await recordAnalyticsUniqueRollupSubject(tx, {
              ...scope,
              rollupKind: "action_session",
              rollupKey: actionRollupKey,
              subjectHash: sessionSubjectHash
            });
            await upsertActionRollup(tx, scope, actionKey, {
              eventCount: 1,
              uniqueSessions: actionSessionSubject.inserted ? 1 : 0
            });
          }

          if (funnelSignal !== null) {
            const funnelRollupKey = `${funnelSignal.funnelKey}|${funnelSignal.stepKey}`;
            const funnelStepSubject = await recordAnalyticsUniqueRollupSubject(tx, {
              ...scope,
              rollupKind: "funnel_step_session",
              rollupKey: funnelRollupKey,
              subjectHash: sessionSubjectHash
            });
            const funnelCompletionSubject = funnelSignal.isCompletion
              ? await recordAnalyticsUniqueRollupSubject(tx, {
                  ...scope,
                  rollupKind: "funnel_completion_session",
                  rollupKey: funnelRollupKey,
                  subjectHash: sessionSubjectHash
                })
              : null;
            await upsertFunnelRollup(tx, scope, funnelSignal, {
              sessionsEntered: funnelStepSubject.inserted ? 1 : 0,
              sessionsCompleted: funnelCompletionSubject?.inserted === true ? 1 : 0
            });
          }
        }

        return { recorded: true };
      });
    }
  };
}

function buildAnalyticsEventDedupeKey(projectId: string, event: AnalyticsEventEnvelope): string {
  return hashStableJson({
    project_id: projectId,
    event_id: event.event_id,
    occurred_at: event.occurred_at,
    event_type: event.event_type
  });
}

function buildAnalyticsDimensions(
  dimensions: AnalyticsDimensions,
  customDimensions: AnalyticsCustomDimensions,
  deployId: string | null
): Record<string, unknown> {
  return {
    auth_state: dimensions.auth_state,
    device_type: dimensions.device_type,
    browser_family: dimensions.browser_family,
    browser_major: dimensions.browser_major,
    os_family: dimensions.os_family,
    os_major: dimensions.os_major,
    language: dimensions.language,
    locale: dimensions.locale,
    viewport_bucket: dimensions.viewport_bucket,
    referrer_domain: dimensions.referrer_domain,
    utm_source: dimensions.utm_source,
    utm_medium: dimensions.utm_medium,
    utm_campaign: dimensions.utm_campaign,
    country_code: dimensions.country_code,
    region_code: dimensions.region_code,
    ...(deployId === null ? {} : { deploy_id: deployId }),
    custom_dimensions: sortRecord(customDimensions)
  };
}

function sortRecord(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => left.localeCompare(right))
  );
}

function hashStableJson(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
    left.localeCompare(right)
  );
  return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableJson(entryValue)}`).join(",")}}`;
}

function getBucketStart(occurredAt: string, granularity: AnalyticsBucketGranularity): string {
  const date = new Date(occurredAt);
  if (granularity === "hour") {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours())
    ).toISOString();
  }

  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  ).toISOString();
}

async function classifyAnalyticsVisitor(
  db: Queryable,
  projectId: string,
  visitorHash: string,
  occurredAt: string
): Promise<"new" | "returning"> {
  const result = await db.query<{ is_new: boolean }>(
    `
      WITH inserted AS (
        INSERT INTO analytics_visitor_first_seen (
          project_id,
          visitor_hash,
          first_seen_at,
          last_seen_at
        )
        VALUES ($1::uuid, $2, $3::timestamptz, $3::timestamptz)
        ON CONFLICT DO NOTHING
        RETURNING 1
      ),
      updated AS (
        UPDATE analytics_visitor_first_seen
        SET
          first_seen_at = LEAST(first_seen_at, $3::timestamptz),
          last_seen_at = GREATEST(last_seen_at, $3::timestamptz)
        WHERE project_id = $1::uuid
          AND visitor_hash = $2
          AND NOT EXISTS (SELECT 1 FROM inserted)
        RETURNING 1
      )
      SELECT EXISTS(SELECT 1 FROM inserted) AS is_new
    `,
    [projectId, visitorHash, occurredAt]
  );
  return result.rows[0]?.is_new === true ? "new" : "returning";
}

function toDurationBucketCounts(durationMs: number): Record<string, number> {
  const bucket = durationMs < 10_000
    ? "under_10s"
    : durationMs < 30_000
      ? "10s_to_30s"
      : durationMs < 60_000
        ? "30s_to_60s"
        : durationMs < 180_000
          ? "1m_to_3m"
          : "over_3m";
  return { [bucket]: 1 };
}

function getRouteKey(event: AnalyticsEventEnvelope): string | null {
  const route = event.payload.route;
  const key = route?.normalized_path ?? route?.path ?? null;
  return key === null || key.length === 0 ? null : key;
}

function getPreviousRouteKey(event: AnalyticsEventEnvelope): string | null {
  const route = event.payload.previous_route;
  const key = route?.normalized_path ?? route?.path ?? null;
  return key === null || key.length === 0 ? null : key;
}

function getTransitionKey(event: AnalyticsEventEnvelope): {
  fromRouteKey: string;
  toRouteKey: string;
} | null {
  if (event.payload.kind !== "route_change") {
    return null;
  }

  const fromRouteKey = getPreviousRouteKey(event);
  const toRouteKey = getRouteKey(event);
  if (fromRouteKey === null || toRouteKey === null) {
    return null;
  }

  return { fromRouteKey, toRouteKey };
}

function isPageViewLike(event: AnalyticsEventEnvelope): boolean {
  return event.payload.kind === "page_view" || event.payload.kind === "route_change";
}

function getActionKey(
  event: AnalyticsEventEnvelope
): { actionKey: string; routeKey: string } | null {
  const routeKey = getRouteKey(event) ?? "";
  if (event.payload.kind === "action" && typeof event.payload.signal?.action_key === "string") {
    return { actionKey: event.payload.signal.action_key, routeKey };
  }
  if (
    event.payload.kind === "conversion" &&
    typeof event.payload.signal?.conversion_key === "string"
  ) {
    return { actionKey: `conversion:${event.payload.signal.conversion_key}`, routeKey };
  }
  if (
    event.payload.kind === "journey_marker" &&
    typeof event.payload.signal?.marker_key === "string"
  ) {
    return { actionKey: `marker:${event.payload.signal.marker_key}`, routeKey };
  }

  return null;
}

async function resolveFunnelSignal(
  db: Queryable,
  projectId: string,
  event: AnalyticsEventEnvelope
): Promise<{
  funnelKey: string;
  stepKey: string;
  stepOrder: number;
  isCompletion: boolean;
} | null> {
  const funnelKey = event.payload.signal?.funnel_key;
  const stepKey = event.payload.signal?.step_key;
  if (event.payload.kind !== "funnel_step" || typeof funnelKey !== "string" || typeof stepKey !== "string") {
    return null;
  }

  const result = await db.query<{ step_order: unknown; step_count: unknown }>(
    `
      SELECT
        (step.ordinality - 1)::integer AS step_order,
        jsonb_array_length(definition.steps)::integer AS step_count
      FROM analytics_funnel_definitions definition
      CROSS JOIN LATERAL jsonb_array_elements(definition.steps) WITH ORDINALITY AS step(value, ordinality)
      WHERE definition.project_id = $1::uuid
        AND definition.funnel_key = $2
        AND definition.archived_at IS NULL
        AND step.value->>'step_key' = $3
      LIMIT 1
    `,
    [projectId, funnelKey, stepKey]
  );
  const row = result.rows[0];
  if (row === undefined) {
    return null;
  }
  const stepOrder = toNonNegativeInteger(row.step_order);
  const stepCount = Math.max(1, toNonNegativeInteger(row.step_count));
  return { funnelKey, stepKey, stepOrder, isCompletion: stepOrder === stepCount - 1 };
}

function toNonNegativeInteger(value: unknown): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

async function upsertSessionRollup(
  db: Queryable,
  scope: AnalyticsRollupScope,
  deltas: AnalyticsSessionDeltas
): Promise<void> {
  await db.query(
    `
      INSERT INTO analytics_session_rollups (
        project_id,
        service,
        environment,
        bucket_start,
        bucket_granularity,
        dimension_hash,
        dimensions,
        device_type,
        browser_family,
        os_family,
        language,
        country_code,
        auth_state,
        sessions,
        active_visitors,
        new_visitors,
        returning_visitors,
        bounces,
        exits,
        total_duration_ms,
        total_pageviews
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
      ON CONFLICT (
        project_id,
        service,
        environment,
        bucket_start,
        bucket_granularity,
        dimension_hash
      ) DO UPDATE SET
        sessions = analytics_session_rollups.sessions + EXCLUDED.sessions,
        active_visitors = analytics_session_rollups.active_visitors + EXCLUDED.active_visitors,
        new_visitors = analytics_session_rollups.new_visitors + EXCLUDED.new_visitors,
        returning_visitors = analytics_session_rollups.returning_visitors + EXCLUDED.returning_visitors,
        bounces = analytics_session_rollups.bounces + EXCLUDED.bounces,
        exits = analytics_session_rollups.exits + EXCLUDED.exits,
        total_duration_ms = analytics_session_rollups.total_duration_ms + EXCLUDED.total_duration_ms,
        total_pageviews = analytics_session_rollups.total_pageviews + EXCLUDED.total_pageviews,
        updated_at = now()
    `,
    [
      scope.projectId,
      scope.service,
      scope.environment,
      scope.bucketStart,
      scope.bucketGranularity,
      scope.dimensionHash,
      JSON.stringify(scope.dimensions),
      scope.deviceType,
      scope.browserFamily,
      scope.osFamily,
      scope.language,
      scope.countryCode,
      scope.authState,
      deltas.sessions,
      deltas.activeVisitors,
      deltas.newVisitors,
      deltas.returningVisitors,
      deltas.bounces,
      deltas.exits,
      deltas.totalDurationMs,
      deltas.totalPageviews
    ]
  );
}

async function upsertRouteRollup(
  db: Queryable,
  scope: AnalyticsRollupScope,
  routeKey: string,
  deltas: AnalyticsRouteDeltas
): Promise<void> {
  await db.query(
    `
      INSERT INTO analytics_route_rollups (
        project_id,
        service,
        environment,
        bucket_start,
        bucket_granularity,
        route_key,
        dimension_hash,
        dimensions,
        device_type,
        browser_family,
        os_family,
        language,
        country_code,
        auth_state,
        pageviews,
        unique_sessions,
        entrances,
        exits,
        bounces,
        duration_bucket_counts
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20::jsonb)
      ON CONFLICT (
        project_id,
        service,
        environment,
        bucket_start,
        bucket_granularity,
        route_key,
        dimension_hash
      ) DO UPDATE SET
        pageviews = analytics_route_rollups.pageviews + EXCLUDED.pageviews,
        unique_sessions = analytics_route_rollups.unique_sessions + EXCLUDED.unique_sessions,
        entrances = analytics_route_rollups.entrances + EXCLUDED.entrances,
        exits = analytics_route_rollups.exits + EXCLUDED.exits,
        bounces = analytics_route_rollups.bounces + EXCLUDED.bounces,
        duration_bucket_counts = jsonb_build_object(
          'under_10s',
          COALESCE((analytics_route_rollups.duration_bucket_counts->>'under_10s')::bigint, 0)
            + COALESCE((EXCLUDED.duration_bucket_counts->>'under_10s')::bigint, 0),
          '10s_to_30s',
          COALESCE((analytics_route_rollups.duration_bucket_counts->>'10s_to_30s')::bigint, 0)
            + COALESCE((EXCLUDED.duration_bucket_counts->>'10s_to_30s')::bigint, 0),
          '30s_to_60s',
          COALESCE((analytics_route_rollups.duration_bucket_counts->>'30s_to_60s')::bigint, 0)
            + COALESCE((EXCLUDED.duration_bucket_counts->>'30s_to_60s')::bigint, 0),
          '1m_to_3m',
          COALESCE((analytics_route_rollups.duration_bucket_counts->>'1m_to_3m')::bigint, 0)
            + COALESCE((EXCLUDED.duration_bucket_counts->>'1m_to_3m')::bigint, 0),
          'over_3m',
          COALESCE((analytics_route_rollups.duration_bucket_counts->>'over_3m')::bigint, 0)
            + COALESCE((EXCLUDED.duration_bucket_counts->>'over_3m')::bigint, 0)
        ),
        updated_at = now()
    `,
    [
      scope.projectId,
      scope.service,
      scope.environment,
      scope.bucketStart,
      scope.bucketGranularity,
      routeKey,
      scope.dimensionHash,
      JSON.stringify(scope.dimensions),
      scope.deviceType,
      scope.browserFamily,
      scope.osFamily,
      scope.language,
      scope.countryCode,
      scope.authState,
      deltas.pageviews,
      deltas.uniqueSessions,
      deltas.entrances,
      deltas.exits,
      deltas.bounces,
      JSON.stringify(deltas.durationBucketCounts)
    ]
  );
}

async function upsertActionRollup(
  db: Queryable,
  scope: AnalyticsRollupScope,
  action: { actionKey: string; routeKey: string },
  deltas: AnalyticsActionDeltas
): Promise<void> {
  await db.query(
    `
      INSERT INTO analytics_action_rollups (
        project_id,
        service,
        environment,
        bucket_start,
        bucket_granularity,
        action_key,
        route_key,
        dimension_hash,
        dimensions,
        device_type,
        browser_family,
        os_family,
        language,
        country_code,
        auth_state,
        event_count,
        unique_sessions
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14, $15, $16, $17)
      ON CONFLICT (
        project_id,
        service,
        environment,
        bucket_start,
        bucket_granularity,
        action_key,
        route_key,
        dimension_hash
      ) DO UPDATE SET
        event_count = analytics_action_rollups.event_count + EXCLUDED.event_count,
        unique_sessions = analytics_action_rollups.unique_sessions + EXCLUDED.unique_sessions,
        updated_at = now()
    `,
    [
      scope.projectId,
      scope.service,
      scope.environment,
      scope.bucketStart,
      scope.bucketGranularity,
      action.actionKey,
      action.routeKey,
      scope.dimensionHash,
      JSON.stringify(scope.dimensions),
      scope.deviceType,
      scope.browserFamily,
      scope.osFamily,
      scope.language,
      scope.countryCode,
      scope.authState,
      deltas.eventCount,
      deltas.uniqueSessions
    ]
  );
}

async function upsertTransitionRollup(
  db: Queryable,
  scope: AnalyticsRollupScope,
  transition: { fromRouteKey: string; toRouteKey: string },
  deltas: AnalyticsTransitionDeltas
): Promise<void> {
  await db.query(
    `
      INSERT INTO analytics_transition_rollups (
        project_id,
        service,
        environment,
        bucket_start,
        bucket_granularity,
        from_route_key,
        to_route_key,
        dimension_hash,
        dimensions,
        device_type,
        browser_family,
        os_family,
        language,
        country_code,
        auth_state,
        transition_count,
        unique_sessions
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14, $15, $16, $17)
      ON CONFLICT (
        project_id,
        service,
        environment,
        bucket_start,
        bucket_granularity,
        from_route_key,
        to_route_key,
        dimension_hash
      ) DO UPDATE SET
        transition_count = analytics_transition_rollups.transition_count + EXCLUDED.transition_count,
        unique_sessions = analytics_transition_rollups.unique_sessions + EXCLUDED.unique_sessions,
        updated_at = now()
    `,
    [
      scope.projectId,
      scope.service,
      scope.environment,
      scope.bucketStart,
      scope.bucketGranularity,
      transition.fromRouteKey,
      transition.toRouteKey,
      scope.dimensionHash,
      JSON.stringify(scope.dimensions),
      scope.deviceType,
      scope.browserFamily,
      scope.osFamily,
      scope.language,
      scope.countryCode,
      scope.authState,
      deltas.transitionCount,
      deltas.uniqueSessions
    ]
  );
}

async function upsertFunnelRollup(
  db: Queryable,
  scope: AnalyticsRollupScope,
  funnel: { funnelKey: string; stepKey: string; stepOrder: number },
  deltas: AnalyticsFunnelDeltas
): Promise<void> {
  await db.query(
    `
      INSERT INTO analytics_funnel_rollups (
        project_id,
        service,
        environment,
        bucket_start,
        bucket_granularity,
        funnel_key,
        step_key,
        step_order,
        dimension_hash,
        dimensions,
        device_type,
        browser_family,
        os_family,
        language,
        country_code,
        auth_state,
        sessions_entered,
        sessions_completed
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15, $16, $17, $18)
      ON CONFLICT (
        project_id,
        service,
        environment,
        bucket_start,
        bucket_granularity,
        funnel_key,
        step_key,
        dimension_hash
      ) DO UPDATE SET
        sessions_entered = analytics_funnel_rollups.sessions_entered + EXCLUDED.sessions_entered,
        sessions_completed = analytics_funnel_rollups.sessions_completed + EXCLUDED.sessions_completed,
        updated_at = now()
    `,
    [
      scope.projectId,
      scope.service,
      scope.environment,
      scope.bucketStart,
      scope.bucketGranularity,
      funnel.funnelKey,
      funnel.stepKey,
      funnel.stepOrder,
      scope.dimensionHash,
      JSON.stringify(scope.dimensions),
      scope.deviceType,
      scope.browserFamily,
      scope.osFamily,
      scope.language,
      scope.countryCode,
      scope.authState,
      deltas.sessionsEntered,
      deltas.sessionsCompleted
    ]
  );
}
