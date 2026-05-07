import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { createRetrievalMcpTools } from "../../../apps/mcp/src/retrieval-tools.js";
import { createLocalRetrievalFixture } from "../../helpers/local-retrieval-fixture.js";

describe("mcp retrieval tools auth and error handling", () => {
  it("requires a bearer token for explicit cloud retrieval in connected mode", async () => {
    const { rootDirectory } = await createLocalRetrievalFixture({ mode: "connected" });
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(rootDirectory);

    try {
      const tools = createRetrievalMcpTools({
        listIncidents: vi.fn(),
        getIncident: vi.fn(),
        resolveIncident: vi.fn(),
        reopenIncident: vi.fn(),
        getBundle: vi.fn(),
        getLogs: vi.fn(),
        getReproduction: vi.fn()
      });

      await expect(tools.get_logs({ source: "cloud", incidentId: "inc_cloud_prod" })).rejects.toThrow(
        "mcp_tool_error:auth_required"
      );
    } finally {
      cwdSpy.mockRestore();
    }
  });

  it("reports local-only projects when cloud retrieval is requested without auth", async () => {
    const { rootDirectory } = await createLocalRetrievalFixture();
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(rootDirectory);

    try {
      const tools = createRetrievalMcpTools({
        listIncidents: vi.fn(),
        getIncident: vi.fn(),
        resolveIncident: vi.fn(),
        reopenIncident: vi.fn(),
        getBundle: vi.fn(),
        getLogs: vi.fn(),
        getReproduction: vi.fn()
      });

      await expect(tools.get_bundle({ source: "cloud", incidentId: "inc_local" })).rejects.toThrow(
        "mcp_tool_error:local_only_project"
      );
    } finally {
      cwdSpy.mockRestore();
    }
  });

  it("paginates merged connected incidents with filters across cloud pages", async () => {
    const { rootDirectory } = await createLocalRetrievalFixture({ mode: "connected" });
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(rootDirectory);
    const listIncidents = vi
      .fn()
      .mockResolvedValueOnce({
        incidents: [
          {
            incident_id: "inc_cloud_2",
            title: "Second cloud incident",
            severity: "high",
            status: "open",
            last_seen_at: "2026-03-20T00:03:00.000Z"
          }
        ],
        next_cursor: "2026-03-20T00:03:00.000Z|inc_cloud_2"
      })
      .mockResolvedValueOnce({
        incidents: [
          {
            incident_id: "inc_cloud_1",
            title: "First cloud incident",
            severity: "critical",
            status: "open",
            last_seen_at: "2026-03-20T00:01:00.000Z"
          }
        ],
        next_cursor: null
      });

    try {
      const tools = createRetrievalMcpTools({
        listIncidents,
        getIncident: vi.fn(),
        resolveIncident: vi.fn(),
        reopenIncident: vi.fn(),
        getBundle: vi.fn(),
        getLogs: vi.fn(),
        getReproduction: vi.fn()
      });

      await expect(
        tools.list_incidents({
          bearerToken: "dbundle_mem_x",
          environment: "production",
          service: "checkout-api",
          status: "open",
          severity: "high",
          cursor: "2026-03-20T00:03:00.000Z|inc_cloud_2",
          limit: 2
        })
      ).resolves.toEqual({
        incidents: [
          expect.objectContaining({ incident_id: "inc_cloud_1", source: "cloud" })
        ],
        next_cursor: null
      });

      expect(listIncidents).toHaveBeenNthCalledWith(1, {
        bearerToken: "dbundle_mem_x",
        environment: "production",
        service: "checkout-api",
        status: "open",
        severity: "high"
      });
      expect(listIncidents).toHaveBeenNthCalledWith(2, {
        bearerToken: "dbundle_mem_x",
        environment: "production",
        service: "checkout-api",
        status: "open",
        severity: "high",
        cursor: "2026-03-20T00:03:00.000Z|inc_cloud_2"
      });
    } finally {
      cwdSpy.mockRestore();
    }
  });

  it("maps invalid local state instead of silently falling through to cloud", async () => {
    const { rootDirectory } = await createLocalRetrievalFixture({ mode: "connected" });
    writeFileSync(join(rootDirectory, ".debugbundle", "local", "state.json"), "{\n", "utf8");
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(rootDirectory);

    try {
      const tools = createRetrievalMcpTools({
        listIncidents: vi.fn(),
        getIncident: vi.fn(),
        resolveIncident: vi.fn(),
        reopenIncident: vi.fn(),
        getBundle: vi.fn(),
        getLogs: vi.fn(),
        getReproduction: vi.fn()
      });

      await expect(tools.get_incident({ bearerToken: "dbundle_mem_x", incidentId: "inc_invalid" })).rejects.toThrow(
        "mcp_tool_error:invalid_local_state"
      );
      await expect(tools.resolve_incident({ bearerToken: "dbundle_mem_x", incidentId: "inc_invalid" })).rejects.toThrow(
        "mcp_tool_error:invalid_local_state"
      );
      await expect(tools.reopen_incident({ bearerToken: "dbundle_mem_x", incidentId: "inc_invalid" })).rejects.toThrow(
        "mcp_tool_error:invalid_local_state"
      );
      await expect(tools.get_bundle({ bearerToken: "dbundle_mem_x", incidentId: "inc_invalid" })).rejects.toThrow(
        "mcp_tool_error:invalid_local_state"
      );
      await expect(tools.get_reproduction({ bearerToken: "dbundle_mem_x", incidentId: "inc_invalid" })).rejects.toThrow(
        "mcp_tool_error:invalid_local_state"
      );
    } finally {
      cwdSpy.mockRestore();
    }
  });

  it("reopens a cloud incident when source is explicitly cloud", async () => {
    const { rootDirectory } = await createLocalRetrievalFixture({ mode: "connected" });
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(rootDirectory);
    const reopenIncident = vi.fn().mockResolvedValue({
      incident_id: "inc_cloud_prod",
      status: "open",
      resolved_at: null
    });

    try {
      const tools = createRetrievalMcpTools({
        listIncidents: vi.fn(),
        getIncident: vi.fn(),
        resolveIncident: vi.fn(),
        reopenIncident,
        getBundle: vi.fn(),
        getLogs: vi.fn(),
        getReproduction: vi.fn()
      });

      await expect(
        tools.reopen_incident({ bearerToken: "dbundle_mem_x", source: "cloud", incidentId: "inc_cloud_prod" })
      ).resolves.toEqual({
        incident: expect.objectContaining({
          incident_id: "inc_cloud_prod",
          status: "open",
          source: "cloud"
        })
      });
      expect(reopenIncident).toHaveBeenCalledWith({
        bearerToken: "dbundle_mem_x",
        incidentId: "inc_cloud_prod"
      });
    } finally {
      cwdSpy.mockRestore();
    }
  });
});