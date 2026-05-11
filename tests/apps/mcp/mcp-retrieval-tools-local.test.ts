import { describe, expect, it, vi } from "vitest";

import { createRetrievalMcpTools } from "../../../apps/mcp/src/retrieval-tools.js";
import { createLocalRetrievalFixture } from "../../helpers/local-retrieval-fixture.js";

describe("mcp retrieval tools local mode", () => {
  it("reads local incidents, bundle, and reproduction without a bearer token in local-only mode", async () => {
    const { rootDirectory, openIncident } = await createLocalRetrievalFixture();

    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(rootDirectory);

    try {
      const tools = createRetrievalMcpTools({
        listIncidents: vi.fn().mockRejectedValue(new Error("should_not_call_cloud")),
        getIncident: vi.fn().mockRejectedValue(new Error("should_not_call_cloud")),
        getIncidentContext: vi.fn().mockRejectedValue(new Error("should_not_call_cloud")),
        resolveIncident: vi.fn().mockRejectedValue(new Error("should_not_call_cloud")),
        reopenIncident: vi.fn().mockRejectedValue(new Error("should_not_call_cloud")),
        getBundle: vi.fn().mockRejectedValue(new Error("should_not_call_cloud")),
        getLogs: vi.fn().mockRejectedValue(new Error("should_not_call_cloud")),
        getReproduction: vi.fn().mockRejectedValue(new Error("should_not_call_cloud"))
      });

      await expect(
        tools.list_incidents({
          environment: "local",
          status: "open"
        })
      ).resolves.toEqual({
        incidents: [
          expect.objectContaining({
            incident_id: openIncident.incidentId,
            source: "local",
            status: "open"
          })
        ],
        next_cursor: null
      });

      await expect(tools.get_incident({ incidentId: openIncident.incidentId })).resolves.toEqual({
        incident: expect.objectContaining({
          incident_id: openIncident.incidentId,
          source: "local"
        })
      });

      await expect(tools.get_incident_context({ incidentId: openIncident.incidentId })).resolves.toEqual(
        expect.objectContaining({
          incident: expect.objectContaining({
            incident_id: openIncident.incidentId,
            source: "local"
          }),
          bundle: expect.objectContaining({
            status: "ready"
          })
        })
      );

      await expect(tools.get_bundle({ incidentId: openIncident.incidentId })).resolves.toEqual({
        bundle_version: 1,
        incident_id: openIncident.incidentId,
        source: "local"
      });

      await expect(tools.get_reproduction({ incidentId: openIncident.incidentId })).resolves.toEqual({
        possible: true,
        confidence: 0.8,
        reason: "request_context_available"
      });
    } finally {
      cwdSpy.mockRestore();
    }
  });

  it("resolves and reopens local incidents without a bearer token in local-only mode", async () => {
    const { rootDirectory, openIncident, resolvedIncident } = await createLocalRetrievalFixture();

    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(rootDirectory);

    try {
      const tools = createRetrievalMcpTools({
        listIncidents: vi.fn().mockRejectedValue(new Error("should_not_call_cloud")),
        getIncident: vi.fn().mockRejectedValue(new Error("should_not_call_cloud")),
        getIncidentContext: vi.fn().mockRejectedValue(new Error("should_not_call_cloud")),
        resolveIncident: vi.fn().mockRejectedValue(new Error("should_not_call_cloud")),
        reopenIncident: vi.fn().mockRejectedValue(new Error("should_not_call_cloud")),
        getBundle: vi.fn().mockRejectedValue(new Error("should_not_call_cloud")),
        getLogs: vi.fn().mockRejectedValue(new Error("should_not_call_cloud")),
        getReproduction: vi.fn().mockRejectedValue(new Error("should_not_call_cloud"))
      });

      await expect(tools.resolve_incident({ incidentId: openIncident.incidentId })).resolves.toEqual({
        incident: expect.objectContaining({
          incident_id: openIncident.incidentId,
          status: "resolved"
        })
      });

      await expect(tools.reopen_incident({ incidentId: resolvedIncident.incidentId })).resolves.toEqual({
        incident: expect.objectContaining({
          incident_id: resolvedIncident.incidentId,
          status: "open"
        })
      });
    } finally {
      cwdSpy.mockRestore();
    }
  });

  it("reads local incidents explicitly with source=local in connected mode without a bearer token", async () => {
    const { rootDirectory, openIncident } = await createLocalRetrievalFixture({ mode: "connected" });

    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(rootDirectory);

    try {
      const tools = createRetrievalMcpTools({
        listIncidents: vi.fn().mockRejectedValue(new Error("should_not_call_cloud")),
        getIncident: vi.fn().mockRejectedValue(new Error("should_not_call_cloud")),
        getIncidentContext: vi.fn().mockRejectedValue(new Error("should_not_call_cloud")),
        resolveIncident: vi.fn().mockRejectedValue(new Error("should_not_call_cloud")),
        reopenIncident: vi.fn().mockRejectedValue(new Error("should_not_call_cloud")),
        getBundle: vi.fn().mockRejectedValue(new Error("should_not_call_cloud")),
        getLogs: vi.fn().mockRejectedValue(new Error("should_not_call_cloud")),
        getReproduction: vi.fn().mockRejectedValue(new Error("should_not_call_cloud"))
      });

      await expect(tools.list_incidents({ source: "local" })).resolves.toEqual({
        incidents: expect.arrayContaining([
          expect.objectContaining({
            incident_id: openIncident.incidentId,
            source: "local"
          })
        ]),
        next_cursor: null
      });
    } finally {
      cwdSpy.mockRestore();
    }
  });
});
