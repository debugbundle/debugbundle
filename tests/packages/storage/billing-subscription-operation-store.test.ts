import { describe, expect, it, vi } from "vitest";
import {
  createPostgresBillingSubscriptionOperationStore,
  type BillingSubscriptionOperation
} from "../../../packages/storage/src/billing-subscription-operation-store.js";

const organization = {
  stripe_customer_id: "cus_test",
  stripe_subscription_id: "sub_test",
  billing_state: "active",
  suspended_at: null
};
const operation: BillingSubscriptionOperation = {
  id: "operation_existing",
  organization_id: "org_test",
  subscription_id: "sub_test",
  customer_id: "cus_test",
  kind: "upgrade",
  intent: { target: "team", units: 2 },
  parameters: null,
  resource_id: null,
  created_at: "2026-10-20T00:00:00Z",
  completed_at: null
};
const request = {
  organization_id: "org_test",
  kind: "upgrade" as const,
  intent: { units: 2, target: "team" }
};

function fixture() {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  return { query, store: createPostgresBillingSubscriptionOperationStore({ query }) };
}

describe("Postgres subscription operation adapter", () => {
  it("reads the durable operation and preserves absence", async () => {
    const { query, store } = fixture();
    query.mockResolvedValueOnce({ rows: [operation] });
    expect(await store.get("org_test")).toEqual(operation);
    expect(await store.get("org_missing")).toBeNull();
    expect(query.mock.calls.map((call) => call[1] as unknown)).toEqual([
      ["org_test"],
      ["org_missing"]
    ]);
  });

  it.each([
    undefined,
    { ...organization, suspended_at: "2026-10-20T00:00:00Z" },
    { ...organization, stripe_customer_id: null },
    { ...organization, stripe_subscription_id: null },
    { ...organization, billing_state: "canceled" }
  ])("refuses an unavailable subscription before reserving a provider command: %j", async (org) => {
    const { query, store } = fixture();
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: org ? [org] : [] });
    expect(await store.claim(request)).toBe("no_active_subscription");
    expect(query.mock.calls.some((call) => String(call[0]).startsWith("INSERT"))).toBe(false);
    expect(query).toHaveBeenLastCalledWith("COMMIT", []);
  });

  it("returns the same pending identity despite intent key ordering or a stale preview", async () => {
    const { query, store } = fixture();
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [organization] })
      .mockResolvedValueOnce({ rows: [operation] });
    expect(await store.claim({ ...request, expected_operation_id: null })).toEqual(operation);
    expect(query.mock.calls.some((call) => /^(INSERT|DELETE)/.test(String(call[0])))).toBe(false);
  });

  it.each([
    { ...operation, subscription_id: "sub_previous" },
    { ...operation, kind: "capacity_increase" as const },
    { ...operation, intent: { target: "team", units: 3 } }
  ])(
    "preserves a conflicting pending operation without creating another charge: %j",
    async (current) => {
      const { query, store } = fixture();
      query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [organization] })
        .mockResolvedValueOnce({ rows: [current] });
      expect(await store.claim(request)).toBe("billing_change_in_progress");
      expect(query.mock.calls.some((call) => /^(INSERT|DELETE)/.test(String(call[0])))).toBe(false);
    }
  );

  it("fences a new command against the completed revision its confirmation did not see", async () => {
    const { query, store } = fixture();
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [organization] })
      .mockResolvedValueOnce({ rows: [{ ...operation, completed_at: "2026-10-20T01:00:00Z" }] });
    expect(await store.claim({ ...request, expected_operation_id: null })).toBe(
      "billing_change_in_progress"
    );
    expect(query.mock.calls.some((call) => /^(INSERT|DELETE)/.test(String(call[0])))).toBe(false);
  });

  it.each([false, true])(
    "claims a new durable identity after validating the observed revision (previous=%s)",
    async (hasPrevious) => {
      const { query, store } = fixture();
      const current = hasPrevious ? { ...operation, completed_at: "2026-10-20T01:00:00Z" } : null;
      query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [organization] })
        .mockResolvedValueOnce({ rows: current ? [current] : [] });
      if (hasPrevious) query.mockResolvedValueOnce({ rows: [] });
      query.mockResolvedValueOnce({ rows: [{ ...operation, id: "operation_new" }] });
      expect(
        await store.claim({ ...request, expected_operation_id: current?.id ?? null })
      ).toMatchObject({ id: "operation_new" });
      const insertion = query.mock.calls.find((call) => String(call[0]).startsWith("INSERT"));
      expect(insertion?.[1]).toEqual([
        "org_test",
        expect.stringMatching(/^[a-f0-9-]{36}$/),
        "sub_test",
        "cus_test",
        "upgrade",
        JSON.stringify(request.intent)
      ]);
      expect(query).toHaveBeenLastCalledWith("COMMIT", []);
    }
  );

  it("rolls back a failed claim and surfaces the original database failure", async () => {
    const { query, store } = fixture();
    const failure = new Error("database unavailable");
    query.mockResolvedValueOnce({ rows: [] }).mockRejectedValueOnce(failure);
    await expect(store.claim(request)).rejects.toBe(failure);
    expect(query).toHaveBeenLastCalledWith("ROLLBACK", []);
  });

  it("returns the prepared persisted command or a fenced absence", async () => {
    const { query, store } = fixture();
    const persisted = { ...operation, parameters: { original: true } };
    query.mockResolvedValueOnce({ rows: [persisted] });
    expect(await store.prepare("org_test", operation.id, { replacement: true })).toEqual(persisted);
    expect(query.mock.calls[0]?.[1]).toEqual([
      "org_test",
      operation.id,
      JSON.stringify({ replacement: true })
    ]);
    expect(await store.prepare("org_test", "stale_attempt", {})).toBeNull();
  });

  it.each([0, 1])(
    "reports resource/completion fencing without inventing success (affected=%s)",
    async (affected) => {
      const { query, store } = fixture();
      query.mockResolvedValue({ rows: affected ? [{ id: operation.id }] : [] });
      expect(await store.saveResource("org_test", operation.id, "in_test")).toBe(affected === 1);
      expect(await store.complete("org_test", operation.id)).toBe(affected === 1);
      expect(await store.abandonUnprepared("org_test", operation.id)).toBe(affected === 1);
      expect(await store.retireVoidedPayment("org_test", operation.id, "in_test")).toBe(
        affected === 1
      );
      expect(query.mock.calls.map((call) => call[1] as unknown)).toEqual([
        ["org_test", operation.id, "in_test"],
        ["org_test", operation.id],
        ["org_test", operation.id],
        ["org_test", operation.id, "in_test"]
      ]);
    }
  );
});
