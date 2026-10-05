import { expect, it, vi } from "vitest";
import {
  analyticsFlowWithAuthCommand,
  createAnalyticsFlowApi
} from "../../../apps/cli/src/analytics-flow-commands.js";
import { runCli } from "../../../apps/cli/src/main.js";
import { createAnalyticsFlowMcpTools } from "../../../apps/mcp/src/analytics-flow-tools.js";
import { flowDefinition, flowInput, flowReport } from "../../fixtures/analytics-flow-report.js";
const projectId = flowDefinition.project_id;
it("routes project flow commands and rejects unsupported windows", async () => {
  const command = vi.fn().mockResolvedValue({ exitCode: 0, output: "ok" });
  expect(
    (
      await runCli(
        [
          "analytics",
          "flows",
          "report",
          "--project",
          projectId,
          "--key",
          "reading",
          "--window",
          "7d",
          "--json"
        ],
        { analyticsFlowCommand: command }
      )
    ).exitCode
  ).toBe(0);
  expect(command).toHaveBeenCalledWith({
    action: "report",
    projectId,
    flowKey: "reading",
    window: "7d",
    json: true
  });
  expect(
    (
      await runCli(
        [
          "analytics",
          "flows",
          "report",
          "--project",
          projectId,
          "--key",
          "reading",
          "--window",
          "all"
        ],
        { analyticsFlowCommand: command }
      )
    ).exitCode
  ).not.toBe(0);
  expect(
    (
      await runCli(
        [
          "analytics",
          "flows",
          "save",
          "--project",
          projectId,
          "--definition-json",
          JSON.stringify(flowInput)
        ],
        { analyticsFlowCommand: command }
      )
    ).exitCode
  ).toBe(0);
});
it("shares validated APIs between CLI and MCP without operator-specific parameters", async () => {
  const request = vi.fn().mockResolvedValue({ status: 200, body: flowReport });
  const api = createAnalyticsFlowApi({ request });
  const tools = createAnalyticsFlowMcpTools(api);
  expect(
    await tools.get_analytics_flow_report({
      bearerToken: "member",
      projectId,
      flowKey: "reading",
      window: "7d"
    })
  ).toEqual(flowReport);
  expect(request).toHaveBeenLastCalledWith({
    method: "GET",
    path: `/v1/projects/${projectId}/analytics/flows/reading/report?window=7d`,
    bearerToken: "member"
  });
  request.mockResolvedValue({ status: 200, body: { flow: flowDefinition } });
  expect(
    await tools.save_analytics_flow({ bearerToken: "member", projectId, definition: flowInput })
  ).toEqual({ flow: flowDefinition });
  expect(request).toHaveBeenLastCalledWith(
    expect.objectContaining({ method: "PUT", body: flowInput })
  );
  request.mockResolvedValue({ status: 200, body: { flows: [flowDefinition] } });
  const result = await analyticsFlowWithAuthCommand(
    { action: "list", projectId, json: true },
    {
      readAuthState: vi
        .fn()
        .mockResolvedValue({ bearer_token: "member", base_url: "https://api.customer.test" }),
      createHttpClient: () => ({ request })
    }
  );
  expect(result.exitCode).toBe(0);
  expect(JSON.parse(result.output)).toEqual({ flows: [flowDefinition] });
  request.mockResolvedValue({ status: 403, body: { error: "forbidden" } });
  await expect(
    tools.archive_analytics_flow({ bearerToken: "member", projectId, flowKey: "reading" })
  ).rejects.toThrow("mcp_tool_error:forbidden");
  request.mockResolvedValue({ status: 200, body: { starts: "invalid" } });
  await expect(
    api.report({ bearerToken: "member", projectId, flowKey: "reading" })
  ).rejects.toThrow("Invalid flow response");
});
