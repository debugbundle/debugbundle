import { describe, expect, it, vi } from "vitest";
import { createRetrievalApi } from "../../../packages/retrieval-client/src/index.js";
import {
  resolveIncidentCommand,
  reopenIncidentCommand,
  resolveIncidentWithAuthCommand
} from "../../../apps/cli/src/retrieval-commands.js";
import { createRetrievalMcpTools } from "../../../apps/mcp/src/retrieval-tools.js";
import { createImprovementMcpTools } from "../../../apps/mcp/src/improvement-tools.js";

describe("CLI mutation outcomes", () => {
  it.each([true, false])(
    "retains a confirmed remote success when the optional local cache cannot be updated (json=%s)",
    async (json) => {
      const resolveIncident = vi.fn().mockResolvedValue({
        incident_id: "inc_synthetic",
        title: "Synthetic",
        status: "resolved",
        severity: "high",
        resolved_at: "2026-09-21T00:00:00.000Z"
      });
      const result = await resolveIncidentWithAuthCommand(
        { source: "cloud", incidentId: "inc_synthetic", json },
        {
          readAuthState: vi
            .fn()
            .mockResolvedValue({
              bearer_token: "synthetic",
              base_url: "https://synthetic.invalid"
            }),
          createApi: vi.fn().mockReturnValue({ resolveIncident }),
          readdir: vi.fn().mockRejectedValue(new Error("sensitive-cache-error-canary"))
        }
      );
      expect(result.exitCode).toBe(0);
      if (json) {
        expect(JSON.parse(result.output).incident).toMatchObject({
          status: "resolved",
          cache_warning: "cloud_cache_update_unavailable"
        });
      } else {
        expect(result.output).toContain("Cloud change confirmed; local cache unavailable.");
      }
      expect(result.output).not.toContain("sensitive-cache-error-canary");
      expect(resolveIncident).toHaveBeenCalledTimes(1);
    }
  );

  it("gives human callers explicit no-retry guidance", async () => {
    const result = await resolveIncidentCommand(
      { bearerToken: "synthetic", incidentId: "inc_synthetic" },
      createRetrievalApi({ request: vi.fn().mockResolvedValue({ status: 200, body: {} }) })
    );
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("The operation may have succeeded");
    expect(result.output).toContain("Check the current state before retrying");
  });

  it.each([resolveIncidentCommand, reopenIncidentCommand])(
    "reports unconfirmed writes in machine-readable output",
    async (command) => {
      const request = vi.fn().mockResolvedValue({ status: 200, body: {} });
      const result = await command(
        { bearerToken: "synthetic", incidentId: "inc_synthetic", json: true },
        createRetrievalApi({ request })
      );
      expect(result.exitCode).toBe(1);
      expect(JSON.parse(result.output)).toMatchObject({
        error: "mutation_outcome_unconfirmed",
        outcome: "unknown",
        retry_safe: false
      });
      expect(result.output).toContain("Check the current state before retrying");
      expect(result.output).not.toContain("Update DebugBundle CLI and retry");
      expect(request).toHaveBeenCalledTimes(1);
    }
  );

  it("preserves the no-retry warning in MCP incident and improvement mutations", async () => {
    const api = createRetrievalApi({
      request: vi.fn().mockResolvedValue({ status: 200, body: {} })
    });
    const incidents = createRetrievalMcpTools({ ...api, getLogs: api.listLogs });
    const improvements = createImprovementMcpTools(api);
    await expect(
      incidents.resolve_incident({
        source: "cloud",
        bearerToken: "synthetic",
        incidentId: "inc_synthetic"
      })
    ).rejects.toThrow("mutation_outcome_unconfirmed");
    await expect(
      improvements.resolve_improvement({ bearerToken: "synthetic", improvementId: "imp_synthetic" })
    ).rejects.toThrow("Check the current state before retrying");
  });
});
