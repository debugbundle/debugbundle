import { describe, expect, it, vi } from "vitest";

import { ImprovementSettingsApiError } from "../../../apps/cli/src/improvement-settings-commands.js";
import {
  createImprovementSettingsMcpTools,
  IMPROVEMENT_SETTINGS_MCP_TOOL_NAMES
} from "../../../apps/mcp/src/improvement-settings-tools.ts";

describe("mcp improvement settings tools", () => {
  it("declares improvement settings tool parity", () => {
    expect(IMPROVEMENT_SETTINGS_MCP_TOOL_NAMES).toEqual([
      "get_improvement_settings",
      "update_improvement_settings"
    ]);
  });

  it("returns improvement settings payloads", async () => {
    const settingsFixture = {
      access_mode: "manage",
      cloud_automation_available: true,
      settings: {
        automated_improvement_bundles_enabled: true,
        improvement_bundle_sensitivity: "balanced"
      }
    };

    const tools = createImprovementSettingsMcpTools({
      getImprovementSettings: vi.fn().mockResolvedValue(settingsFixture),
      updateImprovementSettings: vi.fn().mockResolvedValue({
        access_mode: "manage",
        cloud_automation_available: true,
        settings: {
          automated_improvement_bundles_enabled: false,
          improvement_bundle_sensitivity: "verbose"
        }
      })
    });

    await expect(
      tools.get_improvement_settings({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1"
      })
    ).resolves.toEqual(settingsFixture);

    await expect(
      tools.update_improvement_settings({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        update: {
          automated_improvement_bundles_enabled: false,
          improvement_bundle_sensitivity: "verbose"
        }
      })
    ).resolves.toEqual({
      access_mode: "manage",
      cloud_automation_available: true,
      settings: {
        automated_improvement_bundles_enabled: false,
        improvement_bundle_sensitivity: "verbose"
      }
    });
  });

  it("maps improvement settings api and unknown errors to mcp tool errors", async () => {
    const tools = createImprovementSettingsMcpTools({
      getImprovementSettings: vi
        .fn()
        .mockRejectedValue(new ImprovementSettingsApiError(401, "invalid_member_token")),
      updateImprovementSettings: vi.fn().mockRejectedValue(new Error("boom"))
    });

    await expect(
      tools.get_improvement_settings({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1"
      })
    ).rejects.toThrow("mcp_tool_error:invalid_member_token");

    await expect(
      tools.update_improvement_settings({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        update: { automated_improvement_bundles_enabled: false }
      })
    ).rejects.toThrow("mcp_tool_error:unknown_error");
  });
});
