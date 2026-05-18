/**
 * Tier capabilities — single source of truth for plan-gated features and limits.
 *
 * Route code checks capabilities, not tier names:
 *   const caps = getTierCapabilities(project.organization_plan);
 *   if (!caps.remote_probes) return reply.status(403).send({ error: "upgrade_required" });
 *
 * Adding a tier or moving a feature between tiers = one config change here.
 * Source-of-truth for values: /spec/tiers.md (finalized).
 */

export const MAX_BILLING_ADDITIONAL_CAPACITY_UNITS = 99;

export const TIER_CAPABILITIES = {
  free: {
    remote_probes: false,
    github_automation: false,
    slack_integration: false,
    cloud_improvement_bundles: false,
    shared_dashboards: false,
    member_invites: false,
    included_capacity_units: 1,
    max_members: 1,
    ingestion_rate_per_min: 1_000,
    retrieval_rate_per_min: 100,
    bundle_retention_days: 7,
    raw_event_retention_days: 7,
    // Allowance buckets (account-level pool, not per capacity unit)
    monthly_bundle_requests: 100,
    monthly_raw_ingested_events: 750,
    retained_bundle_cap: 50,
    monthly_remote_activations: 0,
    monthly_alert_deliveries: 25,
    monthly_webhook_deliveries: 100,
  },
  solo: {
    remote_probes: true,
    github_automation: true,
    slack_integration: false,
    cloud_improvement_bundles: false,
    shared_dashboards: false,
    member_invites: false,
    included_capacity_units: 3,
    max_members: 1,
    ingestion_rate_per_min: 5_000,
    retrieval_rate_per_min: 300,
    bundle_retention_days: 30,
    raw_event_retention_days: 14,
    // Per-unit allowance (multiply by included and purchased capacity units)
    monthly_bundle_requests: 250,
    monthly_raw_ingested_events: 3_500,
    retained_bundle_cap: 150,
    monthly_remote_activations: 25,
    monthly_alert_deliveries: 75,
    monthly_webhook_deliveries: 250,
  },
  team: {
    remote_probes: true,
    github_automation: true,
    slack_integration: true,
    cloud_improvement_bundles: true,
    shared_dashboards: true,
    member_invites: true,
    included_capacity_units: 15,
    max_members: 5,
    ingestion_rate_per_min: 10_000,
    retrieval_rate_per_min: 500,
    bundle_retention_days: 90,
    raw_event_retention_days: 30,
    // Per-unit allowance (multiply by included and purchased capacity units)
    monthly_bundle_requests: 1_000,
    monthly_raw_ingested_events: 10_000,
    retained_bundle_cap: 400,
    monthly_remote_activations: 50,
    monthly_alert_deliveries: 300,
    monthly_webhook_deliveries: 1_000,
  },
} as const;

export type TierName = keyof typeof TIER_CAPABILITIES;

/** Structural type for tier capabilities — widened from const literals for extensibility. */
export interface TierCapabilities {
  readonly remote_probes: boolean;
  readonly github_automation: boolean;
  readonly slack_integration: boolean;
  readonly cloud_improvement_bundles: boolean;
  readonly shared_dashboards: boolean;
  readonly member_invites: boolean;
  readonly included_capacity_units: number;
  readonly max_members: number;
  readonly ingestion_rate_per_min: number;
  readonly retrieval_rate_per_min: number;
  readonly bundle_retention_days: number;
  readonly raw_event_retention_days: number;
  readonly monthly_bundle_requests: number;
  readonly monthly_raw_ingested_events: number;
  readonly retained_bundle_cap: number;
  readonly monthly_remote_activations: number;
  readonly monthly_alert_deliveries: number;
  readonly monthly_webhook_deliveries: number;
}

/**
 * Self-host mode: all features unlocked, all limits effectively unlimited.
 * Activated by setting SELFHOST_MODE=true in the environment.
 * Auth and security remain fully enforced — only billing/quota gates are bypassed.
 */
const SELFHOST_CAPABILITIES: TierCapabilities = {
  remote_probes: true,
  github_automation: true,
  slack_integration: true,
  cloud_improvement_bundles: true,
  shared_dashboards: true,
  member_invites: true,
  included_capacity_units: 1_000_000,
  max_members: 1_000,
  ingestion_rate_per_min: 1_000_000,
  retrieval_rate_per_min: 100_000,
  bundle_retention_days: 36_500,
  raw_event_retention_days: 36_500,
  monthly_bundle_requests: 1_000_000_000,
  monthly_raw_ingested_events: 1_000_000_000,
  retained_bundle_cap: 1_000_000,
  monthly_remote_activations: 1_000_000,
  monthly_alert_deliveries: 1_000_000,
  monthly_webhook_deliveries: 1_000_000,
};

/** Whether the instance is running in self-host mode (all tier limits bypassed). */
export function isSelfHostMode(): boolean {
  return typeof process !== "undefined" && process.env["SELFHOST_MODE"] === "true";
}

/** Resolve a plan string to its capabilities. Unknown plans fall back to free. */
export function getTierCapabilities(plan: string | undefined): TierCapabilities {
  if (isSelfHostMode()) {
    return SELFHOST_CAPABILITIES;
  }
  if (plan !== undefined && plan in TIER_CAPABILITIES) {
    return TIER_CAPABILITIES[plan as TierName];
  }
  return TIER_CAPABILITIES.free;
}
