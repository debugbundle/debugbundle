import { expect, it, vi } from "vitest";
import { createEventEnvelope } from "../../../packages/shared-types/src/index.js";
import { createEvidenceContextStore } from "../../../packages/storage/src/evidence-context-store.js";
const project = "00000000-0000-4000-8000-000000000001";
const reference = {
  version: 1 as const,
  failure_ref: "11111111-1111-4111-8111-111111111111",
  scope: { kind: "page" as const, page_id: "22222222-2222-4222-8222-222222222222" }
};
function context() {
  return createEventEnvelope({
    event_type: "diagnostic_context",
    occurred_at: "2026-10-26T01:00:01.000Z",
    service: { name: "web", environment: "test" },
    correlation: { session_id: "private-session" },
    payload: {
      ...reference,
      kind: "recovery",
      attempt_id: "33333333-3333-4333-8333-333333333333",
      state: "attempt_completed",
      status_code: 200
    }
  });
}
it("stores project-scoped hashes, bounded retention and a first receipt without raw correlation", async () => {
  const event = context();
  const query = vi.fn().mockImplementation(async (sql: string) => ({
    rows: sql.includes("INSERT INTO evidence_context_events") ? [{ event_id: event.event_id }] : []
  }));
  await createEvidenceContextStore({ query }).record(project, event, "2026-10-26T01:00:02.000Z");
  const calls = JSON.stringify(query.mock.calls);
  expect(calls).not.toContain("private-session");
  expect(calls).not.toContain(reference.failure_ref);
  expect(calls).not.toContain(reference.scope.page_id);
  expect(calls).toContain("expires_at");
  expect(calls).toContain("received_at");
});
it("does not index uninstrumented legacy errors or future-dated context", async () => {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  await createEvidenceContextStore({ query }).record(
    project,
    context(),
    "2026-10-26T00:00:00.000Z"
  );
  await createEvidenceContextStore({ query }).record(
    project,
    createEventEnvelope({
      event_type: "log_event",
      service: { name: "web", environment: "test" },
      payload: { level: "error", message: "failure", attributes: {} }
    }),
    "2026-10-26T01:00:02.000Z"
  );
  expect(query).not.toHaveBeenCalled();
});
it("does not enqueue duplicate rebuilds when its index insert was already recorded", async () => {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  await createEvidenceContextStore({ query }).record(
    project,
    context(),
    "2026-10-26T01:00:02.000Z"
  );
  expect(query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO worker_jobs"))).toBe(
    false
  );
});
it("indexes explicit request/log signals but excludes demoted exceptions and context samples", async () => {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  const store = createEvidenceContextStore({ query });
  const failure = createEventEnvelope({
    event_type: "backend_exception",
    occurred_at: "2026-10-26T01:00:00.000Z",
    service: { name: "web", environment: "test" },
    correlation: { session_id: "private-session" },
    context: { evidence_reference: reference },
    payload: {
      name: "Error",
      message: "failure",
      stack: "unavailable",
      handled: true,
      request: { method: "UNKNOWN", path: "/", headers: {}, query: {} },
      response: { status_code: 0 },
      runtime: { version: "test" }
    }
  });
  await store.record(project, failure, failure.occurred_at, "context_signal");
  expect(query).not.toHaveBeenCalled();
  const request = createEventEnvelope({
    ...failure,
    event_type: "request_event",
    payload: {
      method: "GET",
      path: "/work",
      headers: {},
      query: {},
      response_status: 503,
      duration_ms: 1
    }
  });
  const log = createEventEnvelope({
    ...failure,
    event_type: "log_event",
    payload: { level: "error", message: "failure", attributes: {} }
  });
  for (const event of [request, log])
    await store.record(project, event, event.occurred_at, "incident_signal");
  await store.record(project, request, request.occurred_at, "context_signal");
  expect(
    query.mock.calls.filter(([sql]) => String(sql).includes("INSERT INTO evidence_context_events"))
  ).toHaveLength(2);
});
