import { describe, expect, it } from "vitest";

import {
  AnalyticsSettingsResponseSchema,
  AnalyticsSettingsSchema,
  AnalyticsSettingsUpdateSchema
} from "../../../packages/shared-types/src/index.js";

describe("analytics settings shared types", () => {
  it("validates project analytics settings", () => {
    expect(
      AnalyticsSettingsSchema.parse({
        enabled: false,
        privacy_mode: "strict",
        consent_required: false,
        capture_page_views: true,
        capture_route_changes: true,
        capture_actions: false,
        capture_friction_signals: true,
        journey_sample_rate: 0,
        raw_retention_days: 1,
        sample_retention_days: 7,
        hourly_retention_days: 30,
        aggregate_retention_months: 12,
        max_saved_funnels: 3,
        max_custom_dimensions: 0,
        approved_custom_dimensions: []
      })
    ).toEqual({
      enabled: false,
      privacy_mode: "strict",
      consent_required: false,
      capture_page_views: true,
      capture_route_changes: true,
      capture_actions: false,
      capture_friction_signals: true,
      journey_sample_rate: 0,
      raw_retention_days: 1,
      sample_retention_days: 7,
      hourly_retention_days: 30,
      aggregate_retention_months: 12,
      max_saved_funnels: 3,
      max_custom_dimensions: 0,
      approved_custom_dimensions: []
    });
  });

  it("requires at least one field for settings updates", () => {
    expect(AnalyticsSettingsUpdateSchema.safeParse({}).success).toBe(false);
    expect(
      AnalyticsSettingsUpdateSchema.parse({
        enabled: true,
        privacy_mode: "standard"
      })
    ).toEqual({
      enabled: true,
      privacy_mode: "standard"
    });
  });

  it("rejects sensitive or excessive custom dimension settings", () => {
    expect(
      AnalyticsSettingsUpdateSchema.safeParse({
        approved_custom_dimensions: ["account_tier", "workspace_size", "user_id"]
      }).success
    ).toBe(false);
    expect(
      AnalyticsSettingsUpdateSchema.safeParse({
        approved_custom_dimensions: Array.from({ length: 21 }, (_, index) => `dimension_${index}`)
      }).success
    ).toBe(false);
  });

  it("rejects approved custom dimensions that exceed the configured limit", () => {
    const invalidSettings = {
      enabled: true,
      privacy_mode: "standard",
      consent_required: false,
      capture_page_views: true,
      capture_route_changes: true,
      capture_actions: true,
      capture_friction_signals: true,
      journey_sample_rate: 0.1,
      raw_retention_days: 3,
      sample_retention_days: 30,
      hourly_retention_days: 30,
      aggregate_retention_months: 24,
      max_saved_funnels: 10,
      max_custom_dimensions: 1,
      approved_custom_dimensions: ["account_tier", "workspace_size"]
    };

    expect(AnalyticsSettingsSchema.safeParse(invalidSettings).success).toBe(false);
    expect(
      AnalyticsSettingsUpdateSchema.safeParse({
        max_custom_dimensions: 1,
        approved_custom_dimensions: ["account_tier", "workspace_size"]
      }).success
    ).toBe(false);
  });

  it("validates response metadata and settings payloads together", () => {
    expect(
      AnalyticsSettingsResponseSchema.parse({
        access_mode: "manage",
        analytics_available: true,
        settings: {
          enabled: true,
          privacy_mode: "standard",
          consent_required: true,
          capture_page_views: true,
          capture_route_changes: true,
          capture_actions: false,
          capture_friction_signals: true,
          journey_sample_rate: 0.1,
          raw_retention_days: 3,
          sample_retention_days: 30,
          hourly_retention_days: 90,
          aggregate_retention_months: 24,
          max_saved_funnels: 10,
          max_custom_dimensions: 8,
          approved_custom_dimensions: ["account_tier"]
        }
      })
    ).toEqual({
      access_mode: "manage",
      analytics_available: true,
      settings: {
        enabled: true,
        privacy_mode: "standard",
        consent_required: true,
        capture_page_views: true,
        capture_route_changes: true,
        capture_actions: false,
        capture_friction_signals: true,
        journey_sample_rate: 0.1,
        raw_retention_days: 3,
        sample_retention_days: 30,
        hourly_retention_days: 90,
        aggregate_retention_months: 24,
        max_saved_funnels: 10,
        max_custom_dimensions: 8,
        approved_custom_dimensions: ["account_tier"]
      }
    });
  });
});
