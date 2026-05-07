import { z } from "zod";
import { describe, expect, it, vi } from "vitest";

import { CliAuthStateError } from "../../../apps/cli/src/auth-state.js";
import {
  createAlertCommand,
  createAlertWithAuthCommand,
  deleteAlertCommand,
  deleteAlertWithAuthCommand,
  listAlertsCommand,
  listAlertsWithAuthCommand,
  updateAlertCommand,
  updateAlertWithAuthCommand
} from "../../../apps/cli/src/alert-commands.js";
import { AlertApiError } from "../../../packages/alert-client/src/index.js";

const AlertCreateOutputSchema = z
  .object({
    alert: z.object({ service_id: z.string().nullable() }).passthrough()
  })
  .strict();

describe("cli alert commands", () => {
  it("renders alert list output in human mode", async () => {
    const result = await listAlertsCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1"
      },
      {
        listAlerts: vi.fn().mockResolvedValue([
          {
            alert_id: "al_1",
            project_id: "proj_1",
            service_id: null,
            channel: "email",
            condition_type: "severity_threshold",
            severity_min: "high",
            config: {},
            is_enabled: true,
            created_at: "2026-03-15T00:00:00.000Z",
            updated_at: "2026-03-15T00:00:00.000Z"
          }
        ])
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("al_1 | enabled | severity_threshold | email | project=proj_1");
  });

  it("loads stored auth state and forwards it into alert creation", async () => {
    const readAuthState = vi.fn().mockResolvedValue({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test"
    });
    const httpClient = { request: vi.fn() };
    const createHttpClient = vi.fn().mockReturnValue(httpClient);
    const createAlert = vi.fn().mockResolvedValue({
      alert_id: "al_1",
      project_id: "proj_1",
      service_id: "svc_1",
      channel: "email",
      condition_type: "severity_threshold",
      severity_min: "high",
      config: {
        to: ["oncall@example.com"]
      },
      is_enabled: true,
      created_at: "2026-03-15T00:00:00.000Z",
      updated_at: "2026-03-15T00:00:00.000Z"
    });
    const createApi = vi.fn().mockReturnValue({
      listAlerts: vi.fn(),
      createAlert,
      updateAlert: vi.fn(),
      deleteAlert: vi.fn()
    });

    const result = await createAlertWithAuthCommand(
      {
        authFilePath: "/tmp/auth.json",
        projectId: "proj_1",
        serviceId: "svc_1",
        channel: "email",
        conditionType: "severity_threshold",
        severityMin: "high",
        config: {
          to: ["oncall@example.com"]
        },
        json: true
      },
      {
        readAuthState,
        createHttpClient,
        createApi
      }
    );

    expect(createHttpClient).toHaveBeenCalledWith({
      baseUrl: "https://selfhost.debugbundle.test"
    });
    expect(createAlert).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved",
      projectId: "proj_1",
      serviceId: "svc_1",
      channel: "email",
      conditionType: "severity_threshold",
      severityMin: "high",
      config: {
        to: ["oncall@example.com"]
      }
    });
    expect(JSON.parse(result.output)).toEqual({
      alert: {
        alert_id: "al_1",
        project_id: "proj_1",
        service_id: "svc_1",
        channel: "email",
        condition_type: "severity_threshold",
        severity_min: "high",
        config: {
          to: ["oncall@example.com"]
        },
        is_enabled: true,
        created_at: "2026-03-15T00:00:00.000Z",
        updated_at: "2026-03-15T00:00:00.000Z"
      }
    });
  });

  it("maps missing stored auth state to auth/config exit code for alert commands", async () => {
    const result = await listAlertsWithAuthCommand(
      {
        projectId: "proj_1"
      },
      {
        readAuthState: vi.fn().mockRejectedValue(new CliAuthStateError("auth_state_missing", "Not logged in."))
      }
    );

    expect(result.exitCode).toBe(2);
    expect(result.output).toBe("Not logged in.");
  });

  it("formats remaining alert command outputs and json branches", async () => {
    const createResult = await createAlertCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        channel: "email",
        conditionType: "new_incident"
      },
      {
        createAlert: vi.fn().mockResolvedValue({
          alert_id: "al_1",
          project_id: "proj_1",
          service_id: null,
          channel: "email",
          condition_type: "new_incident",
          severity_min: null,
          config: {},
          is_enabled: true,
          created_at: "2026-03-15T00:00:00.000Z",
          updated_at: "2026-03-15T00:00:00.000Z"
        })
      }
    );

    const updateResult = await updateAlertCommand(
      {
        bearerToken: "dbundle_mem_x",
        alertId: "al_1",
        isEnabled: false,
        json: true
      },
      {
        updateAlert: vi.fn().mockResolvedValue({
          alert_id: "al_1",
          project_id: "proj_1",
          service_id: null,
          channel: "email",
          condition_type: "new_incident",
          severity_min: null,
          config: {},
          is_enabled: false,
          created_at: "2026-03-15T00:00:00.000Z",
          updated_at: "2026-03-15T00:05:00.000Z"
        })
      }
    );

    const deleteResult = await deleteAlertCommand(
      {
        bearerToken: "dbundle_mem_x",
        alertId: "al_1"
      },
      {
        deleteAlert: vi.fn().mockResolvedValue({ alert_id: "al_1" })
      }
    );

    expect(createResult.output).toContain("Alert created: al_1");
    expect(JSON.parse(updateResult.output)).toEqual({
      alert: {
        alert_id: "al_1",
        project_id: "proj_1",
        service_id: null,
        channel: "email",
        condition_type: "new_incident",
        severity_min: null,
        config: {},
        is_enabled: false,
        created_at: "2026-03-15T00:00:00.000Z",
        updated_at: "2026-03-15T00:05:00.000Z"
      }
    });
    expect(deleteResult.output).toContain("Alert deleted: al_1");
  });

  it("covers empty lists, direct json output, wrapper list flow, and remaining request fields", async () => {
    const emptyList = await listAlertsCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1"
      },
      {
        listAlerts: vi.fn().mockResolvedValue([])
      }
    );
    const jsonList = await listAlertsCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        limit: 5,
        json: true
      },
      {
        listAlerts: vi.fn().mockResolvedValue([{ alert_id: "al_2" }])
      }
    );
    const created = await createAlertCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        serviceId: "svc_1",
        channel: "webhook",
        conditionType: "severity_threshold",
        severityMin: "critical",
        config: { target_url: "https://hooks.example.test/alerts" },
        isEnabled: false,
        json: true
      },
      {
        createAlert: vi.fn().mockResolvedValue({
          alert_id: "al_2",
          project_id: "proj_1",
          service_id: "svc_1",
          channel: "webhook",
          condition_type: "severity_threshold",
          severity_min: "critical",
          config: { target_url: "https://hooks.example.test/alerts" },
          is_enabled: false,
          created_at: "2026-03-15T00:00:00.000Z",
          updated_at: "2026-03-15T00:00:00.000Z"
        })
      }
    );
    const updated = await updateAlertCommand(
      {
        bearerToken: "dbundle_mem_x",
        alertId: "al_2",
        serviceId: null,
        severityMin: null,
        config: null
      },
      {
        updateAlert: vi.fn().mockResolvedValue({
          alert_id: "al_2",
          project_id: "proj_1",
          service_id: null,
          channel: "webhook",
          condition_type: "severity_threshold",
          severity_min: null,
          config: null,
          is_enabled: false,
          created_at: "2026-03-15T00:00:00.000Z",
          updated_at: "2026-03-15T00:10:00.000Z"
        })
      }
    );
    const readAuthState = vi.fn().mockResolvedValue({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test"
    });
    const createApi = vi.fn().mockReturnValue({
      listAlerts: vi.fn().mockResolvedValue([]),
      createAlert: vi.fn(),
      updateAlert: vi.fn(),
      deleteAlert: vi.fn()
    });
    const wrapperList = await listAlertsWithAuthCommand(
      {
        projectId: "proj_1",
        limit: 3,
        json: true
      },
      {
        readAuthState,
        createApi
      }
    );

    expect(emptyList.output).toBe("No alerts found.");
    expect(JSON.parse(jsonList.output)).toEqual({ alerts: [{ alert_id: "al_2" }] });
    expect(AlertCreateOutputSchema.parse(JSON.parse(created.output)).alert.service_id).toBe("svc_1");
    expect(updated.output).toContain("Alert updated: al_2");
    expect(JSON.parse(wrapperList.output)).toEqual({ alerts: [] });
  });

  it("maps auth, not-found, validation, and unknown alert errors", async () => {
    const authResult = await deleteAlertCommand(
      {
        bearerToken: "dbundle_mem_x",
        alertId: "al_1"
      },
      {
        deleteAlert: vi.fn().mockRejectedValue(new AlertApiError(401, "invalid_member_token"))
      }
    );

    const notFoundResult = await updateAlertCommand(
      {
        bearerToken: "dbundle_mem_x",
        alertId: "al_missing",
        isEnabled: false
      },
      {
        updateAlert: vi.fn().mockRejectedValue(new AlertApiError(404, "alert_not_found"))
      }
    );

    const validationResult = await createAlertCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        channel: "email",
        conditionType: "new_incident"
      },
      {
        createAlert: vi.fn().mockRejectedValue(new AlertApiError(400, "invalid_payload"))
      }
    );

    const unknownResult = await deleteAlertCommand(
      {
        bearerToken: "dbundle_mem_x",
        alertId: "al_1"
      },
      {
        deleteAlert: vi.fn().mockRejectedValue("boom")
      }
    );

    expect(authResult.exitCode).toBe(2);
    expect(notFoundResult.exitCode).toBe(3);
    expect(validationResult.exitCode).toBe(4);
    expect(unknownResult).toEqual({
      exitCode: 1,
      output: "boom"
    });
  });

  it("loads stored auth state for update and delete wrappers", async () => {
    const readAuthState = vi.fn().mockResolvedValue({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test"
    });
    const createApi = vi.fn().mockReturnValue({
      listAlerts: vi.fn(),
      createAlert: vi.fn(),
      updateAlert: vi.fn().mockResolvedValue({
        alert_id: "al_1",
        project_id: "proj_1",
        service_id: null,
        channel: "slack",
        condition_type: "error_spike",
        severity_min: null,
        config: {},
        is_enabled: false,
        created_at: "2026-03-15T00:00:00.000Z",
        updated_at: "2026-03-15T00:05:00.000Z"
      }),
      deleteAlert: vi.fn().mockResolvedValue({ alert_id: "al_1" })
    });

    const updateResult = await updateAlertWithAuthCommand(
      {
        alertId: "al_1",
        channel: "slack",
        conditionType: "error_spike",
        isEnabled: false
      },
      {
        readAuthState,
        createApi
      }
    );

    const deleteResult = await deleteAlertWithAuthCommand(
      {
        alertId: "al_1",
        json: true
      },
      {
        readAuthState,
        createApi
      }
    );

    expect(createApi).toHaveBeenCalled();
    expect(updateResult.output).toContain("Alert updated: al_1");
    expect(JSON.parse(deleteResult.output)).toEqual({ alert: { alert_id: "al_1" } });
  });
});