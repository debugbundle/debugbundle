import { afterEach, expect, it, vi } from "vitest";
import {
  AnalyticsJobRecoveryApiError,
  type AnalyticsJobRecoveryApi
} from "../../../apps/cli/src/analytics-job-recovery-api.js";
import { ANALYTICS_JOB_RECOVERY_MCP_TOOL_CATALOG } from "../../../apps/mcp/src/analytics-job-recovery-tool-catalog.js";
import { createAnalyticsJobRecoveryMcpTools } from "../../../apps/mcp/src/analytics-job-recovery-tools.js";
import { MCP_TOOL_CATALOG } from "../../../apps/mcp/src/tool-catalog.js";
import { createDefaultMcpTools } from "../../../apps/mcp/src/default-tools.js";
import { createMcpServer } from "../../../apps/mcp/src/server.js";
import * as authState from "../../../apps/cli/src/auth-state.js";
import * as nodeHttp from "../../../packages/node-http/src/index.js";

const retry = {
  projectId: "11111111-1111-4111-8111-111111111111",
  eventId: "22222222-2222-4222-8222-222222222222"
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it("registers only a strict ordinary member retry tool", async () => {
  expect(MCP_TOOL_CATALOG.some((tool) => tool.name === "analytics_job_retry")).toBe(true);
  expect(
    ANALYTICS_JOB_RECOVERY_MCP_TOOL_CATALOG[0].inputSchema.safeParse({
      ...retry,
      bearerToken: "member"
    }).success
  ).toBe(true);
  const run = vi
    .fn<AnalyticsJobRecoveryApi["retry"]>()
    .mockResolvedValue({ project_id: retry.projectId, event_id: retry.eventId, status: "queued" });
  const tool = createAnalyticsJobRecoveryMcpTools({ retry: run }).analytics_job_retry;
  expect(await tool({ ...retry, bearerToken: "member" })).toMatchObject({ status: "queued" });
  expect(run).toHaveBeenCalledWith({ bearerToken: "member", retry });
  await expect(tool({ ...retry, bearerToken: "member", raw: "never" })).rejects.toThrow(
    "mcp_tool_error:invalid_input"
  );
  run.mockRejectedValueOnce(
    new AnalyticsJobRecoveryApiError(409, "analytics_job_recovery_unavailable")
  );
  await expect(tool({ ...retry, bearerToken: "member" })).rejects.toThrow(
    "mcp_tool_error:analytics_job_recovery_unavailable"
  );
});

it("uses stored local member auth and excludes restricted agent-read", async () => {
  vi.spyOn(authState, "readCliAuthState").mockResolvedValue({
    bearer_token: "synthetic-member",
    base_url: "https://stored.example.test"
  });
  vi.stubEnv("DEBUGBUNDLE_MEMBER_TOKEN", "");
  vi.stubEnv("DEBUGBUNDLE_API_URL", "");
  const fetchMock = vi
    .spyOn(nodeHttp, "nodeFetch")
    .mockResolvedValue(
      new Response(
        JSON.stringify({ project_id: retry.projectId, event_id: retry.eventId, status: "queued" }),
        { status: 202 }
      )
    );
  const server = createMcpServer({
    tools: await createDefaultMcpTools({ localAuth: true }),
    localAuth: true
  });
  const result = await server.handleRequest({
    id: 1,
    method: "tools/call",
    params: { name: "analytics_job_retry", arguments: retry }
  });
  const applied = result as { result: { content: Array<{ text: string }> } };
  expect(JSON.parse(applied.result.content[0]!.text)).toMatchObject({ status: "queued" });
  expect(fetchMock).toHaveBeenCalledWith(
    `https://stored.example.test/v1/projects/${retry.projectId}/analytics/events/${retry.eventId}/retry`,
    expect.objectContaining({
      headers: expect.objectContaining({ authorization: "Bearer synthetic-member" })
    })
  );
  const listed = await server.handleRequest({ id: 2, method: "tools/list" });
  const visible = listed as {
    result: {
      tools: Array<{ name: string; inputSchema: { properties: Record<string, unknown> } }>;
    };
  };
  expect(
    visible.result.tools.find((tool) => tool.name === "analytics_job_retry")?.inputSchema.properties
  ).not.toHaveProperty("bearerToken");
  vi.stubEnv("DEBUGBUNDLE_AGENT_TOKEN", "dbundle_agent_synthetic");
  expect(await createDefaultMcpTools({ agentRead: true })).not.toHaveProperty(
    "analytics_job_retry"
  );
});
