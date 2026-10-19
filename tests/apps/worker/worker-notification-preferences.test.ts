import { expect, it, vi } from "vitest";
import { processNextEvaluateAlertsJob } from "../../../apps/worker/src/processor.js";
import type {
  NotificationChannel,
  EffectiveNotification
} from "../../../packages/shared-types/src/notification-preferences.js";
import { createDailyNotificationTransport } from "../../../apps/worker/src/notification-daily-transport.js";

function fixture() {
  const job = {
    project_id: "project",
    incident_id: "incident",
    condition_type: "new_incident",
    severity: "high",
    dedupe_key: "event",
    occurred_at: "2026-10-18T10:00:00Z",
    environment: "production",
    service_name: "api"
  };
  const rule = (channel: NotificationChannel) => ({
    alert_id: channel,
    channel,
    cooldown_seconds: 0,
    config:
      channel === "email"
        ? { to: "owner@example.com" }
        : { webhook_url: "https://hooks.example.com/alerts" }
  });
  const decide = vi.fn(
    async ({ channel }: { channel: NotificationChannel }): Promise<EffectiveNotification> => ({
      mode: channel === "email" ? "daily" : "immediate",
      reason: "account_default",
      paused_until: null,
      daily: { time: "09:00", timezone: "Europe/Ljubljana" }
    })
  );
  return {
    queue: { enqueue: vi.fn(), dequeue: vi.fn().mockResolvedValue(job) },
    notificationPreferences: { decide },
    notificationDaily: { enqueue: vi.fn().mockResolvedValue({ created_delivery: true }) },
    alertStore: {
      listMatchingAlerts: vi.fn().mockResolvedValue([rule("email"), rule("slack")]),
      createAlertDeliveryIntent: vi
        .fn()
        .mockResolvedValue({ delivery_id: "delivery", created: true }),
      markAlertDeliveryResult: vi.fn(),
      queueAlertEmailDigestItem: vi.fn(),
      claimDueAlertEmailDigests: vi.fn(),
      getAlertEmailDigest: vi.fn(),
      markAlertEmailDigestResult: vi.fn()
    },
    alertTransport: { deliver: vi.fn() }
  };
}
it("queues daily email while preserving live Slack and suppressing spikes in daily mode", async () => {
  const input = fixture();
  await processNextEvaluateAlertsJob(input);
  expect(input.notificationDaily.enqueue).toHaveBeenCalledWith(
    expect.objectContaining({
      recipient: "owner@example.com",
      schedule: { time: "09:00", timezone: "Europe/Ljubljana" }
    })
  );
  expect(input.alertStore.queueAlertEmailDigestItem).not.toHaveBeenCalled();
  expect(input.alertTransport.deliver).toHaveBeenCalledWith(
    expect.objectContaining({ channel: "slack" })
  );
  input.notificationDaily.enqueue.mockClear();
  input.queue.dequeue.mockResolvedValue({
    ...(await input.queue.dequeue()),
    condition_type: "error_spike"
  });
  await processNextEvaluateAlertsJob(input);
  expect(input.notificationDaily.enqueue).not.toHaveBeenCalled();
});
it("suppresses paused channels without creating intents and rechecks a newly paused direct destination", async () => {
  const input = fixture();
  input.notificationPreferences.decide.mockResolvedValue({
    mode: "off",
    reason: "account_paused",
    paused_until: null,
    daily: { time: "09:00", timezone: "UTC" }
  });
  await processNextEvaluateAlertsJob(input);
  expect(input.notificationDaily.enqueue).not.toHaveBeenCalled();
  expect(input.alertStore.createAlertDeliveryIntent).not.toHaveBeenCalled();
  input.notificationPreferences.decide
    .mockResolvedValueOnce({
      mode: "off",
      reason: "account_paused",
      paused_until: null,
      daily: { time: "09:00", timezone: "UTC" }
    })
    .mockResolvedValueOnce({
      mode: "immediate",
      reason: "account_default",
      paused_until: null,
      daily: { time: "09:00", timezone: "UTC" }
    });
  await processNextEvaluateAlertsJob(input);
  expect(input.alertTransport.deliver).not.toHaveBeenCalled();
  expect(input.alertStore.markAlertDeliveryResult).toHaveBeenCalledWith({
    delivery_id: "delivery",
    delivered: false,
    error_message: "notification_suppressed"
  });
});
it("retains the mandatory allowance notice when a new daily batch is blocked", async () => {
  const input = fixture();
  input.alertStore.listMatchingAlerts.mockResolvedValue([
    {
      alert_id: "email",
      channel: "email",
      cooldown_seconds: 0,
      config: { to: "owner@example.com" }
    }
  ]);
  input.notificationDaily.enqueue.mockResolvedValue({
    created_delivery: false,
    allowance_exhausted: true
  });
  const queueProjectOperationalEmailDelivery = vi.fn();
  await processNextEvaluateAlertsJob({
    ...input,
    billingStore: {
      getBillingSummaryForProject: vi.fn().mockResolvedValue({
        allowances: { monthly_alert_deliveries: { used: 10, limit: 10 } },
        usage_window: { starts_at: "2026-10-01T00:00:00Z", ends_at: "2026-11-01T00:00:00Z" }
      })
    },
    operationalEmailDeliveryStore: { queueProjectOperationalEmailDelivery }
  });
  expect(queueProjectOperationalEmailDelivery).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: "allowance_limit_reached",
      payload: expect.objectContaining({ used: 10, limit: 10 })
    })
  );
});
it("renders safe HTML and text for daily email with project grouping and incident links", async () => {
  const send = vi.fn();
  await createDailyNotificationTransport({
    emailTransport: { send },
    appBaseUrl: "https://app.debugbundle.com"
  })({
    recipient: "owner@example.com",
    total_incident_count: 30,
    items: [
      {
        incident_id: "incident",
        project_id: "project",
        project_name: "Checkout",
        occurred_at: "2026-10-18T10:00:00Z",
        condition_type: "new_incident",
        severity: "high",
        environment: "production",
        service_name: "api",
        summary: "<script>alert(1)</script> password=example-secret"
      }
    ]
  });
  const email = send.mock.calls[0]?.[0];
  expect(email.subject).toBe("[DebugBundle Daily] 30 new unresolved incidents");
  expect(email.html).toContain("Checkout");
  expect(email.text).toContain("Checkout");
  expect(email.html).not.toContain("<script>");
  expect(JSON.stringify(email)).not.toContain("example-secret");
  expect(email.text).toContain("https://app.debugbundle.com/incidents/incident");
});

it("handles missing email configuration and renders a single low-severity daily incident without links", async () => {
  const item = {
    incident_id: "i",
    project_id: "p",
    project_name: "App",
    occurred_at: "2026-10-18T10:00:00Z",
    condition_type: "new_incident",
    severity: "low",
    environment: "production",
    service_name: "web",
    summary: "Failure"
  };
  const input = { recipient: "owner@example.com", total_incident_count: 1, items: [item] };
  await expect(createDailyNotificationTransport({ emailTransport: null })(input)).rejects.toThrow(
    "notification_email_unavailable"
  );
  const send = vi.fn();
  await createDailyNotificationTransport({ emailTransport: { send } })(input);
  expect(send.mock.calls[0]?.[0].subject).toBe("[DebugBundle Daily] 1 new unresolved incident");
  expect(send.mock.calls[0]?.[0].text).not.toContain("/incidents/");
});
