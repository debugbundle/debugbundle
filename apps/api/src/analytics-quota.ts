import {
  getTierCapabilities,
  isSelfHostMode
} from "../../../packages/shared-types/src/index.js";
import type {
  AnalyticsAllowanceReleaseInput,
  BillingSummaryRecord
} from "../../../packages/storage/src/index.js";
import type { ApiDependencies } from "./api-types.js";

export type AnalyticsQuotaMetric =
  | "monthly_analytics_events"
  | "monthly_analytics_sessions"
  | "monthly_analytics_journey_samples"
  | "monthly_analytics_bundle_generations";

export type AnalyticsQuotaClaim =
  | { allowed: true; release?: AnalyticsAllowanceReleaseInput }
  | {
      allowed: false;
      metric: AnalyticsQuotaMetric;
      used: number;
      limit: number;
      retry_after_ms: number;
      usage_window: {
        starts_at: string;
        ends_at: string;
      };
    };

type AnalyticsQuotaEvent = {
  event: {
    payload: {
      kind: string;
    };
    correlation: {
      session_id: string;
    };
  };
};

export function toRetryAfterSeconds(retryAfterMs: number): string {
  return String(Math.max(1, Math.ceil(retryAfterMs / 1_000)));
}

function getQuotaRetryAfterMs(resetAt: string, now: Date): number {
  return Math.max(1_000, new Date(resetAt).getTime() - now.getTime());
}

function getCapacityUnits(summary: BillingSummaryRecord): number {
  return Math.max(1, summary.capacity_units.total);
}

function countIncomingSessionStarts(events: AnalyticsQuotaEvent[]): number {
  const sessionIds = new Set<string>();
  for (const { event } of events) {
    if (event.payload.kind === "session_start") {
      sessionIds.add(event.correlation.session_id);
    }
  }
  return sessionIds.size;
}

function buildAnalyticsLimits(input: {
  organization_plan: string | undefined;
  billingSummary: BillingSummaryRecord;
}): {
  monthly_analytics_events: number;
  monthly_analytics_sessions: number;
  monthly_analytics_journey_samples: number;
  monthly_analytics_bundle_generations: number;
} {
  const caps = getTierCapabilities(input.organization_plan);
  const capacityUnits = getCapacityUnits(input.billingSummary);

  return {
    monthly_analytics_events: caps.monthly_analytics_events * capacityUnits,
    monthly_analytics_sessions: caps.monthly_analytics_sessions * capacityUnits,
    monthly_analytics_journey_samples: caps.monthly_analytics_journey_samples * capacityUnits,
    monthly_analytics_bundle_generations: caps.monthly_analytics_bundle_generations * capacityUnits
  };
}

async function readBillingSummary(input: {
  dependencies: ApiDependencies;
  organization_id: string;
  now: Date;
}): Promise<BillingSummaryRecord | null> {
  if (
    input.dependencies.billingManagement === undefined ||
    input.dependencies.analyticsUsage === undefined ||
    isSelfHostMode()
  ) {
    return null;
  }

  return input.dependencies.billingManagement.getBillingSummaryForOrganization({
    organization_id: input.organization_id,
    now: input.now.toISOString()
  });
}

async function claimAnalyticsUsage(input: {
  dependencies: ApiDependencies;
  organization_id: string;
  organization_plan: string | undefined;
  now: Date;
  analytics_events: number;
  analytics_sessions: number;
  analytics_journey_samples: number;
  analytics_bundle_generations: number;
}): Promise<AnalyticsQuotaClaim> {
  const billingSummary = await readBillingSummary({
    dependencies: input.dependencies,
    organization_id: input.organization_id,
    now: input.now
  });
  const analyticsUsage = input.dependencies.analyticsUsage;
  if (billingSummary === null || analyticsUsage === undefined) {
    return { allowed: true };
  }

  const release: AnalyticsAllowanceReleaseInput = {
    organization_id: input.organization_id,
    period_starts_at: billingSummary.usage_window.starts_at,
    analytics_events: input.analytics_events,
    analytics_sessions: input.analytics_sessions,
    analytics_journey_samples: input.analytics_journey_samples,
    analytics_bundle_generations: input.analytics_bundle_generations
  };
  const claim = await analyticsUsage.claimAnalyticsUsageForOrganization({
    ...release,
    limits: buildAnalyticsLimits({
      organization_plan: input.organization_plan,
      billingSummary
    })
  });
  if (claim.allowed) {
    return { allowed: true, release };
  }

  return {
    allowed: false,
    metric: claim.metric,
    used: claim.used,
    limit: claim.limit,
    retry_after_ms: getQuotaRetryAfterMs(billingSummary.usage_window.ends_at, input.now),
    usage_window: billingSummary.usage_window
  };
}

export async function claimAnalyticsIngestionQuota(input: {
  dependencies: ApiDependencies;
  organization_id: string | undefined;
  organization_plan: string | undefined;
  events: AnalyticsQuotaEvent[];
  now: Date;
}): Promise<AnalyticsQuotaClaim> {
  if (input.organization_id === undefined || input.events.length === 0) {
    return { allowed: true };
  }

  return claimAnalyticsUsage({
    dependencies: input.dependencies,
    organization_id: input.organization_id,
    organization_plan: input.organization_plan,
    now: input.now,
    analytics_events: input.events.length,
    analytics_sessions: countIncomingSessionStarts(input.events),
    analytics_journey_samples: 0,
    analytics_bundle_generations: 0
  });
}

export async function claimAnalyticsBundleGenerationQuota(input: {
  dependencies: ApiDependencies;
  organization_id: string;
  organization_plan: string | undefined;
  now: Date;
}): Promise<AnalyticsQuotaClaim> {
  return claimAnalyticsUsage({
    dependencies: input.dependencies,
    organization_id: input.organization_id,
    organization_plan: input.organization_plan,
    now: input.now,
    analytics_events: 0,
    analytics_sessions: 0,
    analytics_journey_samples: 0,
    analytics_bundle_generations: 1
  });
}

export async function releaseAnalyticsQuotaClaimBestEffort(input: {
  dependencies: ApiDependencies;
  release: AnalyticsAllowanceReleaseInput | undefined;
}): Promise<void> {
  if (input.release === undefined || input.dependencies.analyticsUsage === undefined) {
    return;
  }

  await input.dependencies.analyticsUsage.releaseAnalyticsUsageForOrganization(input.release).catch(() => undefined);
}
