import { describe, expect, it, vi } from "vitest";

import { WebhookApiError } from "../../../packages/webhook-client/src/index.js";
import { WEBHOOK_MCP_TOOL_NAMES, createWebhookMcpTools } from "../../../apps/mcp/src/webhook-tools.js";

describe("mcp webhook tools", () => {
  it("declares webhook tool parity", () => {
    expect(WEBHOOK_MCP_TOOL_NAMES).toEqual([
      "list_webhooks",
      "create_webhook",
      "update_webhook",
      "delete_webhook",
      "test_webhook",
      "list_webhook_deliveries",
      "retry_webhook_delivery"
    ]);
  });

  it("returns webhook and delivery payloads", async () => {
    const tools = createWebhookMcpTools({
      listWebhooks: vi.fn().mockResolvedValue([{ webhook_id: "wh_1" }]),
      createWebhook: vi.fn().mockResolvedValue({ webhook_id: "wh_2", signing_secret: "dbundle_whsec_secret" }),
      getWebhook: vi.fn(),
      updateWebhook: vi.fn().mockResolvedValue({ webhook_id: "wh_2", is_enabled: false }),
      deleteWebhook: vi.fn().mockResolvedValue({ webhook_id: "wh_2" }),
      testWebhook: vi.fn().mockResolvedValue({ delivery_id: "del_test", event_type: "verification.failed" }),
      listWebhookDeliveries: vi.fn().mockResolvedValue([{ delivery_id: "del_1" }]),
      retryWebhookDelivery: vi.fn().mockResolvedValue({ delivery_id: "del_1", event_type: "bundle.created" })
    });

    await expect(
      tools.list_webhooks({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        limit: 5
      })
    ).resolves.toEqual({
      webhooks: [{ webhook_id: "wh_1" }]
    });

    await expect(
      tools.create_webhook({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        url: "https://hooks.example.test/debugbundle",
        events: ["bundle.created"],
        filters: { environment: ["production"] },
        isEnabled: true
      })
    ).resolves.toEqual({
      webhook: { webhook_id: "wh_2", signing_secret: "dbundle_whsec_secret" }
    });

    await expect(
      tools.update_webhook({
        bearerToken: "dbundle_mem_x",
        webhookId: "wh_2",
        isEnabled: false
      })
    ).resolves.toEqual({
      webhook: { webhook_id: "wh_2", is_enabled: false }
    });

    await expect(
      tools.delete_webhook({
        bearerToken: "dbundle_mem_x",
        webhookId: "wh_2"
      })
    ).resolves.toEqual({
      webhook: { webhook_id: "wh_2" }
    });

    await expect(
      tools.test_webhook({
        bearerToken: "dbundle_mem_x",
        webhookId: "wh_2",
        eventType: "verification.failed"
      })
    ).resolves.toEqual({
      delivery: { delivery_id: "del_test", event_type: "verification.failed" }
    });

    await expect(
      tools.list_webhook_deliveries({
        bearerToken: "dbundle_mem_x",
        webhookId: "wh_2"
      })
    ).resolves.toEqual({
      deliveries: [{ delivery_id: "del_1" }]
    });
  });

  it("maps webhook api and unknown errors to mcp tool errors", async () => {
    const tools = createWebhookMcpTools({
      listWebhooks: vi.fn().mockRejectedValue(new WebhookApiError(401, "invalid_member_token")),
      createWebhook: vi.fn().mockRejectedValue(new Error("boom")),
      getWebhook: vi.fn(),
      updateWebhook: vi.fn(),
      deleteWebhook: vi.fn(),
      testWebhook: vi.fn(),
      listWebhookDeliveries: vi.fn(),
      retryWebhookDelivery: vi.fn()
    });

    await expect(
      tools.list_webhooks({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1"
      })
    ).rejects.toThrow("mcp_tool_error:invalid_member_token");

    await expect(
      tools.create_webhook({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        url: "https://hooks.example.test/debugbundle",
        events: ["bundle.created"]
      })
    ).rejects.toThrow("mcp_tool_error:unknown_error");
  });

  it("forwards optional webhook fields and retry payloads", async () => {
    const api = {
      listWebhooks: vi.fn().mockResolvedValue([]),
      createWebhook: vi.fn().mockResolvedValue({ webhook_id: "wh_3" }),
      getWebhook: vi.fn(),
      updateWebhook: vi.fn().mockResolvedValue({ webhook_id: "wh_3" }),
      deleteWebhook: vi.fn().mockResolvedValue({ webhook_id: "wh_3" }),
      testWebhook: vi.fn().mockResolvedValue({ delivery_id: "del_3" }),
      listWebhookDeliveries: vi.fn().mockResolvedValue([]),
      retryWebhookDelivery: vi.fn().mockResolvedValue({ delivery_id: "del_3", event_type: "verification.failed" })
    };
    const tools = createWebhookMcpTools(api);

    await tools.create_webhook({
      bearerToken: "dbundle_mem_x",
      projectId: "proj_1",
      url: "https://hooks.example.test/debugbundle",
      events: ["bundle.created", 123],
      filters: { service: ["checkout-api"] },
      isEnabled: false
    });
    await tools.update_webhook({
      bearerToken: "dbundle_mem_x",
      webhookId: "wh_3",
      url: "https://hooks.example.test/updated",
      events: ["bundle.updated"],
      filters: { verification: true },
      isEnabled: true
    });
    await expect(
      tools.retry_webhook_delivery({
        bearerToken: "dbundle_mem_x",
        webhookId: "wh_3",
        deliveryId: "del_3"
      })
    ).resolves.toEqual({ delivery_id: "del_3", event_type: "verification.failed" });

    expect(api.createWebhook).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_x",
      projectId: "proj_1",
      url: "https://hooks.example.test/debugbundle",
      events: ["bundle.created", "123"],
      filters: { service: ["checkout-api"] },
      isEnabled: false
    });
    expect(api.updateWebhook).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_x",
      webhookId: "wh_3",
      url: "https://hooks.example.test/updated",
      events: ["bundle.updated"],
      filters: { verification: true },
      isEnabled: true
    });
  });

  it("forwards list delivery limits and omits invalid test event values", async () => {
    const api = {
      listWebhooks: vi.fn().mockResolvedValue([]),
      createWebhook: vi.fn().mockResolvedValue({}),
      getWebhook: vi.fn(),
      updateWebhook: vi.fn().mockResolvedValue({}),
      deleteWebhook: vi.fn().mockResolvedValue({}),
      testWebhook: vi.fn().mockResolvedValue({ delivery_id: "del_4" }),
      listWebhookDeliveries: vi.fn().mockResolvedValue([{ delivery_id: "del_4" }]),
      retryWebhookDelivery: vi.fn().mockResolvedValue({})
    };
    const tools = createWebhookMcpTools(api);

    await expect(
      tools.list_webhook_deliveries({ bearerToken: "dbundle_mem_x", webhookId: "wh_4", limit: 7 })
    ).resolves.toEqual({ deliveries: [{ delivery_id: "del_4" }] });
    await expect(
      tools.test_webhook({ bearerToken: "dbundle_mem_x", webhookId: "wh_4", eventType: "not-valid" })
    ).resolves.toEqual({ delivery: { delivery_id: "del_4" } });

    expect(api.listWebhookDeliveries).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_x",
      webhookId: "wh_4",
      limit: 7
    });
    expect(api.testWebhook).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_x",
      webhookId: "wh_4"
    });
  });
});