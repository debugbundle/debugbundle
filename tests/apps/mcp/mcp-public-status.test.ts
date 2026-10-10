import { expect, it, vi } from "vitest";
import { createPublicStatusApi } from "../../../apps/cli/src/public-status-commands.js";
import {
  createPublicStatusMcpTools,
  PUBLIC_STATUS_MCP_TOOL_NAMES
} from "../../../apps/mcp/src/public-status-tools.js";
import { MCP_TOOL_NAMES } from "../../../apps/mcp/src/tool-catalog.js";
import { LOCAL_AUTH_MCP_TOOL_CATALOG } from "../../../apps/mcp/src/local-auth-catalog.js";
import {
  statusProjectId,
  statusCheckId,
  statusSettings,
  statusPublicId
} from "../../helpers/public-status.ts";
it("adds ordinary and local-auth tools and delegates to the same API", async () => {
  expect(MCP_TOOL_NAMES).toEqual(expect.arrayContaining([...PUBLIC_STATUS_MCP_TOOL_NAMES]));
  for (const name of PUBLIC_STATUS_MCP_TOOL_NAMES)
    expect(
      LOCAL_AUTH_MCP_TOOL_CATALOG.find((t) => t.name === name)?.inputSchema.safeParse({
        projectId: statusProjectId,
        ...(name === "save_public_status_page" ? { settings: statusSettings } : {})
      }).success
    ).toBe(true);
  const request = vi.fn().mockResolvedValue({
    status: 200,
    body: {
      settings: statusSettings,
      public_id: statusPublicId,
      public_url: `https://status.debugbundle.com/${statusPublicId}`,
      access_mode: "manage"
    }
  });
  const tools = createPublicStatusMcpTools(createPublicStatusApi({ request }));
  await tools.save_public_status_page({
    bearerToken: "member-secret",
    projectId: statusProjectId,
    settings: statusSettings
  });
  expect(request).toHaveBeenLastCalledWith(
    expect.objectContaining({ method: "PUT", body: statusSettings })
  );
  request.mockResolvedValueOnce({ status: 200, body: { projects: [], next_cursor: null } });
  await tools.list_public_status_page_options({
    bearerToken: "member-secret",
    projectId: statusProjectId,
    check_project_id: statusProjectId,
    check_cursor: statusCheckId
  });
  expect(request.mock.lastCall?.[0].path).toContain("check_cursor=");
  await expect(tools.get_public_status_page({ projectId: statusProjectId })).rejects.toThrow(
    "invalid_status_input"
  );
  request.mockResolvedValueOnce({ status: 403, body: { error: "forbidden" } });
  await expect(
    tools.preview_public_status_page({ bearerToken: "member-secret", projectId: statusProjectId })
  ).rejects.toThrow("mcp_tool_error:forbidden");
});
