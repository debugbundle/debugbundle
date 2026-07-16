import { describe, expect, it, vi } from "vitest";

import { createPostgresAnalyticsSettingsStore } from "../../../packages/storage/src/analytics-settings-store.js";

describe("analytics settings store", () => {
  describe("getAnalyticsSettingsByProjectId", () => {
    it("returns disabled defaults for an existing project without a settings row", async () => {
      const query = vi.fn().mockResolvedValue({
        rows: [
          {
            enabled: false,
            privacy_mode: "strict",
            consent_required: false,
            capture_page_views: true,
            capture_route_changes: true,
            capture_actions: false,
            capture_friction_signals: true,
            journey_sample_rate: "0",
            raw_retention_days: 1,
            sample_retention_days: 7,
            hourly_retention_days: 30,
            aggregate_retention_months: 12,
            max_saved_funnels: null,
            max_custom_dimensions: null,
            approved_custom_dimensions: [],
            organization_plan: "solo"
          }
        ]
      });

      const store = createPostgresAnalyticsSettingsStore({ query });
      const result = await store.getAnalyticsSettingsByProjectId("proj_123");

      expect(result).toEqual({
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
        max_saved_funnels: 10,
        max_custom_dimensions: 3,
        approved_custom_dimensions: []
      });
      expect(String(query.mock.calls[0]![0])).toContain("LEFT JOIN project_analytics_settings");
      expect(String(query.mock.calls[0]![0])).toContain("JOIN organizations");
      expect(String(query.mock.calls[0]![0])).toContain("organizations.plan AS organization_plan");
      expect(String(query.mock.calls[0]![0])).toContain("settings.max_custom_dimensions");
      expect(query.mock.calls[0]![1]).toEqual(["proj_123"]);
    });

    it("returns null when the project does not exist", async () => {
      const query = vi.fn().mockResolvedValue({ rows: [] });

      const store = createPostgresAnalyticsSettingsStore({ query });

      await expect(store.getAnalyticsSettingsByProjectId("proj_missing")).resolves.toBeNull();
    });
  });

  describe("updateAnalyticsSettings", () => {
    it("upserts provided settings and returns the persisted row", async () => {
      const existingRow = {
        enabled: false,
        privacy_mode: "strict",
        consent_required: false,
        capture_page_views: true,
        capture_route_changes: true,
        capture_actions: false,
        capture_friction_signals: true,
        journey_sample_rate: "0",
        raw_retention_days: 1,
        sample_retention_days: 7,
        hourly_retention_days: 30,
        aggregate_retention_months: 12,
        max_saved_funnels: 10,
        max_custom_dimensions: 0,
        approved_custom_dimensions: []
      };
      const row = {
        enabled: true,
        privacy_mode: "standard",
        consent_required: true,
        capture_page_views: true,
        capture_route_changes: true,
        capture_actions: false,
        capture_friction_signals: true,
        journey_sample_rate: "0.25",
        raw_retention_days: 3,
        sample_retention_days: 30,
        hourly_retention_days: 90,
        aggregate_retention_months: 24,
        max_saved_funnels: 10,
        max_custom_dimensions: 8,
        approved_custom_dimensions: ["account_tier"]
      };
      const query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [existingRow] })
        .mockResolvedValueOnce({ rows: [row] });

      const store = createPostgresAnalyticsSettingsStore({ query });
      const result = await store.updateAnalyticsSettings({
        project_id: "proj_123",
        update: {
          enabled: true,
          privacy_mode: "standard",
          consent_required: true,
          journey_sample_rate: 0.25,
          raw_retention_days: 3,
          sample_retention_days: 30,
          hourly_retention_days: 90,
          aggregate_retention_months: 24,
          max_saved_funnels: 10,
          max_custom_dimensions: 8,
          approved_custom_dimensions: ["account_tier"]
        }
      });

      expect(result).toEqual({
        ...row,
        journey_sample_rate: 0.25
      });
      const sql = String(query.mock.calls[1]![0]);
      expect(sql).toContain("INSERT INTO project_analytics_settings");
      expect(sql).toContain("FROM projects");
      expect(sql).toContain("ON CONFLICT (project_id) DO UPDATE");
      expect(sql).toContain("enabled = EXCLUDED.enabled");
      expect(sql).toContain("approved_custom_dimensions = EXCLUDED.approved_custom_dimensions");
      expect(query.mock.calls[1]![1]).toContain("proj_123");
      expect(query.mock.calls[1]![1]).toContain(JSON.stringify(["account_tier"]));
    });

    it("returns null without upserting when the project does not exist", async () => {
      const query = vi.fn().mockResolvedValue({ rows: [] });

      const store = createPostgresAnalyticsSettingsStore({ query });
      await expect(
        store.updateAnalyticsSettings({
          project_id: "proj_missing",
          update: { enabled: true }
        })
      ).resolves.toBeNull();

      expect(query).toHaveBeenCalledTimes(1);
      expect(String(query.mock.calls[0]![0])).toContain("LEFT JOIN project_analytics_settings");
    });

    it("rejects partial updates that would leave too many approved custom dimensions", async () => {
      const query = vi.fn().mockResolvedValueOnce({
        rows: [
          {
            enabled: true,
            privacy_mode: "standard",
            consent_required: false,
            capture_page_views: true,
            capture_route_changes: true,
            capture_actions: true,
            capture_friction_signals: true,
            journey_sample_rate: "0.2",
            raw_retention_days: 3,
            sample_retention_days: 30,
            hourly_retention_days: 90,
            aggregate_retention_months: 24,
            max_saved_funnels: 10,
            max_custom_dimensions: 2,
            approved_custom_dimensions: ["account_tier", "workspace_size"]
          }
        ]
      });

      const store = createPostgresAnalyticsSettingsStore({ query });
      await expect(
        store.updateAnalyticsSettings({
          project_id: "proj_123",
          update: { max_custom_dimensions: 1 }
        })
      ).rejects.toThrow();

      expect(query).toHaveBeenCalledTimes(1);
    });

    it("rejects empty updates before hitting the database", async () => {
      const query = vi.fn();
      const store = createPostgresAnalyticsSettingsStore({ query });

      await expect(
        store.updateAnalyticsSettings({ project_id: "proj_123", update: {} })
      ).rejects.toThrow("analytics_settings_update_empty");
      expect(query).not.toHaveBeenCalled();
    });
  });
});
