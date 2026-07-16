import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  createPostgresAnalyticsCorrelationStore,
  hashAnalyticsCorrelationValue,
  hashAnalyticsSessionSubject,
  type Queryable
} from "../../../packages/storage/src/index.js";

function createTransactionalDb(query: Queryable["query"]): Queryable {
  return {
    query,
    transaction: async <Result>(callback: (tx: Queryable) => Promise<Result>) =>
      callback({ query } as Queryable)
  };
}

describe("analytics correlation store", () => {
  it("hashes correlation values deterministically without retaining raw identifiers", (): void => {
    const expected = createHash("sha256").update("session-123", "utf8").digest("hex");

    expect(hashAnalyticsCorrelationValue("session-123")).toBe(expected);
    expect(hashAnalyticsCorrelationValue(" session-123 ")).toBe(expected);
    expect(hashAnalyticsCorrelationValue(null)).toBeNull();
    expect(hashAnalyticsCorrelationValue("   ")).toBeNull();
    expect(hashAnalyticsSessionSubject("project-1", "session-123")).toBe(
      createHash("sha256")
        .update('{"project_id":"project-1","session_id":"session-123"}', "utf8")
        .digest("hex")
    );
  });

  it("records incident correlation and links previously aggregated route sessions", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ event_id: "22222222-2222-4222-8222-222222222222" }] })
      .mockResolvedValueOnce({ rows: [{ linked_sessions: "2" }] });
    const store = createPostgresAnalyticsCorrelationStore(
      createTransactionalDb(query as Queryable["query"])
    );

    await expect(
      store.recordIncidentCorrelation({
        project_id: "11111111-1111-4111-8111-111111111111",
        incident_id: "33333333-3333-4333-8333-333333333333",
        event_id: "22222222-2222-4222-8222-222222222222",
        service: "web",
        environment: "production",
        occurred_at: "2026-07-10T10:05:00.000Z",
        session_id_hash: "session-hash",
        trace_id_hash: "trace-hash"
      })
    ).resolves.toEqual({ recorded: true, linked_sessions: 2 });

    expect(String(query.mock.calls[0]?.[0])).toContain("INSERT INTO analytics_incident_correlations");
    expect(String(query.mock.calls[1]?.[0])).toContain("INSERT INTO analytics_incident_session_links");
    expect(String(query.mock.calls[1]?.[0])).toContain("linked_incident_sessions");
  });

  it("does not relink a duplicate incident event", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [] });
    const store = createPostgresAnalyticsCorrelationStore(
      createTransactionalDb(query as Queryable["query"])
    );

    await expect(
      store.recordIncidentCorrelation({
        project_id: "11111111-1111-4111-8111-111111111111",
        incident_id: "33333333-3333-4333-8333-333333333333",
        event_id: "22222222-2222-4222-8222-222222222222",
        service: "web",
        environment: "production",
        occurred_at: "2026-07-10T10:05:00.000Z",
        session_id_hash: "session-hash",
        trace_id_hash: null
      })
    ).resolves.toEqual({ recorded: false, linked_sessions: 0 });

    expect(query).toHaveBeenCalledOnce();
  });

  it("skips incident correlation when no privacy-safe identifier is available", async (): Promise<void> => {
    const query = vi.fn();
    const store = createPostgresAnalyticsCorrelationStore({ query });

    await expect(
      store.recordIncidentCorrelation({
        project_id: "11111111-1111-4111-8111-111111111111",
        incident_id: "33333333-3333-4333-8333-333333333333",
        event_id: "22222222-2222-4222-8222-222222222222",
        service: "web",
        environment: "production",
        occurred_at: "2026-07-10T10:05:00.000Z",
        session_id_hash: null,
        trace_id_hash: null
      })
    ).resolves.toEqual({ recorded: false, linked_sessions: 0 });

    expect(query).not.toHaveBeenCalled();
  });
});
