import { describe, expect, it, vi } from "vitest";

import { AlertApiError } from "../../../packages/alert-client/src/index.js";
import { ALERT_MCP_TOOL_NAMES, createAlertMcpTools } from "../../../apps/mcp/src/alert-tools.js";

describe("mcp alert tools", () => {
  it("declares alert tool parity", () => {
    expect(ALERT_MCP_TOOL_NAMES).toEqual([
      "list_alerts",
      "create_alert",
      "update_alert",
      "delete_alert"
    ]);
  });

  it("returns alert payloads", async () => {
    const tools = createAlertMcpTools({
      listAlerts: vi.fn().mockResolvedValue([{ alert_id: "al_1" }]),
      createAlert: vi.fn().mockResolvedValue({ alert_id: "al_2" }),
      updateAlert: vi.fn().mockResolvedValue({ alert_id: "al_2", is_enabled: false }),
      deleteAlert: vi.fn().mockResolvedValue({ alert_id: "al_2" })
    });

    await expect(
      tools.list_alerts({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        limit: 5
      })
    ).resolves.toEqual({
      alerts: [{ alert_id: "al_1" }]
    });

    await expect(
      tools.create_alert({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        channel: "email",
        conditionType: "new_incident",
        config: { to: "owner@example.com" },
        isEnabled: true
      })
    ).resolves.toEqual({
      alert: { alert_id: "al_2" }
    });

    await expect(
      tools.update_alert({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        alertId: "al_2",
        isEnabled: false
      })
    ).resolves.toEqual({
      alert: { alert_id: "al_2", is_enabled: false }
    });

    await expect(
      tools.delete_alert({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        alertId: "al_2"
      })
    ).resolves.toEqual({
      alert: { alert_id: "al_2" }
    });
  });

  it("maps alert api and unknown errors to mcp tool errors", async () => {
    const tools = createAlertMcpTools({
      listAlerts: vi.fn().mockRejectedValue(new AlertApiError(401, "invalid_member_token")),
      createAlert: vi.fn().mockRejectedValue(new Error("boom")),
      updateAlert: vi.fn(),
      deleteAlert: vi.fn()
    });

    await expect(
      tools.list_alerts({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1"
      })
    ).rejects.toThrow("mcp_tool_error:invalid_member_token");

    await expect(
      tools.create_alert({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        channel: "email",
        conditionType: "new_incident",
        config: { to: "owner@example.com" }
      })
    ).rejects.toThrow("mcp_tool_error:unknown_error");
  });

  it("forwards optional alert fields through create and update tools", async () => {
    const api = {
      listAlerts: vi.fn().mockResolvedValue([]),
      createAlert: vi.fn().mockResolvedValue({ alert_id: "al_3" }),
      updateAlert: vi.fn().mockResolvedValue({ alert_id: "al_3" }),
      deleteAlert: vi.fn().mockResolvedValue({ alert_id: "al_3" })
    };
    const tools = createAlertMcpTools(api);

    await tools.create_alert({
      bearerToken: "dbundle_mem_x",
      projectId: "proj_1",
      serviceId: "svc_1",
      channel: "webhook",
      conditionType: "severity_threshold",
      severityMin: "high",
      severityLifecycleScope: "incident_regressed",
      cooldownSeconds: 86400,
      config: { target_url: "https://hooks.example.test/alerts" },
      isEnabled: false
    });
    await tools.update_alert({
      bearerToken: "dbundle_mem_x",
      projectId: "proj_1",
      alertId: "al_3",
      serviceId: null,
      channel: "slack",
      conditionType: "error_spike",
      severityMin: null,
      severityLifecycleScope: null,
      cooldownSeconds: 0,
      config: null,
      isEnabled: true
    });

    expect(api.createAlert).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_x",
      projectId: "proj_1",
      serviceId: "svc_1",
      channel: "webhook",
      conditionType: "severity_threshold",
      severityMin: "high",
      severityLifecycleScope: "incident_regressed",
      cooldownSeconds: 86400,
      config: { target_url: "https://hooks.example.test/alerts" },
      isEnabled: false
    });
    expect(api.updateAlert).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_x",
      projectId: "proj_1",
      alertId: "al_3",
      serviceId: null,
      channel: "slack",
      conditionType: "error_spike",
      severityMin: null,
      severityLifecycleScope: null,
      cooldownSeconds: 0,
      config: null,
      isEnabled: true
    });
  });
});
