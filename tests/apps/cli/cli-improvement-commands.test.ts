import { describe, expect, it, vi } from "vitest";

import { CliAuthStateError } from "../../../apps/cli/src/auth-state.js";
import {
  getImprovementBundleCommand,
  getImprovementBundleWithAuthCommand,
  getImprovementCommand,
  getImprovementWithAuthCommand,
  listImprovementsCommand,
  listImprovementsWithAuthCommand,
  reopenImprovementCommand,
  reopenImprovementWithAuthCommand,
  resolveImprovementCommand,
  resolveImprovementWithAuthCommand,
  snoozeImprovementCommand,
  snoozeImprovementWithAuthCommand
} from "../../../apps/cli/src/improvement-commands.js";
import { RetrievalApiError } from "../../../packages/retrieval-client/src/index.js";

const baseImprovement = {
  improvement_id: "imp_123",
  project_name: "Main App",
  title: "Warning hotspot: payment provider warning",
  kind: "warning_hotspot",
  severity: "medium",
  status: "open",
  environment: "production",
  service_name: "checkout-api",
  confidence: 0.78,
  occurrence_count: 7,
  summary: "Repeated warning log pattern detected.",
  last_detected_at: "2026-05-18T12:30:00.000Z",
  resolved_at: null,
  related_incident_ids: []
};

describe("cli improvement commands", () => {
  it("renders list and detail output in human mode", async () => {
    const listResult = await listImprovementsCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1"
      },
      {
        listImprovements: vi.fn().mockResolvedValue({
          improvements: [
            {
              improvement_id: "imp_123",
              severity: "medium",
              status: "open",
              title: "Warning hotspot: payment provider warning"
            }
          ],
          next_cursor: "cursor_2"
        })
      }
    );
    const detailResult = await getImprovementCommand(
      {
        bearerToken: "dbundle_mem_x",
        improvementId: "imp_123"
      },
      {
        getImprovement: vi.fn().mockResolvedValue(baseImprovement)
      }
    );
    const incidentDetailResult = await getImprovementCommand(
      {
        bearerToken: "dbundle_mem_x",
        improvementId: "imp_incident"
      },
      {
        getImprovement: vi.fn().mockResolvedValue({
          ...baseImprovement,
          improvement_id: "imp_incident",
          kind: "recurring_incident",
          related_incident_ids: ["inc_123"]
        })
      }
    );

    expect(listResult.exitCode).toBe(0);
    expect(listResult.output).toContain("imp_123 | medium | open | Warning hotspot: payment provider warning");
    expect(listResult.output).toContain("next_cursor: cursor_2");
    expect(detailResult.exitCode).toBe(0);
    expect(detailResult.output).toContain("Improvement: imp_123");
    expect(detailResult.output).toContain("Project: Main App");
    expect(detailResult.output).toContain("Summary: Repeated warning log pattern detected.");
    expect(detailResult.output).not.toContain("Resolved at:");
    expect(incidentDetailResult.output).toContain("Related incidents: inc_123");
  });

  it("renders empty list output and mutation or bundle results in json mode", async () => {
    const emptyListResult = await listImprovementsCommand(
      {
        bearerToken: "dbundle_mem_x"
      },
      {
        listImprovements: vi.fn().mockResolvedValue({
          improvements: [],
          next_cursor: null
        })
      }
    );
    const resolveResult = await resolveImprovementCommand(
      {
        bearerToken: "dbundle_mem_x",
        improvementId: "imp_123",
        json: true
      },
      {
        resolveImprovement: vi.fn().mockResolvedValue({
          ...baseImprovement,
          status: "resolved",
          resolved_at: "2026-05-18T13:00:00.000Z"
        })
      }
    );
    const reopenResult = await reopenImprovementCommand(
      {
        bearerToken: "dbundle_mem_x",
        improvementId: "imp_123",
        json: true
      },
      {
        reopenImprovement: vi.fn().mockResolvedValue({
          ...baseImprovement,
          kind: "recurring_incident"
        })
      }
    );
    const snoozeResult = await snoozeImprovementCommand(
      {
        bearerToken: "dbundle_mem_x",
        improvementId: "imp_123",
        snoozedUntil: "2026-05-25T13:00:00.000Z",
        json: true
      },
      {
        snoozeImprovement: vi.fn().mockResolvedValue({
          ...baseImprovement,
          status: "snoozed",
          resolved_at: null
        })
      }
    );
    const bundleResult = await getImprovementBundleCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        improvementId: "imp_123",
        json: true
      },
      {
        getImprovementBundle: vi.fn().mockResolvedValue({
          bundle_id: "bundle_123",
          project_id: "proj_1",
          version: "v1"
        })
      }
    );

    expect(emptyListResult).toEqual({ exitCode: 0, output: "No improvements found." });
    expect(JSON.parse(resolveResult.output)).toMatchObject({ status: "resolved" });
    expect(JSON.parse(reopenResult.output)).toMatchObject({ kind: "recurring_incident" });
    expect(JSON.parse(snoozeResult.output)).toMatchObject({ status: "snoozed" });
    expect(JSON.parse(bundleResult.output)).toEqual({
      bundle_id: "bundle_123",
      project_id: "proj_1",
      version: "v1"
    });
  });

  it("renders the remaining direct output branches in human and json modes", async () => {
    const getJsonResult = await getImprovementCommand(
      {
        bearerToken: "dbundle_mem_x",
        improvementId: "imp_123",
        json: true
      },
      {
        getImprovement: vi.fn().mockResolvedValue({
          ...baseImprovement,
          resolved_at: "2026-05-18T13:00:00.000Z"
        })
      }
    );
    const resolveHumanResult = await resolveImprovementCommand(
      {
        bearerToken: "dbundle_mem_x",
        improvementId: "imp_123"
      },
      {
        resolveImprovement: vi.fn().mockResolvedValue({
          ...baseImprovement,
          status: "resolved",
          resolved_at: "2026-05-18T13:00:00.000Z"
        })
      }
    );
    const reopenHumanResult = await reopenImprovementCommand(
      {
        bearerToken: "dbundle_mem_x",
        improvementId: "imp_123"
      },
      {
        reopenImprovement: vi.fn().mockResolvedValue({
          ...baseImprovement,
          kind: "recurring_incident"
        })
      }
    );
    const snoozeHumanResult = await snoozeImprovementCommand(
      {
        bearerToken: "dbundle_mem_x",
        improvementId: "imp_123",
        snoozedUntil: "2026-05-25T13:00:00.000Z"
      },
      {
        snoozeImprovement: vi.fn().mockResolvedValue({
          ...baseImprovement,
          status: "snoozed",
          resolved_at: null
        })
      }
    );
    const bundleHumanResult = await getImprovementBundleCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        improvementId: "imp_123"
      },
      {
        getImprovementBundle: vi.fn().mockResolvedValue({
          bundle_id: "bundle_123",
          status: "pending"
        })
      }
    );

    expect(JSON.parse(getJsonResult.output)).toMatchObject({
      improvement_id: "imp_123",
      resolved_at: "2026-05-18T13:00:00.000Z"
    });
    expect(resolveHumanResult.output).toContain("Improvement resolved.");
    expect(resolveHumanResult.output).toContain("Resolved at: 2026-05-18T13:00:00.000Z");
    expect(reopenHumanResult.output).toContain("Improvement reopened.");
    expect(snoozeHumanResult.output).toContain("Improvement snoozed.");
    expect(bundleHumanResult.output).toContain('"bundle_id": "bundle_123"');
  });

  it("maps retrieval API failures to CLI exit codes", async () => {
    const unauthorized = await listImprovementsCommand(
      { bearerToken: "dbundle_mem_x" },
      { listImprovements: vi.fn().mockRejectedValue(new RetrievalApiError(401, "invalid_member_token")) }
    );
    const notFound = await getImprovementCommand(
      { bearerToken: "dbundle_mem_x", improvementId: "imp_missing" },
      { getImprovement: vi.fn().mockRejectedValue(new RetrievalApiError(404, "improvement_not_found")) }
    );
    const badRequest = await snoozeImprovementCommand(
      {
        bearerToken: "dbundle_mem_x",
        improvementId: "imp_123",
        snoozedUntil: "invalid-date"
      },
      { snoozeImprovement: vi.fn().mockRejectedValue(new RetrievalApiError(400, "invalid_payload")) }
    );
    const unknownFailure = await getImprovementBundleCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        improvementId: "imp_123"
      },
      { getImprovementBundle: vi.fn().mockRejectedValue(new Error("boom")) }
    );

    expect(unauthorized).toEqual({ exitCode: 2, output: "retrieval_api_error: 401:invalid_member_token" });
    expect(notFound).toEqual({ exitCode: 3, output: "retrieval_api_error: 404:improvement_not_found" });
    expect(badRequest).toEqual({ exitCode: 4, output: "retrieval_api_error: 400:invalid_payload" });
    expect(unknownFailure).toEqual({ exitCode: 1, output: "boom" });
  });

  it("maps non-special retrieval API failures to exit code 1", async () => {
    const serverFailure = await resolveImprovementCommand(
      {
        bearerToken: "dbundle_mem_x",
        improvementId: "imp_123"
      },
      {
        resolveImprovement: vi.fn().mockRejectedValue(new RetrievalApiError(503, "temporary_outage"))
      }
    );

    expect(serverFailure).toEqual({ exitCode: 1, output: "retrieval_api_error: 503:temporary_outage" });
  });

  it("loads stored auth state and forwards it into authenticated improvement commands", async () => {
    const readAuthState = vi.fn().mockResolvedValue({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test"
    });
    const httpClient = { request: vi.fn() };
    const createHttpClient = vi.fn().mockReturnValue(httpClient);
    const listImprovements = vi.fn().mockResolvedValue({ improvements: [], next_cursor: null });
    const getImprovement = vi.fn().mockResolvedValue(baseImprovement);
    const resolveImprovement = vi.fn().mockResolvedValue({ ...baseImprovement, status: "resolved", resolved_at: "2026-05-18T13:00:00.000Z" });
    const reopenImprovement = vi.fn().mockResolvedValue(baseImprovement);
    const snoozeImprovement = vi.fn().mockResolvedValue({ ...baseImprovement, status: "snoozed" });
    const getImprovementBundle = vi.fn().mockResolvedValue({ bundle_id: "bundle_123" });
    const createApi = vi.fn().mockReturnValue({
      listImprovements,
      getImprovement,
      resolveImprovement,
      reopenImprovement,
      snoozeImprovement,
      getImprovementBundle
    });

    const listResult = await listImprovementsWithAuthCommand(
      {
        authFilePath: "/tmp/auth.json",
        projectId: "proj_1",
        json: true
      },
      { readAuthState, createHttpClient, createApi }
    );
    const getResult = await getImprovementWithAuthCommand(
      {
        authFilePath: "/tmp/auth.json",
        improvementId: "imp_123"
      },
      { readAuthState, createHttpClient, createApi }
    );
    const resolveResult = await resolveImprovementWithAuthCommand(
      {
        authFilePath: "/tmp/auth.json",
        improvementId: "imp_123"
      },
      { readAuthState, createHttpClient, createApi }
    );
    const reopenResult = await reopenImprovementWithAuthCommand(
      {
        authFilePath: "/tmp/auth.json",
        improvementId: "imp_123"
      },
      { readAuthState, createHttpClient, createApi }
    );
    const snoozeResult = await snoozeImprovementWithAuthCommand(
      {
        authFilePath: "/tmp/auth.json",
        improvementId: "imp_123",
        snoozedUntil: "2026-05-25T13:00:00.000Z"
      },
      { readAuthState, createHttpClient, createApi }
    );
    const bundleResult = await getImprovementBundleWithAuthCommand(
      {
        authFilePath: "/tmp/auth.json",
        projectId: "proj_1",
        improvementId: "imp_123"
      },
      { readAuthState, createHttpClient, createApi }
    );

    expect(createHttpClient).toHaveBeenCalledWith({
      baseUrl: "https://selfhost.debugbundle.test"
    });
    expect(listImprovements).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved",
      projectId: "proj_1",
      json: true
    });
    expect(getImprovement).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved",
      improvementId: "imp_123"
    });
    expect(resolveImprovement).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved",
      improvementId: "imp_123"
    });
    expect(reopenImprovement).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved",
      improvementId: "imp_123"
    });
    expect(snoozeImprovement).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved",
      improvementId: "imp_123",
      snoozedUntil: "2026-05-25T13:00:00.000Z"
    });
    expect(getImprovementBundle).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved",
      projectId: "proj_1",
      improvementId: "imp_123"
    });
    expect(JSON.parse(listResult.output)).toEqual({ improvements: [], next_cursor: null });
    expect(getResult.output).toContain("Improvement: imp_123");
    expect(resolveResult.output).toContain("Improvement resolved.");
    expect(reopenResult.output).toContain("Improvement reopened.");
    expect(snoozeResult.output).toContain("Improvement snoozed.");
    expect(bundleResult.output).toContain('"bundle_id": "bundle_123"');
  });

  it("maps auth state failures to exit code 2 for authenticated commands", async () => {
    const result = await listImprovementsWithAuthCommand(
      {
        projectId: "proj_1"
      },
      {
        readAuthState: vi.fn().mockRejectedValue(new CliAuthStateError("auth_state_missing", "Not logged in."))
      }
    );

    expect(result).toEqual({ exitCode: 2, output: "Not logged in." });
  });

  it("supports authenticated commands without explicit auth paths or json flags", async () => {
    const readAuthState = vi.fn().mockResolvedValue({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test"
    });
    const createHttpClient = vi.fn().mockReturnValue({ request: vi.fn() });
    const createApi = vi.fn().mockReturnValue({
      listImprovements: vi.fn().mockResolvedValue({ improvements: [], next_cursor: null }),
      getImprovement: vi.fn().mockResolvedValue(baseImprovement),
      resolveImprovement: vi.fn().mockResolvedValue(baseImprovement),
      reopenImprovement: vi.fn().mockResolvedValue(baseImprovement),
      snoozeImprovement: vi.fn().mockResolvedValue(baseImprovement),
      getImprovementBundle: vi.fn().mockResolvedValue({ bundle_id: "bundle_123" })
    });

    const result = await getImprovementWithAuthCommand(
      {
        improvementId: "imp_123"
      },
      { readAuthState, createHttpClient, createApi }
    );

    expect(readAuthState).toHaveBeenCalledWith({});
    expect(createHttpClient).toHaveBeenCalledWith({ baseUrl: "https://selfhost.debugbundle.test" });
    expect(result.output).toContain("Improvement: imp_123");
  });

  it("forwards every optional list filter and json flag through the authenticated wrapper", async () => {
    const readAuthState = vi.fn().mockResolvedValue({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test"
    });
    const createHttpClient = vi.fn().mockReturnValue({ request: vi.fn() });
    const listImprovements = vi.fn().mockResolvedValue({ improvements: [], next_cursor: null });
    const resolveImprovement = vi.fn().mockResolvedValue(baseImprovement);
    const reopenImprovement = vi.fn().mockResolvedValue(baseImprovement);
    const snoozeImprovement = vi.fn().mockResolvedValue(baseImprovement);
    const getImprovementBundle = vi.fn().mockResolvedValue({ bundle_id: "bundle_123" });
    const createApi = vi.fn().mockReturnValue({
      listImprovements,
      getImprovement: vi.fn().mockResolvedValue(baseImprovement),
      resolveImprovement,
      reopenImprovement,
      snoozeImprovement,
      getImprovementBundle
    });

    await listImprovementsWithAuthCommand(
      {
        authFilePath: "/tmp/auth.json",
        projectId: "proj_1",
        environment: "production",
        service: "checkout-api",
        status: "open",
        severity: "high",
        kind: "warning_hotspot",
        cursor: "cursor_2",
        limit: 10,
        json: true
      },
      { readAuthState, createHttpClient, createApi }
    );
    await resolveImprovementWithAuthCommand(
      {
        authFilePath: "/tmp/auth.json",
        improvementId: "imp_123",
        json: true
      },
      { readAuthState, createHttpClient, createApi }
    );
    await reopenImprovementWithAuthCommand(
      {
        authFilePath: "/tmp/auth.json",
        improvementId: "imp_123",
        json: true
      },
      { readAuthState, createHttpClient, createApi }
    );
    await snoozeImprovementWithAuthCommand(
      {
        authFilePath: "/tmp/auth.json",
        improvementId: "imp_123",
        snoozedUntil: "2026-05-25T13:00:00.000Z",
        json: true
      },
      { readAuthState, createHttpClient, createApi }
    );
    await getImprovementBundleWithAuthCommand(
      {
        authFilePath: "/tmp/auth.json",
        projectId: "proj_1",
        improvementId: "imp_123",
        json: true
      },
      { readAuthState, createHttpClient, createApi }
    );

    expect(listImprovements).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved",
      projectId: "proj_1",
      environment: "production",
      service: "checkout-api",
      status: "open",
      severity: "high",
      kind: "warning_hotspot",
      cursor: "cursor_2",
      limit: 10,
      json: true
    });
    expect(resolveImprovement).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved",
      improvementId: "imp_123",
      json: true
    });
    expect(reopenImprovement).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved",
      improvementId: "imp_123",
      json: true
    });
    expect(snoozeImprovement).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved",
      improvementId: "imp_123",
      snoozedUntil: "2026-05-25T13:00:00.000Z",
      json: true
    });
    expect(getImprovementBundle).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved",
      projectId: "proj_1",
      improvementId: "imp_123",
      json: true
    });
  });
});
