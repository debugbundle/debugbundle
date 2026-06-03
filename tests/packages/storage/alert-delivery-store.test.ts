import { describe, expect, it, vi } from "vitest";

import { createPostgresAlertDeliveryStore } from "../../../packages/storage/src/alert-delivery-store.js";

describe("alert delivery store", () => {
  it("lists matching enabled alerts for a project condition with service and severity filtering", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          alert_id: "alt_1",
          project_id: "proj_123",
          created_by_user_id: "usr_123",
          service_id: null,
          channel: "webhook",
          condition_type: "severity_threshold",
          severity_min: "medium",
          cooldown_seconds: 0,
          config: { target_url: "https://hooks.example.test/alerts" },
          is_enabled: true,
          created_at: "2026-03-15T00:00:00.000Z",
          updated_at: "2026-03-15T00:00:00.000Z"
        }
      ]
    });

    const store = createPostgresAlertDeliveryStore({ query });
    const alerts = await store.listMatchingAlerts({
      project_id: "proj_123",
      condition_type: "severity_threshold",
      service_name: "checkout-api",
      environment: "production",
      severity: "high"
    });

    expect(alerts).toEqual([
      {
        alert_id: "alt_1",
        project_id: "proj_123",
        created_by_user_id: "usr_123",
        service_id: null,
        channel: "webhook",
        condition_type: "severity_threshold",
        severity_min: "medium",
        cooldown_seconds: 0,
        config: { target_url: "https://hooks.example.test/alerts" },
        is_enabled: true,
        created_at: "2026-03-15T00:00:00.000Z",
        updated_at: "2026-03-15T00:00:00.000Z"
      }
    ]);
    expect(query).toHaveBeenCalledOnce();
  });

  it("creates deduplicated alert delivery intents", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ delivery_id: "ad_123" }] })
      .mockResolvedValueOnce({ rows: [] });

    const store = createPostgresAlertDeliveryStore({ query });

    const created = await store.createAlertDeliveryIntent({
      alert_id: "alt_123",
      project_id: "proj_123",
      incident_id: "inc_123",
      condition_type: "new_incident",
      dedupe_key: "new_incident",
      notification_key: "new_incident",
      cooldown_seconds: 0,
      channel: "webhook",
      payload: { incident_id: "inc_123" }
    });
    const duplicate = await store.createAlertDeliveryIntent({
      alert_id: "alt_123",
      project_id: "proj_123",
      incident_id: "inc_123",
      condition_type: "new_incident",
      dedupe_key: "new_incident",
      notification_key: "new_incident",
      cooldown_seconds: 0,
      channel: "webhook",
      payload: { incident_id: "inc_123" }
    });

    expect(created).toEqual({ delivery_id: "ad_123", created: true });
    expect(duplicate).toEqual({ delivery_id: null, created: false });
  });

  it("queues email digest items and reports whether a new digest was created", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValueOnce({
      rows: [{ digest_id: "dig_123", created: true, created_digest: true }]
    });

    const store = createPostgresAlertDeliveryStore({ query });

    const result = await store.queueAlertEmailDigestItem({
      alert_id: "alt_123",
      project_id: "proj_123",
      incident_id: "inc_123",
      condition_type: "new_incident",
      dedupe_key: "new_incident",
      notification_key: "new_incident",
      cooldown_seconds: 0,
      recipient: "team@example.com",
      payload: { incident_id: "inc_123" },
      aggregation_window_seconds: 10,
      allow_new_digest: true
    });

    expect(result).toEqual({
      digest_id: "dig_123",
      created: true,
      created_digest: true
    });
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[0]).toContain("WITH cooldown_lock AS");
    expect(query.mock.calls[0]?.[0]).toContain("WHERE $12::boolean = true");
    expect(query.mock.calls[0]?.[0]).toContain("DO UPDATE SET\n              updated_at = now()");
    expect(query.mock.calls[0]?.[0]).not.toContain("BEGIN");
    expect(query.mock.calls[0]?.[1]?.[9]).toBe(JSON.stringify({ incident_id: "inc_123" }));
    expect(query.mock.calls[0]?.[1]?.[11]).toBe(true);
  });

  it("does not create a new digest when quota is exhausted and no pending digest exists", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValueOnce({
      rows: [{ digest_id: null, created: false, created_digest: false }]
    });

    const store = createPostgresAlertDeliveryStore({ query });

    const result = await store.queueAlertEmailDigestItem({
      alert_id: "alt_123",
      project_id: "proj_123",
      incident_id: "inc_123",
      condition_type: "new_incident",
      dedupe_key: "new_incident",
      notification_key: "new_incident",
      cooldown_seconds: 0,
      recipient: "team@example.com",
      payload: { incident_id: "inc_123" },
      aggregation_window_seconds: 10,
      allow_new_digest: false
    });

    expect(result).toEqual({
      digest_id: null,
      created: false,
      created_digest: false
    });
  });

  it("claims due email digests and loads them with ordered items", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ digest_id: "dig_123" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            digest_id: "dig_123",
            project_id: "proj_123",
            recipient: "team@example.com",
            status: "pending",
            next_attempt_at: "2026-05-17T10:00:10.000Z",
            claimed_at: "2026-05-17T10:00:11.000Z",
            last_error: null,
            delivered_at: null,
            created_at: "2026-05-17T10:00:00.000Z",
            updated_at: "2026-05-17T10:00:11.000Z"
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            item_id: "item_1",
            digest_id: "dig_123",
            alert_id: "alt_1",
            project_id: "proj_123",
            incident_id: "inc_1",
            condition_type: "new_incident",
            dedupe_key: "new_incident",
            notification_key: "new_incident",
            payload: { incident_id: "inc_1" },
            created_at: "2026-05-17T10:00:00.000Z"
          }
        ]
      });

    const store = createPostgresAlertDeliveryStore({ query });

    await expect(store.claimDueAlertEmailDigests(10)).resolves.toEqual([{ digest_id: "dig_123" }]);
    await expect(store.getAlertEmailDigest("dig_123")).resolves.toEqual({
      digest: {
        digest_id: "dig_123",
        project_id: "proj_123",
        recipient: "team@example.com",
        status: "pending",
        next_attempt_at: "2026-05-17T10:00:10.000Z",
        claimed_at: "2026-05-17T10:00:11.000Z",
        last_error: null,
        delivered_at: null,
        created_at: "2026-05-17T10:00:00.000Z",
        updated_at: "2026-05-17T10:00:11.000Z"
      },
      items: [
        {
          item_id: "item_1",
          digest_id: "dig_123",
          alert_id: "alt_1",
          project_id: "proj_123",
          incident_id: "inc_1",
          condition_type: "new_incident",
          dedupe_key: "new_incident",
          notification_key: "new_incident",
          payload: { incident_id: "inc_1" },
          created_at: "2026-05-17T10:00:00.000Z"
        }
      ]
    });
  });

  it("marks alert deliveries and email digests delivered or failed", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ status: "delivered" }] })
      .mockResolvedValueOnce({ rows: [{ status: "failed" }] })
      .mockResolvedValueOnce({ rows: [{ status: "delivered" }] });

    const store = createPostgresAlertDeliveryStore({ query });
    const delivered = await store.markAlertDeliveryResult({
      delivery_id: "ad_123",
      delivered: true,
      error_message: null
    });
    const failed = await store.markAlertDeliveryResult({
      delivery_id: "ad_124",
      delivered: false,
      error_message: "alert_channel_not_supported:webhook"
    });
    const digestDelivered = await store.markAlertEmailDigestResult({
      digest_id: "dig_123",
      delivered: true,
      error_message: null
    });

    expect(delivered).toEqual({ status: "delivered" });
    expect(failed).toEqual({ status: "failed" });
    expect(digestDelivered).toEqual({ status: "delivered" });
  });
});
