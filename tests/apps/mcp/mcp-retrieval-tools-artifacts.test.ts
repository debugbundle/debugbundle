import { describe, expect, it, vi } from "vitest";

import { RetrievalApiError } from "../../../packages/retrieval-client/src/index.js";
import { createRetrievalMcpTools } from "../../../apps/mcp/src/retrieval-tools.js";

describe("mcp retrieval tools artifacts", () => {
  it("returns bundle and reproduction payloads and maps errors", async () => {
    const tools = createRetrievalMcpTools({
      listIncidents: vi.fn().mockResolvedValue([]),
      getIncident: vi.fn().mockResolvedValue({ incident_id: "inc_123" }),
      resolveIncident: vi.fn().mockResolvedValue({ incident_id: "inc_123", status: "resolved" }),
      reopenIncident: vi.fn(),
      getBundle: vi.fn().mockResolvedValue({ bundle_version: 1 }),
      getLogs: vi.fn().mockResolvedValue({ logs: [], next_cursor: null }),
      getReproduction: vi.fn().mockRejectedValue(new RetrievalApiError(401, "invalid_member_token"))
    });

    await expect(tools.get_bundle({ bearerToken: "dbundle_mem_x", source: "cloud", incidentId: "inc_123" })).resolves.toEqual({
      bundle_version: 1,
      source: "cloud"
    });
    await expect(
      tools.get_reproduction({ bearerToken: "dbundle_mem_x", source: "cloud", incidentId: "inc_123" })
    ).rejects.toThrow("mcp_tool_error:invalid_member_token");
  });

  it("returns logs payload and forwards filters for get_logs", async () => {
    const getLogs = vi.fn().mockResolvedValue({
      logs: [
        {
          event_id: "evt_123",
          event_type: "backend_exception",
          occurred_at: "2026-03-11T00:10:00.000Z",
          is_sampled: true,
          level: "error"
        }
      ],
      next_cursor: "2026-03-11T00:10:00.000Z|evt_123"
    });

    const tools = createRetrievalMcpTools({
      listIncidents: vi.fn().mockResolvedValue([]),
      getIncident: vi.fn().mockResolvedValue({ incident_id: "inc_123" }),
      resolveIncident: vi.fn().mockResolvedValue({ incident_id: "inc_123", status: "resolved" }),
      reopenIncident: vi.fn(),
      getBundle: vi.fn().mockResolvedValue({ bundle_version: 1 }),
      getLogs,
      getReproduction: vi.fn().mockResolvedValue({ status: "pending" })
    });

    await expect(
      tools.get_logs({
        bearerToken: "dbundle_mem_x",
        source: "cloud",
        incidentId: "inc_123",
        level: "error",
        cursor: "2026-03-11T00:09:00.000Z|evt_122",
        limit: 10
      })
    ).resolves.toEqual({
      logs: [
        {
          event_id: "evt_123",
          event_type: "backend_exception",
          occurred_at: "2026-03-11T00:10:00.000Z",
          is_sampled: true,
          level: "error"
        }
      ],
      next_cursor: "2026-03-11T00:10:00.000Z|evt_123"
    });
    expect(getLogs).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_x",
      incidentId: "inc_123",
      level: "error",
      cursor: "2026-03-11T00:09:00.000Z|evt_122",
      limit: 10
    });
  });

  it("supports minimal incident and log inputs and maps unknown retrieval failures", async () => {
    const listIncidents = vi.fn().mockResolvedValue({
      incidents: [],
      next_cursor: null
    });
    const getLogs = vi.fn().mockResolvedValue({
      logs: [],
      next_cursor: null
    });
    const tools = createRetrievalMcpTools({
      listIncidents,
      getIncident: vi.fn().mockResolvedValue({ incident_id: "inc_123" }),
      resolveIncident: vi.fn().mockResolvedValue({ incident_id: "inc_123", status: "resolved" }),
      reopenIncident: vi.fn(),
      getBundle: vi.fn().mockRejectedValue("bundle_failed"),
      getLogs,
      getReproduction: vi.fn().mockResolvedValue({ status: "ready" })
    });

    await expect(tools.list_incidents({ bearerToken: "dbundle_mem_x", source: "cloud" })).resolves.toEqual({
      incidents: [],
      next_cursor: null
    });
    await expect(tools.get_logs({ bearerToken: "dbundle_mem_x", source: "cloud", incidentId: "inc_123" })).resolves.toEqual({
      logs: [],
      next_cursor: null
    });
    expect(listIncidents).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_x"
    });
    expect(getLogs).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_x",
      incidentId: "inc_123"
    });
    await expect(tools.get_bundle({ bearerToken: "dbundle_mem_x", source: "cloud", incidentId: "inc_123" })).rejects.toThrow(
      "mcp_tool_error:unknown_error"
    );
  });
});