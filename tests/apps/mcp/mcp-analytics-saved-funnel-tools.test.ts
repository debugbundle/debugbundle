import { describe, expect, it, vi } from "vitest";

import { AnalyticsSavedFunnelApiError } from "../../../apps/cli/src/analytics-saved-funnel-commands.js";
import { ANALYTICS_SAVED_FUNNEL_MCP_TOOL_CATALOG } from "../../../apps/mcp/src/analytics-saved-funnel-tool-catalog.js";
import {
  ANALYTICS_SAVED_FUNNEL_MCP_TOOL_NAMES,
  createAnalyticsSavedFunnelMcpTools
} from "../../../apps/mcp/src/analytics-saved-funnel-tools.js";

describe("MCP saved analytics funnel tools", () => {
  it("publishes strict lifecycle schemas", () => {
    expect(ANALYTICS_SAVED_FUNNEL_MCP_TOOL_NAMES).toEqual([
      "list_saved_analytics_funnels",
      "create_saved_analytics_funnel",
      "update_saved_analytics_funnel",
      "archive_saved_analytics_funnel"
    ]);
    const create = ANALYTICS_SAVED_FUNNEL_MCP_TOOL_CATALOG[1].inputSchema;
    expect(
      create.safeParse({
        bearerToken: "token",
        projectId: "project-1",
        funnelKey: "signup",
        displayName: "Signup",
        steps: [
          { step_key: "same", display_name: "One" },
          { step_key: "same", display_name: "Two" }
        ]
      }).success
    ).toBe(false);
  });

  it("delegates list, create, update, and archive to the shared API client", async () => {
    const api = {
      list: vi.fn().mockResolvedValue({ funnels: [] }),
      create: vi.fn().mockResolvedValue({ funnel_key: "signup" }),
      update: vi.fn().mockResolvedValue({ funnel_key: "signup" }),
      archive: vi.fn().mockResolvedValue({ funnel_key: "signup" })
    };
    const tools = createAnalyticsSavedFunnelMcpTools(api as never);
    const scope = { bearerToken: "token", projectId: "project-1" };
    const steps = [
      { step_key: "landing", display_name: "Landing" },
      { step_key: "complete", display_name: "Complete" }
    ];

    await tools.list_saved_analytics_funnels(scope);
    await tools.create_saved_analytics_funnel({
      ...scope,
      funnelKey: "signup",
      displayName: "Signup",
      steps
    });
    await tools.update_saved_analytics_funnel({
      ...scope,
      funnelKey: "signup",
      displayName: "Onboarding"
    });
    await tools.archive_saved_analytics_funnel({ ...scope, funnelKey: "signup" });

    expect(api.list).toHaveBeenCalledWith(scope);
    expect(api.create).toHaveBeenCalledWith({
      ...scope,
      definition: { funnel_key: "signup", display_name: "Signup", steps }
    });
    expect(api.update).toHaveBeenCalledWith({
      ...scope,
      funnelKey: "signup",
      update: { display_name: "Onboarding" }
    });
    expect(api.archive).toHaveBeenCalledWith({ ...scope, funnelKey: "signup" });
  });

  it("maps API and unknown failures to MCP tool errors", async () => {
    const tools = createAnalyticsSavedFunnelMcpTools({
      list: vi.fn().mockRejectedValue(new AnalyticsSavedFunnelApiError(403, "forbidden")),
      create: vi.fn().mockRejectedValue(new Error("boom")),
      update: vi.fn(),
      archive: vi.fn()
    } as never);

    await expect(
      tools.list_saved_analytics_funnels({ bearerToken: "token", projectId: "project-1" })
    ).rejects.toThrow("mcp_tool_error:forbidden");
    await expect(
      tools.create_saved_analytics_funnel({ bearerToken: "token", projectId: "project-1" })
    ).rejects.toThrow("mcp_tool_error:unknown_error");
  });
});
