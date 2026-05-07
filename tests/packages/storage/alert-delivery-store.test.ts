import { describe, expect, it, vi } from "vitest";

import { createPostgresAlertDeliveryStore } from "../../../packages/storage/src/alert-delivery-store.js";

describe("alert delivery store", () => {
  it("lists matching enabled alerts for a project condition with service and severity filtering", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          alert_id: "alt_1",
          project_id: "proj_123",
          service_id: null,
          channel: "webhook",
          condition_type: "severity_threshold",
          severity_min: "medium",
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
        service_id: null,
        channel: "webhook",
        condition_type: "severity_threshold",
        severity_min: "medium",
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
      channel: "webhook",
      payload: { incident_id: "inc_123" }
    });
    const duplicate = await store.createAlertDeliveryIntent({
      alert_id: "alt_123",
      project_id: "proj_123",
      incident_id: "inc_123",
      condition_type: "new_incident",
      dedupe_key: "new_incident",
      channel: "webhook",
      payload: { incident_id: "inc_123" }
    });

    expect(created).toEqual({ delivery_id: "ad_123", created: true });
    expect(duplicate).toEqual({ delivery_id: null, created: false });
  });

  it("marks alert deliveries delivered or failed", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ status: "delivered" }] })
      .mockResolvedValueOnce({ rows: [{ status: "failed" }] });

    const store = createPostgresAlertDeliveryStore({ query });
    const delivered = await store.markAlertDeliveryResult({
      delivery_id: "ad_123",
      delivered: true,
      error_message: null
    });
    const failed = await store.markAlertDeliveryResult({
      delivery_id: "ad_124",
      delivered: false,
      error_message: "alert_channel_not_supported:email"
    });

    expect(delivered).toEqual({ status: "delivered" });
    expect(failed).toEqual({ status: "failed" });
  });
});
