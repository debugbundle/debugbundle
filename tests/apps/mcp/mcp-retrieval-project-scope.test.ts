import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createRetrievalMcpTools } from "../../../apps/mcp/src/retrieval-tools.js";
import { createLocalRetrievalFixture } from "../../helpers/local-retrieval-fixture.js";

let workspace: string;

async function connectedWorkspace(projectId: unknown = "proj_connected") {
  const fixture = await createLocalRetrievalFixture({ mode: "connected" });
  workspace = fixture.rootDirectory;
  await writeFile(
    join(fixture.rootDirectory, ".debugbundle/local/connection.json"),
    JSON.stringify({ mode: "connected", cloud_project_id: projectId })
  );
  vi.spyOn(process, "cwd").mockReturnValue(fixture.rootDirectory);
  return fixture;
}

function createTools() {
  const listIncidents = vi.fn().mockResolvedValue({ incidents: [], next_cursor: null });
  const tools = createRetrievalMcpTools({
    listIncidents,
    getIncident: vi.fn(),
    getIncidentContext: vi.fn(),
    resolveIncident: vi.fn(),
    reopenIncident: vi.fn(),
    getBundle: vi.fn(),
    getLogs: vi.fn(),
    getReproduction: vi.fn()
  });
  return { tools, listIncidents };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(workspace, { recursive: true, force: true });
});

describe("MCP connected incident project scope", () => {
  it("scopes every cloud page to the connection while retaining local evidence", async () => {
    const { openIncident, rootDirectory } = await connectedWorkspace();
    const { tools, listIncidents } = createTools();
    listIncidents.mockImplementationOnce(async () => {
      await writeFile(
        join(rootDirectory, ".debugbundle/local/connection.json"),
        JSON.stringify({
          mode: "connected",
          cloud_project_id: "proj_changed_during_pagination"
        })
      );
      return { incidents: [], next_cursor: "next-page" };
    });

    const result = await tools.list_incidents({ bearerToken: "synthetic-member" });

    expect(result).toMatchObject({
      incidents: [expect.objectContaining({ incident_id: openIncident.incidentId })]
    });
    expect(listIncidents).toHaveBeenCalledTimes(2);
    expect(listIncidents).toHaveBeenNthCalledWith(1, {
      bearerToken: "synthetic-member",
      projectId: "proj_connected",
      status: "active"
    });
    expect(listIncidents).toHaveBeenNthCalledWith(2, {
      bearerToken: "synthetic-member",
      projectId: "proj_connected",
      status: "active",
      cursor: "next-page"
    });
  });

  it("also scopes explicit cloud reads and preserves other filters", async () => {
    await connectedWorkspace();
    const { tools, listIncidents } = createTools();
    await tools.list_incidents({
      bearerToken: "synthetic-member",
      source: "cloud",
      environment: "production",
      service: "checkout",
      status: "all",
      limit: 3,
      cursor: "page"
    });
    expect(listIncidents).toHaveBeenCalledWith({
      bearerToken: "synthetic-member",
      projectId: "proj_connected",
      environment: "production",
      service: "checkout",
      limit: 3,
      cursor: "page"
    });
  });

  it("honours an explicitly selected project", async () => {
    await connectedWorkspace(null);
    const { tools, listIncidents } = createTools();
    await tools.list_incidents({
      bearerToken: "synthetic-member",
      projectId: "proj_selected",
      source: "cloud"
    });
    expect(listIncidents).toHaveBeenCalledWith({
      bearerToken: "synthetic-member",
      projectId: "proj_selected",
      status: "active"
    });
  });

  it.each(["", "   "])(
    "rejects an explicitly blank project %j without broadening scope",
    async (projectId) => {
      await connectedWorkspace();
      const { tools, listIncidents } = createTools();
      await expect(
        tools.list_incidents({ bearerToken: "synthetic-member", projectId, source: "cloud" })
      ).rejects.toThrow("mcp_tool_error:invalid_project_id");
      expect(listIncidents).not.toHaveBeenCalled();
    }
  );

  it.each([null, "", "   ", 42, {}])(
    "rejects an unusable connected project %j before cloud requests",
    async (projectId) => {
      await connectedWorkspace(projectId);
      const { tools, listIncidents } = createTools();
      await expect(
        tools.list_incidents({ bearerToken: "synthetic-member", source: "cloud" })
      ).rejects.toThrow("mcp_tool_error:invalid_local_connection_config");
      expect(listIncidents).not.toHaveBeenCalled();
    }
  );

  it("does not broaden a legacy connected configuration missing its project", async () => {
    const { rootDirectory } = await connectedWorkspace();
    await writeFile(
      join(rootDirectory, ".debugbundle/local/connection.json"),
      JSON.stringify({ mode: "connected" })
    );
    const { tools, listIncidents } = createTools();
    await expect(tools.list_incidents({ bearerToken: "synthetic-member" })).rejects.toThrow(
      "mcp_tool_error:invalid_local_connection_config"
    );
    expect(listIncidents).not.toHaveBeenCalled();
  });

  it("keeps explicit local reads independent of the cloud project", async () => {
    const { openIncident } = await connectedWorkspace(null);
    const { tools, listIncidents } = createTools();
    await expect(tools.list_incidents({ source: "local" })).resolves.toMatchObject({
      incidents: [expect.objectContaining({ incident_id: openIncident.incidentId })]
    });
    expect(listIncidents).not.toHaveBeenCalled();
  });

  it("preserves account-wide reads outside a connected workspace", async () => {
    const { rootDirectory } = await createLocalRetrievalFixture();
    workspace = rootDirectory;
    vi.spyOn(process, "cwd").mockReturnValue(rootDirectory);
    const { tools, listIncidents } = createTools();
    await tools.list_incidents({ bearerToken: "synthetic-member", source: "cloud" });
    expect(listIncidents).toHaveBeenCalledWith({
      bearerToken: "synthetic-member",
      status: "active"
    });
  });
});
