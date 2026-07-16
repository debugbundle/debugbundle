import type { Queryable } from "./types.js";
import { runInTransaction } from "./transaction.js";

export interface AnalyticsAllowanceUsageSummary {
  monthly_analytics_events: number;
  monthly_analytics_sessions: number;
  monthly_analytics_journey_samples: number;
  monthly_analytics_bundle_generations: number;
}

export interface AnalyticsAllowanceClaimInput {
  organization_id: string;
  period_starts_at: string;
  analytics_events: number;
  analytics_sessions: number;
  analytics_journey_samples: number;
  analytics_bundle_generations: number;
  limits: AnalyticsAllowanceUsageSummary;
  claims?: AnalyticsAllowanceIdempotencyClaim[] | undefined;
}

export type AnalyticsAllowanceClaimMetric =
  | "analytics_events"
  | "analytics_sessions"
  | "analytics_journey_samples"
  | "analytics_bundle_generations";

export interface AnalyticsAllowanceIdempotencyClaim {
  claim_key: string;
  metric: AnalyticsAllowanceClaimMetric;
}

export interface AnalyticsAllowanceReleaseInput {
  organization_id: string;
  period_starts_at: string;
  analytics_events: number;
  analytics_sessions: number;
  analytics_journey_samples: number;
  analytics_bundle_generations: number;
  claim_keys?: string[] | undefined;
}

export type AnalyticsAllowanceMetric =
  | "monthly_analytics_events"
  | "monthly_analytics_sessions"
  | "monthly_analytics_journey_samples"
  | "monthly_analytics_bundle_generations";

export type AnalyticsAllowanceClaimResult =
  | {
      allowed: true;
      usage: AnalyticsAllowanceUsageSummary;
      claimed_keys?: string[];
    }
  | {
      allowed: false;
      metric: AnalyticsAllowanceMetric;
      used: number;
      limit: number;
      usage: AnalyticsAllowanceUsageSummary;
    };

export interface AnalyticsUsageStore {
  getAnalyticsUsageForOrganization(input: {
    organization_id: string;
    period_starts_at: string;
  }): Promise<AnalyticsAllowanceUsageSummary>;
  claimAnalyticsUsageForOrganization(input: AnalyticsAllowanceClaimInput): Promise<AnalyticsAllowanceClaimResult>;
  releaseAnalyticsUsageForOrganization(input: AnalyticsAllowanceReleaseInput): Promise<void>;
}

type AnalyticsUsageCounterRow = {
  analytics_events: number | string;
  analytics_sessions: number | string;
  analytics_journey_samples: number | string;
  analytics_bundle_generations: number | string;
};

function readCount(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toUsageSummary(row: AnalyticsUsageCounterRow | undefined): AnalyticsAllowanceUsageSummary {
  return {
    monthly_analytics_events: readCount(row?.analytics_events),
    monthly_analytics_sessions: readCount(row?.analytics_sessions),
    monthly_analytics_journey_samples: readCount(row?.analytics_journey_samples),
    monthly_analytics_bundle_generations: readCount(row?.analytics_bundle_generations)
  };
}

function findExceededMetric(input: {
  usage: AnalyticsAllowanceUsageSummary;
  limits: AnalyticsAllowanceUsageSummary;
}): Exclude<AnalyticsAllowanceClaimResult, { allowed: true }> | null {
  if (input.usage.monthly_analytics_events > input.limits.monthly_analytics_events) {
    return {
      allowed: false,
      metric: "monthly_analytics_events",
      used: input.usage.monthly_analytics_events,
      limit: input.limits.monthly_analytics_events,
      usage: input.usage
    };
  }
  if (input.usage.monthly_analytics_sessions > input.limits.monthly_analytics_sessions) {
    return {
      allowed: false,
      metric: "monthly_analytics_sessions",
      used: input.usage.monthly_analytics_sessions,
      limit: input.limits.monthly_analytics_sessions,
      usage: input.usage
    };
  }
  if (
    input.usage.monthly_analytics_journey_samples >
    input.limits.monthly_analytics_journey_samples
  ) {
    return {
      allowed: false,
      metric: "monthly_analytics_journey_samples",
      used: input.usage.monthly_analytics_journey_samples,
      limit: input.limits.monthly_analytics_journey_samples,
      usage: input.usage
    };
  }
  if (
    input.usage.monthly_analytics_bundle_generations >
    input.limits.monthly_analytics_bundle_generations
  ) {
    return {
      allowed: false,
      metric: "monthly_analytics_bundle_generations",
      used: input.usage.monthly_analytics_bundle_generations,
      limit: input.limits.monthly_analytics_bundle_generations,
      usage: input.usage
    };
  }

  return null;
}

function buildRequestedUsage(input: AnalyticsAllowanceClaimInput): AnalyticsAllowanceUsageSummary {
  return {
    monthly_analytics_events: Math.max(0, input.analytics_events),
    monthly_analytics_sessions: Math.max(0, input.analytics_sessions),
    monthly_analytics_journey_samples: Math.max(0, input.analytics_journey_samples),
    monthly_analytics_bundle_generations: Math.max(0, input.analytics_bundle_generations)
  };
}

export function createPostgresAnalyticsUsageStore(db: Queryable): AnalyticsUsageStore {
  async function getAnalyticsUsageForOrganization(input: {
    organization_id: string;
    period_starts_at: string;
  }): Promise<AnalyticsAllowanceUsageSummary> {
    const result = await db.query<AnalyticsUsageCounterRow>(
      `
        SELECT
          analytics_events,
          analytics_sessions,
          analytics_journey_samples,
          analytics_bundle_generations
        FROM analytics_usage_counters
        WHERE organization_id = $1::uuid
          AND period_starts_at = $2::timestamptz
      `,
      [input.organization_id, input.period_starts_at]
    );

    return toUsageSummary(result.rows[0]);
  }

  return {
    getAnalyticsUsageForOrganization,

    async claimAnalyticsUsageForOrganization(input) {
      if (input.claims !== undefined) {
        return claimIdempotentAnalyticsUsage(db, input);
      }
      const requested = buildRequestedUsage(input);
      const requestedExceeded = findExceededMetric({
        usage: requested,
        limits: input.limits
      });
      if (requestedExceeded !== null) {
        return requestedExceeded;
      }

      if (
        requested.monthly_analytics_events === 0 &&
        requested.monthly_analytics_sessions === 0 &&
        requested.monthly_analytics_journey_samples === 0 &&
        requested.monthly_analytics_bundle_generations === 0
      ) {
        return {
          allowed: true,
          usage: await getAnalyticsUsageForOrganization(input)
        };
      }

      const result = await db.query<AnalyticsUsageCounterRow>(
        `
          INSERT INTO analytics_usage_counters (
            organization_id,
            period_starts_at,
            analytics_events,
            analytics_sessions,
            analytics_journey_samples,
            analytics_bundle_generations,
            updated_at
          )
          VALUES ($1::uuid, $2::timestamptz, $3, $4, $5, $6, now())
          ON CONFLICT (organization_id, period_starts_at)
          DO UPDATE SET
            analytics_events = analytics_usage_counters.analytics_events + EXCLUDED.analytics_events,
            analytics_sessions = analytics_usage_counters.analytics_sessions + EXCLUDED.analytics_sessions,
            analytics_journey_samples =
              analytics_usage_counters.analytics_journey_samples + EXCLUDED.analytics_journey_samples,
            analytics_bundle_generations =
              analytics_usage_counters.analytics_bundle_generations + EXCLUDED.analytics_bundle_generations,
            updated_at = now()
          WHERE analytics_usage_counters.analytics_events + EXCLUDED.analytics_events <= $7
            AND analytics_usage_counters.analytics_sessions + EXCLUDED.analytics_sessions <= $8
            AND analytics_usage_counters.analytics_journey_samples + EXCLUDED.analytics_journey_samples <= $9
            AND analytics_usage_counters.analytics_bundle_generations + EXCLUDED.analytics_bundle_generations <= $10
          RETURNING analytics_events, analytics_sessions, analytics_journey_samples, analytics_bundle_generations
        `,
        [
          input.organization_id,
          input.period_starts_at,
          requested.monthly_analytics_events,
          requested.monthly_analytics_sessions,
          requested.monthly_analytics_journey_samples,
          requested.monthly_analytics_bundle_generations,
          input.limits.monthly_analytics_events,
          input.limits.monthly_analytics_sessions,
          input.limits.monthly_analytics_journey_samples,
          input.limits.monthly_analytics_bundle_generations
        ]
      );
      if (result.rows.length > 0) {
        return {
          allowed: true,
          usage: toUsageSummary(result.rows[0])
        };
      }

      const currentUsage = await getAnalyticsUsageForOrganization(input);
      const exceeded = findExceededMetric({
        usage: {
          monthly_analytics_events: currentUsage.monthly_analytics_events + requested.monthly_analytics_events,
          monthly_analytics_sessions: currentUsage.monthly_analytics_sessions + requested.monthly_analytics_sessions,
          monthly_analytics_journey_samples:
            currentUsage.monthly_analytics_journey_samples + requested.monthly_analytics_journey_samples,
          monthly_analytics_bundle_generations:
            currentUsage.monthly_analytics_bundle_generations + requested.monthly_analytics_bundle_generations
        },
        limits: input.limits
      });
      return exceeded ?? {
        allowed: false,
        metric: "monthly_analytics_events",
        used: currentUsage.monthly_analytics_events,
        limit: input.limits.monthly_analytics_events,
        usage: currentUsage
      };
    },

    async releaseAnalyticsUsageForOrganization(input) {
      if (input.claim_keys !== undefined) {
        if (input.claim_keys.length === 0) {
          return;
        }
        await releaseIdempotentAnalyticsUsage(db, input);
        return;
      }
      await db.query(
        `
          UPDATE analytics_usage_counters
          SET
            analytics_events = GREATEST(0, analytics_events - $3),
            analytics_sessions = GREATEST(0, analytics_sessions - $4),
            analytics_journey_samples = GREATEST(0, analytics_journey_samples - $5),
            analytics_bundle_generations = GREATEST(0, analytics_bundle_generations - $6),
            updated_at = now()
          WHERE organization_id = $1::uuid
            AND period_starts_at = $2::timestamptz
        `,
        [
          input.organization_id,
          input.period_starts_at,
          Math.max(0, input.analytics_events),
          Math.max(0, input.analytics_sessions),
          Math.max(0, input.analytics_journey_samples),
          Math.max(0, input.analytics_bundle_generations)
        ]
      );
    }
  };
}

async function claimIdempotentAnalyticsUsage(
  db: Queryable,
  input: AnalyticsAllowanceClaimInput
): Promise<AnalyticsAllowanceClaimResult> {
  const claims = normalizeIdempotencyClaims(input.claims ?? []);
  return runInTransaction(db, async (tx) => {
    await tx.query(
      `
        INSERT INTO analytics_usage_counters (organization_id, period_starts_at)
        VALUES ($1::uuid, $2::timestamptz)
        ON CONFLICT DO NOTHING
      `,
      [input.organization_id, input.period_starts_at]
    );
    const locked = await tx.query<AnalyticsUsageCounterRow>(
      `
        SELECT analytics_events, analytics_sessions, analytics_journey_samples,
          analytics_bundle_generations
        FROM analytics_usage_counters
        WHERE organization_id = $1::uuid
          AND period_starts_at = $2::timestamptz
        FOR UPDATE
      `,
      [input.organization_id, input.period_starts_at]
    );
    const current = toUsageSummary(locked.rows[0]);
    if (claims.length === 0) {
      return { allowed: true, usage: current, claimed_keys: [] };
    }

    const existing = await tx.query<{ claim_key: string }>(
      `
        SELECT claim_key
        FROM analytics_usage_claims
        WHERE organization_id = $1::uuid
          AND period_starts_at = $2::timestamptz
          AND claim_key = ANY($3::text[])
      `,
      [input.organization_id, input.period_starts_at, claims.map((claim) => claim.claim_key)]
    );
    const existingKeys = new Set(existing.rows.map((row) => row.claim_key));
    const newClaims = claims.filter((claim) => !existingKeys.has(claim.claim_key));
    const deltas = usageFromClaims(newClaims);
    const projected = addUsage(current, deltas);
    const exceeded = findExceededMetric({ usage: projected, limits: input.limits });
    if (exceeded !== null) {
      return exceeded;
    }

    if (newClaims.length > 0) {
      await tx.query(
        `
          UPDATE analytics_usage_counters
          SET
            analytics_events = analytics_events + $3,
            analytics_sessions = analytics_sessions + $4,
            analytics_journey_samples = analytics_journey_samples + $5,
            analytics_bundle_generations = analytics_bundle_generations + $6,
            updated_at = now()
          WHERE organization_id = $1::uuid
            AND period_starts_at = $2::timestamptz
        `,
        [
          input.organization_id,
          input.period_starts_at,
          deltas.monthly_analytics_events,
          deltas.monthly_analytics_sessions,
          deltas.monthly_analytics_journey_samples,
          deltas.monthly_analytics_bundle_generations
        ]
      );
      await tx.query(
        `
          INSERT INTO analytics_usage_claims (
            organization_id,
            period_starts_at,
            claim_key,
            metric
          )
          SELECT $1::uuid, $2::timestamptz, claims.claim_key, claims.metric
          FROM unnest($3::text[], $4::text[]) AS claims(claim_key, metric)
          ON CONFLICT DO NOTHING
        `,
        [
          input.organization_id,
          input.period_starts_at,
          newClaims.map((claim) => claim.claim_key),
          newClaims.map((claim) => claim.metric)
        ]
      );
    }
    return {
      allowed: true,
      usage: projected,
      claimed_keys: newClaims.map((claim) => claim.claim_key)
    };
  });
}

async function releaseIdempotentAnalyticsUsage(
  db: Queryable,
  input: AnalyticsAllowanceReleaseInput
): Promise<void> {
  await db.query(
    `
      WITH deleted AS (
        DELETE FROM analytics_usage_claims
        WHERE organization_id = $1::uuid
          AND period_starts_at = $2::timestamptz
          AND claim_key = ANY($3::text[])
        RETURNING metric
      ),
      deltas AS (
        SELECT
          COUNT(*) FILTER (WHERE metric = 'analytics_events')::bigint AS analytics_events,
          COUNT(*) FILTER (WHERE metric = 'analytics_sessions')::bigint AS analytics_sessions,
          COUNT(*) FILTER (WHERE metric = 'analytics_journey_samples')::bigint AS analytics_journey_samples,
          COUNT(*) FILTER (WHERE metric = 'analytics_bundle_generations')::bigint AS analytics_bundle_generations
        FROM deleted
      )
      UPDATE analytics_usage_counters counters
      SET
        analytics_events = GREATEST(0, counters.analytics_events - deltas.analytics_events),
        analytics_sessions = GREATEST(0, counters.analytics_sessions - deltas.analytics_sessions),
        analytics_journey_samples = GREATEST(0, counters.analytics_journey_samples - deltas.analytics_journey_samples),
        analytics_bundle_generations = GREATEST(0, counters.analytics_bundle_generations - deltas.analytics_bundle_generations),
        updated_at = now()
      FROM deltas
      WHERE counters.organization_id = $1::uuid
        AND counters.period_starts_at = $2::timestamptz
    `,
    [input.organization_id, input.period_starts_at, input.claim_keys]
  );
}

function normalizeIdempotencyClaims(
  claims: AnalyticsAllowanceIdempotencyClaim[]
): AnalyticsAllowanceIdempotencyClaim[] {
  const unique = new Map<string, AnalyticsAllowanceIdempotencyClaim>();
  for (const claim of claims) {
    const key = claim.claim_key.trim().slice(0, 255);
    if (key.length > 0 && !unique.has(key)) {
      unique.set(key, { claim_key: key, metric: claim.metric });
    }
  }
  return [...unique.values()];
}

function usageFromClaims(claims: AnalyticsAllowanceIdempotencyClaim[]): AnalyticsAllowanceUsageSummary {
  const usage: AnalyticsAllowanceUsageSummary = {
    monthly_analytics_events: 0,
    monthly_analytics_sessions: 0,
    monthly_analytics_journey_samples: 0,
    monthly_analytics_bundle_generations: 0
  };
  for (const claim of claims) {
    usage[`monthly_${claim.metric}`] += 1;
  }
  return usage;
}

function addUsage(
  current: AnalyticsAllowanceUsageSummary,
  delta: AnalyticsAllowanceUsageSummary
): AnalyticsAllowanceUsageSummary {
  return {
    monthly_analytics_events: current.monthly_analytics_events + delta.monthly_analytics_events,
    monthly_analytics_sessions: current.monthly_analytics_sessions + delta.monthly_analytics_sessions,
    monthly_analytics_journey_samples:
      current.monthly_analytics_journey_samples + delta.monthly_analytics_journey_samples,
    monthly_analytics_bundle_generations:
      current.monthly_analytics_bundle_generations + delta.monthly_analytics_bundle_generations
  };
}
