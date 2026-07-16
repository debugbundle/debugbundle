import { describe, expect, it, vi } from "vitest";

import { AnalyticsSettingsApiError } from "../../../apps/cli/src/analytics-settings-commands.js";
import {
  ANALYTICS_SETTINGS_MCP_TOOL_NAMES,
  createAnalyticsSettingsMcpTools
} from "../../../apps/mcp/src/analytics-settings-tools.js";

describe("mcp analytics settings tools", () => {
  it("declares analytics settings tool parity", () => {
    expect(ANALYTICS_SETTINGS_MCP_TOOL_NAMES).toEqual([
      "get_analytics_settings",
      "update_analytics_settings"
    ]);
  });

  it("returns analytics settings payloads", async () => {
    const settingsFixture = {
      access_mode: "manage",
      analytics_available: true,
      settings: {
        enabled: true,
        privacy_mode: "standard",
        consent_required: false,
        capture_page_views: true,
        capture_route_changes: true,
        capture_actions: false,
        capture_friction_signals: true,
        journey_sample_rate: 0.25,
        raw_retention_days: 1,
        sample_retention_days: 7,
        hourly_retention_days: 30,
        aggregate_retention_months: 12,
        max_saved_funnels: 3,
        max_custom_dimensions: 2,
        approved_custom_dimensions: ["account_tier", "plan"]
      }
    };

    const tools = createAnalyticsSettingsMcpTools({
      getAnalyticsSettings: vi.fn().mockResolvedValue(settingsFixture),
      updateAnalyticsSettings: vi.fn().mockResolvedValue(settingsFixture)
    });

    await expect(
      tools.get_analytics_settings({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1"
      })
    ).resolves.toEqual(settingsFixture);

    await expect(
      tools.update_analytics_settings({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        update: {
          enabled: true,
          privacy_mode: "standard"
        }
      })
    ).resolves.toEqual(settingsFixture);
  });

  it("maps analytics settings API and unknown errors to MCP tool errors", async () => {
    const tools = createAnalyticsSettingsMcpTools({
      getAnalyticsSettings: vi.fn().mockRejectedValue(new AnalyticsSettingsApiError(401, "invalid_member_token")),
      updateAnalyticsSettings: vi.fn().mockRejectedValue(new Error("boom"))
    });

    await expect(
      tools.get_analytics_settings({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1"
      })
    ).rejects.toThrow("mcp_tool_error:invalid_member_token");

    await expect(
      tools.update_analytics_settings({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        update: { enabled: true }
      })
    ).rejects.toThrow("mcp_tool_error:unknown_error");
  });
});
