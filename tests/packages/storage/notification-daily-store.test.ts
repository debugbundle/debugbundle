import { describe, expect, it, vi } from "vitest";
import {
  createNotificationDailyStore,
  type DailyNotificationBatch
} from "../../../packages/storage/src/notification-daily-store.js";
import type { Queryable } from "../../../packages/storage/src/types.js";

const now = new Date("2026-10-19T08:00:00Z");
const schedule = { time: "09:00", timezone: "UTC" };
const batch: DailyNotificationBatch = {
  id: "batch",
  recipient: "ops@example.com",
  schedule_time: "09:00",
  schedule_timezone: "UTC",
  due_at: "2026-10-19T09:00:00.000Z",
  claim_token: "lease",
  attempts: 1,
  next_attempt_at: "2026-10-19T08:00:00.000Z"
};
const admission = {
  alert_id: "rule",
  incident_id: "incident",
  project_id: "project",
  recipient: batch.recipient,
  occurred_at: now.toISOString(),
  schedule,
  now
};

function database(...results: Record<string, unknown>[][]) {
  const query = vi
    .fn<(sql: string, params: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>()
    .mockResolvedValue({ rows: [] });
  for (const rows of results) query.mockResolvedValueOnce({ rows });
  const transaction = vi.fn();
  const db: Queryable = {
    query: query as Queryable["query"],
    async transaction(callback) {
      transaction();
      return callback({ query: query as Queryable["query"] });
    }
  };
  return { query, transaction, store: createNotificationDailyStore(db) };
}

describe("daily notification storage transaction boundaries", () => {
  it("charges and wakes only a newly admitted project contribution in one transaction", async () => {
    const db = database([], [{ id: "batch" }], [{ present: false }], [{ id: "item" }]);
    expect(await db.store.enqueue(admission)).toEqual({ created_delivery: true });
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(db.query.mock.calls[4]?.[1]).toEqual(["batch", "project", true]);
    expect(db.query.mock.calls[5]?.[1]).toEqual(["batch", now.toISOString()]);
  });

  it("refuses an exhausted allowance before writing an incident", async () => {
    const db = database([], [{ id: "batch" }], [{ present: false }]);
    expect(await db.store.enqueue({ ...admission, allow_new_delivery: false })).toEqual({
      created_delivery: false,
      allowance_exhausted: true
    });
    expect(db.query).toHaveBeenCalledTimes(3);
  });

  it("preserves a converted digest's accounting when a later incident is appended", async () => {
    const db = database(
      [],
      [{ id: "batch" }],
      [{ present: true, billable: false }],
      [{ id: "item" }]
    );
    expect(await db.store.enqueue(admission)).toEqual({ created_delivery: false });
    expect(db.query.mock.calls[3]?.[1]?.[7]).toBe(false);
    expect(db.query).toHaveBeenCalledTimes(4);
  });

  it("does not charge duplicate or ineligible incidents", async () => {
    const db = database([], [{ id: "batch" }], [{ present: false }], []);
    expect(await db.store.enqueue(admission)).toEqual({ created_delivery: false });
    expect(db.query).toHaveBeenCalledTimes(4);
  });

  it("moves a late admission to the next window before accounting for it", async () => {
    const db = database([], [], [{ id: "tomorrow" }], [{ present: false }], [{ id: "item" }]);
    expect(await db.store.enqueue({ ...admission, billable: false })).toEqual({
      created_delivery: false
    });
    expect(db.query.mock.calls[2]?.[1]?.[4]).toBe("2026-10-20T09:00:00.000Z");
    expect(db.query.mock.calls[5]?.[1]).toEqual(["tomorrow", "project", false]);
  });

  it("fails retryably if no writable admission window can be acquired", async () => {
    const db = database([], [], []);
    await expect(db.store.enqueue(admission)).rejects.toThrow("notification_batch_not_created");
    expect(db.query).toHaveBeenCalledTimes(3);
  });

  it("does not create target rows or accounting after losing the source lease", async () => {
    const db = database([], [], []);
    await db.store.reschedule(batch, "incident", { ...schedule, time: "08:00" }, now);
    expect(db.query).toHaveBeenCalledTimes(3);
    const scopes = db.query.mock.calls.slice(0, 2).map((call) => call[1]?.[0]);
    expect(scopes).toEqual([...scopes].sort());
  });

  it("preserves accounting when a reschedule falls beyond an already sending window", async () => {
    const leaseAt = new Date("2026-10-19T10:01:00Z");
    const db = database([], [], [{ id: batch.id }], [], [{ id: "tomorrow" }]);
    await db.store.reschedule(
      batch,
      "incident",
      { ...schedule, time: "10:00" },
      now,
      undefined,
      leaseAt
    );
    expect(db.query.mock.calls[4]?.[1]?.[4]).toBe("2026-10-20T10:00:00.000Z");
    expect(db.query.mock.calls[5]?.[1]).toEqual(["tomorrow", [batch.id], "incident"]);
    expect(db.query.mock.calls[6]?.[1]).toEqual([
      batch.id,
      batch.claim_token,
      "incident",
      "tomorrow"
    ]);
  });

  it("does not move items when both reschedule destinations are unavailable", async () => {
    const db = database([], [{ id: batch.id }], [], []);
    await expect(db.store.reschedule(batch, "incident", schedule, now, now)).rejects.toThrow(
      "notification_reschedule_failed"
    );
    expect(db.query).toHaveBeenCalledTimes(4);
  });

  it("surfaces database failures to the owning transaction", async () => {
    const db = database();
    db.query.mockRejectedValueOnce(new Error("database_unavailable"));
    await expect(db.store.enqueue(admission)).rejects.toThrow("database_unavailable");
    expect(db.transaction).toHaveBeenCalledOnce();
  });

  it("keeps page reads and lifecycle writes bound to the claim token", async () => {
    const db = database(
      [{ id: batch.id }],
      [],
      [{ incident_id: "incident" }],
      [],
      [{ revision: "v1" }],
      []
    );
    expect(await db.store.renew(batch, now)).toBe(true);
    expect(await db.store.renew(batch, now)).toBe(false);
    expect(await db.store.listItems(batch, "cursor")).toEqual([{ incident_id: "incident" }]);
    expect(await db.store.listLegacyDigestItems("legacy", null)).toEqual([]);
    expect(await db.store.policyRevision(batch)).toBe("v1");
    expect(await db.store.policyRevision(batch)).toBe("");
    await db.store.defer(batch, now, new Date(batch.due_at));
    await db.store.complete(batch, true);
    await db.store.complete(batch, false);
    await db.store.fail(batch, now);
    await db.store.cleanup();
    expect(db.query.mock.calls[2]?.[1]).toEqual([batch.id, batch.claim_token, "cursor"]);
    expect(db.query.mock.calls[6]?.[1]).toEqual([
      batch.id,
      batch.claim_token,
      now.toISOString(),
      batch.due_at,
      batch.next_attempt_at
    ]);
    expect(db.query.mock.calls[7]?.[1]).toEqual([batch.id, batch.claim_token, "delivered"]);
    expect(db.query.mock.calls[8]?.[1]).toEqual([batch.id, batch.claim_token, "suppressed"]);
    expect(db.query.mock.calls[9]?.[1]).toEqual([batch.id, batch.claim_token, now.toISOString()]);
  });
});

describe("daily notification claims", () => {
  it("does not acquire group locks when there is no candidate", async () => {
    const db = database([]);
    expect(await db.store.claim(now)).toBeNull();
    expect(db.query).toHaveBeenCalledOnce();
  });

  it.each([
    { rows: [{ ...batch, active: true, ready: true }] },
    { rows: [{ ...batch, active: false, ready: false }] },
    { rows: [] }
  ])("rechecks availability after acquiring the group lock: %j", async ({ rows }) => {
    const db = database([batch], [], rows);
    expect(await db.store.claim(now)).toBeNull();
    expect(db.query).toHaveBeenCalledTimes(3);
  });

  it("coalesces missed due windows while preserving usage before issuing a new lease", async () => {
    const later = new Date("2026-10-20T09:00:00Z");
    const db = database(
      [batch],
      [],
      [
        { ...batch, active: false, ready: true },
        { ...batch, id: "other", active: false, ready: true },
        { ...batch, id: "future", due_at: "2026-10-21T09:00:00Z", active: false, ready: false }
      ],
      [],
      [],
      [],
      [{ ...batch, claim_token: "new" }]
    );
    expect(await db.store.claim(later)).toMatchObject({ claim_token: "new" });
    expect(db.query.mock.calls[3]?.[1]).toEqual([batch.id, ["other"], null]);
    expect(db.query.mock.calls[4]?.[1]).toEqual([batch.id, ["other"]]);
    expect(db.query.mock.calls[5]?.[1]).toEqual([["other"]]);
    expect(db.query.mock.calls[6]?.[1]?.[1]).not.toBe(batch.claim_token);
  });

  it("keeps other windows separate when claiming a future batch for policy review", async () => {
    const db = database(
      [batch],
      [],
      [
        { ...batch, active: false, ready: true },
        { ...batch, id: "older", due_at: "2026-10-18T09:00:00Z", active: false, ready: true }
      ],
      [batch]
    );
    expect(await db.store.claim(now)).toEqual(batch);
    expect(db.query).toHaveBeenCalledTimes(4);
  });
});
