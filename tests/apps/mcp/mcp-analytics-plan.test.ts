import { afterEach, expect, it, vi } from "vitest";
import {
  AnalyticsPlanApiError,
  type AnalyticsPlanApi
} from "../../../apps/cli/src/analytics-plan-api.js";
import { createAnalyticsPlanMcpTools } from "../../../apps/mcp/src/analytics-plan-tools.js";
import { ANALYTICS_PLAN_MCP_TOOL_CATALOG } from "../../../apps/mcp/src/analytics-plan-tool-catalog.js";
import { MCP_TOOL_CATALOG } from "../../../apps/mcp/src/tool-catalog.js";
import { createDefaultMcpTools } from "../../../apps/mcp/src/default-tools.js";
import { createMcpServer } from "../../../apps/mcp/src/server.js";
import * as authState from "../../../apps/cli/src/auth-state.js";
import * as nodeHttp from "../../../packages/node-http/src/index.js";
import {
  analyticsProjectPlanFixture,
  analyticsProjectPlanPreviewFixture,
  analyticsProjectPlanRecordFixture
} from "../../helpers/analytics-plan-fixtures.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const plan = analyticsProjectPlanFixture(projectId);
const preview = analyticsProjectPlanPreviewFixture(projectId);
const record = analyticsProjectPlanRecordFixture(projectId);

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it("registers strict project-plan tools and requires a reviewed hash for apply", () => {
  expect(ANALYTICS_PLAN_MCP_TOOL_CATALOG.map((tool) => tool.name)).toEqual([
    "analytics_plan_get",
    "analytics_plan_validate",
    "analytics_plan_preview",
    "analytics_plan_apply"
  ]);
  for (const tool of ANALYTICS_PLAN_MCP_TOOL_CATALOG)
    expect(MCP_TOOL_CATALOG.some((entry) => entry.name === tool.name)).toBe(true);
  const apply = ANALYTICS_PLAN_MCP_TOOL_CATALOG[3].inputSchema;
  expect(apply.safeParse({ bearerToken: "member", projectId, plan }).success).toBe(false);
  expect(
    apply.safeParse({ bearerToken: "member", projectId, plan, previewHash: preview.preview_hash })
      .success
  ).toBe(true);
  expect(
    apply.safeParse({
      bearerToken: "member",
      projectId,
      plan,
      previewHash: preview.preview_hash,
      raw: "never"
    }).success
  ).toBe(false);
});

it("dispatches over the shared CLI API and contains untrusted errors", async () => {
  const execute = vi.fn<AnalyticsPlanApi["execute"]>().mockResolvedValue(preview);
  const tools = createAnalyticsPlanMcpTools({ execute });
  await tools.analytics_plan_get({ bearerToken: "member", projectId });
  await tools.analytics_plan_validate({ bearerToken: "member", projectId, plan });
  await tools.analytics_plan_preview({ bearerToken: "member", projectId, plan });
  await tools.analytics_plan_apply({
    bearerToken: "member",
    projectId,
    plan,
    previewHash: preview.preview_hash
  });
  expect(execute.mock.calls.map(([input]) => input)).toEqual([
    { bearerToken: "member", operation: { operation: "get", projectId } },
    { bearerToken: "member", operation: { operation: "validate", projectId, plan } },
    { bearerToken: "member", operation: { operation: "preview", projectId, plan } },
    {
      bearerToken: "member",
      operation: { operation: "apply", projectId, plan, previewHash: preview.preview_hash }
    }
  ]);
  const observed = {
    ...record,
    observations: [
      {
        event_name: "signup.completed",
        event_revision: 1,
        producer_kind: "server" as const,
        observed_count: "2",
        first_observed_on: "2026-09-29",
        last_observed_on: "2026-09-29"
      }
    ]
  };
  execute.mockResolvedValueOnce(observed);
  expect(await tools.analytics_plan_get({ bearerToken: "member", projectId })).toEqual(observed);
  await expect(
    tools.analytics_plan_apply({ bearerToken: "member", projectId, plan })
  ).rejects.toThrow("mcp_tool_error:invalid_input");
  await expect(tools.analytics_plan_get({ bearerToken: "", projectId })).rejects.toThrow(
    "mcp_tool_error:invalid_input"
  );
  await expect(
    tools.analytics_plan_get({ bearerToken: "member", projectId, raw: "never" })
  ).rejects.toThrow("mcp_tool_error:invalid_input");
  execute.mockRejectedValueOnce(new AnalyticsPlanApiError(403, "analytics_plan_forbidden"));
  await expect(tools.analytics_plan_get({ bearerToken: "member", projectId })).rejects.toThrow(
    "mcp_tool_error:analytics_plan_forbidden"
  );
  execute.mockRejectedValueOnce(new Error("untrusted customer.secret"));
  await expect(tools.analytics_plan_get({ bearerToken: "member", projectId })).rejects.toThrow(
    "mcp_tool_error:analytics_plan_request_failed"
  );
});

it("uses stored local member auth and keeps restricted agent tools separate", async () => {
  vi.spyOn(authState, "readCliAuthState").mockResolvedValue({
    bearer_token: "synthetic-member",
    base_url: "https://stored.example.test"
  });
  vi.stubEnv("DEBUGBUNDLE_MEMBER_TOKEN", "");
  vi.stubEnv("DEBUGBUNDLE_API_URL", "");
  const fetchMock = vi
    .spyOn(nodeHttp, "nodeFetch")
    .mockResolvedValue(
      new Response(JSON.stringify({ plan: record, replayed: false }), { status: 200 })
    );
  const server = createMcpServer({
    tools: await createDefaultMcpTools({ localAuth: true }),
    localAuth: true
  });
  const result = await server.handleRequest({
    id: 1,
    method: "tools/call",
    params: {
      name: "analytics_plan_apply",
      arguments: { projectId, plan, previewHash: preview.preview_hash }
    }
  });
  const applied = result as { result: { content: Array<{ text: string }> } };
  expect(JSON.parse(applied.result.content[0]!.text)).toEqual({ plan: record, replayed: false });
  expect(fetchMock).toHaveBeenCalledWith(
    `https://stored.example.test/v1/projects/${projectId}/analytics/plan/apply`,
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
    visible.result.tools.find((tool) => tool.name === "analytics_plan_apply")?.inputSchema
      .properties
  ).not.toHaveProperty("bearerToken");
  vi.stubEnv("DEBUGBUNDLE_AGENT_TOKEN", "dbundle_agent_synthetic");
  const restricted = await createDefaultMcpTools({ agentRead: true });
  expect(restricted).not.toHaveProperty("analytics_plan_apply");
});
