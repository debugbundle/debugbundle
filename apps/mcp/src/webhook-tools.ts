import { WebhookApiError } from "../../../packages/webhook-client/src/index.js";

export const WEBHOOK_MCP_TOOL_NAMES = [
  "list_webhooks",
  "create_webhook",
  "update_webhook",
  "delete_webhook",
  "test_webhook",
  "list_webhook_deliveries",
  "retry_webhook_delivery"
] as const;

function mapMcpError(error: unknown): never {
  if (error instanceof WebhookApiError) {
    throw new Error(`mcp_tool_error:${error.code}`);
  }

  throw new Error("mcp_tool_error:unknown_error");
}

export function createWebhookMcpTools(api: {
  listWebhooks(input: { bearerToken: string; projectId: string; limit?: number }): Promise<unknown[]>;
  createWebhook(input: {
    bearerToken: string;
    projectId: string;
    url: string;
    events: string[];
    filters?: Record<string, unknown>;
    isEnabled?: boolean;
  }): Promise<unknown>;
  getWebhook(input: { bearerToken: string; webhookId: string }): Promise<unknown>;
  updateWebhook(input: {
    bearerToken: string;
    webhookId: string;
    url?: string;
    events?: string[];
    filters?: Record<string, unknown>;
    isEnabled?: boolean;
  }): Promise<unknown>;
  deleteWebhook(input: { bearerToken: string; webhookId: string }): Promise<unknown>;
  testWebhook(input: {
    bearerToken: string;
    webhookId: string;
    eventType?: "verification.passed" | "verification.failed";
  }): Promise<unknown>;
  listWebhookDeliveries(input: { bearerToken: string; webhookId: string; limit?: number }): Promise<unknown[]>;
  retryWebhookDelivery(input: { bearerToken: string; webhookId: string; deliveryId: string }): Promise<unknown>;
}): Record<(typeof WEBHOOK_MCP_TOOL_NAMES)[number], (input: Record<string, unknown>) => Promise<unknown>> {
  return {
    async list_webhooks(input) {
      try {
        const requestInput: { bearerToken: string; projectId: string; limit?: number } = {
          bearerToken: String(input["bearerToken"]),
          projectId: String(input["projectId"])
        };
        if (typeof input["limit"] === "number") {
          requestInput.limit = input["limit"];
        }

        return {
          webhooks: await api.listWebhooks(requestInput)
        };
      } catch (error) {
        mapMcpError(error);
      }
    },

    async create_webhook(input) {
      try {
        const requestInput: {
          bearerToken: string;
          projectId: string;
          url: string;
          events: string[];
          filters?: Record<string, unknown>;
          isEnabled?: boolean;
        } = {
          bearerToken: String(input["bearerToken"]),
          projectId: String(input["projectId"]),
          url: String(input["url"]),
          events: Array.isArray(input["events"]) ? input["events"].map((value) => String(value)) : []
        };
        if (typeof input["filters"] === "object" && input["filters"] !== null) {
          requestInput.filters = input["filters"] as Record<string, unknown>;
        }
        if (typeof input["isEnabled"] === "boolean") {
          requestInput.isEnabled = input["isEnabled"];
        }

        return {
          webhook: await api.createWebhook(requestInput)
        };
      } catch (error) {
        mapMcpError(error);
      }
    },

    async update_webhook(input) {
      try {
        const requestInput: {
          bearerToken: string;
          webhookId: string;
          url?: string;
          events?: string[];
          filters?: Record<string, unknown>;
          isEnabled?: boolean;
        } = {
          bearerToken: String(input["bearerToken"]),
          webhookId: String(input["webhookId"])
        };
        if (typeof input["url"] === "string") {
          requestInput.url = input["url"];
        }
        if (Array.isArray(input["events"])) {
          requestInput.events = input["events"].map((value) => String(value));
        }
        if (typeof input["filters"] === "object" && input["filters"] !== null) {
          requestInput.filters = input["filters"] as Record<string, unknown>;
        }
        if (typeof input["isEnabled"] === "boolean") {
          requestInput.isEnabled = input["isEnabled"];
        }

        return {
          webhook: await api.updateWebhook(requestInput)
        };
      } catch (error) {
        mapMcpError(error);
      }
    },

    async delete_webhook(input) {
      try {
        return {
          webhook: await api.deleteWebhook({
            bearerToken: String(input["bearerToken"]),
            webhookId: String(input["webhookId"])
          })
        };
      } catch (error) {
        mapMcpError(error);
      }
    },

    async test_webhook(input) {
      try {
        const requestInput: {
          bearerToken: string;
          webhookId: string;
          eventType?: "verification.passed" | "verification.failed";
        } = {
          bearerToken: String(input["bearerToken"]),
          webhookId: String(input["webhookId"])
        };
        if (input["eventType"] === "verification.passed" || input["eventType"] === "verification.failed") {
          requestInput.eventType = input["eventType"];
        }

        return {
          delivery: await api.testWebhook(requestInput)
        };
      } catch (error) {
        mapMcpError(error);
      }
    },

    async list_webhook_deliveries(input) {
      try {
        const requestInput: { bearerToken: string; webhookId: string; limit?: number } = {
          bearerToken: String(input["bearerToken"]),
          webhookId: String(input["webhookId"])
        };
        if (typeof input["limit"] === "number") {
          requestInput.limit = input["limit"];
        }

        return {
          deliveries: await api.listWebhookDeliveries(requestInput)
        };
      } catch (error) {
        mapMcpError(error);
      }
    },

    async retry_webhook_delivery(input) {
      try {
        return await api.retryWebhookDelivery({
          bearerToken: String(input["bearerToken"]),
          webhookId: String(input["webhookId"]),
          deliveryId: String(input["deliveryId"])
        });
      } catch (error) {
        mapMcpError(error);
      }
    }
  };
}