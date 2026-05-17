import { describe, expect, it, vi } from "vitest";

import { WebhookApiError, createWebhookApi, type HttpClient } from "../../../packages/webhook-client/src/index.js";

describe("webhook api client", () => {
  it("calls list webhooks route with required project query and optional limit", async () => {
    const request = vi.fn<HttpClient["request"]>().mockResolvedValue({
      status: 200,
      body: {
        webhooks: [
          {
            webhook_id: "wh_1",
            project_id: "proj_1",
            url: "https://hooks.example.test/debugbundle",
            events: ["bundle.created"],
            filters: {
              environment: ["production"]
            },
            is_enabled: true,
            created_by_user_id: "usr_1",
            created_at: "2026-03-15T00:00:00.000Z",
            updated_at: "2026-03-15T00:00:00.000Z"
          }
        ]
      }
    });

    const api = createWebhookApi({ request });
    const webhooks = await api.listWebhooks({
      bearerToken: "dbundle_mem_x",
      projectId: "proj_1",
      limit: 5
    });

    expect(webhooks).toHaveLength(1);
    expect(request).toHaveBeenCalledWith({
      method: "GET",
      path: "/v1/webhooks?project_id=proj_1&limit=5",
      bearerToken: "dbundle_mem_x"
    });
  });

  it("calls create webhook route and returns create-only signing secret", async () => {
    const request = vi.fn<HttpClient["request"]>().mockResolvedValue({
      status: 201,
      body: {
        webhook: {
          webhook_id: "wh_1",
          project_id: "proj_1",
          url: "https://hooks.example.test/debugbundle",
          events: ["bundle.created", "bundle.updated"],
          filters: {
            environment: ["production"],
            severity_min: "high"
          },
          is_enabled: true,
          created_by_user_id: "usr_1",
          created_at: "2026-03-15T00:00:00.000Z",
          updated_at: "2026-03-15T00:00:00.000Z",
          signing_secret: "dbundle_whsec_secret"
        }
      }
    });

    const api = createWebhookApi({ request });
    const webhook = await api.createWebhook({
      bearerToken: "dbundle_mem_x",
      projectId: "proj_1",
      url: "https://hooks.example.test/debugbundle",
      events: ["bundle.created", "bundle.updated"],
      filters: {
        environment: ["production"],
        severity_min: "high"
      },
      isEnabled: true
    });

    expect(webhook.signing_secret).toBe("dbundle_whsec_secret");
    expect(request).toHaveBeenCalledWith({
      method: "POST",
      path: "/v1/webhooks",
      bearerToken: "dbundle_mem_x",
      body: {
        project_id: "proj_1",
        url: "https://hooks.example.test/debugbundle",
        events: ["bundle.created", "bundle.updated"],
        filters: {
          environment: ["production"],
          severity_min: "high"
        },
        is_enabled: true
      }
    });
  });

  it("calls get and update webhook routes", async () => {
    const request = vi
      .fn<HttpClient["request"]>()
      .mockResolvedValueOnce({
        status: 200,
        body: {
          webhook: {
            webhook_id: "wh_1",
            project_id: "proj_1",
            url: "https://hooks.example.test/debugbundle",
            events: ["bundle.created"],
            filters: {},
            is_enabled: true,
            created_by_user_id: "usr_1",
            created_at: "2026-03-15T00:00:00.000Z",
            updated_at: "2026-03-15T00:00:00.000Z"
          }
        }
      })
      .mockResolvedValueOnce({
        status: 200,
        body: {
          webhook: {
            webhook_id: "wh_1",
            project_id: "proj_1",
            url: "https://hooks.example.test/updated",
            events: ["bundle.updated"],
            filters: {
              environment: ["staging"],
              verification: false
            },
            is_enabled: false,
            created_by_user_id: "usr_1",
            created_at: "2026-03-15T00:00:00.000Z",
            updated_at: "2026-03-15T00:05:00.000Z"
          }
        }
      });

    const api = createWebhookApi({ request });
    const fetched = await api.getWebhook({
      bearerToken: "dbundle_mem_x",
      projectId: "proj_1",
      webhookId: "wh_1"
    });
    const updated = await api.updateWebhook({
      bearerToken: "dbundle_mem_x",
      projectId: "proj_1",
      webhookId: "wh_1",
      url: "https://hooks.example.test/updated",
      events: ["bundle.updated"],
      filters: {
        environment: ["staging"],
        verification: false
      },
      isEnabled: false
    });

    expect(fetched.webhook_id).toBe("wh_1");
    expect(updated.is_enabled).toBe(false);
    expect(request).toHaveBeenNthCalledWith(1, {
      method: "GET",
      path: "/v1/webhooks/wh_1?project_id=proj_1",
      bearerToken: "dbundle_mem_x"
    });
    expect(request).toHaveBeenNthCalledWith(2, {
      method: "PATCH",
      path: "/v1/webhooks/wh_1?project_id=proj_1",
      bearerToken: "dbundle_mem_x",
      body: {
        url: "https://hooks.example.test/updated",
        events: ["bundle.updated"],
        filters: {
          environment: ["staging"],
          verification: false
        },
        is_enabled: false
      }
    });
  });

  it("calls delete webhook route and maps 204 to deleted id", async () => {
    const request = vi.fn<HttpClient["request"]>().mockResolvedValue({
      status: 204,
      body: null
    });

    const api = createWebhookApi({ request });
    const deleted = await api.deleteWebhook({
      bearerToken: "dbundle_mem_x",
      projectId: "proj_1",
      webhookId: "wh_1"
    });

    expect(deleted).toEqual({ webhook_id: "wh_1" });
    expect(request).toHaveBeenCalledWith({
      method: "DELETE",
      path: "/v1/webhooks/wh_1?project_id=proj_1",
      bearerToken: "dbundle_mem_x"
    });
  });

  it("calls webhook deliveries route with optional limit", async () => {
    const request = vi.fn<HttpClient["request"]>().mockResolvedValue({
      status: 200,
      body: {
        deliveries: [
          {
            delivery_id: "del_1",
            event_type: "bundle.created",
            status: "delivered",
            attempt_count: 1,
            next_attempt_at: null,
            last_response_code: 200,
            last_attempted_at: "2026-03-15T00:00:01.000Z",
            last_error: null
          }
        ]
      }
    });

    const api = createWebhookApi({ request });
    const deliveries = await api.listWebhookDeliveries({
      bearerToken: "dbundle_mem_x",
      projectId: "proj_1",
      webhookId: "wh_1",
      limit: 10
    });

    expect(deliveries).toHaveLength(1);
    expect(request).toHaveBeenCalledWith({
      method: "GET",
      path: "/v1/webhooks/wh_1/deliveries?project_id=proj_1&limit=10",
      bearerToken: "dbundle_mem_x"
    });
  });

  it("calls webhook test route with default and explicit event types", async () => {
    const request = vi
      .fn<HttpClient["request"]>()
      .mockResolvedValueOnce({
        status: 202,
        body: {
          delivery: {
            delivery_id: "del_default",
            event_type: "verification.passed",
            status: "pending",
            attempt_count: 1,
            next_attempt_at: null,
            last_response_code: null,
            last_attempted_at: null,
            last_error: null
          }
        }
      })
      .mockResolvedValueOnce({
        status: 202,
        body: {
          delivery: {
            delivery_id: "del_failed",
            event_type: "verification.failed",
            status: "pending",
            attempt_count: 1,
            next_attempt_at: null,
            last_response_code: null,
            last_attempted_at: null,
            last_error: null
          }
        }
      });

    const api = createWebhookApi({ request });
    const defaultDelivery = await api.testWebhook({
      bearerToken: "dbundle_mem_x",
      projectId: "proj_1",
      webhookId: "wh_1"
    });
    const explicitDelivery = await api.testWebhook({
      bearerToken: "dbundle_mem_x",
      projectId: "proj_1",
      webhookId: "wh_1",
      eventType: "verification.failed"
    });

    expect(defaultDelivery.delivery_id).toBe("del_default");
    expect(explicitDelivery.event_type).toBe("verification.failed");
    expect(request).toHaveBeenNthCalledWith(1, {
      method: "POST",
      path: "/v1/webhooks/wh_1/test?project_id=proj_1",
      bearerToken: "dbundle_mem_x",
      body: {}
    });
    expect(request).toHaveBeenNthCalledWith(2, {
      method: "POST",
      path: "/v1/webhooks/wh_1/test?project_id=proj_1",
      bearerToken: "dbundle_mem_x",
      body: {
        event_type: "verification.failed"
      }
    });
  });

  it("throws structured and shape errors for webhook routes", async () => {
    const requestError = vi.fn<HttpClient["request"]>().mockResolvedValue({
      status: 404,
      body: {
        error: "webhook_not_found"
      }
    });
    const requestShape = vi.fn<HttpClient["request"]>().mockResolvedValue({
      status: 200,
      body: {
        webhooks: [{ invalid: true }]
      }
    });
    const requestMalformedError = vi.fn<HttpClient["request"]>().mockResolvedValue({
      status: 500,
      body: {
        unexpected: true
      }
    });

    const apiError = createWebhookApi({ request: requestError });
    const apiShape = createWebhookApi({ request: requestShape });
    const apiMalformedError = createWebhookApi({ request: requestMalformedError });

    await expect(apiError.getWebhook({ bearerToken: "dbundle_mem_x", projectId: "proj_1", webhookId: "wh_missing" })).rejects.toEqual(
      new WebhookApiError(404, "webhook_not_found")
    );
    await expect(apiShape.listWebhooks({ bearerToken: "dbundle_mem_x", projectId: "proj_1" })).rejects.toEqual(
      new WebhookApiError(200, "invalid_response_shape")
    );
    await expect(
      apiMalformedError.createWebhook({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        url: "https://hooks.example.test/debugbundle",
        events: ["bundle.created"]
      })
    ).rejects.toEqual(new WebhookApiError(500, "unknown_error"));
  });

  it("retries a webhook delivery via POST and parses response via Zod schema", async () => {
    const request = vi.fn<HttpClient["request"]>().mockResolvedValue({
      status: 200,
      body: { delivery_id: "del_retried", event_type: "bundle.created" }
    });

    const api = createWebhookApi({ request });
    const result = await api.retryWebhookDelivery({
      bearerToken: "dbundle_mem_test",
      projectId: "proj_1",
      webhookId: "wh_1",
      deliveryId: "del_failed"
    });

    expect(result).toEqual({
      delivery_id: "del_retried",
      event_type: "bundle.created"
    });
    expect(request).toHaveBeenCalledWith({
      method: "POST",
      path: "/v1/webhooks/wh_1/deliveries/del_failed/retry?project_id=proj_1",
      bearerToken: "dbundle_mem_test",
      body: {}
    });
  });

  it("throws on non-2xx retry response", async () => {
    const request = vi.fn<HttpClient["request"]>().mockResolvedValue({
      status: 404,
      body: { error: "delivery_not_found" }
    });

    const api = createWebhookApi({ request });
    await expect(
      api.retryWebhookDelivery({
        bearerToken: "dbundle_mem_test",
        projectId: "proj_1",
        webhookId: "wh_1",
        deliveryId: "del_missing"
      })
    ).rejects.toThrow();
  });

  it("accepts disabled status in webhook delivery list response", async () => {
    const request = vi.fn<HttpClient["request"]>().mockResolvedValue({
      status: 200,
      body: {
        deliveries: [
          {
            delivery_id: "del_1",
            event_type: "bundle.created",
            status: "disabled",
            attempt_count: 5,
            next_attempt_at: null,
            last_response_code: 503,
            last_attempted_at: "2026-03-11T00:00:00.000Z",
            last_error: "webhook_http_error_503"
          }
        ]
      }
    });

    const api = createWebhookApi({ request });
    const deliveries = await api.listWebhookDeliveries({
      bearerToken: "dbundle_mem_test",
      projectId: "proj_1",
      webhookId: "wh_1"
    });

    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.status).toBe("disabled");
  });
});
