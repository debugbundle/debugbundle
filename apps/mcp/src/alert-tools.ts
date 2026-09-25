import { AlertApiError } from "../../../packages/alert-client/src/index.js";

export const ALERT_MCP_TOOL_NAMES = ["list_alerts", "list_alert_groups", "get_alert_group", "create_alert", "update_alert", "rotate_alert_webhook_secret", "delete_alert"] as const;

function mapMcpError(error: unknown): never {
  if (error instanceof AlertApiError) {
    throw new Error(`mcp_tool_error:${error.code}`);
  }

  throw new Error("mcp_tool_error:unknown_error");
}

export function createAlertMcpTools(api: {
  listAlerts(input: { bearerToken: string; projectId: string; limit?: number }): Promise<unknown[]>;
  listAlertGroups(input: { bearerToken: string; projectId: string; limit?: number; cursor?: string }): Promise<unknown>;
  getAlertGroup(input: { bearerToken: string; projectId: string; kind: "direct" | "email_digest"; groupId: string; limit?: number; cursor?: string }): Promise<unknown>;
  createAlert(input: {
    bearerToken: string;
    projectId: string;
    serviceId?: string;
    channel: string;
    conditionType: string;
    severityMin?: string;
    severityLifecycleScope?: string;
    cooldownSeconds?: number;
    config: Record<string, unknown>;
    isEnabled?: boolean;
  }): Promise<unknown>;
  updateAlert(input: {
    bearerToken: string;
    projectId: string;
    alertId: string;
    serviceId?: string | null;
    channel?: string;
    conditionType?: string;
    severityMin?: string | null;
    severityLifecycleScope?: string | null;
    cooldownSeconds?: number;
    config?: Record<string, unknown> | null;
    rotateSigningSecret?: boolean;
    isEnabled?: boolean;
  }): Promise<unknown>;
  deleteAlert(input: { bearerToken: string; projectId: string; alertId: string }): Promise<unknown>;
}): Record<(typeof ALERT_MCP_TOOL_NAMES)[number], (input: Record<string, unknown>) => Promise<unknown>> {
  return {
    async list_alerts(input) {
      try {
        const requestInput: { bearerToken: string; projectId: string; limit?: number } = {
          bearerToken: String(input["bearerToken"]),
          projectId: String(input["projectId"])
        };
        if (typeof input["limit"] === "number") {
          requestInput.limit = input["limit"];
        }

        return { alerts: await api.listAlerts(requestInput) };
      } catch (error) {
        mapMcpError(error);
      }
    },

    async list_alert_groups(input) {
      try {
        return await api.listAlertGroups({
          bearerToken: String(input["bearerToken"]), projectId: String(input["projectId"]),
          ...(typeof input["limit"] === "number" ? { limit: input["limit"] } : {}),
          ...(typeof input["cursor"] === "string" ? { cursor: input["cursor"] } : {})
        });
      } catch (error) {
        mapMcpError(error);
      }
    },

    async get_alert_group(input) {
      try {
        const kind = input["kind"];
        if (kind !== "direct" && kind !== "email_digest") throw new Error("invalid_group_kind");
        return await api.getAlertGroup({
          bearerToken: String(input["bearerToken"]), projectId: String(input["projectId"]),
          kind, groupId: String(input["groupId"]),
          ...(typeof input["limit"] === "number" ? { limit: input["limit"] } : {}),
          ...(typeof input["cursor"] === "string" ? { cursor: input["cursor"] } : {})
        });
      } catch (error) {
        mapMcpError(error);
      }
    },

    async create_alert(input) {
      try {
        const requestInput: {
          bearerToken: string;
          projectId: string;
          serviceId?: string;
          channel: string;
          conditionType: string;
          severityMin?: string;
          severityLifecycleScope?: string;
          cooldownSeconds?: number;
          config: Record<string, unknown>;
          isEnabled?: boolean;
        } = {
          bearerToken: String(input["bearerToken"]),
          projectId: String(input["projectId"]),
          channel: String(input["channel"]),
          conditionType: String(input["conditionType"]),
          config: input["config"] as Record<string, unknown>
        };
        if (typeof input["serviceId"] === "string") {
          requestInput.serviceId = input["serviceId"];
        }
        if (typeof input["severityMin"] === "string") {
          requestInput.severityMin = input["severityMin"];
        }
        if (typeof input["severityLifecycleScope"] === "string") {
          requestInput.severityLifecycleScope = input["severityLifecycleScope"];
        }
        if (typeof input["cooldownSeconds"] === "number") {
          requestInput.cooldownSeconds = input["cooldownSeconds"];
        }
        if (typeof input["isEnabled"] === "boolean") {
          requestInput.isEnabled = input["isEnabled"];
        }

        return { alert: await api.createAlert(requestInput) };
      } catch (error) {
        mapMcpError(error);
      }
    },

    async update_alert(input) {
      try {
        const requestInput: {
          bearerToken: string;
          projectId: string;
          alertId: string;
          serviceId?: string | null;
          channel?: string;
          conditionType?: string;
          severityMin?: string | null;
          severityLifecycleScope?: string | null;
          cooldownSeconds?: number;
          config?: Record<string, unknown> | null;
          isEnabled?: boolean;
        } = {
          bearerToken: String(input["bearerToken"]),
          projectId: String(input["projectId"]),
          alertId: String(input["alertId"])
        };
        if (typeof input["serviceId"] === "string") {
          requestInput.serviceId = input["serviceId"];
        } else if (input["serviceId"] === null) {
          requestInput.serviceId = null;
        }
        if (typeof input["channel"] === "string") {
          requestInput.channel = input["channel"];
        }
        if (typeof input["conditionType"] === "string") {
          requestInput.conditionType = input["conditionType"];
        }
        if (typeof input["severityMin"] === "string") {
          requestInput.severityMin = input["severityMin"];
        } else if (input["severityMin"] === null) {
          requestInput.severityMin = null;
        }
        if (typeof input["severityLifecycleScope"] === "string") {
          requestInput.severityLifecycleScope = input["severityLifecycleScope"];
        } else if (input["severityLifecycleScope"] === null) {
          requestInput.severityLifecycleScope = null;
        }
        if (typeof input["cooldownSeconds"] === "number") {
          requestInput.cooldownSeconds = input["cooldownSeconds"];
        }
        if (typeof input["config"] === "object") {
          requestInput.config = input["config"] as Record<string, unknown> | null;
        }
        if (typeof input["isEnabled"] === "boolean") {
          requestInput.isEnabled = input["isEnabled"];
        }

        return { alert: await api.updateAlert(requestInput) };
      } catch (error) {
        mapMcpError(error);
      }
    },

    async rotate_alert_webhook_secret(input) {
      try {
        return { alert: await api.updateAlert({
          bearerToken: String(input["bearerToken"]),
          projectId: String(input["projectId"]),
          alertId: String(input["alertId"]),
          channel: "webhook",
          rotateSigningSecret: true
        }) };
      } catch (error) {
        mapMcpError(error);
      }
    },

    async delete_alert(input) {
      try {
        return {
          alert: await api.deleteAlert({
            bearerToken: String(input["bearerToken"]),
            projectId: String(input["projectId"]),
            alertId: String(input["alertId"])
          })
        };
      } catch (error) {
        mapMcpError(error);
      }
    }
  };
}
