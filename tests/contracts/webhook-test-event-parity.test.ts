import { describe, expect, it, vi } from "vitest";
import { runCli } from "../../apps/cli/src/main.js";
import { createWebhookMcpTools } from "../../apps/mcp/src/webhook-tools.js";
import { MCP_TOOL_CATALOG } from "../../apps/mcp/src/tool-catalog.js";
import {
  createWebhookApi,
  WebhookApiError,
  WebhookEventPayloadSchema,
  WebhookEventTypeSchema
} from "../../packages/webhook-client/src/index.js";

describe("webhook test event parity", () => {
  it.each(WebhookEventTypeSchema.options)(
    "accepts the existing signed synthetic %s envelope",
    (eventType) => {
      expect(
        WebhookEventPayloadSchema.safeParse({
          delivery_id: "delivery",
          event: eventType,
          event_type: eventType,
          occurred_at: "2026-10-07T00:00:00Z",
          project_id: "proj",
          webhook_id: "wh",
          incident_id: "synthetic",
          test: true,
          data: { message: "Synthetic webhook test delivery" }
        }).success
      ).toBe(true);
    }
  );
  it.each(WebhookEventTypeSchema.options)(
    "routes %s through CLI and the additive MCP tool",
    async (eventType) => {
      const testWebhookCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "queued" });
      const result = await runCli(
        ["webhook", "test", "wh", "--project-id", "proj", "--event", eventType],
        { testWebhookCommand }
      );
      expect(result.exitCode).toBe(0);
      expect(testWebhookCommand).toHaveBeenCalledWith({
        projectId: "proj",
        webhookId: "wh",
        eventType
      });
      const descriptor = MCP_TOOL_CATALOG.find((tool) => tool.name === "test_webhook_event");
      expect(descriptor).toBeDefined();
      const input = { bearerToken: "member", projectId: "proj", webhookId: "wh", eventType };
      expect(descriptor!.inputSchema.safeParse(input).success).toBe(true);
      const testWebhook = vi
        .fn()
        .mockResolvedValue({ delivery_id: "delivery", event_type: eventType });
      const tools = createWebhookMcpTools({
        listWebhooks: vi.fn(),
        createWebhook: vi.fn(),
        getWebhook: vi.fn(),
        updateWebhook: vi.fn(),
        deleteWebhook: vi.fn(),
        testWebhook,
        listWebhookDeliveries: vi.fn(),
        retryWebhookDelivery: vi.fn()
      });
      await expect(tools.test_webhook_event(input)).resolves.toEqual({
        delivery: { delivery_id: "delivery", event_type: eventType }
      });
      expect(testWebhook).toHaveBeenCalledWith(input);
    }
  );
  it("rejects invalid events before dispatch and retains legacy default behavior", async () => {
    const testWebhookCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "queued" });
    expect(
      (
        await runCli(["webhook", "test", "wh", "--project-id", "proj", "--event", "unknown"], {
          testWebhookCommand
        })
      ).exitCode
    ).toBe(4);
    expect(testWebhookCommand).not.toHaveBeenCalled();
    expect(
      (await runCli(["webhook", "test", "wh", "--project-id", "proj"], { testWebhookCommand }))
        .exitCode
    ).toBe(0);
    expect(testWebhookCommand).toHaveBeenCalledWith({ projectId: "proj", webhookId: "wh" });
  });
  it("validates the additive tool and preserves authorization errors and the legacy event schema", async () => {
    const descriptor = MCP_TOOL_CATALOG.find((tool) => tool.name === "test_webhook_event")!;
    const legacy = MCP_TOOL_CATALOG.find((tool) => tool.name === "test_webhook")!;
    const input = {
      bearerToken: "member",
      projectId: "proj",
      webhookId: "wh",
      eventType: "bundle.resolved"
    };
    expect(legacy.inputSchema.safeParse(input).success).toBe(false);
    expect(descriptor.inputSchema.safeParse({ ...input, eventType: "unknown" }).success).toBe(
      false
    );
    expect(descriptor.inputSchema.safeParse({ ...input, syntheticMode: "other" }).success).toBe(
      false
    );
    const testWebhook = vi.fn().mockRejectedValue(new WebhookApiError(403, "forbidden"));
    const tools = createWebhookMcpTools({
      listWebhooks: vi.fn(),
      createWebhook: vi.fn(),
      getWebhook: vi.fn(),
      updateWebhook: vi.fn(),
      deleteWebhook: vi.fn(),
      testWebhook,
      listWebhookDeliveries: vi.fn(),
      retryWebhookDelivery: vi.fn()
    });
    await expect(tools.test_webhook_event({ ...input, eventType: "unknown" })).rejects.toThrow(
      "mcp_tool_error:unknown_error"
    );
    expect(testWebhook).not.toHaveBeenCalled();
    await expect(tools.test_webhook_event(input)).rejects.toThrow("mcp_tool_error:forbidden");
  });
  it("uses the unchanged scoped POST and parses a lifecycle event delivery", async () => {
    const delivery = {
      delivery_id: "delivery",
      event_type: "bundle.resolved",
      status: "pending",
      attempt_count: 0,
      next_attempt_at: null,
      last_response_code: null,
      last_attempted_at: null,
      last_error: null
    };
    const request = vi.fn().mockResolvedValue({ status: 202, body: { delivery } });
    const api = createWebhookApi({ request });
    await expect(
      api.testWebhook({
        bearerToken: "member",
        projectId: "proj",
        webhookId: "wh",
        eventType: "bundle.resolved"
      })
    ).resolves.toEqual(delivery);
    expect(request).toHaveBeenCalledWith({
      method: "POST",
      path: "/v1/webhooks/wh/test?project_id=proj",
      bearerToken: "member",
      body: { event_type: "bundle.resolved" }
    });
  });
});
