import { describe, expect, it, vi } from "vitest";
import type { BuildBundleWorkerDependencies } from "../../../apps/worker/src/processor-shared.js";
import { mockedObject } from "../../helpers/vitest.js";
import {
  processNextBuildBundleJob,
  processNextBuildReproductionJob,
  processNextDeliverOperationalEmailJob,
  processNextGroupIncidentJob
} from "../../../apps/worker/src/processor.js";

describe("worker processor bundle delivery", () => {
  it.each([false, true])(
    "withholds bound bundle work when live authority is unavailable (checker present: %s)",
    async (hasChecker) => {
      const read = vi.fn(),
        putObject = vi.fn();
      const job = {
        project_id: "11111111-1111-4111-8111-111111111111",
        initiating_authority: {
          version: 1,
          kind: "member_token",
          user_id: "22222222-2222-4222-8222-222222222222",
          token_id: "33333333-3333-4333-8333-333333333333"
        },
        scope_origin_ids: ["11111111-1111-4111-8111-111111111111"]
      };
      const result = await processNextBuildBundleJob({
        queue: { dequeue: vi.fn().mockResolvedValue(job), enqueue: vi.fn() },
        incidentStore: mockedObject<BuildBundleWorkerDependencies["incidentStore"]>({
          getBundleBuildContext: read
        }),
        objectStore: { putObject },
        ...(hasChecker
          ? { projectJobAuthorization: { isAuthorized: vi.fn().mockResolvedValue(false) } }
          : {})
      });
      expect(result).toEqual({ processed: true, reason: "initiator_access_revoked" });
      expect(read).not.toHaveBeenCalled();
      expect(putObject).not.toHaveBeenCalled();
    }
  );
  it("withholds reproduction reads after the requesting credential is revoked", async () => {
    const read = vi.fn(),
      putObject = vi.fn();
    const result = await processNextBuildReproductionJob({
      queue: {
        enqueue: vi.fn(),
        dequeue: vi.fn().mockResolvedValue({
          project_id: "11111111-1111-4111-8111-111111111111",
          initiating_authority: {
            version: 1,
            kind: "browser_session",
            user_id: "22222222-2222-4222-8222-222222222222"
          },
          scope_origin_ids: ["11111111-1111-4111-8111-111111111111"]
        })
      },
      objectStore: { getObject: read, putObject },
      projectJobAuthorization: { isAuthorized: vi.fn().mockResolvedValue(false) }
    });
    expect(result).toEqual({ processed: true, reason: "initiator_access_revoked" });
    expect(read).not.toHaveBeenCalled();
    expect(putObject).not.toHaveBeenCalled();
  });
  it("should deliver a queued operational allowance email and mark it delivered", async (): Promise<void> => {
    const markOperationalEmailDeliveryAttempt = vi
      .fn()
      .mockResolvedValue({ status: "delivered", next_attempt: null });
    const emailSend = vi.fn().mockResolvedValue(undefined);

    const result = await processNextDeliverOperationalEmailJob({
      appBaseUrl: "https://app.debugbundle.test",
      operationalEmailDeliveryStore: {
        claimDueOperationalEmailDeliveries: vi
          .fn()
          .mockResolvedValue([{ delivery_id: "opem_123", attempt: 1 }]),
        getOperationalEmailDelivery: vi.fn().mockResolvedValue({
          delivery_id: "opem_123",
          organization_id: "org_123",
          project_id: "proj_123",
          kind: "allowance_warning_80",
          dedupe_key:
            "allowance_warning_80:monthly_raw_ingested_events:window:2026-05-01T00:00:00.000Z",
          payload: {
            meter: "monthly_raw_ingested_events",
            used: 8400,
            limit: 10500,
            usage_window_ends_at: "2026-06-01T00:00:00.000Z"
          },
          status: "retrying",
          attempt_count: 0,
          next_attempt_at: null,
          last_error: null,
          delivered_at: null,
          created_at: "2026-05-18T12:00:00.000Z",
          updated_at: "2026-05-18T12:00:00.000Z"
        }),
        resolveOperationalEmailRecipientContext: vi.fn().mockResolvedValue({
          organization_name: "Acme Production",
          project_name: "Checkout API",
          recipient_email: "owner@example.com"
        }),
        markOperationalEmailDeliveryAttempt
      },
      emailTransport: {
        send: emailSend
      }
    });

    expect(result).toEqual({ processed: true });
    expect(emailSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["owner@example.com"],
        subject: "DebugBundle: 80% of raw ingested events allowance used",
        text: expect.stringContaining("Usage: 8400 of 10500"),
        html: expect.stringContaining("Raw ingested events allowance at 80%")
      })
    );
    expect(markOperationalEmailDeliveryAttempt).toHaveBeenCalledWith({
      delivery_id: "opem_123",
      attempt: 1,
      delivered: true,
      error_message: null
    });
  });

  it("should mark queued operational email failures for retry", async (): Promise<void> => {
    const markOperationalEmailDeliveryAttempt = vi
      .fn()
      .mockResolvedValue({ status: "retrying", next_attempt: 2 });
    const loggerWarn = vi.fn();

    const result = await processNextDeliverOperationalEmailJob({
      logger: { warn: loggerWarn },
      operationalEmailDeliveryStore: {
        claimDueOperationalEmailDeliveries: vi
          .fn()
          .mockResolvedValue([{ delivery_id: "opem_123", attempt: 1 }]),
        getOperationalEmailDelivery: vi.fn().mockResolvedValue({
          delivery_id: "opem_123",
          organization_id: "org_123",
          project_id: "proj_123",
          kind: "allowance_limit_reached",
          dedupe_key:
            "allowance_limit_reached:monthly_raw_ingested_events:window:2026-05-01T00:00:00.000Z",
          payload: {
            meter: "monthly_raw_ingested_events",
            used: 10500
          },
          status: "retrying",
          attempt_count: 0,
          next_attempt_at: null,
          last_error: null,
          delivered_at: null,
          created_at: "2026-05-18T12:00:00.000Z",
          updated_at: "2026-05-18T12:00:00.000Z"
        }),
        resolveOperationalEmailRecipientContext: vi.fn().mockResolvedValue({
          organization_name: "Acme Production",
          project_name: "Checkout API",
          recipient_email: "owner@example.com"
        }),
        markOperationalEmailDeliveryAttempt
      },
      emailTransport: {
        send: vi.fn()
      }
    });

    expect(result).toEqual({ processed: true });
    expect(markOperationalEmailDeliveryAttempt).toHaveBeenCalledWith({
      delivery_id: "opem_123",
      attempt: 1,
      delivered: false,
      error_message: "operational_email_invalid_allowance_payload"
    });
    expect(loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        delivery_id: "opem_123",
        kind: "allowance_limit_reached",
        error_message: "operational_email_invalid_allowance_payload"
      }),
      "operational_email_delivery_failed"
    );
  });

  it("should return no_jobs when group-incident queue is empty", async (): Promise<void> => {
    const result = await processNextGroupIncidentJob({
      queue: {
        enqueue: vi.fn(),
        dequeue: vi.fn().mockResolvedValue(null)
      },
      incidentStore: {
        upsertIncident: vi.fn(),
        insertIncidentEvent: vi.fn(),
        markIncidentSpiking: vi.fn()
      },
      frequencyCounter: {
        recordOccurrence: vi.fn()
      },
      lifecycleWebhookPublisher: {
        publish: vi.fn()
      }
    });

    expect(result).toEqual({ processed: false, reason: "no_jobs" });
  });

  it("should skip non-incident signals before incident upsert", async (): Promise<void> => {
    const upsertIncident = vi.fn();
    const insertIncidentEvent = vi.fn();
    const recordOccurrence = vi.fn();
    const publish = vi.fn();

    const result = await processNextGroupIncidentJob({
      queue: {
        enqueue: vi.fn(),
        dequeue: vi.fn().mockResolvedValue({
          project_id: "proj_123",
          event_id: "evt_context",
          event_type: "frontend_breadcrumb",
          event_class: "context_signal",
          service_name: "checkout-api",
          environment: "production",
          fingerprint: "fp_context",
          normalized_message: "GET /health returned 404",
          occurred_at: "2026-03-12T00:00:00.000Z",
          severity: "low"
        })
      },
      incidentStore: {
        upsertIncident,
        insertIncidentEvent,
        markIncidentSpiking: vi.fn()
      },
      frequencyCounter: {
        recordOccurrence
      },
      lifecycleWebhookPublisher: {
        publish
      }
    });

    expect(result).toEqual({ processed: true, reason: "non_incident_signal" });
    expect(upsertIncident).not.toHaveBeenCalled();
    expect(insertIncidentEvent).not.toHaveBeenCalled();
    expect(recordOccurrence).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it("should return no_jobs when build-bundle queue is empty", async (): Promise<void> => {
    const result = await processNextBuildBundleJob({
      queue: {
        enqueue: vi.fn(),
        dequeue: vi.fn().mockResolvedValue(null)
      },
      incidentStore: {
        getBundleBuildContext: vi.fn(),
        reserveBundleGeneration: vi.fn()
      },
      objectStore: {
        putObject: vi.fn()
      }
    });

    expect(result).toEqual({ processed: false, reason: "no_jobs" });
  });

  it("should return no_jobs when build-reproduction queue is empty", async (): Promise<void> => {
    const result = await processNextBuildReproductionJob({
      queue: {
        enqueue: vi.fn(),
        dequeue: vi.fn().mockResolvedValue(null)
      },
      objectStore: {
        getObject: vi.fn(),
        putObject: vi.fn()
      }
    });

    expect(result).toEqual({ processed: false, reason: "no_jobs" });
  });

  it("should return incident_missing when build-bundle incident context cannot be loaded", async (): Promise<void> => {
    const result = await processNextBuildBundleJob({
      queue: {
        enqueue: vi.fn(),
        dequeue: vi.fn().mockResolvedValue({
          project_id: "proj_123",
          incident_id: "inc_missing",
          event_id: "evt_123",
          occurred_at: "2026-03-12T00:00:00.000Z",
          occurrence_count: 1,
          trigger: "occurrence_threshold"
        })
      },
      incidentStore: {
        getBundleBuildContext: vi.fn().mockResolvedValue(null),
        reserveBundleGeneration: vi.fn()
      },
      objectStore: {
        putObject: vi.fn()
      }
    });

    expect(result).toEqual({ processed: false, reason: "incident_missing" });
  });
});
