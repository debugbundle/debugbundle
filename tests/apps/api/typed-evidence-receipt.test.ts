import { afterEach, expect, it, vi } from "vitest";
import { createApiServer } from "../../../apps/api/src/server.js";
import { createIngestionPersistenceService } from "../../../packages/storage/src/ingestion-services.js";
import { createEventEnvelope } from "../../../packages/shared-types/src/index.js";
import { createBaseDependencies } from "../../helpers/api-capture-rule-ingestion.js";

afterEach(() => vi.useRealTimers());

function recovery() {
  return createEventEnvelope({
    event_type: "diagnostic_context",
    occurred_at: "2026-10-26T10:02:00.000Z",
    service: { name: "api", environment: "test" },
    payload: {
      version: 1,
      kind: "recovery",
      failure_ref: "550e8400-e29b-41d4-a716-446655440002",
      scope: { kind: "operation", operation_id: "550e8400-e29b-41d4-a716-446655440003" },
      attempt_id: "550e8400-e29b-41d4-a716-446655440004",
      state: "attempt_completed"
    }
  });
}

it("keeps a future-dated first submission ineligible on later HTTP replay", async () => {
  const received = "2026-10-26T10:00:00.000Z",
    putObject = vi.fn(),
    enqueue = vi.fn();
  const claim = vi.fn().mockResolvedValue({ matches: true, received_at: received });
  const persistence = createIngestionPersistenceService({
    objectStore: { putObject },
    queue: { enqueue },
    evidenceReceipts: { claim }
  });
  const app = createApiServer({ ...createBaseDependencies(), ingestionPersistence: persistence });
  await app.ready();
  vi.useFakeTimers({ toFake: ["Date"] });
  const event = recovery();
  try {
    for (const date of [received, "2026-10-26T10:03:00.000Z"]) {
      vi.setSystemTime(new Date(date));
      const result = await app.inject({
        method: "POST",
        url: "/v1/events?debugbundle_evidence=1",
        headers: { authorization: "Bearer dbundle_proj_test" },
        payload: { events: [event] }
      });
      expect(result.statusCode).toBe(202);
      expect(result.json()).toMatchObject({
        accepted: 0,
        rejected: 1,
        errors: [{ index: 0, reason: "invalid_event" }]
      });
    }
    expect(claim).toHaveBeenCalledTimes(2);
    expect(putObject).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  } finally {
    await app.close();
  }
});

it("rejects a conflicting evidence identity per index without preventing ordinary events", async () => {
  const persist = vi.fn();
  const app = createApiServer({
    ...createBaseDependencies(),
    ingestionPersistence: {
      persistAndEnqueue: persist,
      claimEvidenceReceipt: async (event, _project, receipt) => ({
        received_at: receipt,
        matches: event.event_type !== "diagnostic_context"
      })
    }
  });
  const ordinary = createEventEnvelope({
    event_type: "log_event",
    service: { name: "api", environment: "test" },
    payload: { level: "error", message: "failure", attributes: {} }
  });
  try {
    const result = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: { authorization: "Bearer dbundle_proj_test" },
      payload: { events: [recovery(), ordinary] }
    });
    expect(result.statusCode).toBe(202);
    expect(result.json()).toMatchObject({
      accepted: 1,
      rejected: 1,
      errors: [{ index: 0, reason: "invalid_event" }]
    });
    expect(persist).toHaveBeenCalledOnce();
    expect(persist.mock.calls[0]?.[0].event_id).toBe(ordinary.event_id);
  } finally {
    await app.close();
  }
});

it("does not advertise evidence support for a custom persistence path without durable receipts", async () => {
  const app = createApiServer(createBaseDependencies());
  try {
    const result = await app.inject({
      method: "POST",
      url: "/v1/events?debugbundle_evidence=1",
      headers: { authorization: "Bearer dbundle_proj_test" },
      payload: { events: [] }
    });
    expect(result.json().evidence_capabilities).toEqual({ version: 1, features: [] });
  } finally {
    await app.close();
  }
});

it("advertises verified default persistence support only on opted-in config and ACK requests", async () => {
  const persistence = createIngestionPersistenceService({
    objectStore: { putObject: vi.fn() },
    queue: { enqueue: vi.fn() },
    evidenceReceipts: { claim: vi.fn() }
  });
  const app = createApiServer({ ...createBaseDependencies(), ingestionPersistence: persistence });
  try {
    for (const [method, path] of [
      ["GET", "/v1/sdk/config"],
      ["POST", "/v1/events"]
    ] as const) {
      for (const opted of [false, true]) {
        const response = await app.inject({
          method,
          url: path + (opted ? "?debugbundle_evidence=1" : ""),
          headers: { authorization: "Bearer dbundle_proj_test" },
          ...(method === "POST" ? { payload: { events: [] } } : {})
        });
        expect(response.statusCode).toBe(method === "GET" ? 200 : 202);
        if (opted)
          expect(response.json().evidence_capabilities).toEqual({
            version: 1,
            features: [
              "exception_evidence_v1",
              "resource_observations_v1",
              "recovery_v1",
              "evidence_provenance_v1"
            ]
          });
        else expect(response.json()).not.toHaveProperty("evidence_capabilities");
      }
    }
  } finally {
    await app.close();
  }
});
