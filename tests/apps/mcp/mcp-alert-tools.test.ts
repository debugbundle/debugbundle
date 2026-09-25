import { describe, expect, it, vi } from "vitest";

import { AlertApiError } from "../../../packages/alert-client/src/index.js";
import { ALERT_MCP_TOOL_NAMES, createAlertMcpTools } from "../../../apps/mcp/src/alert-tools.js";

describe("mcp alert tools", () => {
  it("declares alert tool parity", () => {
    expect(ALERT_MCP_TOOL_NAMES).toEqual([
      "list_alerts",
      "list_alert_groups",
      "get_alert_group",
      "create_alert",
      "update_alert",
      "rotate_alert_webhook_secret",
      "delete_alert"
    ]);
  });

  it("returns alert payloads", async () => {
    const tools = createAlertMcpTools({
      listAlerts: vi.fn().mockResolvedValue([{ alert_id: "al_1" }]),
      listAlertGroups: vi.fn().mockResolvedValue({ groups: [], next_cursor: null }),
      getAlertGroup: vi.fn().mockResolvedValue({ group: { group_id: "group-id" }, members: [], next_cursor: null }),
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

    await expect(tools.list_alert_groups({ bearerToken: "dbundle_mem_x", projectId: "proj_1" }))
      .resolves.toEqual({ groups: [], next_cursor: null });
    await expect(tools.get_alert_group({
      bearerToken: "dbundle_mem_x", projectId: "proj_1", kind: "direct", groupId: "group-id"
    })).resolves.toEqual({ group: { group_id: "group-id" }, members: [], next_cursor: null });

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
      listAlertGroups: vi.fn(),
      getAlertGroup: vi.fn(),
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
      listAlertGroups: vi.fn(),
      getAlertGroup: vi.fn(),
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
    await tools.rotate_alert_webhook_secret({ bearerToken: "dbundle_mem_x", projectId: "proj_1",
      alertId: "al_3" });
    expect(api.updateAlert).toHaveBeenLastCalledWith({
      bearerToken: "dbundle_mem_x", projectId: "proj_1", alertId: "al_3",
      channel: "webhook", rotateSigningSecret: true
    });
  });
});
