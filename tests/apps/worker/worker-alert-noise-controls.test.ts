import { expect, it, vi } from "vitest";
import { processNextEvaluateAlertsJob } from "../../../apps/worker/src/processor-alerts.js";
import type { EvaluateAlertsWorkerDependencies } from "../../../apps/worker/src/processor-shared.js";
import { CreateAlertBodySchema } from "../../../apps/api/src/schemas.js";

it("accepts bounded email digest windows and project cooldowns through the public schema", () => {
  const base = {
    project_id: "00000000-0000-4000-8000-000000000001",
    condition_type: "new_incident",
    cooldown_seconds: 120
  };
  expect(
    CreateAlertBodySchema.safeParse({
      ...base,
      channel: "email",
      config: { to: "ops@example.com", aggregation_window_seconds: 30 }
    }).success
  ).toBe(true);
  expect(
    CreateAlertBodySchema.safeParse({
      ...base,
      channel: "webhook",
      config: { target_url: "https://example.com/alerts", cooldown_scope: "project" }
    }).success
  ).toBe(true);
  expect(
    CreateAlertBodySchema.safeParse({
      ...base,
      channel: "email",
      config: { to: "ops@example.com", aggregation_window_seconds: 10000 }
    }).success
  ).toBe(false);
});

it("applies an opt-in project rule cooldown across incidents while allowing higher severity through", async () => {
  const createAlertDeliveryIntent = vi
    .fn()
    .mockResolvedValue({ created: false, delivery_id: null });
  const run = async (incidentId: string, severity: string) =>
    processNextEvaluateAlertsJob({
      queue: {
        dequeue: vi.fn().mockResolvedValue({
          project_id: "project",
          incident_id: incidentId,
          condition_type: "new_incident",
          dedupe_key: "new_incident",
          notification_key: incidentId,
          occurred_at: "2026-09-22T10:00:00.000Z",
          service_name: "web",
          environment: "production",
          severity
        })
      },
      alertStore: {
        listMatchingAlerts: vi.fn().mockResolvedValue([
          {
            alert_id: "alert",
            channel: "webhook",
            config: { target_url: "https://example.com/alerts", cooldown_scope: "project" },
            cooldown_seconds: 120
          }
        ]),
        createAlertDeliveryIntent
      }
    } as unknown as EvaluateAlertsWorkerDependencies);
  await run("first", "low");
  await run("second", "low");
  await run("third", "high");
  expect(createAlertDeliveryIntent.mock.calls[0]![0].notification_key).toBe(
    createAlertDeliveryIntent.mock.calls[1]![0].notification_key
  );
  expect(createAlertDeliveryIntent.mock.calls[0]![0].notification_key).not.toBe(
    createAlertDeliveryIntent.mock.calls[2]![0].notification_key
  );
});

it("uses the configured digest window and keeps per-incident cooldown identity inside a resource burst", async () => {
  const queueAlertEmailDigestItem = vi
    .fn()
    .mockResolvedValue({ created: false, digest_id: null, created_digest: false });
  await processNextEvaluateAlertsJob({
    queue: {
      dequeue: vi.fn().mockResolvedValue({
        project_id: "project",
        incident_id: "incident",
        condition_type: "new_incident",
        dedupe_key: "new_incident",
        notification_key: "burst",
        coalescing_window_seconds: 10,
        coalescing_key: "burst",
        occurred_at: "2026-09-22T10:00:00.000Z",
        service_name: "web",
        environment: "production",
        severity: "low"
      })
    },
    alertStore: {
      listMatchingAlerts: vi.fn().mockResolvedValue([
        {
          alert_id: "alert",
          channel: "email",
          config: { to: "ops@example.com", aggregation_window_seconds: 30 },
          cooldown_seconds: 300
        }
      ]),
      queueAlertEmailDigestItem
    }
  } as unknown as EvaluateAlertsWorkerDependencies);
  expect(queueAlertEmailDigestItem).toHaveBeenCalledWith(
    expect.objectContaining({
      aggregation_window_seconds: 30,
      notification_key: "incident",
      cooldown_seconds: 300
    })
  );
});
