import type { Queryable } from "./types.js";

export interface AnalyticsAllowanceUsageSummary {
  monthly_analytics_events: number;
  monthly_analytics_sessions: number;
  monthly_analytics_bundle_generations: number;
}

export interface AnalyticsAllowanceClaimInput {
  organization_id: string;
  period_starts_at: string;
  analytics_events: number;
  analytics_sessions: number;
  analytics_bundle_generations: number;
  limits: AnalyticsAllowanceUsageSummary;
}

export interface AnalyticsAllowanceReleaseInput {
  organization_id: string;
  period_starts_at: string;
  analytics_events: number;
  analytics_sessions: number;
  analytics_bundle_generations: number;
}

export type AnalyticsAllowanceMetric =
  | "monthly_analytics_events"
  | "monthly_analytics_sessions"
  | "monthly_analytics_bundle_generations";

export type AnalyticsAllowanceClaimResult =
  | {
      allowed: true;
      usage: AnalyticsAllowanceUsageSummary;
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
            analytics_bundle_generations,
            updated_at
          )
          VALUES ($1::uuid, $2::timestamptz, $3, $4, $5, now())
          ON CONFLICT (organization_id, period_starts_at)
          DO UPDATE SET
            analytics_events = analytics_usage_counters.analytics_events + EXCLUDED.analytics_events,
            analytics_sessions = analytics_usage_counters.analytics_sessions + EXCLUDED.analytics_sessions,
            analytics_bundle_generations =
              analytics_usage_counters.analytics_bundle_generations + EXCLUDED.analytics_bundle_generations,
            updated_at = now()
          WHERE analytics_usage_counters.analytics_events + EXCLUDED.analytics_events <= $6
            AND analytics_usage_counters.analytics_sessions + EXCLUDED.analytics_sessions <= $7
            AND analytics_usage_counters.analytics_bundle_generations + EXCLUDED.analytics_bundle_generations <= $8
          RETURNING analytics_events, analytics_sessions, analytics_bundle_generations
        `,
        [
          input.organization_id,
          input.period_starts_at,
          requested.monthly_analytics_events,
          requested.monthly_analytics_sessions,
          requested.monthly_analytics_bundle_generations,
          input.limits.monthly_analytics_events,
          input.limits.monthly_analytics_sessions,
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
      await db.query(
        `
          UPDATE analytics_usage_counters
          SET
            analytics_events = GREATEST(0, analytics_events - $3),
            analytics_sessions = GREATEST(0, analytics_sessions - $4),
            analytics_bundle_generations = GREATEST(0, analytics_bundle_generations - $5),
            updated_at = now()
          WHERE organization_id = $1::uuid
            AND period_starts_at = $2::timestamptz
        `,
        [
          input.organization_id,
          input.period_starts_at,
          Math.max(0, input.analytics_events),
          Math.max(0, input.analytics_sessions),
          Math.max(0, input.analytics_bundle_generations)
        ]
      );
    }
  };
}
