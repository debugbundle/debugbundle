import { expect, it, vi } from "vitest";
import {
  AnalyticsErasureStatusApiError,
  type AnalyticsErasureStatusApi
} from "../../../apps/cli/src/analytics-erasure-status-api.js";
import { ANALYTICS_ERASURE_STATUS_MCP_TOOL_CATALOG } from "../../../apps/mcp/src/analytics-erasure-status-tool-catalog.js";
import { createAnalyticsErasureStatusMcpTools } from "../../../apps/mcp/src/analytics-erasure-status-tools.js";
import { MCP_TOOL_CATALOG } from "../../../apps/mcp/src/tool-catalog.js";

const query = {
  projectId: "11111111-1111-4111-8111-111111111111",
  taskId: "22222222-2222-4222-8222-222222222222"
};

it("registers a strict ordinary member erasure status read", async () => {
  expect(MCP_TOOL_CATALOG.some((tool) => tool.name === "analytics_erasure_status")).toBe(true);
  expect(
    ANALYTICS_ERASURE_STATUS_MCP_TOOL_CATALOG[0].inputSchema.safeParse({
      ...query,
      bearerToken: "member"
    }).success
  ).toBe(true);
  const read = vi.fn<AnalyticsErasureStatusApi["read"]>().mockResolvedValue({
    protocol: "2026-09-analytics-erasure-01",
    task_id: query.taskId,
    project_id: query.projectId,
    cutoff_at: "2026-09-30T18:00:00.000Z",
    status: "pending",
    completed_at: null
  });
  const tool = createAnalyticsErasureStatusMcpTools({ read }).analytics_erasure_status;
  expect(await tool({ ...query, bearerToken: "member" })).toMatchObject({ status: "pending" });
  expect(read).toHaveBeenCalledWith({ bearerToken: "member", query });
  await expect(tool({ ...query, bearerToken: "member", subject_ref: "secret" })).rejects.toThrow(
    "mcp_tool_error:invalid_input"
  );
  read.mockRejectedValueOnce(new AnalyticsErasureStatusApiError(403, "forbidden"));
  await expect(tool({ ...query, bearerToken: "member" })).rejects.toThrow(
    "mcp_tool_error:forbidden"
  );
});
