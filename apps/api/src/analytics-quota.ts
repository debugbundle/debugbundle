import { getTierCapabilities, isSelfHostMode } from "../../../packages/shared-types/src/index.js";
import type {
  AnalyticsAllowanceIdempotencyClaim,
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

export type AnalyticsQuotaEvent = {
  event: {
    event_id: string;
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
  const capacityUnits =
    input.organization_plan === "solo" || input.organization_plan === "team"
      ? getCapacityUnits(input.billingSummary)
      : 1;

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
  claims?: AnalyticsAllowanceIdempotencyClaim[];
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
    ...(input.claims === undefined ? {} : { claims: input.claims }),
    limits: buildAnalyticsLimits({
      organization_plan: input.organization_plan,
      billingSummary
    })
  });
  if (claim.allowed) {
    if (claim.claimed_keys === undefined) {
      return { allowed: true, release };
    }
    const claimedKeys = new Set(claim.claimed_keys);
    const claimed = (input.claims ?? []).filter((entry) => claimedKeys.has(entry.claim_key));
    return {
      allowed: true,
      release: {
        ...release,
        analytics_events: claimed.filter((entry) => entry.metric === "analytics_events").length,
        analytics_sessions: claimed.filter((entry) => entry.metric === "analytics_sessions").length,
        analytics_journey_samples: claimed.filter(
          (entry) => entry.metric === "analytics_journey_samples"
        ).length,
        analytics_bundle_generations: claimed.filter(
          (entry) => entry.metric === "analytics_bundle_generations"
        ).length,
        claim_keys: claim.claimed_keys
      }
    };
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
    analytics_bundle_generations: 0,
    claims: buildIngestionQuotaClaims(input.events)
  });
}

export async function claimAnalyticsIngestionQuotaAtBoundary<TEvent extends AnalyticsQuotaEvent>(input: {
  dependencies: ApiDependencies;
  organization_id: string | undefined;
  organization_plan: string | undefined;
  events: TEvent[];
  now: Date;
}): Promise<{
  accepted_events: TEvent[];
  rejected_events: TEvent[];
  releases: AnalyticsAllowanceReleaseInput[];
  retry_after_ms: number | null;
}> {
  const batchClaim = await claimAnalyticsIngestionQuota(input);
  if (batchClaim.allowed) {
    return {
      accepted_events: input.events,
      rejected_events: [],
      releases: batchClaim.release === undefined ? [] : [batchClaim.release],
      retry_after_ms: null
    };
  }

  if (input.events.length <= 1) {
    return {
      accepted_events: [],
      rejected_events: input.events,
      releases: [],
      retry_after_ms: batchClaim.retry_after_ms
    };
  }

  const acceptedEvents: TEvent[] = [];
  const rejectedEvents: TEvent[] = [];
  const releases: AnalyticsAllowanceReleaseInput[] = [];
  let retryAfterMs = batchClaim.retry_after_ms;

  // The full-batch claim is the normal fast path. Near a boundary, atomic
  // per-event claims consume every usable unit without over-claiming a meter.
  for (const event of input.events) {
    const eventClaim = await claimAnalyticsIngestionQuota({ ...input, events: [event] });
    if (eventClaim.allowed) {
      acceptedEvents.push(event);
      if (eventClaim.release !== undefined) {
        releases.push(eventClaim.release);
      }
    } else {
      rejectedEvents.push(event);
      retryAfterMs = eventClaim.retry_after_ms;
    }
  }

  return {
    accepted_events: acceptedEvents,
    rejected_events: rejectedEvents,
    releases,
    retry_after_ms: retryAfterMs
  };
}

export async function claimAnalyticsBundleGenerationQuota(input: {
  dependencies: ApiDependencies;
  organization_id: string;
  organization_plan: string | undefined;
  now: Date;
  claim_key: string;
}): Promise<AnalyticsQuotaClaim> {
  return claimAnalyticsUsage({
    dependencies: input.dependencies,
    organization_id: input.organization_id,
    organization_plan: input.organization_plan,
    now: input.now,
    analytics_events: 0,
    analytics_sessions: 0,
    analytics_journey_samples: 0,
    analytics_bundle_generations: 1,
    claims: [
      {
        claim_key: `bundle:${input.claim_key}`,
        metric: "analytics_bundle_generations"
      }
    ]
  });
}

export async function releaseAnalyticsQuotaClaimBestEffort(input: {
  dependencies: ApiDependencies;
  release: AnalyticsAllowanceReleaseInput | undefined;
  exclude_claim_keys?: ReadonlySet<string> | undefined;
}): Promise<void> {
  if (input.release === undefined || input.dependencies.analyticsUsage === undefined) {
    return;
  }
  const excludeClaimKeys = input.exclude_claim_keys;
  const release =
    input.release.claim_keys === undefined || excludeClaimKeys === undefined
      ? input.release
      : {
          ...input.release,
          claim_keys: input.release.claim_keys.filter((key) => !excludeClaimKeys.has(key))
        };
  await input.dependencies.analyticsUsage
    .releaseAnalyticsUsageForOrganization(release)
    .catch(() => undefined);
}

export function getAnalyticsQuotaClaimKeysForEvent(event: AnalyticsQuotaEvent["event"]): string[] {
  return [
    `event:${event.event_id}`,
    ...(event.payload.kind === "session_start" ? [`session:${event.correlation.session_id}`] : [])
  ];
}

function buildIngestionQuotaClaims(
  events: AnalyticsQuotaEvent[]
): AnalyticsAllowanceIdempotencyClaim[] {
  return events.flatMap(({ event }) => [
    { claim_key: `event:${event.event_id}`, metric: "analytics_events" as const },
    ...(event.payload.kind === "session_start"
      ? [
          {
            claim_key: `session:${event.correlation.session_id}`,
            metric: "analytics_sessions" as const
          }
        ]
      : [])
  ]);
}
