import { describe, expect, it, afterEach } from "vitest";

import {
  TIER_CAPABILITIES,
  getTierCapabilities,
  isSelfHostMode,
  type TierName,
  type TierCapabilities
} from "../../../packages/shared-types/src/tier-capabilities.ts";

describe("tier capabilities", () => {
  it("should define free, solo, and team tiers", (): void => {
    const tierNames: TierName[] = ["free", "solo", "team"];
    for (const name of tierNames) {
      expect(TIER_CAPABILITIES[name]).toBeDefined();
    }
  });

  it("should return free capabilities for undefined plan", (): void => {
    const caps = getTierCapabilities(undefined);
    expect(caps).toEqual(TIER_CAPABILITIES.free);
  });

  it("should return free capabilities for unknown plan string", (): void => {
    const caps = getTierCapabilities("enterprise");
    expect(caps).toEqual(TIER_CAPABILITIES.free);
  });

  it("should return free capabilities for empty string", (): void => {
    const caps = getTierCapabilities("");
    expect(caps).toEqual(TIER_CAPABILITIES.free);
  });

  it("should return exact tier capabilities for valid plan names", (): void => {
    expect(getTierCapabilities("free")).toEqual(TIER_CAPABILITIES.free);
    expect(getTierCapabilities("solo")).toEqual(TIER_CAPABILITIES.solo);
    expect(getTierCapabilities("team")).toEqual(TIER_CAPABILITIES.team);
  });

  it("should gate remote probes for free tier only", (): void => {
    expect(getTierCapabilities("free").remote_probes).toBe(false);
    expect(getTierCapabilities("solo").remote_probes).toBe(true);
    expect(getTierCapabilities("team").remote_probes).toBe(true);
  });

  it("should gate shared dashboards for team tier only", (): void => {
    expect(getTierCapabilities("free").shared_dashboards).toBe(false);
    expect(getTierCapabilities("solo").shared_dashboards).toBe(false);
    expect(getTierCapabilities("team").shared_dashboards).toBe(true);
  });

  it("should gate slack integration for team tier only", (): void => {
    expect(getTierCapabilities("free").slack_integration).toBe(false);
    expect(getTierCapabilities("solo").slack_integration).toBe(false);
    expect(getTierCapabilities("team").slack_integration).toBe(true);
  });

  it("should gate cloud improvement bundles for Solo and Team tiers", (): void => {
    expect(getTierCapabilities("free").cloud_improvement_bundles).toBe(false);
    expect(getTierCapabilities("solo").cloud_improvement_bundles).toBe(true);
    expect(getTierCapabilities("team").cloud_improvement_bundles).toBe(true);
  });

  it("should expose AnalyticsBundle on every hosted tier", (): void => {
    expect(getTierCapabilities("free").analytics_bundle).toBe(true);
    expect(getTierCapabilities("solo").analytics_bundle).toBe(true);
    expect(getTierCapabilities("team").analytics_bundle).toBe(true);
  });

  it("should expose health-check limits per tier", (): void => {
    expect(getTierCapabilities("free").availability_checks_per_project).toBe(1);
    expect(getTierCapabilities("free").availability_check_min_interval_seconds).toBe(300);
    expect(getTierCapabilities("solo").availability_checks_per_project).toBe(5);
    expect(getTierCapabilities("solo").availability_check_min_interval_seconds).toBe(60);
    expect(getTierCapabilities("team").availability_checks_per_project).toBe(25);
    expect(getTierCapabilities("team").availability_check_min_interval_seconds).toBe(30);
  });

  it("should gate member invites for team tier only", (): void => {
    expect(getTierCapabilities("free").member_invites).toBe(false);
    expect(getTierCapabilities("solo").member_invites).toBe(false);
    expect(getTierCapabilities("team").member_invites).toBe(true);
  });

  it("should have increasing rate limits across tiers", (): void => {
    const free = getTierCapabilities("free");
    const solo = getTierCapabilities("solo");
    const team = getTierCapabilities("team");

    expect(solo.ingestion_rate_per_min).toBeGreaterThan(free.ingestion_rate_per_min);
    expect(team.ingestion_rate_per_min).toBeGreaterThan(solo.ingestion_rate_per_min);
    expect(solo.retrieval_rate_per_min).toBeGreaterThan(free.retrieval_rate_per_min);
    expect(team.retrieval_rate_per_min).toBeGreaterThan(solo.retrieval_rate_per_min);
  });

  it("should have longer retention for paid tiers", (): void => {
    const free = getTierCapabilities("free");
    const solo = getTierCapabilities("solo");
    const team = getTierCapabilities("team");

    expect(solo.bundle_retention_days).toBeGreaterThan(free.bundle_retention_days);
    expect(team.bundle_retention_days).toBeGreaterThan(solo.bundle_retention_days);
    expect(solo.raw_event_retention_days).toBeGreaterThan(free.raw_event_retention_days);
    expect(team.raw_event_retention_days).toBeGreaterThan(solo.raw_event_retention_days);
    expect(solo.analytics_hourly_retention_days).toBeGreaterThan(
      free.analytics_hourly_retention_days
    );
    expect(team.analytics_hourly_retention_days).toBeGreaterThan(
      solo.analytics_hourly_retention_days
    );
  });

  it("should match finalized tiers.md project and member limits", (): void => {
    expect(TIER_CAPABILITIES.free.included_capacity_units).toBe(1);
    expect(TIER_CAPABILITIES.free.max_members).toBe(1);
    expect(TIER_CAPABILITIES.solo.included_capacity_units).toBe(3);
    expect(TIER_CAPABILITIES.solo.max_members).toBe(1);
    expect(TIER_CAPABILITIES.team.included_capacity_units).toBe(15);
    expect(TIER_CAPABILITIES.team.max_members).toBeGreaterThanOrEqual(1_000);
  });

  it("should match finalized tiers.md retention values", (): void => {
    expect(TIER_CAPABILITIES.free.bundle_retention_days).toBe(7);
    expect(TIER_CAPABILITIES.free.raw_event_retention_days).toBe(7);
    expect(TIER_CAPABILITIES.solo.bundle_retention_days).toBe(30);
    expect(TIER_CAPABILITIES.solo.raw_event_retention_days).toBe(14);
    expect(TIER_CAPABILITIES.team.bundle_retention_days).toBe(90);
    expect(TIER_CAPABILITIES.team.raw_event_retention_days).toBe(30);
    expect(TIER_CAPABILITIES.free.analytics_hourly_retention_days).toBe(7);
    expect(TIER_CAPABILITIES.solo.analytics_hourly_retention_days).toBe(30);
    expect(TIER_CAPABILITIES.team.analytics_hourly_retention_days).toBe(90);
  });

  it("should include allowance bucket fields on all tiers", (): void => {
    for (const tier of ["free", "solo", "team"] as const) {
      const caps = TIER_CAPABILITIES[tier];
      expect(typeof caps.monthly_bundle_requests).toBe("number");
      expect(typeof caps.monthly_raw_ingested_events).toBe("number");
      expect(typeof caps.retained_bundle_cap).toBe("number");
      expect(typeof caps.monthly_remote_activations).toBe("number");
      expect(typeof caps.monthly_alert_deliveries).toBe("number");
      expect(typeof caps.monthly_webhook_deliveries).toBe("number");
      expect(typeof caps.monthly_analytics_events).toBe("number");
      expect(typeof caps.monthly_analytics_sessions).toBe("number");
      expect(typeof caps.monthly_analytics_journey_samples).toBe("number");
      expect(typeof caps.monthly_analytics_bundle_generations).toBe("number");
      expect(typeof caps.max_analytics_saved_funnels).toBe("number");
      expect(typeof caps.max_analytics_custom_dimensions).toBe("number");
    }
  });

  it("should match finalized tiers.md allowance values", (): void => {
    // Free
    expect(TIER_CAPABILITIES.free.monthly_bundle_requests).toBe(100);
    expect(TIER_CAPABILITIES.free.monthly_raw_ingested_events).toBe(750);
    expect(TIER_CAPABILITIES.free.retained_bundle_cap).toBe(50);
    expect(TIER_CAPABILITIES.free.monthly_remote_activations).toBe(0);
    expect(TIER_CAPABILITIES.free.monthly_alert_deliveries).toBe(25);
    expect(TIER_CAPABILITIES.free.monthly_webhook_deliveries).toBe(100);
    expect(TIER_CAPABILITIES.free.monthly_analytics_events).toBe(5_000);
    expect(TIER_CAPABILITIES.free.monthly_analytics_sessions).toBe(1_000);
    expect(TIER_CAPABILITIES.free.monthly_analytics_journey_samples).toBe(100);
    expect(TIER_CAPABILITIES.free.monthly_analytics_bundle_generations).toBe(3);
    expect(TIER_CAPABILITIES.free.max_analytics_saved_funnels).toBe(1);
    expect(TIER_CAPABILITIES.free.max_analytics_custom_dimensions).toBe(1);
    // Solo per-slot
    expect(TIER_CAPABILITIES.solo.monthly_bundle_requests).toBe(250);
    expect(TIER_CAPABILITIES.solo.monthly_raw_ingested_events).toBe(3_500);
    expect(TIER_CAPABILITIES.solo.retained_bundle_cap).toBe(150);
    expect(TIER_CAPABILITIES.solo.monthly_remote_activations).toBe(25);
    expect(TIER_CAPABILITIES.solo.monthly_alert_deliveries).toBe(75);
    expect(TIER_CAPABILITIES.solo.monthly_webhook_deliveries).toBe(250);
    expect(TIER_CAPABILITIES.solo.monthly_analytics_events).toBe(50_000);
    expect(TIER_CAPABILITIES.solo.monthly_analytics_sessions).toBe(10_000);
    expect(TIER_CAPABILITIES.solo.monthly_analytics_journey_samples).toBe(1_000);
    expect(TIER_CAPABILITIES.solo.monthly_analytics_bundle_generations).toBe(25);
    expect(TIER_CAPABILITIES.solo.max_analytics_saved_funnels).toBe(10);
    expect(TIER_CAPABILITIES.solo.max_analytics_custom_dimensions).toBe(3);
    // Team per-slot
    expect(TIER_CAPABILITIES.team.monthly_bundle_requests).toBe(1_000);
    expect(TIER_CAPABILITIES.team.monthly_raw_ingested_events).toBe(10_000);
    expect(TIER_CAPABILITIES.team.retained_bundle_cap).toBe(400);
    expect(TIER_CAPABILITIES.team.monthly_remote_activations).toBe(50);
    expect(TIER_CAPABILITIES.team.monthly_alert_deliveries).toBe(300);
    expect(TIER_CAPABILITIES.team.monthly_webhook_deliveries).toBe(1_000);
    expect(TIER_CAPABILITIES.team.monthly_analytics_events).toBe(250_000);
    expect(TIER_CAPABILITIES.team.monthly_analytics_sessions).toBe(50_000);
    expect(TIER_CAPABILITIES.team.monthly_analytics_journey_samples).toBe(10_000);
    expect(TIER_CAPABILITIES.team.monthly_analytics_bundle_generations).toBe(100);
    expect(TIER_CAPABILITIES.team.max_analytics_saved_funnels).toBe(50);
    expect(TIER_CAPABILITIES.team.max_analytics_custom_dimensions).toBe(8);
  });

  it("should satisfy type constraint for TierCapabilities", (): void => {
    const caps: TierCapabilities = getTierCapabilities("solo");
    expect(typeof caps.remote_probes).toBe("boolean");
    expect(typeof caps.slack_integration).toBe("boolean");
    expect(typeof caps.included_capacity_units).toBe("number");
    expect(typeof caps.ingestion_rate_per_min).toBe("number");
    expect(typeof caps.availability_checks_per_project).toBe("number");
    expect(typeof caps.availability_check_min_interval_seconds).toBe("number");
  });
});

describe("self-host mode", () => {
  afterEach(() => {
    delete process.env["SELFHOST_MODE"];
  });

  it("should report self-host mode as inactive by default", (): void => {
    delete process.env["SELFHOST_MODE"];
    expect(isSelfHostMode()).toBe(false);
  });

  it("should report self-host mode as active when SELFHOST_MODE=true", (): void => {
    process.env["SELFHOST_MODE"] = "true";
    expect(isSelfHostMode()).toBe(true);
  });

  it("should not activate self-host mode for other values", (): void => {
    process.env["SELFHOST_MODE"] = "false";
    expect(isSelfHostMode()).toBe(false);

    process.env["SELFHOST_MODE"] = "1";
    expect(isSelfHostMode()).toBe(false);

    process.env["SELFHOST_MODE"] = "yes";
    expect(isSelfHostMode()).toBe(false);
  });

  it("should return unlimited capabilities for any plan when in self-host mode", (): void => {
    process.env["SELFHOST_MODE"] = "true";

    for (const plan of ["free", "solo", "team", undefined, "enterprise"] as const) {
      const caps = getTierCapabilities(plan);
      expect(caps.remote_probes).toBe(true);
      expect(caps.github_automation).toBe(true);
      expect(caps.slack_integration).toBe(true);
      expect(caps.cloud_improvement_bundles).toBe(true);
      expect(caps.shared_dashboards).toBe(true);
      expect(caps.member_invites).toBe(true);
      expect(caps.availability_checks_per_project).toBeGreaterThanOrEqual(1_000_000);
      expect(caps.availability_check_min_interval_seconds).toBe(30);
      expect(caps.included_capacity_units).toBeGreaterThanOrEqual(1_000_000);
      expect(caps.max_members).toBeGreaterThanOrEqual(1_000);
      expect(caps.ingestion_rate_per_min).toBeGreaterThanOrEqual(1_000_000);
      expect(caps.monthly_raw_ingested_events).toBeGreaterThanOrEqual(1_000_000_000);
      expect(caps.monthly_bundle_requests).toBeGreaterThanOrEqual(1_000_000_000);
      expect(caps.monthly_analytics_events).toBeGreaterThanOrEqual(1_000_000_000);
      expect(caps.monthly_analytics_sessions).toBeGreaterThanOrEqual(1_000_000_000);
      expect(caps.monthly_analytics_journey_samples).toBeGreaterThanOrEqual(1_000_000_000);
      expect(caps.monthly_analytics_bundle_generations).toBeGreaterThanOrEqual(1_000_000_000);
      expect(caps.max_analytics_saved_funnels).toBe(100);
      expect(caps.max_analytics_custom_dimensions).toBe(20);
    }
  });

  it("should return normal tier capabilities when self-host mode is off", (): void => {
    delete process.env["SELFHOST_MODE"];
    expect(getTierCapabilities("free")).toEqual(TIER_CAPABILITIES.free);
    expect(getTierCapabilities("solo")).toEqual(TIER_CAPABILITIES.solo);
    expect(getTierCapabilities("team")).toEqual(TIER_CAPABILITIES.team);
  });
});
