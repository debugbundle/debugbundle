import { afterEach, expect, it, vi } from "vitest";
import {
  AnalyticsSpacePlanApiError,
  type AnalyticsSpacePlanApi
} from "../../../apps/cli/src/analytics-space-plan-api.js";
import { createAnalyticsSpacePlanMcpTools } from "../../../apps/mcp/src/analytics-space-plan-tools.js";
import { ANALYTICS_SPACE_PLAN_MCP_TOOL_CATALOG } from "../../../apps/mcp/src/analytics-space-plan-tool-catalog.js";
import { MCP_TOOL_CATALOG } from "../../../apps/mcp/src/tool-catalog.js";
import { createDefaultMcpTools } from "../../../apps/mcp/src/default-tools.js";
import { createMcpServer } from "../../../apps/mcp/src/server.js";
import * as authState from "../../../apps/cli/src/auth-state.js";
import * as nodeHttp from "../../../packages/node-http/src/index.js";
import { analyticsSpacePlanFixture } from "../../helpers/analytics-plan-fixtures.js";

const spaceId = "11111111-1111-4111-8111-111111111111";
const plan = { ...analyticsSpacePlanFixture(spaceId), reports: [] };
const previewHash = "a".repeat(64);
const record = {
  space_id: spaceId,
  revision: 1,
  space_revision: 1,
  catalog: plan.catalog,
  reports: [],
  source_catalog_revisions: [{ project_id: spaceId, catalog_revision: 1 }],
  coverage: [
    {
      name: "signup.completed",
      project_ids: [spaceId],
      source_entry_revisions: [{ project_id: spaceId, entry_revision: 1 }]
    }
  ]
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it("registers strict space-plan tools and requires a reviewed hash", () => {
  expect(ANALYTICS_SPACE_PLAN_MCP_TOOL_CATALOG.map((tool) => tool.name)).toEqual([
    "analytics_space_plan_get",
    "analytics_space_plan_validate",
    "analytics_space_plan_preview",
    "analytics_space_plan_apply"
  ]);
  for (const tool of ANALYTICS_SPACE_PLAN_MCP_TOOL_CATALOG)
    expect(MCP_TOOL_CATALOG.some((entry) => entry.name === tool.name)).toBe(true);
  const apply = ANALYTICS_SPACE_PLAN_MCP_TOOL_CATALOG[3].inputSchema;
  expect(apply.safeParse({ bearerToken: "member", spaceId, plan }).success).toBe(false);
  expect(apply.safeParse({ bearerToken: "member", spaceId, plan, previewHash }).success).toBe(true);
  expect(
    apply.safeParse({ bearerToken: "member", spaceId, plan, previewHash, raw: "never" }).success
  ).toBe(false);
});

it("dispatches through shared API and contains untrusted errors", async () => {
  const execute = vi.fn<AnalyticsSpacePlanApi["execute"]>().mockResolvedValue(record);
  const tools = createAnalyticsSpacePlanMcpTools({ execute });
  await tools.analytics_space_plan_get({ bearerToken: "member", spaceId });
  await tools.analytics_space_plan_validate({ bearerToken: "member", spaceId, plan });
  await tools.analytics_space_plan_preview({ bearerToken: "member", spaceId, plan });
  await tools.analytics_space_plan_apply({ bearerToken: "member", spaceId, plan, previewHash });
  expect(execute.mock.calls.map(([input]) => input.operation.operation)).toEqual([
    "get",
    "validate",
    "preview",
    "apply"
  ]);
  await expect(
    tools.analytics_space_plan_apply({ bearerToken: "member", spaceId, plan })
  ).rejects.toThrow("mcp_tool_error:invalid_input");
  execute.mockRejectedValueOnce(
    new AnalyticsSpacePlanApiError(409, "analytics_space_plan_conflict")
  );
  await expect(tools.analytics_space_plan_get({ bearerToken: "member", spaceId })).rejects.toThrow(
    "mcp_tool_error:analytics_space_plan_conflict"
  );
  execute.mockRejectedValueOnce(new Error("untrusted customer.secret"));
  await expect(tools.analytics_space_plan_get({ bearerToken: "member", spaceId })).rejects.toThrow(
    "mcp_tool_error:analytics_space_plan_request_failed"
  );
});

it("uses local member auth without exposing it or granting agent-read writes", async () => {
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
    params: { name: "analytics_space_plan_apply", arguments: { spaceId, plan, previewHash } }
  });
  const applied = result as { result: { content: Array<{ text: string }> } };
  expect(JSON.parse(applied.result.content[0]!.text)).toEqual({ plan: record, replayed: false });
  expect(fetchMock).toHaveBeenCalledWith(
    `https://stored.example.test/v1/analytics/spaces/${spaceId}/plan/apply`,
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
    visible.result.tools.find((tool) => tool.name === "analytics_space_plan_apply")?.inputSchema
      .properties
  ).not.toHaveProperty("bearerToken");
  vi.stubEnv("DEBUGBUNDLE_AGENT_TOKEN", "dbundle_agent_synthetic");
  expect(await createDefaultMcpTools({ agentRead: true })).not.toHaveProperty(
    "analytics_space_plan_apply"
  );
});
