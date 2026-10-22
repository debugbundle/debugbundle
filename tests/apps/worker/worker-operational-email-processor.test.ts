import { describe, expect, it, vi } from "vitest";

import { processNextDeliverOperationalEmailJob } from "../../../apps/worker/src/operational-email-processor.js";

describe("worker operational email processor", () => {
  it.each([false, true])(
    "delivers queued billing emails through the existing retry path (transport failure: %s)",
    async (failure) => {
      const send = failure
        ? vi.fn().mockRejectedValue(new Error("transport unavailable"))
        : vi.fn().mockResolvedValue(undefined);
      const mark = vi
        .fn()
        .mockResolvedValue({ status: failure ? "retrying" : "delivered", next_attempt: null });
      const payload = {
        subject: "Subscription updated",
        text: "Team is active",
        html: "<p>Team is active</p>"
      };
      await processNextDeliverOperationalEmailJob({
        operationalEmailDeliveryStore: {
          claimDueOperationalEmailDeliveries: vi
            .fn()
            .mockResolvedValue([{ delivery_id: "email_billing", attempt: 1 }]),
          getOperationalEmailDelivery: vi.fn().mockResolvedValue({
            delivery_id: "email_billing",
            organization_id: "org_test",
            project_id: null,
            kind: "billing_lifecycle",
            payload,
            created_at: "2026-10-22T00:00:00Z"
          }),
          resolveOperationalEmailRecipientContext: vi.fn().mockResolvedValue({
            organization_name: "Synthetic",
            recipient_email: "owner@example.test"
          }),
          markOperationalEmailDeliveryAttempt: mark
        },
        emailTransport: { send }
      });
      expect(send).toHaveBeenCalledExactlyOnceWith({ to: ["owner@example.test"], ...payload });
      expect(mark).toHaveBeenCalledWith(
        expect.objectContaining({ delivery_id: "email_billing", attempt: 1, delivered: !failure })
      );
    }
  );
  it("records delivery metrics for sent allowance warning emails", async (): Promise<void> => {
    const recordMetricDeltas = vi.fn().mockResolvedValue("recorded");
    const send = vi.fn().mockResolvedValue(undefined);

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
        markOperationalEmailDeliveryAttempt: vi.fn().mockResolvedValue({
          status: "delivered",
          next_attempt: null
        })
      },
      emailTransport: {
        send
      },
      accountAnalyticsStore: {
        recordMetricDeltas
      },
      resolveOrganizationIdForProject: vi.fn().mockResolvedValue("org_123")
    });

    expect(result).toEqual({ processed: true });
    expect(send).toHaveBeenCalledOnce();
    expect(recordMetricDeltas).toHaveBeenCalledWith({
      organization_id: "org_123",
      occurred_at: "2026-05-18T12:00:00.000Z",
      source: "operational_email_result",
      dedupe_key: "operational_email_result:opem_123:delivered",
      deltas: {
        operational_emails_sent: 1,
        allowance_warning_emails_sent: 1
      }
    });
  });
});
