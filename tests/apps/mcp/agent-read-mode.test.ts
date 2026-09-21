import { describe, expect, it, vi } from "vitest";
import { createMcpServer } from "../../../apps/mcp/src/server.js";
import { createAgentReadClient } from "../../../packages/agent-read-client/src/index.js";

const PROJECT = "00000000-0000-4000-8000-000000000001";
const INCIDENT = "11111111-1111-4111-8111-111111111111";

describe("restricted agent MCP mode", () => {
  it("discovers exactly five read tools and refuses hidden management invocation", async () => {
    const mutation = vi.fn();
    const server = createMcpServer({ agentRead: true, tools: {
      agent_project_summary: vi.fn().mockResolvedValue({ project: { project_id: PROJECT, name: "API" } }),
      agent_list_incidents: vi.fn().mockResolvedValue({ incidents: [] }),
      agent_get_incident: vi.fn(), agent_get_incident_context: vi.fn(), agent_get_bundle: vi.fn(),
      create_project_token: mutation
    } });
    const list = await server.handleRequest({ id: 1, method: "tools/list" });
    expect((list as { result: { tools: Array<{ name: string }> } }).result.tools.map((tool) => tool.name)).toEqual([
      "agent_project_summary", "agent_list_incidents", "agent_get_incident", "agent_get_incident_context", "agent_get_bundle"
    ]);
    const hidden = await server.handleRequest({ id: 2, method: "tools/call",
      params: { name: "create_project_token", arguments: { projectId: PROJECT, label: "x" } } });
    expect(hidden).toMatchObject({ error: { code: -32602 } });
    expect(mutation).not.toHaveBeenCalled();
    const invalid = await server.handleRequest({ id: 3, method: "tools/call",
      params: { name: "agent_get_bundle", arguments: { projectId: PROJECT, incidentId: INCIDENT, bearerToken: "secret" } } });
    expect(invalid).toMatchObject({ error: { code: -32602 } });
  });

  it("rejects broad credentials before making an HTTP call", () => {
    const fetchImpl = vi.fn();
    expect(() => createAgentReadClient({ baseUrl: "https://api.debugbundle.com", token: "dbundle_mem_broad", fetchImpl })).toThrow("agent_read_credential_required");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("uses only GET, bounds output, and excludes unclassified project fields", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      project: { project_id: PROJECT, name: "API", raw_logs: "password=hunter2" }
    }), { status: 200 }));
    const client = createAgentReadClient({ baseUrl: "https://api.debugbundle.com", token: "dbundle_agent_synthetic", fetchImpl });
    await expect(client.read({ name: "project_summary", projectId: PROJECT })).resolves.toEqual({
      project: { project_id: PROJECT, name: "API" }
    });
    expect(fetchImpl).toHaveBeenCalledWith(new URL(`https://api.debugbundle.com/v1/agent/projects/${PROJECT}`),
      expect.objectContaining({ method: "GET", redirect: "error" }));
  });
});
