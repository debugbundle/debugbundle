import { readFile, rm } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

import { listIncidentsWithAuthCommand } from "../../../apps/cli/src/retrieval-commands.js";
import { createLocalRetrievalFixture } from "../../helpers/local-retrieval-fixture.js";

const workspaces: string[] = [];
afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(projectId: unknown = "proj_connected") {
  const { rootDirectory } = await createLocalRetrievalFixture({ mode: "connected" });
  workspaces.push(rootDirectory);
  const listIncidents = vi.fn().mockResolvedValue({ incidents: [], next_cursor: null });
  const dependencies = {
    cwd: () => rootDirectory,
    readFile: async (path: string) =>
      path.endsWith("connection.json")
        ? JSON.stringify({ mode: "connected", cloud_project_id: projectId })
        : readFile(path, "utf8"),
    readAuthState: vi
      .fn()
      .mockResolvedValue({ bearer_token: "synthetic-member", base_url: "https://example.test" }),
    createHttpClient: vi.fn().mockReturnValue({ request: vi.fn() }),
    createApi: vi.fn().mockReturnValue({ listIncidents })
  };
  return { dependencies, listIncidents };
}

describe("CLI connected incident project scope", () => {
  it.each([undefined, "cloud"] as const)(
    "scopes source %s to the connected cloud project",
    async (source) => {
      const { dependencies, listIncidents } = await fixture();
      const result = await listIncidentsWithAuthCommand(
        { ...(source === undefined ? {} : { source }), json: true },
        dependencies
      );
      expect(result.exitCode).toBe(0);
      expect(listIncidents).toHaveBeenCalledWith({
        bearerToken: "synthetic-member",
        projectId: "proj_connected",
        status: "active"
      });
    }
  );

  it("honours explicit cloud project selection", async () => {
    const { dependencies, listIncidents } = await fixture(null);
    const result = await listIncidentsWithAuthCommand(
      { source: "cloud", projectId: "proj_selected", json: true },
      dependencies
    );
    expect(result.exitCode).toBe(0);
    expect(listIncidents).toHaveBeenCalledWith({
      bearerToken: "synthetic-member",
      projectId: "proj_selected",
      status: "active"
    });
  });

  it.each(["", "   "])("rejects explicitly blank project %j before requests", async (projectId) => {
    const { dependencies, listIncidents } = await fixture();
    const result = await listIncidentsWithAuthCommand({ source: "cloud", projectId }, dependencies);
    expect(result).toEqual({ exitCode: 4, output: "retrieval_api_error: 400:invalid_project_id" });
    expect(listIncidents).not.toHaveBeenCalled();
  });

  it.each([null, "", "   ", 42])("fails closed for connected project %j", async (projectId) => {
    const { dependencies, listIncidents } = await fixture(projectId);
    const result = await listIncidentsWithAuthCommand({ source: "cloud" }, dependencies);
    expect(result).toEqual({
      exitCode: 4,
      output: "retrieval_api_error: 400:invalid_local_connection_config"
    });
    expect(listIncidents).not.toHaveBeenCalled();
  });
});
