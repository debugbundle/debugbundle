import { AlertApiError } from "../../../packages/alert-client/src/index.js";

export const ALERT_MCP_TOOL_NAMES = ["list_alerts", "create_alert", "update_alert", "delete_alert"] as const;

function mapMcpError(error: unknown): never {
  if (error instanceof AlertApiError) {
    throw new Error(`mcp_tool_error:${error.code}`);
  }

  throw new Error("mcp_tool_error:unknown_error");
}

export function createAlertMcpTools(api: {
  listAlerts(input: { bearerToken: string; projectId: string; limit?: number }): Promise<unknown[]>;
  createAlert(input: {
    bearerToken: string;
    projectId: string;
    serviceId?: string;
    channel: string;
    conditionType: string;
    severityMin?: string;
    config?: Record<string, unknown>;
    isEnabled?: boolean;
  }): Promise<unknown>;
  updateAlert(input: {
    bearerToken: string;
    alertId: string;
    serviceId?: string | null;
    channel?: string;
    conditionType?: string;
    severityMin?: string | null;
    config?: Record<string, unknown> | null;
    isEnabled?: boolean;
  }): Promise<unknown>;
  deleteAlert(input: { bearerToken: string; alertId: string }): Promise<unknown>;
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

    async create_alert(input) {
      try {
        const requestInput: {
          bearerToken: string;
          projectId: string;
          serviceId?: string;
          channel: string;
          conditionType: string;
          severityMin?: string;
          config?: Record<string, unknown>;
          isEnabled?: boolean;
        } = {
          bearerToken: String(input["bearerToken"]),
          projectId: String(input["projectId"]),
          channel: String(input["channel"]),
          conditionType: String(input["conditionType"])
        };
        if (typeof input["serviceId"] === "string") {
          requestInput.serviceId = input["serviceId"];
        }
        if (typeof input["severityMin"] === "string") {
          requestInput.severityMin = input["severityMin"];
        }
        if (typeof input["config"] === "object" && input["config"] !== null) {
          requestInput.config = input["config"] as Record<string, unknown>;
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
          alertId: string;
          serviceId?: string | null;
          channel?: string;
          conditionType?: string;
          severityMin?: string | null;
          config?: Record<string, unknown> | null;
          isEnabled?: boolean;
        } = {
          bearerToken: String(input["bearerToken"]),
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

    async delete_alert(input) {
      try {
        return {
          alert: await api.deleteAlert({
            bearerToken: String(input["bearerToken"]),
            alertId: String(input["alertId"])
          })
        };
      } catch (error) {
        mapMcpError(error);
      }
    }
  };
}