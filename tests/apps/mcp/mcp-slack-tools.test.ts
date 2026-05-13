import { describe, expect, it, vi } from "vitest";

import { SlackApiError } from "../../../packages/slack-client/src/index.js";
import { SLACK_MCP_TOOL_NAMES, createSlackMcpTools } from "../../../apps/mcp/src/slack-tools.js";

describe("mcp slack tools", () => {
  it("declares slack tool parity", () => {
    expect(SLACK_MCP_TOOL_NAMES).toEqual([
      "list_slack_destinations",
      "get_slack_connect_url",
      "test_slack_destination",
      "delete_slack_destination"
    ]);
  });

  it("returns slack destination payloads", async () => {
    const api = {
      listSlackDestinations: vi.fn().mockResolvedValue([{ slack_destination_id: "sd_1" }]),
      getSlackInstallUrl: vi.fn().mockResolvedValue("https://slack.com/oauth/v2/authorize?client_id=1"),
      testSlackDestination: vi.fn().mockResolvedValue({ delivered: true }),
      deleteSlackDestination: vi.fn().mockResolvedValue({ slack_destination_id: "sd_1" })
    };
    const tools = createSlackMcpTools(api);

    await expect(
      tools.list_slack_destinations({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1"
      })
    ).resolves.toEqual({ destinations: [{ slack_destination_id: "sd_1" }] });
    await expect(
      tools.get_slack_connect_url({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        returnTo: "/projects/proj_1/alerts"
      })
    ).resolves.toEqual({ install_url: "https://slack.com/oauth/v2/authorize?client_id=1" });
    await expect(
      tools.test_slack_destination({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        destinationId: "sd_1"
      })
    ).resolves.toEqual({ delivery: { delivered: true } });
    await expect(
      tools.delete_slack_destination({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        destinationId: "sd_1"
      })
    ).resolves.toEqual({ destination: { slack_destination_id: "sd_1" } });
  });

  it("maps slack api and unknown errors to mcp tool errors", async () => {
    const tools = createSlackMcpTools({
      listSlackDestinations: vi.fn().mockRejectedValue(new SlackApiError(403, "upgrade_required")),
      getSlackInstallUrl: vi.fn().mockRejectedValue(new Error("boom")),
      testSlackDestination: vi.fn(),
      deleteSlackDestination: vi.fn()
    });

    await expect(
      tools.list_slack_destinations({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1"
      })
    ).rejects.toThrow("mcp_tool_error:upgrade_required");
    await expect(
      tools.get_slack_connect_url({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1"
      })
    ).rejects.toThrow("mcp_tool_error:unknown_error");
  });
});
