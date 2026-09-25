import { describe, expect, it, vi } from "vitest";
import { processNextDeliverAlertEmailDigestJob, processNextEvaluateAlertsJob } from "../../../apps/worker/src/processor-alerts.js";
import { AlertDeliveryError } from "../../../apps/worker/src/processor-shared.js";

function directFixture() {
  const rule = {
    alert_id: "alert_1", project_id: "project_1", created_by_user_id: "user_1",
    service_id: null, channel: "webhook" as const, condition_type: "new_incident" as const,
    severity_min: null, severity_lifecycle_scope: null, cooldown_seconds: 0,
    config: { target_url: "https://receiver.example/alerts" }, signing_secret: "test-signing-key",
    is_enabled: true, created_at: "2026-09-25T00:00:00Z", updated_at: "2026-09-25T00:00:00Z"
  };
  const dependencies = {
    queue: {
      getActiveJobId: () => "durable_evaluation_owner",
      enqueue: vi.fn(),
      dequeue: vi.fn().mockResolvedValue({
        project_id: "project_1", incident_id: "incident_1", condition_type: "new_incident",
        dedupe_key: "new_incident", occurred_at: "2026-09-25T00:00:00Z",
        service_name: "checkout", environment: "production", severity: "high"
      })
    },
    alertStore: {
      listMatchingAlerts: vi.fn().mockResolvedValue([rule]),
      createAlertDeliveryIntent: vi.fn().mockResolvedValue({ delivery_id: "delivery_1", created: true }),
      markAlertDeliveryResult: vi.fn().mockResolvedValue({ status: "delivered" }),
      queueAlertEmailDigestItem: vi.fn().mockResolvedValue({ digest_id: "digest_1", created: true, created_digest: true }),
      claimDueAlertEmailDigests: vi.fn(), getAlertEmailDigest: vi.fn(), markAlertEmailDigestResult: vi.fn()
    },
    alertTransport: { deliver: vi.fn().mockResolvedValue(undefined) },
    accountAnalyticsStore: { recordMetricDeltas: vi.fn().mockResolvedValue(undefined) },
    resolveOrganizationIdForProject: vi.fn().mockResolvedValue("organization_1")
  };
  return { rule, dependencies };
}

function emailFixture() {
  const digest = {
    digest: {
      digest_id: "digest_1", project_id: "project_1", recipient: "alerts@example.com",
      status: "pending" as "pending" | "failed" | "delivered",
      next_attempt_at: "2026-09-25T00:00:10Z", claimed_at: "2026-09-25T00:00:10Z",
      last_error: null, delivered_at: null, created_at: "2026-09-25T00:00:00Z", updated_at: "2026-09-25T00:00:00Z"
    },
    total_incident_count: 2,
    items: [{
      item_id: "item_1", digest_id: "digest_1", alert_id: "alert_1", project_id: "project_1",
      incident_id: "incident_1", condition_type: "new_incident" as const,
      condition_types: ["new_incident", "severity_threshold"], dedupe_key: "new_incident",
      notification_key: "incident_1", payload: { severity: "high" }, created_at: "2026-09-25T00:00:00Z"
    }]
  };
  const dependencies = {
    queue: { enqueue: vi.fn(), dequeue: vi.fn().mockResolvedValue({ digest_id: "digest_1" }) },
    alertStore: {
      getAlertEmailDigest: vi.fn().mockResolvedValue(digest),
      markAlertEmailDigestResult: vi.fn().mockResolvedValue({ status: "delivered" })
    },
    alertEmailDigestTransport: { deliver: vi.fn().mockResolvedValue(undefined) },
    accountAnalyticsStore: { recordMetricDeltas: vi.fn().mockResolvedValue(undefined) },
    resolveOrganizationIdForProject: vi.fn().mockResolvedValue("organization_1")
  };
  return { digest, dependencies };
}

const providerFailures = [
  { label: "timeout", error: new AlertDeliveryError("alert_timeout"), code: "alert_timeout" },
  { label: "rate limit", error: new AlertDeliveryError("alert_http_error_429"), code: "alert_http_error_429" },
  { label: "server error", error: new AlertDeliveryError("alert_http_error_503"), code: "alert_http_error_503" },
  { label: "blocked target", error: new AlertDeliveryError("alert_target_blocked"), code: "alert_target_blocked" },
  { label: "arbitrary exception", error: new Error("POST https://secret:password@receiver.example/?token=private failed"), code: "alert_delivery_transport_failed" },
  { label: "untrusted typed exception", error: new AlertDeliveryError("alert_http_error_503?token=private"), code: "alert_delivery_transport_failed" },
  { label: "non-error rejection", error: { token: "private", url: "https://receiver.example/private" }, code: "alert_delivery_transport_failed" }
];

describe("alert provider failures and retries", () => {
  it.each(providerFailures)("persists only a safe direct-provider diagnostic for $label", async ({ error, code }) => {
    const { dependencies } = directFixture();
    dependencies.alertTransport.deliver.mockRejectedValue(error);
    await expect(processNextEvaluateAlertsJob(dependencies)).rejects.toMatchObject({ name: "AlertDeliveryError", message: code });
    expect(dependencies.alertStore.markAlertDeliveryResult).toHaveBeenCalledExactlyOnceWith({
      delivery_id: "delivery_1", delivered: false, error_message: code
    });
    expect(dependencies.accountAnalyticsStore.recordMetricDeltas).toHaveBeenLastCalledWith(expect.objectContaining({
      dedupe_key: "alert_delivery_result:delivery_1:failed", deltas: { alert_deliveries_failed: 1 }
    }));
  });

  it.each(providerFailures)("retains the email digest for retry with a safe diagnostic for $label", async ({ error, code }) => {
    const { dependencies } = emailFixture();
    dependencies.alertEmailDigestTransport.deliver.mockRejectedValue(error);
    await expect(processNextDeliverAlertEmailDigestJob(dependencies)).rejects.toMatchObject({ name: "AlertDeliveryError", message: code });
    expect(dependencies.alertStore.markAlertEmailDigestResult).toHaveBeenCalledExactlyOnceWith({
      digest_id: "digest_1", delivered: false, error_message: code
    });
    expect(dependencies.accountAnalyticsStore.recordMetricDeltas).not.toHaveBeenCalled();
  });

  it("attempts later direct rules and queues email before surfacing the first provider failure", async () => {
    const { dependencies, rule } = directFixture();
    dependencies.alertStore.listMatchingAlerts.mockResolvedValue([
      rule, { ...rule, alert_id: "alert_2" }, { ...rule, alert_id: "alert_3" },
      { ...rule, alert_id: "email_rule", channel: "email", config: { to: "alerts@example.com" } }
    ]);
    dependencies.alertStore.createAlertDeliveryIntent
      .mockResolvedValueOnce({ delivery_id: "delivery_1", created: true })
      .mockResolvedValueOnce({ delivery_id: "delivery_2", created: true })
      .mockResolvedValueOnce({ delivery_id: "delivery_3", created: true });
    dependencies.alertTransport.deliver
      .mockRejectedValueOnce(new AlertDeliveryError("alert_timeout"))
      .mockRejectedValueOnce(new AlertDeliveryError("alert_http_error_503"));
    await expect(processNextEvaluateAlertsJob(dependencies)).rejects.toThrow("alert_timeout");
    expect(dependencies.alertTransport.deliver.mock.calls.map((call): unknown => call[0].alert_id))
      .toEqual(["alert_1", "alert_2", "alert_3"]);
    expect(dependencies.alertStore.markAlertDeliveryResult.mock.calls.map((call): unknown => call[0]))
      .toEqual([
        { delivery_id: "delivery_1", delivered: false, error_message: "alert_timeout" },
        { delivery_id: "delivery_2", delivered: false, error_message: "alert_http_error_503" },
        { delivery_id: "delivery_3", delivered: true, error_message: null }
      ]);
    expect(dependencies.alertStore.queueAlertEmailDigestItem).toHaveBeenCalledOnce();
  });

  it("retries the owning direct intent after allowance exhaustion without charging another delivery", async () => {
    const { dependencies } = directFixture();
    dependencies.alertStore.createAlertDeliveryIntent.mockResolvedValue({ delivery_id: "delivery_1", created: false });
    await expect(processNextEvaluateAlertsJob({
      ...dependencies,
      billingStore: { getBillingSummaryForProject: vi.fn().mockResolvedValue({
        allowances: { monthly_alert_deliveries: { limit: 10, used: 10 } },
        usage_window: { starts_at: "2026-09-01T00:00:00Z", ends_at: "2026-10-01T00:00:00Z" }
      }) }
    })).resolves.toEqual({ processed: true });
    expect(dependencies.alertStore.createAlertDeliveryIntent).toHaveBeenCalledWith(expect.objectContaining({
      evaluation_job_id: "durable_evaluation_owner", allow_new_delivery: false
    }));
    expect(dependencies.alertTransport.deliver).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      delivery_id: "delivery_1", signing_secret: "test-signing-key"
    }));
    expect(dependencies.accountAnalyticsStore.recordMetricDeltas).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      dedupe_key: "alert_delivery_result:delivery_1:delivered", deltas: { alert_deliveries_delivered: 1 }
    }));
  });

  it("retries a failed digest under the same identity and preserves the bounded incident summary", async () => {
    const { digest, dependencies } = emailFixture();
    digest.digest.status = "failed";
    await expect(processNextDeliverAlertEmailDigestJob(dependencies)).resolves.toEqual({ processed: true });
    expect(dependencies.alertEmailDigestTransport.deliver).toHaveBeenCalledExactlyOnceWith({
      digest_id: "digest_1", project_id: "project_1", recipient: "alerts@example.com", total_incident_count: 2,
      items: [{ incident_id: "incident_1", condition_type: "new_incident",
        condition_types: ["new_incident", "severity_threshold"], payload: { severity: "high" } }]
    });
    expect(dependencies.alertStore.markAlertEmailDigestResult).toHaveBeenCalledExactlyOnceWith({
      digest_id: "digest_1", delivered: true, error_message: null
    });
  });

  it("does not label a direct send as provider-failed when recording its success fails", async () => {
    const { dependencies } = directFixture();
    dependencies.alertStore.markAlertDeliveryResult.mockRejectedValue(new Error("database_unavailable"));
    await expect(processNextEvaluateAlertsJob(dependencies)).rejects.toThrow("database_unavailable");
    expect(dependencies.alertStore.markAlertDeliveryResult).toHaveBeenCalledExactlyOnceWith({
      delivery_id: "delivery_1", delivered: true, error_message: null
    });
  });

  it("does not label an email send as provider-failed when recording its success fails", async () => {
    const { dependencies } = emailFixture();
    dependencies.alertStore.markAlertEmailDigestResult.mockRejectedValue(new Error("database_unavailable"));
    await expect(processNextDeliverAlertEmailDigestJob(dependencies)).rejects.toThrow("database_unavailable");
    expect(dependencies.alertStore.markAlertEmailDigestResult).toHaveBeenCalledExactlyOnceWith({
      digest_id: "digest_1", delivered: true, error_message: null
    });
  });

  it("preserves sent state when accounting is temporarily unavailable", async () => {
    const direct = directFixture().dependencies;
    const email = emailFixture().dependencies;
    direct.accountAnalyticsStore.recordMetricDeltas.mockRejectedValue(new Error("accounting_unavailable"));
    email.accountAnalyticsStore.recordMetricDeltas.mockRejectedValue(new Error("accounting_unavailable"));
    await expect(processNextEvaluateAlertsJob(direct)).resolves.toEqual({ processed: true });
    await expect(processNextDeliverAlertEmailDigestJob(email)).resolves.toEqual({ processed: true });
    expect(direct.alertStore.markAlertDeliveryResult).toHaveBeenCalledExactlyOnceWith({
      delivery_id: "delivery_1", delivered: true, error_message: null
    });
    expect(email.alertStore.markAlertEmailDigestResult).toHaveBeenCalledExactlyOnceWith({
      digest_id: "digest_1", delivered: true, error_message: null
    });
  });

  it("does not deliver a missing or already sent digest, or mark an idle queue", async () => {
    const { digest, dependencies } = emailFixture();
    dependencies.queue.dequeue.mockResolvedValueOnce(null);
    await expect(processNextDeliverAlertEmailDigestJob(dependencies)).resolves.toEqual({ processed: false, reason: "no_jobs" });
    dependencies.alertStore.getAlertEmailDigest.mockResolvedValueOnce(null);
    await expect(processNextDeliverAlertEmailDigestJob(dependencies)).resolves.toEqual({ processed: true });
    digest.digest.status = "delivered";
    await expect(processNextDeliverAlertEmailDigestJob(dependencies)).resolves.toEqual({ processed: true });
    expect(dependencies.alertEmailDigestTransport.deliver).not.toHaveBeenCalled();
    expect(dependencies.alertStore.markAlertEmailDigestResult).not.toHaveBeenCalled();
  });

  it("finishes an empty retained digest with a bounded diagnostic and no provider call", async () => {
    const { digest, dependencies } = emailFixture();
    digest.items = [];
    await expect(processNextDeliverAlertEmailDigestJob(dependencies)).resolves.toEqual({ processed: true });
    expect(dependencies.alertEmailDigestTransport.deliver).not.toHaveBeenCalled();
    expect(dependencies.alertStore.markAlertEmailDigestResult).toHaveBeenCalledExactlyOnceWith({
      digest_id: "digest_1", delivered: false, error_message: "alert_email_digest_empty"
    });
  });
});
