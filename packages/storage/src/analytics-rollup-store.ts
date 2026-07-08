import { createHash } from "node:crypto";

import type {
  AnalyticsCustomDimensions,
  AnalyticsDimensions,
  AnalyticsEventEnvelope
} from "../../shared-types/src/index.js";
import { evaluateAnalyticsFunnelDropoffOpportunities } from "./analytics-opportunity-evaluator.js";
import { runInTransaction } from "./transaction.js";
import type { Queryable } from "./types.js";

type AnalyticsBucketGranularity = "hour" | "day";

type AnalyticsRollupKind =
  | "session"
  | "route_session"
  | "transition_session"
  | "action_session"
  | "funnel_step_session"
  | "funnel_completion_session";

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
}

interface AnalyticsSessionDeltas {
  sessions: number;
  exits: number;
  totalPageviews: number;
}

interface AnalyticsRouteDeltas {
  pageviews: number;
  uniqueSessions: number;
  entrances: number;
  exits: number;
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

        const dimensions = buildAnalyticsDimensions(input.event.payload.dimensions, input.event.payload.custom_dimensions ?? {});
        const dimensionHash = hashStableJson(dimensions);
        const sessionSubjectHash = hashStableJson({
          project_id: input.project_id,
          session_id: input.event.correlation.session_id
        });
        const routeKey = getRouteKey(input.event);
        const transitionKey = getTransitionKey(input.event);
        const actionKey = getActionKey(input.event);
        const funnelSignal = getFunnelSignal(input.event);

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
            authState: input.event.payload.dimensions.auth_state
          };

          const countedSession = await insertUniqueRollupSubject(tx, {
            ...scope,
            rollupKind: "session",
            rollupKey: "active",
            subjectHash: sessionSubjectHash
          });
          await upsertSessionRollup(tx, scope, {
            sessions: countedSession ? 1 : 0,
            exits: input.event.payload.kind === "session_summary" ? 1 : 0,
            totalPageviews: isPageViewLike(input.event) ? 1 : 0
          });

          if (routeKey !== null && isPageViewLike(input.event)) {
            const countedRouteSession = await insertUniqueRollupSubject(tx, {
              ...scope,
              rollupKind: "route_session",
              rollupKey: routeKey,
              subjectHash: sessionSubjectHash
            });
            await upsertRouteRollup(tx, scope, routeKey, {
              pageviews: 1,
              uniqueSessions: countedRouteSession ? 1 : 0,
              entrances: input.event.payload.kind === "page_view" ? 1 : 0,
              exits: 0
            });
          }

          if (transitionKey !== null) {
            const transitionRollupKey = `${transitionKey.fromRouteKey}|${transitionKey.toRouteKey}`;
            const countedTransitionSession = await insertUniqueRollupSubject(tx, {
              ...scope,
              rollupKind: "transition_session",
              rollupKey: transitionRollupKey,
              subjectHash: sessionSubjectHash
            });
            await upsertTransitionRollup(tx, scope, transitionKey, {
              transitionCount: 1,
              uniqueSessions: countedTransitionSession ? 1 : 0
            });
          }

          if (actionKey !== null) {
            const actionRollupKey = `${actionKey.routeKey}|${actionKey.actionKey}`;
            const countedActionSession = await insertUniqueRollupSubject(tx, {
              ...scope,
              rollupKind: "action_session",
              rollupKey: actionRollupKey,
              subjectHash: sessionSubjectHash
            });
            await upsertActionRollup(tx, scope, actionKey, {
              eventCount: 1,
              uniqueSessions: countedActionSession ? 1 : 0
            });
          }

          if (funnelSignal !== null) {
            const funnelRollupKey = `${funnelSignal.funnelKey}|${funnelSignal.stepKey}`;
            const countedFunnelSession = await insertUniqueRollupSubject(tx, {
              ...scope,
              rollupKind: funnelSignal.isCompletion ? "funnel_completion_session" : "funnel_step_session",
              rollupKey: funnelRollupKey,
              subjectHash: sessionSubjectHash
            });
            await upsertFunnelRollup(tx, scope, funnelSignal, {
              sessionsEntered: funnelSignal.isCompletion ? 0 : countedFunnelSession ? 1 : 0,
              sessionsCompleted: funnelSignal.isCompletion ? countedFunnelSession ? 1 : 0 : 0
            });
          }
        }

        if (funnelSignal !== null) {
          await evaluateAnalyticsFunnelDropoffOpportunities(tx, {
            project_id: input.project_id,
            occurred_at: input.event.occurred_at,
            service: input.event.service.name,
            environment: input.event.service.environment
          });
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
  customDimensions: AnalyticsCustomDimensions
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
    custom_dimensions: sortRecord(customDimensions)
  };
}

function sortRecord(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).sort(([left], [right]) => left.localeCompare(right)));
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
    return new Date(Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      date.getUTCHours()
    )).toISOString();
  }

  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString();
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

function getActionKey(event: AnalyticsEventEnvelope): { actionKey: string; routeKey: string } | null {
  const routeKey = getRouteKey(event) ?? "";
  if (event.payload.kind === "action" && typeof event.payload.signal?.action_key === "string") {
    return { actionKey: event.payload.signal.action_key, routeKey };
  }
  if (event.payload.kind === "conversion" && typeof event.payload.signal?.conversion_key === "string") {
    return { actionKey: `conversion:${event.payload.signal.conversion_key}`, routeKey };
  }
  if (event.payload.kind === "journey_marker" && typeof event.payload.signal?.marker_key === "string") {
    return { actionKey: `marker:${event.payload.signal.marker_key}`, routeKey };
  }

  return null;
}

function getFunnelSignal(event: AnalyticsEventEnvelope): {
  funnelKey: string;
  stepKey: string;
  stepOrder: number;
  isCompletion: boolean;
} | null {
  if (
    event.payload.kind === "funnel_step" &&
    typeof event.payload.signal?.funnel_key === "string" &&
    typeof event.payload.signal?.step_key === "string"
  ) {
    return {
      funnelKey: event.payload.signal.funnel_key,
      stepKey: event.payload.signal.step_key,
      stepOrder: 0,
      isCompletion: false
    };
  }

  if (
    event.payload.kind === "conversion" &&
    typeof event.payload.signal?.funnel_key === "string" &&
    typeof event.payload.signal?.conversion_key === "string"
  ) {
    return {
      funnelKey: event.payload.signal.funnel_key,
      stepKey: event.payload.signal.conversion_key,
      stepOrder: 0,
      isCompletion: true
    };
  }

  return null;
}

async function insertUniqueRollupSubject(
  db: Queryable,
  input: AnalyticsRollupScope & {
    rollupKind: AnalyticsRollupKind;
    rollupKey: string;
    subjectHash: string;
  }
): Promise<boolean> {
  const result = await db.query<{ subject_hash: string }>(
    `
      INSERT INTO analytics_rollup_uniques (
        project_id,
        rollup_kind,
        service,
        environment,
        bucket_start,
        bucket_granularity,
        rollup_key,
        dimension_hash,
        subject_hash
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT DO NOTHING
      RETURNING subject_hash
    `,
    [
      input.projectId,
      input.rollupKind,
      input.service,
      input.environment,
      input.bucketStart,
      input.bucketGranularity,
      input.rollupKey,
      input.dimensionHash,
      input.subjectHash
    ]
  );

  return result.rows.length > 0;
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
        exits,
        total_pageviews
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      ON CONFLICT (
        project_id,
        service,
        environment,
        bucket_start,
        bucket_granularity,
        dimension_hash
      ) DO UPDATE SET
        sessions = analytics_session_rollups.sessions + EXCLUDED.sessions,
        exits = analytics_session_rollups.exits + EXCLUDED.exits,
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
      deltas.exits,
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
        exits
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
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
      deltas.exits
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
