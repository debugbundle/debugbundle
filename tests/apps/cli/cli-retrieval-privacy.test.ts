import { describe, expect, it, vi } from "vitest";

import { getIncidentCommand, getLogsCommand } from "../../../apps/cli/src/retrieval-commands.js";

describe("historical CLI retrieval privacy", () => {
  it("scrubs cloud incident and log evidence in human and JSON output", async () => {
    const api = {
      getIncident: vi.fn().mockResolvedValue({
        incident_id: "inc_123", title: "password=SYNTHETIC_TITLE_SECRET", severity: "high", status: "open"
      })
    };
    const human = await getIncidentCommand({ bearerToken: "dbundle_mem_x", incidentId: "inc_123" }, api);
    const json = await getIncidentCommand({ bearerToken: "dbundle_mem_x", incidentId: "inc_123", json: true }, api);
    expect(human.output).toContain("password=[REDACTED]");
    expect(json.output).toContain("password=[REDACTED]");
    expect(human.output + json.output).not.toContain("SYNTHETIC_");

    const logs = await getLogsCommand(
      { bearerToken: "dbundle_mem_x", incidentId: "inc_123", json: true },
      { getLogs: vi.fn().mockResolvedValue({ logs: [{ message: "token=SYNTHETIC_LOG_SECRET" }], next_cursor: null }) }
    );
    expect(logs.output).toContain("token=[REDACTED]");
  });
});
