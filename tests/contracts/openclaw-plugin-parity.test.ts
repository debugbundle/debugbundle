import { describe, expect, it } from "vitest";

import {
  DEBUGBUNDLE_OPENCLAW_OPTIONAL_TOOL_NAMES,
  DEBUGBUNDLE_OPENCLAW_TOOL_MAP,
  DEBUGBUNDLE_OPENCLAW_TOOL_NAMES
} from "../../apps/openclaw-plugin/src/index.js";
import { MCP_TOOL_CATALOG, MCP_TOOL_NAMES } from "../../apps/mcp/src/tool-catalog.js";

describe("openclaw plugin parity", () => {
  it("projects every MCP tool into one prefixed OpenClaw tool", () => {
    expect(DEBUGBUNDLE_OPENCLAW_TOOL_MAP).toHaveLength(MCP_TOOL_NAMES.length);
    expect(DEBUGBUNDLE_OPENCLAW_TOOL_NAMES).toEqual(MCP_TOOL_NAMES.map((name) => `debugbundle_${name}`));
    expect(new Set(DEBUGBUNDLE_OPENCLAW_TOOL_NAMES).size).toBe(DEBUGBUNDLE_OPENCLAW_TOOL_NAMES.length);

    for (const mcpTool of MCP_TOOL_CATALOG) {
      expect(DEBUGBUNDLE_OPENCLAW_TOOL_MAP).toContainEqual(
        expect.objectContaining({
          mcpToolName: mcpTool.name,
          openClawToolName: `debugbundle_${mcpTool.name}`,
          description: mcpTool.description
        })
      );
    }
  });

  it("marks state-changing and production-impacting tools optional", () => {
    expect(DEBUGBUNDLE_OPENCLAW_OPTIONAL_TOOL_NAMES).toEqual(
      expect.arrayContaining([
        "debugbundle_resolve_incident",
        "debugbundle_validate",
        "debugbundle_verify_local",
        "debugbundle_verify_cloud",
        "debugbundle_smoke",
        "debugbundle_analyze",
        "debugbundle_reopen_incident",
        "debugbundle_activate_probe",
        "debugbundle_deactivate_probe",
        "debugbundle_create_health_check",
        "debugbundle_update_health_check",
        "debugbundle_delete_health_check",
        "debugbundle_create_project",
        "debugbundle_delete_project",
        "debugbundle_create_project_token",
        "debugbundle_revoke_project_token",
        "debugbundle_update_capture_policy",
        "debugbundle_create_capture_rule",
        "debugbundle_generate_analytics_bundle",
        "debugbundle_update_analytics_settings",
        "debugbundle_create_saved_analytics_funnel",
        "debugbundle_update_saved_analytics_funnel",
        "debugbundle_archive_saved_analytics_funnel",
        "debugbundle_create_webhook",
        "debugbundle_retry_webhook_delivery",
        "debugbundle_start_trial",
        "debugbundle_increase_capacity",
        "debugbundle_invite_project_member",
        "debugbundle_set_project_github_repo"
      ])
    );
    expect(DEBUGBUNDLE_OPENCLAW_OPTIONAL_TOOL_NAMES).not.toContain("debugbundle_list_incidents");
    expect(DEBUGBUNDLE_OPENCLAW_OPTIONAL_TOOL_NAMES).not.toContain("debugbundle_get_bundle");
    expect(DEBUGBUNDLE_OPENCLAW_OPTIONAL_TOOL_NAMES).not.toContain("debugbundle_get_usage_summary");
    expect(DEBUGBUNDLE_OPENCLAW_OPTIONAL_TOOL_NAMES).not.toContain("debugbundle_get_funnel_analysis");
    expect(DEBUGBUNDLE_OPENCLAW_OPTIONAL_TOOL_NAMES).not.toContain("debugbundle_get_billing_summary");
  });
});
