import { describe, expect, it, vi } from "vitest";

import { createPostgresImprovementSettingsStore } from "../../../packages/storage/src/improvement-settings-store.js";

describe("improvement settings store", () => {
  describe("getImprovementSettingsByProjectId", () => {
    it("returns the settings row when a project exists", async () => {
      const row = {
        automated_improvement_bundles_enabled: true,
        improvement_bundle_sensitivity: "balanced",
      };
      const query = vi.fn().mockResolvedValue({ rows: [row] });

      const store = createPostgresImprovementSettingsStore({ query });
      const result = await store.getImprovementSettingsByProjectId("proj_123");

      expect(result).toEqual(row);
      expect(query).toHaveBeenCalledOnce();
      expect(query.mock.calls[0]![1]).toEqual(["proj_123"]);
    });

    it("returns null when the project does not exist", async () => {
      const query = vi.fn().mockResolvedValue({ rows: [] });

      const store = createPostgresImprovementSettingsStore({ query });
      const result = await store.getImprovementSettingsByProjectId("proj_missing");

      expect(result).toBeNull();
    });
  });

  describe("updateImprovementSettings", () => {
    it("updates both fields and returns the persisted settings", async () => {
      const row = {
        automated_improvement_bundles_enabled: false,
        improvement_bundle_sensitivity: "verbose",
      };
      const query = vi.fn().mockResolvedValue({ rows: [row] });

      const store = createPostgresImprovementSettingsStore({ query });
      const result = await store.updateImprovementSettings({
        project_id: "proj_123",
        automated_improvement_bundles_enabled: false,
        improvement_bundle_sensitivity: "verbose",
      });

      expect(result).toEqual(row);
      expect(query).toHaveBeenCalledOnce();
      const sql = query.mock.calls[0]![0] as string;
      expect(sql).toContain("UPDATE projects");
      expect(sql).toContain("automated_improvement_bundles_enabled = $1");
      expect(sql).toContain("improvement_bundle_sensitivity = $2");
      expect(query.mock.calls[0]![1]).toEqual([false, "verbose", "proj_123"]);
    });

    it("supports partial updates", async () => {
      const row = {
        automated_improvement_bundles_enabled: true,
        improvement_bundle_sensitivity: "high_confidence",
      };
      const query = vi.fn().mockResolvedValue({ rows: [row] });

      const store = createPostgresImprovementSettingsStore({ query });
      const result = await store.updateImprovementSettings({
        project_id: "proj_123",
        improvement_bundle_sensitivity: "high_confidence",
      });

      expect(result).toEqual(row);
      expect(query.mock.calls[0]![1]).toEqual(["high_confidence", "proj_123"]);
    });

    it("returns null when the project does not exist", async () => {
      const query = vi.fn().mockResolvedValue({ rows: [] });

      const store = createPostgresImprovementSettingsStore({ query });
      const result = await store.updateImprovementSettings({
        project_id: "proj_missing",
        automated_improvement_bundles_enabled: false,
      });

      expect(result).toBeNull();
    });

    it("rejects empty updates before hitting the database", async () => {
      const query = vi.fn();
      const store = createPostgresImprovementSettingsStore({ query });

      await expect(store.updateImprovementSettings({ project_id: "proj_123" })).rejects.toThrow(
        "improvement_settings_update_empty"
      );
      expect(query).not.toHaveBeenCalled();
    });
  });
});
