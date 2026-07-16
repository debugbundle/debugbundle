import { describe, expect, it } from "vitest";

import { HEALTH_CHECK_MCP_TOOL_CATALOG } from "../../../apps/mcp/src/health-check-tool-catalog.js";
import { ANALYTICS_SAVED_FUNNEL_MCP_TOOL_CATALOG } from "../../../apps/mcp/src/analytics-saved-funnel-tool-catalog.js";
import { PROBE_MCP_TOOL_CATALOG } from "../../../apps/mcp/src/probe-tool-catalog.js";
import { MCP_TOOL_CATALOG, MCP_TOOL_NAMES } from "../../../apps/mcp/src/tool-catalog.js";

describe("mcp tool catalog", () => {
  it("registers health-check and probe catalog entries in the published registry", () => {
    expect(HEALTH_CHECK_MCP_TOOL_CATALOG.map((entry) => entry.name)).toEqual([
      "list_health_checks",
      "get_health_check",
      "create_health_check",
      "update_health_check",
      "delete_health_check",
      "test_health_check",
      "list_health_check_results",
      "list_health_check_daily_rollups"
    ]);

    expect(PROBE_MCP_TOOL_CATALOG.map((entry) => entry.name)).toEqual([
      "activate_probe",
      "list_active_probes",
      "deactivate_probe"
    ]);

    expect(ANALYTICS_SAVED_FUNNEL_MCP_TOOL_CATALOG.map((entry) => entry.name)).toEqual([
      "list_saved_analytics_funnels",
      "create_saved_analytics_funnel",
      "update_saved_analytics_funnel",
      "archive_saved_analytics_funnel"
    ]);

    const publishedNames = MCP_TOOL_CATALOG.map((entry) => entry.name);
    expect(publishedNames).toEqual(MCP_TOOL_NAMES);
    expect(publishedNames).toEqual(
      expect.arrayContaining([
        "list_health_checks",
        "test_health_check",
        "activate_probe",
        "deactivate_probe",
        "list_saved_analytics_funnels"
      ])
    );
  });
});
