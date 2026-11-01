import { describe, expect, it, vi } from "vitest";
import {
  LifecycleWebhookDeliveryError,
  processNextDeliverWebhookJob
} from "../../../apps/worker/src/processor.js";

describe("worker webhook delivery", () => {
  it("should return delivery_missing when deliver-webhook job points to unknown delivery", async (): Promise<void> => {
    const result = await processNextDeliverWebhookJob({
      queue: {
        enqueue: vi.fn(),
        dequeue: vi.fn().mockResolvedValue({ delivery_id: "del_missing", attempt: 1 })
      },
      webhookDeliveryStore: {
        getDeliveryIntent: vi.fn().mockResolvedValue(null),
        markDeliveryAttempt: vi.fn()
      },
      lifecycleWebhookTransport: {
        deliver: vi.fn()
      }
    });

    expect(result).toEqual({ processed: false, reason: "delivery_missing" });
  });

  it("should propagate response code from lifecycle delivery errors", async (): Promise<void> => {
    const queue = {
      enqueue: vi.fn().mockResolvedValue(undefined),
      dequeue: vi.fn().mockResolvedValue({ delivery_id: "del_123", attempt: 1 })
    };

    const webhookDeliveryStore = {
      getDeliveryIntent: vi.fn().mockResolvedValue({
        delivery_id: "del_123",
        webhook_id: "wh_123",
        project_id: "proj_123",
        incident_id: "inc_123",
        event_type: "incident.spike_detected",
        status: "pending",
        attempt_count: 0,
        occurred_at: "2026-03-11T00:00:00.000Z",
        target_url: "https://hooks.example.test/debugbundle",
        next_attempt_at: null,
        last_response_code: null,
        last_attempted_at: null,
        last_error: null,
        payload: { incident_id: "inc_123" },
        signing_secret: "secret_123"
      }),
      markDeliveryAttempt: vi.fn().mockResolvedValue({ status: "retrying", next_attempt: 2 })
    };

    const lifecycleWebhookTransport = {
      deliver: vi
        .fn()
        .mockRejectedValue(new LifecycleWebhookDeliveryError("webhook_http_error_503", 503))
    };

    const result = await processNextDeliverWebhookJob({
      queue,
      webhookDeliveryStore,
      lifecycleWebhookTransport
    });

    expect(result).toEqual({ processed: true });
    expect(webhookDeliveryStore.markDeliveryAttempt).toHaveBeenCalledWith({
      delivery_id: "del_123",
      attempt: 1,
      delivered: false,
      error_message: "webhook_http_error_503",
      response_code: 503
    });
  });

  it("should return no_jobs when deliver-webhook queue is empty", async (): Promise<void> => {
    const result = await processNextDeliverWebhookJob({
      queue: {
        enqueue: vi.fn(),
        dequeue: vi.fn().mockResolvedValue(null)
      },
      webhookDeliveryStore: {
        getDeliveryIntent: vi.fn(),
        markDeliveryAttempt: vi.fn()
      },
      lifecycleWebhookTransport: {
        deliver: vi.fn()
      }
    });

    expect(result).toEqual({ processed: false, reason: "no_jobs" });
  });

  it("should mark webhook delivery as delivered when transport succeeds", async (): Promise<void> => {
    const queue = {
      enqueue: vi.fn(),
      dequeue: vi.fn().mockResolvedValue({ delivery_id: "del_123", attempt: 1 })
    };

    const webhookDeliveryStore = {
      getDeliveryIntent: vi.fn().mockResolvedValue({
        delivery_id: "del_123",
        webhook_id: "wh_123",
        project_id: "proj_123",
        incident_id: "inc_123",
        event_type: "bundle.reopened",
        status: "pending",
        attempt_count: 0,
        occurred_at: "2026-03-11T00:00:00.000Z",
        target_url: "https://hooks.example.test/debugbundle",
        next_attempt_at: null,
        last_response_code: null,
        last_attempted_at: null,
        last_error: null,
        payload: { incident_id: "inc_123" },
        signing_secret: "secret_123"
      }),
      markDeliveryAttempt: vi.fn().mockResolvedValue({ status: "delivered", next_attempt: null })
    };

    const lifecycleWebhookTransport = {
      deliver: vi.fn().mockResolvedValue(undefined)
    };

    const result = await processNextDeliverWebhookJob({
      queue,
      webhookDeliveryStore,
      lifecycleWebhookTransport
    });

    expect(result).toEqual({ processed: true });
    expect(webhookDeliveryStore.markDeliveryAttempt).toHaveBeenCalledWith({
      delivery_id: "del_123",
      attempt: 1,
      delivered: true,
      error_message: null,
      response_code: 200
    });
  });

  it("should not retry delivered webhooks when account analytics recording fails", async (): Promise<void> => {
    const queue = {
      enqueue: vi.fn(),
      dequeue: vi.fn().mockResolvedValue({ delivery_id: "del_123", attempt: 1 })
    };
    const recordMetricDeltas = vi.fn().mockRejectedValue(new Error("analytics_unavailable"));
    const warn = vi.fn();

    const webhookDeliveryStore = {
      getDeliveryIntent: vi.fn().mockResolvedValue({
        delivery_id: "del_123",
        webhook_id: "wh_123",
        project_id: "proj_123",
        incident_id: "inc_123",
        event_type: "bundle.reopened",
        status: "pending",
        attempt_count: 0,
        occurred_at: "2026-03-11T00:00:00.000Z",
        target_url: "https://hooks.example.test/debugbundle",
        next_attempt_at: null,
        last_response_code: null,
        last_attempted_at: null,
        last_error: null,
        payload: { incident_id: "inc_123" },
        signing_secret: "secret_123"
      }),
      markDeliveryAttempt: vi.fn().mockResolvedValue({ status: "delivered", next_attempt: null })
    };

    const lifecycleWebhookTransport = {
      deliver: vi.fn().mockResolvedValue(undefined)
    };

    const result = await processNextDeliverWebhookJob({
      queue,
      webhookDeliveryStore,
      lifecycleWebhookTransport,
      accountAnalyticsStore: { recordMetricDeltas },
      resolveOrganizationIdForProject: vi.fn().mockResolvedValue("org_123"),
      logger: { warn }
    });

    expect(result).toEqual({ processed: true });
    expect(lifecycleWebhookTransport.deliver).toHaveBeenCalledOnce();
    expect(webhookDeliveryStore.markDeliveryAttempt).toHaveBeenCalledWith({
      delivery_id: "del_123",
      attempt: 1,
      delivered: true,
      error_message: null,
      response_code: 200
    });
    expect(recordMetricDeltas).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: "proj_123",
        metric_source: "webhook_delivery_result"
      }),
      "worker_account_analytics_record_failed"
    );
  });

  it("should pass verification.passed deliveries through the existing webhook transport", async (): Promise<void> => {
    const queue = {
      enqueue: vi.fn(),
      dequeue: vi.fn().mockResolvedValue({ delivery_id: "del_456", attempt: 1 })
    };

    const webhookDeliveryStore = {
      getDeliveryIntent: vi.fn().mockResolvedValue({
        delivery_id: "del_456",
        webhook_id: "wh_123",
        project_id: "proj_123",
        incident_id: "inc_test_123",
        event_type: "verification.passed",
        status: "retrying",
        attempt_count: 0,
        occurred_at: "2026-03-11T00:00:00.000Z",
        target_url: "https://hooks.example.test/debugbundle",
        next_attempt_at: "2026-03-11T00:00:30.000Z",
        last_response_code: null,
        last_attempted_at: null,
        last_error: null,
        payload: {
          event_type: "verification.passed",
          test: true
        },
        signing_secret: "secret_123"
      }),
      markDeliveryAttempt: vi.fn().mockResolvedValue({ status: "delivered", next_attempt: null })
    };

    const lifecycleWebhookTransport = {
      deliver: vi.fn().mockResolvedValue(undefined)
    };

    await expect(
      processNextDeliverWebhookJob({
        queue,
        webhookDeliveryStore,
        lifecycleWebhookTransport
      })
    ).resolves.toEqual({ processed: true });
    const deliveredEvent = lifecycleWebhookTransport.deliver.mock.calls[0]?.[0] as
      | {
          delivery_id?: string;
          event_type?: string;
          payload?: { event_type?: string; test?: boolean };
        }
      | undefined;
    expect(deliveredEvent?.delivery_id).toBe("del_456");
    expect(deliveredEvent?.event_type).toBe("verification.passed");
    expect(deliveredEvent?.payload?.event_type).toBe("verification.passed");
    expect(deliveredEvent?.payload?.test).toBe(true);
  });

  it("should record retry state on delivery failure without immediate re-enqueue", async (): Promise<void> => {
    const queue = {
      enqueue: vi.fn().mockResolvedValue(undefined),
      dequeue: vi.fn().mockResolvedValue({ delivery_id: "del_123", attempt: 1 })
    };

    const webhookDeliveryStore = {
      getDeliveryIntent: vi.fn().mockResolvedValue({
        delivery_id: "del_123",
        webhook_id: "wh_123",
        project_id: "proj_123",
        incident_id: "inc_123",
        event_type: "incident.spike_detected",
        status: "pending",
        attempt_count: 0,
        occurred_at: "2026-03-11T00:00:00.000Z",
        target_url: "https://hooks.example.test/debugbundle",
        next_attempt_at: null,
        last_response_code: null,
        last_attempted_at: null,
        last_error: null,
        payload: { incident_id: "inc_123" },
        signing_secret: "secret_123"
      }),
      markDeliveryAttempt: vi.fn().mockResolvedValue({ status: "retrying", next_attempt: 2 })
    };

    const lifecycleWebhookTransport = {
      deliver: vi.fn().mockRejectedValue(new Error("network_down"))
    };

    const result = await processNextDeliverWebhookJob({
      queue,
      webhookDeliveryStore,
      lifecycleWebhookTransport
    });

    expect(result).toEqual({ processed: true });
    expect(webhookDeliveryStore.markDeliveryAttempt).toHaveBeenCalledWith({
      delivery_id: "del_123",
      attempt: 1,
      delivered: false,
      error_message: "network_down",
      response_code: null
    });
    expect(queue.enqueue).not.toHaveBeenCalled();
  });
});

describe("deliver-webhook – onWebhookDisabled callback", () => {
  function makeDeliveryIntent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      delivery_id: "del_1",
      webhook_id: "wh_1",
      project_id: "proj_1",
      incident_id: "inc_1",
      event_type: "bundle.created",
      status: "retrying",
      attempt_count: 5,
      occurred_at: "2026-03-11T00:00:00.000Z",
      target_url: "https://hooks.example.test/wh1",
      next_attempt_at: null,
      last_response_code: null,
      last_attempted_at: null,
      last_error: null,
      payload: { incident_id: "inc_1" },
      signing_secret: "secret_1",
      ...overrides
    };
  }

  it("should call onWebhookDisabled when markDeliveryAttempt indicates auto-disable", async (): Promise<void> => {
    const onWebhookDisabled = vi.fn().mockResolvedValue(undefined);

    await processNextDeliverWebhookJob({
      queue: {
        enqueue: vi.fn(),
        dequeue: vi.fn().mockResolvedValue({ delivery_id: "del_1", attempt: 6 })
      },
      webhookDeliveryStore: {
        getDeliveryIntent: vi.fn().mockResolvedValue(makeDeliveryIntent()),
        markDeliveryAttempt: vi.fn().mockResolvedValue({
          status: "failed",
          next_attempt: null,
          webhook_disabled: true,
          webhook_id: "wh_1"
        })
      },
      lifecycleWebhookTransport: {
        deliver: vi
          .fn()
          .mockRejectedValue(new LifecycleWebhookDeliveryError("webhook_http_error_503", 503))
      },
      onWebhookDisabled
    });

    expect(onWebhookDisabled).toHaveBeenCalledWith({
      webhook_id: "wh_1",
      target_url: "https://hooks.example.test/wh1"
    });
  });

  it("should not call onWebhookDisabled when mark result has no webhook_disabled flag", async (): Promise<void> => {
    const onWebhookDisabled = vi.fn().mockResolvedValue(undefined);

    await processNextDeliverWebhookJob({
      queue: {
        enqueue: vi.fn(),
        dequeue: vi.fn().mockResolvedValue({ delivery_id: "del_2", attempt: 1 })
      },
      webhookDeliveryStore: {
        getDeliveryIntent: vi.fn().mockResolvedValue(
          makeDeliveryIntent({
            delivery_id: "del_2",
            webhook_id: "wh_2",
            event_type: "bundle.updated",
            status: "pending",
            attempt_count: 0,
            target_url: "https://hooks.example.test/wh2",
            signing_secret: "secret_2"
          })
        ),
        markDeliveryAttempt: vi.fn().mockResolvedValue({
          status: "retrying",
          next_attempt: 2
        })
      },
      lifecycleWebhookTransport: {
        deliver: vi.fn().mockRejectedValue(new Error("network error"))
      },
      onWebhookDisabled
    });

    expect(onWebhookDisabled).not.toHaveBeenCalled();
  });

  it("should swallow onWebhookDisabled errors without affecting processing", async (): Promise<void> => {
    const onWebhookDisabled = vi.fn().mockRejectedValue(new Error("email send failed"));

    const result = await processNextDeliverWebhookJob({
      queue: {
        enqueue: vi.fn(),
        dequeue: vi.fn().mockResolvedValue({ delivery_id: "del_3", attempt: 6 })
      },
      webhookDeliveryStore: {
        getDeliveryIntent: vi.fn().mockResolvedValue(
          makeDeliveryIntent({
            delivery_id: "del_3",
            webhook_id: "wh_3",
            target_url: "https://hooks.example.test/wh3",
            signing_secret: "secret_3"
          })
        ),
        markDeliveryAttempt: vi.fn().mockResolvedValue({
          status: "failed",
          next_attempt: null,
          webhook_disabled: true,
          webhook_id: "wh_3"
        })
      },
      lifecycleWebhookTransport: {
        deliver: vi
          .fn()
          .mockRejectedValue(new LifecycleWebhookDeliveryError("webhook_http_error_500", 500))
      },
      onWebhookDisabled
    });

    expect(result).toEqual({ processed: true });
    expect(onWebhookDisabled).toHaveBeenCalled();
  });
});
