import { createPostgresRetentionStore } from "../../../packages/storage/src/retention-store.js";
import { expect, it, vi } from "vitest";
import { createEventEnvelope } from "../../../packages/shared-types/src/index.js";
import {
  createBrowserRecoveryStore,
  lockBrowserRecoveryEvent
} from "../../../packages/storage/src/browser-recovery-store.js";
import { browserResourceEvent } from "../../helpers/browser-resource-fixtures.js";

const projectId = "00000000-0000-4000-8000-000000000001";
function recovery() {
  return createEventEnvelope({
    event_type: "request_event",
    service: { name: "web", environment: "production" },
    correlation: { session_id: "private-session", trace_id: "private-trace" },
    payload: {
      method: "POST",
      path: "/api/refresh?token=private",
      query: {},
      headers: {},
      response_status: 404,
      duration_ms: 2
    }
  });
}

it("indexes only scoped recovery evidence and never persists raw correlation or request values", async () => {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  const store = createBrowserRecoveryStore({ query });
  const event = recovery();
  await store.record(projectId, event);
  expect(JSON.stringify(query.mock.calls)).not.toMatch(
    /private-session|private-trace|token=private/
  );
  const insert = query.mock.calls.find(([sql]) =>
    String(sql).includes("INSERT INTO browser_recovery_events")
  )!;
  expect((insert[1] as unknown[]).slice(0, 6)).toEqual([
    event.event_id,
    projectId,
    "web",
    "production",
    "recovery",
    event.occurred_at
  ]);
  expect(insert[1][6]).toMatch(/^[a-f0-9]{64}$/);
  const firstSessionHash = insert[1][6];
  query.mockClear();
  await store.record("00000000-0000-4000-8000-000000000002", event);
  expect(
    query.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO browser_recovery_events")
    )![1][6]
  ).not.toBe(firstSessionHash);
});

it("does not index unrelated paths or requests without nonempty correlation", async () => {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  const store = createBrowserRecoveryStore({ query });
  const event = recovery();
  event.payload.path = "/favicon.ico";
  await store.record(projectId, event);
  event.payload.path = "/api/refresh";
  event.correlation = { session_id: "  ", trace_id: null, request_id: null, user_id_hash: null };
  await store.record(projectId, event);
  expect(query).not.toHaveBeenCalled();
});

it("records resource references without scheduling extra incident builds", async () => {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  const event = browserResourceEvent();
  event.correlation = { session_id: null, trace_id: "trace", request_id: null, user_id_hash: null };
  await createBrowserRecoveryStore({ query }).record(projectId, event);
  expect(query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO worker_jobs"))).toBe(
    false
  );
  expect(
    query.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO browser_recovery_events")
    )![1][4]
  ).toBe("resource");
});

it("schedules idempotent scoped rebuilds for existing resource incidents", async () => {
  const query = vi.fn().mockImplementation(async (sql: string) => ({
    rows: sql.includes("SELECT DISTINCT i.id")
      ? [{ incident_id: "00000000-0000-4000-8000-000000000010", occurrence_count: 2 }]
      : []
  }));
  await createBrowserRecoveryStore({ query }).record(projectId, recovery());
  const job = query.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO worker_jobs"))!;
  expect(job[1][1]).toBe("build-bundle");
  const payload: unknown = job[1][3];
  if (typeof payload !== "string") throw new Error("Expected serialized job payload");
  expect(JSON.parse(payload)).toMatchObject({
    project_id: projectId,
    incident_id: "00000000-0000-4000-8000-000000000010",
    occurrence_count: 2,
    trigger: "new_context_type"
  });
});

it("uses the indexed event correlation locks and propagates storage failure for transaction retry", async () => {
  const query = vi
    .fn()
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({
      rows: [
        { service_name: "web", environment: "production", session_hash: "hash", trace_hash: null }
      ]
    })
    .mockResolvedValue({ rows: [] });
  await lockBrowserRecoveryEvent({ query }, projectId, "event");
  expect(query).toHaveBeenCalledTimes(1);
  await lockBrowserRecoveryEvent({ query }, projectId, "event");
  expect(query).toHaveBeenCalledTimes(3);
  query.mockRejectedValueOnce(new Error("storage_unavailable"));
  await expect(createBrowserRecoveryStore({ query }).record(projectId, recovery())).rejects.toThrow(
    "storage_unavailable"
  );
});

it("prunes expired recovery references in a bounded retention batch", async () => {
  const query = vi.fn().mockResolvedValue({ rows: [{ event_id: "expired" }] });
  expect(
    await createPostgresRetentionStore({ query }).pruneExpiredBrowserRecoveryEvents!({
      now: "2026-09-22T10:00:00.000Z",
      limit: 100
    })
  ).toBe(1);
  expect(query.mock.calls[0]![1]).toEqual(["2026-09-22T10:00:00.000Z", 100]);
  expect(query.mock.calls[0]![0]).toContain("expires_at <= $1::timestamptz");
});
