import { describe, expect, it, vi } from "vitest";

import { createRetrievalMcpTools } from "../../../apps/mcp/src/retrieval-tools.js";
import { createLocalRetrievalFixture } from "../../helpers/local-retrieval-fixture.js";

describe("mcp retrieval tools connected mode", () => {
  it("merges local and cloud incidents by default in connected mode and annotates cloud results with source", async () => {
    const { rootDirectory, openIncident } = await createLocalRetrievalFixture({ mode: "connected" });
    const listIncidents = vi.fn().mockResolvedValue({
      incidents: [
        {
          incident_id: "inc_cloud_prod",
          project_id: "proj_cloud",
          project_name: "DebugBundle Cloud",
          service_id: "svc_cloud_checkout",
          service_name: "checkout-api",
          latest_deployment_id: null,
          environment: "production",
          fingerprint: "fp_cloud",
          fingerprint_version: "1",
          title: "Cloud checkout failure",
          severity: "critical",
          status: "open",
          first_seen_at: "2026-03-20T00:02:00.000Z",
          last_seen_at: "2026-03-20T00:02:00.000Z",
          occurrence_count: 5,
          spike_detected_at: null,
          resolved_at: null,
          regressed_at: null,
          matched_fields: ["message"]
        }
      ],
      next_cursor: null
    });

    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(rootDirectory);

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

      await expect(tools.list_incidents({ bearerToken: "dbundle_mem_x" })).resolves.toEqual({
        incidents: expect.arrayContaining([
          expect.objectContaining({
            incident_id: "inc_cloud_prod",
            source: "cloud"
          }),
          expect.objectContaining({
            incident_id: openIncident.incidentId,
            source: "local"
          })
        ]),
        next_cursor: null
      });
      expect(listIncidents).toHaveBeenCalledWith({
        bearerToken: "dbundle_mem_x"
      });
    } finally {
      cwdSpy.mockRestore();
    }
  });

  it("looks up local and cloud incident details by default in connected mode", async () => {
    const { rootDirectory, openIncident } = await createLocalRetrievalFixture({ mode: "connected" });
    const getIncident = vi.fn().mockResolvedValue({
      incident_id: "inc_cloud_prod",
      project_id: "proj_cloud",
      project_name: "DebugBundle Cloud",
      service_id: "svc_cloud_checkout",
      service_name: "checkout-api",
      latest_deployment_id: null,
      environment: "production",
      fingerprint: "fp_cloud",
      fingerprint_version: "1",
      title: "Cloud checkout failure",
      severity: "critical",
      status: "open",
      first_seen_at: "2026-03-20T00:02:00.000Z",
      last_seen_at: "2026-03-20T00:02:00.000Z",
      occurrence_count: 5,
      spike_detected_at: null,
      resolved_at: null,
      regressed_at: null,
      matched_fields: ["message"]
    });

    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(rootDirectory);

    try {

      const tools = createRetrievalMcpTools({
        listIncidents: vi.fn().mockResolvedValue({ incidents: [], next_cursor: null }),
        getIncident,
        resolveIncident: vi.fn(),
        reopenIncident: vi.fn(),
        getBundle: vi.fn(),
        getLogs: vi.fn(),
        getReproduction: vi.fn()
      });

      await expect(tools.get_incident({ bearerToken: "dbundle_mem_x", incidentId: openIncident.incidentId })).resolves.toEqual({
        incident: expect.objectContaining({
          incident_id: openIncident.incidentId,
          source: "local"
        })
      });

      await expect(tools.get_incident({ bearerToken: "dbundle_mem_x", incidentId: "inc_cloud_prod" })).resolves.toEqual({
        incident: expect.objectContaining({
          incident_id: "inc_cloud_prod",
          source: "cloud"
        })
      });

      expect(getIncident).toHaveBeenCalledTimes(1);
      expect(getIncident).toHaveBeenCalledWith({
        bearerToken: "dbundle_mem_x",
        incidentId: "inc_cloud_prod"
      });
    } finally {
      cwdSpy.mockRestore();
    }
  });
});