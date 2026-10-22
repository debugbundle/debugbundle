import { expect, it, vi } from "vitest";
import {
  isCompletedManagedSchedule,
  readCompletedManagedSchedule,
  releaseCompletedManagedSchedule
} from "../../../packages/billing/src/stripe-completed-schedule.js";

function fixture() {
  const sub = {
    id: "sub_test",
    schedule: "sched_test",
    items: { has_more: false, data: [{ price: { id: "price_solo" }, quantity: 1 }] }
  };
  const schedule = {
    id: "sched_test",
    subscription: sub.id,
    status: "active",
    end_behavior: "release",
    metadata: { organization_id: "org_test", debugbundle_change: "plan_downgrade" },
    current_phase: { start_date: 20, end_date: 30 },
    phases: [
      { start_date: 10, end_date: 20, items: [{ price: "price_team", quantity: 1 }] },
      { start_date: 20, end_date: 30, items: [{ price: "price_solo", quantity: 1 }] }
    ]
  };
  const client = {
    subscriptionSchedules: {
      retrieve: vi.fn(async () => schedule),
      release: vi.fn(async () => ({ status: "released", released_subscription: sub.id }))
    }
  };
  return {
    sub,
    schedule,
    client,
    run: () =>
      releaseCompletedManagedSchedule({
        client: client as never,
        subscription: sub as never,
        organizationId: "org_test",
        scheduleId: "sched_test",
        idempotencyKey: "stable"
      })
  };
}
it("releases only an owned final phase already applied to the subscription", async () => {
  const f = fixture();
  expect(await readCompletedManagedSchedule(f.client as never, f.sub as never, "org_test")).toBe(
    "sched_test"
  );
  expect(await f.run()).toBe(true);
  expect(f.client.subscriptionSchedules.release).toHaveBeenCalledExactlyOnceWith(
    "sched_test",
    {},
    expect.objectContaining({ idempotencyKey: "stable" })
  );
});
it.each(["future", "foreign", "different_items", "cancel_end", "partial", "other_subscription"])(
  "refuses to release %s schedules",
  async (reason) => {
    const f = fixture();
    if (reason === "future")
      f.schedule.phases.push({
        start_date: 30,
        end_date: 40,
        items: [{ price: "price_team", quantity: 1 }]
      });
    if (reason === "foreign") f.schedule.metadata.organization_id = "org_other";
    if (reason === "different_items") f.sub.items.data[0]!.quantity = 7;
    if (reason === "cancel_end") f.schedule.end_behavior = "cancel";
    if (reason === "partial") f.sub.items.has_more = true;
    if (reason === "other_subscription") f.schedule.subscription = "sub_other";
    expect(await f.run()).toBe(false);
    expect(f.client.subscriptionSchedules.release).not.toHaveBeenCalled();
  }
);
it("reconciles a previously released schedule without another release", async () => {
  const f = fixture();
  Object.assign(f.schedule, { status: "released", released_subscription: f.sub.id });
  expect(await f.run()).toBe(true);
  expect(f.client.subscriptionSchedules.release).not.toHaveBeenCalled();
  expect(isCompletedManagedSchedule(f.sub as never, f.schedule as never, "org_test")).toBe(false);
});
