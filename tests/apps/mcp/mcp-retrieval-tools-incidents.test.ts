import { describe, expect, it, vi } from "vitest";

import { createRetrievalMcpTools } from "../../../apps/mcp/src/retrieval-tools.js";

describe("mcp retrieval tools incidents", () => {
  it("returns incident list and detail payloads", async () => {
    const listIncidents = vi.fn().mockResolvedValue({
      incidents: [{ incident_id: "inc_123" }],
      next_cursor: "2026-03-11T00:09:00.000Z|inc_122"
    });

    const tools = createRetrievalMcpTools({
      listIncidents,
      getIncident: vi.fn().mockResolvedValue({ incident_id: "inc_123" }),
      resolveIncident: vi.fn().mockResolvedValue({ incident_id: "inc_123", status: "resolved" }),
      reopenIncident: vi.fn(),
      getBundle: vi.fn().mockResolvedValue({ bundle_version: 1 }),
      getLogs: vi.fn().mockResolvedValue({ logs: [], next_cursor: null }),
      getReproduction: vi.fn().mockResolvedValue({ status: "pending" })
    });

    await expect(
      tools.list_incidents({
        bearerToken: "dbundle_mem_x",
        source: "cloud",
        projectId: "proj_123",
        environment: "production",
        service: "checkout-api",
        status: "open",
        severity: "high",
        cursor: "2026-03-11T00:08:00.000Z|inc_121",
        limit: 10
      })
    ).resolves.toEqual({
      incidents: [{ incident_id: "inc_123", source: "cloud" }],
      next_cursor: "2026-03-11T00:09:00.000Z|inc_122"
    });
    expect(listIncidents).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_x",
      projectId: "proj_123",
      environment: "production",
      service: "checkout-api",
      status: "open",
      severity: "high",
      cursor: "2026-03-11T00:08:00.000Z|inc_121",
      limit: 10
    });
    await expect(
      tools.get_incident({ bearerToken: "dbundle_mem_x", source: "cloud", incidentId: "inc_123" })
    ).resolves.toEqual({ incident: { incident_id: "inc_123", source: "cloud" } });
  });

  it("returns incident payload for resolve_incident", async () => {
    const resolveIncident = vi.fn().mockResolvedValue({
      incident_id: "inc_123",
      status: "resolved",
      resolved_at: "2026-03-11T00:12:00.000Z"
    });

    const tools = createRetrievalMcpTools({
      listIncidents: vi.fn().mockResolvedValue({ incidents: [], next_cursor: null }),
      getIncident: vi.fn().mockResolvedValue({ incident_id: "inc_123" }),
      resolveIncident,
      reopenIncident: vi.fn(),
      getBundle: vi.fn().mockResolvedValue({ bundle_version: 1 }),
      getLogs: vi.fn().mockResolvedValue({ logs: [], next_cursor: null }),
      getReproduction: vi.fn().mockResolvedValue({ status: "pending" })
    });

    await expect(
      tools.resolve_incident({ bearerToken: "dbundle_mem_x", source: "cloud", incidentId: "inc_123" })
    ).resolves.toEqual({
      incident: {
        incident_id: "inc_123",
        status: "resolved",
        resolved_at: "2026-03-11T00:12:00.000Z",
        source: "cloud"
      }
    });
    expect(resolveIncident).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_x",
      incidentId: "inc_123"
    });
  });
});