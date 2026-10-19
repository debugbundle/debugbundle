import { expect, it, vi } from "vitest";
import {
  createNotificationMcpTools,
  NOTIFICATION_MCP_TOOL_CATALOG
} from "../../../apps/mcp/src/notification-tools.js";
import { MCP_TOOL_CATALOG } from "../../../apps/mcp/src/tool-catalog.js";
it("exposes the same four authorized operations with strict input schemas", async () => {
  const request = vi.fn().mockResolvedValue({});
  const tools = createNotificationMcpTools({ request });
  for (const tool of NOTIFICATION_MCP_TOOL_CATALOG)
    expect(MCP_TOOL_CATALOG.some((entry) => entry.name === tool.name)).toBe(true);
  await tools["pause_notifications"]!({
    bearerToken: "member",
    audience: "shared",
    pause: { channels: ["email", "slack"], until: null }
  });
  expect(request).toHaveBeenCalledWith({ bearerToken: "member", audience: "shared" }, "pause", {
    channels: ["email", "slack"],
    until: null,
    allow_health_checks: false
  });
  await expect(
    tools["update_notification_preferences"]!({
      bearerToken: "member",
      update: { channels: { slack: "daily" } }
    })
  ).rejects.toThrow("invalid_notification_input");
});

it("maps get, update and resume and reports API errors through the tool contract", async () => {
  const { NotificationApiError } =
    await import("../../../packages/alert-client/src/notification-preferences.js");
  const request = vi.fn().mockResolvedValue({});
  const tools = createNotificationMcpTools({ request });
  await tools["get_notification_preferences"]!({ bearerToken: "member" });
  expect(request).toHaveBeenLastCalledWith(
    { bearerToken: "member", audience: "personal" },
    "get",
    undefined
  );
  await tools["update_notification_preferences"]!({
    bearerToken: "member",
    projectId: "10000000-0000-4000-8000-000000000001",
    update: { channels: { email: "daily" }, daily: { time: "08:30", timezone: "Europe/Ljubljana" } }
  });
  expect(request).toHaveBeenLastCalledWith(
    expect.objectContaining({ projectId: "10000000-0000-4000-8000-000000000001" }),
    "update",
    { channels: { email: "daily" }, daily: { time: "08:30", timezone: "Europe/Ljubljana" } }
  );
  await tools["resume_notifications"]!({ bearerToken: "member", resume: { channels: ["email"] } });
  expect(request).toHaveBeenLastCalledWith(expect.any(Object), "resume", { channels: ["email"] });
  request.mockRejectedValueOnce(new NotificationApiError(403, "forbidden"));
  await expect(tools["get_notification_preferences"]!({ bearerToken: "member" })).rejects.toThrow(
    "mcp_tool_error:forbidden"
  );
});
