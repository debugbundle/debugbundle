import { expect, it, vi } from "vitest";
import { filterNotificationDigest } from "../../../packages/storage/src/notification-legacy-delivery.js";
it("filters and moves every member across pages while retaining an exact, prioritized immediate preview", async () => {
  const items = Array.from({ length: 251 }, (_, index) => ({
    incident_id: String(index),
    project_id: "project",
    alert_ids: ["rule-one", "rule-two"],
    created_at: "2026-10-18T12:00:00Z",
    payload: { severity: index === 249 ? "critical" : "low" },
    condition_types: index === 1 ? ["error_spike"] : index === 3 ? undefined : ["new_incident"]
  }));
  const daily = {
    listLegacyDigestItems: vi
      .fn()
      .mockResolvedValueOnce(items.slice(0, 250))
      .mockResolvedValueOnce(items.slice(250)),
    enqueue: vi.fn()
  };
  const preferences = {
    decide: vi.fn(async ({ incident_id }: { incident_id?: string }) => ({
      mode:
        incident_id === "0"
          ? ("off" as const)
          : ["1", "2", "3"].includes(incident_id!)
            ? ("daily" as const)
            : ("immediate" as const),
      reason: "account_default" as const,
      paused_until: null,
      daily: { time: "09:00", timezone: "UTC" }
    }))
  };
  const result = await filterNotificationDigest({
    digestId: "digest",
    recipient: "owner@example.com",
    daily,
    preferences
  });
  expect(result.total).toBe(247);
  expect(result.items).toHaveLength(25);
  expect(result.items[0]?.incident_id).toBe("249");
  expect(daily.enqueue).toHaveBeenCalledTimes(2);
  expect(daily.listLegacyDigestItems).toHaveBeenLastCalledWith("digest", "249");
});
