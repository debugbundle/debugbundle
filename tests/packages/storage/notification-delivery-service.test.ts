import { expect, it, vi } from "vitest";
import { deliverNextDailyNotification } from "../../../packages/storage/src/notification-delivery-service.js";
const batch = {
  id: "batch",
  recipient: "owner@example.com",
  schedule_time: "09:00",
  schedule_timezone: "UTC",
  due_at: "2026-10-19T09:00:00Z",
  claim_token: "claim",
  attempts: 1
};
function fixture() {
  const store = {
    policyRevision: vi.fn().mockResolvedValue("same"),
    defer: vi.fn(),
    claim: vi.fn().mockResolvedValue(batch),
    renew: vi.fn().mockResolvedValue(true),
    listItems: vi.fn().mockResolvedValue([]),
    complete: vi.fn(),
    fail: vi.fn(),
    reschedule: vi.fn(),
    cleanup: vi.fn(),
    enqueue: vi.fn(),
    listLegacyDigestItems: vi.fn()
  };
  const preferences = {
    decide: vi.fn().mockResolvedValue({ mode: "daily", daily: { time: "09:00", timezone: "UTC" } })
  };
  const deliver = vi.fn();
  return { store, preferences, deliver, now: new Date(batch.due_at) };
}
it("skips empty/suppressed digests and fences stale workers", async () => {
  const input = fixture();
  await deliverNextDailyNotification(input);
  expect(input.deliver).not.toHaveBeenCalled();
  expect(input.store.complete).toHaveBeenCalledWith(batch, false);
  input.store.complete.mockClear();
  input.store.renew.mockResolvedValue(false);
  await deliverNextDailyNotification(input);
  expect(input.store.complete).not.toHaveBeenCalled();
});
it("keeps counts exact, previews bounded and provider failures retryable", async () => {
  const input = fixture();
  input.store.listItems.mockResolvedValue(
    Array.from({ length: 30 }, (_, index) => ({
      incident_id: String(index),
      project_id: "project",
      project_name: "App",
      occurred_at: "2026-10-18T12:00:00Z",
      severity: index === 29 ? "critical" : "low",
      condition_type: "new_incident",
      summary: "Failure",
      service_name: "api",
      environment: "production"
    }))
  );
  input.deliver.mockRejectedValueOnce(new Error("secret-provider-error"));
  await deliverNextDailyNotification(input);
  expect(input.deliver.mock.calls[0]?.[0]).toMatchObject({ total_incident_count: 30 });
  expect(input.deliver.mock.calls[0]?.[0].items).toHaveLength(25);
  expect(input.deliver.mock.calls[0]?.[0].items[0].severity).toBe("critical");
  expect(input.store.fail).toHaveBeenCalledWith(batch, input.now);
  expect(input.store.complete).not.toHaveBeenCalled();
});

it("rebuilds after concurrent preference changes without consuming a provider retry", async () => {
  const input = fixture();
  input.store.policyRevision.mockResolvedValueOnce("old").mockResolvedValueOnce("new");
  await deliverNextDailyNotification(input);
  expect(input.deliver).not.toHaveBeenCalled();
  expect(input.store.defer).toHaveBeenCalledWith(batch, input.now);
  expect(input.store.complete).not.toHaveBeenCalled();
  expect(input.store.fail).not.toHaveBeenCalled();
});
it("reschedules pending incidents when the daily time or timezone changes", async () => {
  const input = fixture();
  input.store.listItems.mockResolvedValue([
    { incident_id: "incident", project_id: "project", occurred_at: "2026-10-18T12:00:00Z" }
  ]);
  input.preferences.decide.mockResolvedValue({
    mode: "daily",
    daily: { time: "08:00", timezone: "Europe/Ljubljana" }
  });
  await deliverNextDailyNotification(input);
  expect(input.store.reschedule).toHaveBeenCalledWith(
    batch,
    "incident",
    { time: "08:00", timezone: "Europe/Ljubljana" },
    input.now,
    undefined,
    input.now
  );
  expect(input.deliver).not.toHaveBeenCalled();
});

it("handles idle queues and policies switched out of daily mode without sending", async () => {
  const input = fixture();
  input.store.claim.mockResolvedValueOnce(null);
  expect(await deliverNextDailyNotification(input)).toBe(false);
  input.store.listItems.mockResolvedValue([
    { incident_id: "incident", project_id: "project", occurred_at: "2026-10-18T12:00:00Z" }
  ]);
  input.preferences.decide.mockResolvedValue({
    mode: "off",
    daily: { time: "09:00", timezone: "UTC" }
  });
  await deliverNextDailyNotification({ ...input, now: new Date("2026-10-19T09:00:00Z") });
  expect(input.deliver).not.toHaveBeenCalled();
  expect(input.store.complete).toHaveBeenCalledWith(batch, false);
});
it("pages a large digest with a bounded preview and checks the lease again before sending", async () => {
  const input = fixture();
  const item = (id: string) => ({
    incident_id: id,
    project_id: "project",
    project_name: "App",
    occurred_at: "2026-10-18T12:00:00Z",
    severity: "high",
    condition_type: "new_incident",
    summary: "Failure",
    service_name: "api",
    environment: "production"
  });
  input.store.listItems
    .mockResolvedValueOnce(Array.from({ length: 250 }, (_, index) => item(String(index))))
    .mockResolvedValueOnce([item("last")]);
  await deliverNextDailyNotification(input);
  expect(input.deliver.mock.calls[0]?.[0].total_incident_count).toBe(251);
  expect(input.deliver.mock.calls[0]?.[0].items).toHaveLength(25);
  expect(input.store.listItems).toHaveBeenLastCalledWith(batch, "249");
  input.deliver.mockClear();
  input.store.renew.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  input.store.listItems.mockResolvedValue([item("one")]);
  await deliverNextDailyNotification(input);
  expect(input.deliver).not.toHaveBeenCalled();
});
