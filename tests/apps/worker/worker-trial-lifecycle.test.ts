import { describe, expect, it, vi } from "vitest";

import { processNextDeliverOperationalEmailJob } from "../../../apps/worker/src/operational-email-processor.js";
import { scheduleTrialLifecycleEmails } from "../../../apps/worker/src/trial-lifecycle-scheduler.js";

describe("worker trial lifecycle", () => {
  function createOperationalEmailDelivery(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      delivery_id: "op_123",
      organization_id: "org_123",
      project_id: null,
      kind: "trial_ending_soon",
      dedupe_key: "trial_ending_soon:2026-07-01T00:00:00.000Z:7",
      payload: {
        trial_plan: "team",
        trial_ends_at: "2026-07-01T00:00:00.000Z",
        days_remaining: 7
      },
      status: "pending",
      attempt_count: 0,
      next_attempt_at: null,
      last_error: null,
      delivered_at: null,
      created_at: "2026-06-24T12:00:00.000Z",
      updated_at: "2026-06-24T12:00:00.000Z",
      ...overrides
    };
  }

  it("queues started, reminder, expired, and converted trial emails", async () => {
    const queueOrganizationOperationalEmailDelivery = vi
      .fn()
      .mockResolvedValue({ delivery_id: "op_123", created: true });
    const recordTrialLifecycleEvent = vi.fn().mockResolvedValue(true);

    const result = await scheduleTrialLifecycleEmails({
      now: new Date("2026-06-24T12:00:00.000Z"),
      batchSize: 10,
      billingStore: {
        claimTrialStartedNotificationCandidates: vi.fn().mockResolvedValue([
          {
            organization_id: "org_started",
            current_plan: "team",
            trial_plan: "team",
            trial_started_at: "2026-06-01T12:00:00.000Z",
            trial_ends_at: "2026-07-01T12:00:00.000Z",
            trial_converted_at: null,
            trial_expired_at: null
          }
        ]),
        claimTrialEndingSoonNotificationCandidates: vi
          .fn()
          .mockResolvedValueOnce([
            {
              organization_id: "org_reminder_7",
              current_plan: "team",
              trial_plan: "team",
              trial_started_at: "2026-06-01T12:00:00.000Z",
              trial_ends_at: "2026-07-01T12:00:00.000Z",
              trial_converted_at: null,
              trial_expired_at: null
            }
          ])
          .mockResolvedValueOnce([
            {
              organization_id: "org_reminder_1",
              current_plan: "solo",
              trial_plan: "solo",
              trial_started_at: "2026-06-01T12:00:00.000Z",
              trial_ends_at: "2026-06-25T12:00:00.000Z",
              trial_converted_at: null,
              trial_expired_at: null
            }
          ]),
        claimExpiredTrialCandidates: vi.fn().mockResolvedValue([
          {
            organization_id: "org_expired",
            current_plan: "team",
            trial_plan: "team",
            trial_started_at: "2026-05-01T12:00:00.000Z",
            trial_ends_at: "2026-06-01T12:00:00.000Z",
            trial_converted_at: null,
            trial_expired_at: null
          }
        ]),
        expireTrialForOrganization: vi.fn().mockResolvedValue({
          plan: "free",
          billing_state: "trial_expired"
        }),
        claimTrialConvertedNotificationCandidates: vi.fn().mockResolvedValue([
          {
            organization_id: "org_converted",
            current_plan: "team",
            trial_plan: "solo",
            trial_started_at: "2026-06-01T12:00:00.000Z",
            trial_ends_at: "2026-07-01T12:00:00.000Z",
            trial_converted_at: "2026-06-10T12:00:00.000Z",
            trial_expired_at: null
          }
        ]),
        recordTrialLifecycleEvent
      },
      operationalEmailDeliveryStore: {
        queueOrganizationOperationalEmailDelivery
      }
    });

    expect(result).toEqual({
      queued_started: 1,
      queued_reminders: 2,
      expired_trials: 1,
      queued_converted: 1
    });
    expect(queueOrganizationOperationalEmailDelivery).toHaveBeenCalledTimes(5);
    expect(recordTrialLifecycleEvent).toHaveBeenCalledTimes(5);
    expect(recordTrialLifecycleEvent).toHaveBeenCalledWith({
      organization_id: "org_expired",
      event_type: "trial_expired",
      dedupe_key: "2026-06-01T12:00:00.000Z"
    });
    expect(queueOrganizationOperationalEmailDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: "org_converted",
        kind: "trial_converted",
        payload: expect.objectContaining({
          trial_plan: "solo",
          paid_plan: "team"
        })
      })
    );
  });

  it("does not record a lifecycle event before a trial email is queued", async () => {
    const recordTrialLifecycleEvent = vi.fn().mockResolvedValue(true);

    await expect(
      scheduleTrialLifecycleEmails({
        now: new Date("2026-06-24T12:00:00.000Z"),
        batchSize: 10,
        billingStore: {
          claimTrialStartedNotificationCandidates: vi.fn().mockResolvedValue([
            {
              organization_id: "org_started",
              current_plan: "team",
              trial_plan: "team",
              trial_started_at: "2026-06-01T12:00:00.000Z",
              trial_ends_at: "2026-07-01T12:00:00.000Z",
              trial_converted_at: null,
              trial_expired_at: null
            }
          ]),
          claimTrialEndingSoonNotificationCandidates: vi.fn().mockResolvedValue([]),
          claimExpiredTrialCandidates: vi.fn().mockResolvedValue([]),
          claimTrialConvertedNotificationCandidates: vi.fn().mockResolvedValue([]),
          recordTrialLifecycleEvent
        },
        operationalEmailDeliveryStore: {
          queueOrganizationOperationalEmailDelivery: vi
            .fn()
            .mockRejectedValue(new Error("queue temporarily unavailable"))
        }
      })
    ).rejects.toThrow("queue temporarily unavailable");

    expect(recordTrialLifecycleEvent).not.toHaveBeenCalled();
  });

  it("skips operational email processing when no delivery is due", async () => {
    const result = await processNextDeliverOperationalEmailJob({
      operationalEmailDeliveryStore: {
        claimDueOperationalEmailDeliveries: vi.fn().mockResolvedValue([]),
        getOperationalEmailDelivery: vi.fn(),
        resolveOperationalEmailRecipientContext: vi.fn(),
        markOperationalEmailDeliveryAttempt: vi.fn()
      },
      emailTransport: { send: vi.fn() }
    });

    expect(result).toEqual({ processed: false, reason: "no_jobs" });
  });

  it("marks operational trial email delivery failed when no recipient can be resolved", async () => {
    const markOperationalEmailDeliveryAttempt = vi.fn().mockResolvedValue({
      status: "failed",
      next_attempt: null
    });

    const result = await processNextDeliverOperationalEmailJob({
      operationalEmailDeliveryStore: {
        claimDueOperationalEmailDeliveries: vi
          .fn()
          .mockResolvedValue([{ delivery_id: "op_123", attempt: 2 }]),
        getOperationalEmailDelivery: vi.fn().mockResolvedValue(createOperationalEmailDelivery()),
        resolveOperationalEmailRecipientContext: vi.fn().mockResolvedValue(null),
        markOperationalEmailDeliveryAttempt
      },
      emailTransport: { send: vi.fn() }
    });

    expect(result).toEqual({ processed: true });
    expect(markOperationalEmailDeliveryAttempt).toHaveBeenCalledWith({
      delivery_id: "op_123",
      attempt: 2,
      delivered: false,
      error_message: "operational_email_recipient_missing"
    });
  });

  it("renders an organization-scoped trial email through the operational email processor", async () => {
    const emailTransport = { send: vi.fn().mockResolvedValue(undefined) };
    const markOperationalEmailDeliveryAttempt = vi.fn().mockResolvedValue({
      status: "delivered",
      next_attempt: null
    });

    const result = await processNextDeliverOperationalEmailJob({
      appBaseUrl: "https://app.debugbundle.test",
      operationalEmailDeliveryStore: {
        claimDueOperationalEmailDeliveries: vi
          .fn()
          .mockResolvedValue([{ delivery_id: "op_123", attempt: 1 }]),
        getOperationalEmailDelivery: vi.fn().mockResolvedValue(createOperationalEmailDelivery()),
        resolveOperationalEmailRecipientContext: vi.fn().mockResolvedValue({
          organization_name: "Acme Corp",
          project_name: null,
          recipient_email: "owner@example.com"
        }),
        markOperationalEmailDeliveryAttempt
      },
      emailTransport
    });

    expect(result).toEqual({ processed: true });
    expect(emailTransport.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["owner@example.com"],
        subject: expect.stringContaining("7 day(s) left")
      })
    );
    expect(markOperationalEmailDeliveryAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        delivery_id: "op_123",
        delivered: true
      })
    );
  });

  it("renders started, expired, and converted trial operational emails", async () => {
    const cases = [
      {
        kind: "trial_started",
        payload: {
          trial_plan: "solo",
          trial_ends_at: "2026-07-01T00:00:00.000Z"
        },
        subject: "solo trial has started"
      },
      {
        kind: "trial_expired",
        payload: {
          trial_plan: "team",
          trial_ended_at: "2026-07-01T00:00:00.000Z"
        },
        subject: "trial has ended"
      },
      {
        kind: "trial_converted",
        payload: {
          trial_plan: "solo",
          paid_plan: "team"
        },
        subject: "team plan activated"
      }
    ];

    for (const emailCase of cases) {
      const emailTransport = { send: vi.fn().mockResolvedValue(undefined) };

      await processNextDeliverOperationalEmailJob({
        appBaseUrl: "https://app.debugbundle.test",
        emailAssetBaseUrl: "https://assets.debugbundle.test",
        operationalEmailDeliveryStore: {
          claimDueOperationalEmailDeliveries: vi
            .fn()
            .mockResolvedValue([{ delivery_id: "op_123", attempt: 1 }]),
          getOperationalEmailDelivery: vi.fn().mockResolvedValue(
            createOperationalEmailDelivery({
              kind: emailCase.kind,
              payload: emailCase.payload
            })
          ),
          resolveOperationalEmailRecipientContext: vi.fn().mockResolvedValue({
            organization_name: "Acme Corp",
            project_name: null,
            recipient_email: "owner@example.com"
          }),
          markOperationalEmailDeliveryAttempt: vi.fn().mockResolvedValue({
            status: "delivered",
            next_attempt: null
          })
        },
        emailTransport
      });

      expect(emailTransport.send).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining(emailCase.subject)
        })
      );
    }
  });

  it("renders allowance operational emails through the extracted processor", async () => {
    const emailTransport = { send: vi.fn().mockResolvedValue(undefined) };

    const result = await processNextDeliverOperationalEmailJob({
      appBaseUrl: "https://app.debugbundle.test",
      operationalEmailDeliveryStore: {
        claimDueOperationalEmailDeliveries: vi
          .fn()
          .mockResolvedValue([{ delivery_id: "op_123", attempt: 1 }]),
        getOperationalEmailDelivery: vi.fn().mockResolvedValue(
          createOperationalEmailDelivery({
            project_id: "proj_123",
            kind: "allowance_warning_80",
            payload: {
              meter: "monthly_webhook_deliveries",
              used: 80,
              limit: 100,
              usage_window_ends_at: "2026-07-01T00:00:00.000Z"
            }
          })
        ),
        resolveOperationalEmailRecipientContext: vi.fn().mockResolvedValue({
          organization_name: "Acme Corp",
          project_name: "Checkout API",
          recipient_email: "owner@example.com"
        }),
        markOperationalEmailDeliveryAttempt: vi.fn().mockResolvedValue({
          status: "delivered",
          next_attempt: null
        })
      },
      emailTransport
    });

    expect(result).toEqual({ processed: true });
    expect(emailTransport.send).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.stringContaining("80% of lifecycle webhook deliveries allowance used")
      })
    );
  });

  it("records failed operational trial email attempts for invalid payloads", async () => {
    const logger = { warn: vi.fn() };
    const markOperationalEmailDeliveryAttempt = vi.fn().mockResolvedValue({
      status: "failed",
      next_attempt: null
    });

    const result = await processNextDeliverOperationalEmailJob({
      appBaseUrl: "https://app.debugbundle.test",
      logger,
      operationalEmailDeliveryStore: {
        claimDueOperationalEmailDeliveries: vi
          .fn()
          .mockResolvedValue([{ delivery_id: "op_123", attempt: 3 }]),
        getOperationalEmailDelivery: vi.fn().mockResolvedValue(
          createOperationalEmailDelivery({
            kind: "trial_converted",
            payload: {
              trial_plan: "enterprise",
              paid_plan: "team"
            }
          })
        ),
        resolveOperationalEmailRecipientContext: vi.fn().mockResolvedValue({
          organization_name: "Acme Corp",
          project_name: null,
          recipient_email: "owner@example.com"
        }),
        markOperationalEmailDeliveryAttempt
      },
      emailTransport: { send: vi.fn() }
    });

    expect(result).toEqual({ processed: true });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        delivery_id: "op_123",
        error_message: "operational_email_invalid_trial_converted_payload",
        kind: "trial_converted"
      }),
      "operational_email_delivery_failed"
    );
    expect(markOperationalEmailDeliveryAttempt).toHaveBeenCalledWith({
      delivery_id: "op_123",
      attempt: 3,
      delivered: false,
      error_message: "operational_email_invalid_trial_converted_payload"
    });
  });
});
