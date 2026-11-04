import { describe, expect, it, vi } from "vitest";
import {
  createPostgresMetadataStore,
  type Queryable
} from "../../../packages/storage/src/index.js";

describe("postgres metadata incident-writing", () => {
  it("should use existing service id when available", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "svc_existing" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ incident_id: "inc_123", matched_fields: [], status: "open", regressed_now: false }]
      });

    const db: Queryable = { query };
    const store = createPostgresMetadataStore(db);

    await store.upsertIncident({
      event_id: "550e8400-e29b-41d4-a716-446655440000",
      project_id: "proj_123",
      service_name: "checkout-api",
      environment: "production",
      fingerprint: "fp_123",
      fingerprint_version: "v1",
      title: "TypeError at /checkout",
      severity: "high",
      occurred_at: "2026-03-10T00:00:00.000Z"
    });

    expect(query).toHaveBeenCalledTimes(3);
  });

  it("should upsert incident using service lookup and linkage", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "svc_123" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            incident_id: "inc_123",
            matched_fields: ["normalized_message"],
            status: "open",
            regressed_now: false
          }
        ]
      });

    const db: Queryable = { query };
    const store = createPostgresMetadataStore(db);

    const result = await store.upsertIncident({
      event_id: "550e8400-e29b-41d4-a716-446655440000",
      project_id: "proj_123",
      service_name: "checkout-api",
      environment: "production",
      fingerprint: "fp_123",
      fingerprint_version: "v1",
      title: "TypeError at /checkout",
      severity: "high",
      occurred_at: "2026-03-10T00:00:00.000Z"
    });

    expect(result.incident_id).toBe("inc_123");
    expect(query).toHaveBeenCalledTimes(4);
  });

  it("should insert incident event linkage", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const db: Queryable = { query };

    const store = createPostgresMetadataStore(db);

    await store.insertIncidentEvent({
      incident_id: "inc_123",
      event_id: "550e8400-e29b-41d4-a716-446655440000",
      event_type: "backend_exception",
      occurred_at: "2026-03-10T00:00:00.000Z",
      is_sampled: true,
      level: null
    });

    expect(query).toHaveBeenCalledOnce();
  });

  it("should throw when service creation does not return id", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    const db: Queryable = { query };
    const store = createPostgresMetadataStore(db);

    await expect(
      store.upsertIncident({
        event_id: "550e8400-e29b-41d4-a716-446655440000",
        project_id: "proj_123",
        service_name: "checkout-api",
        environment: "production",
        fingerprint: "fp_123",
        fingerprint_version: "v1",
        title: "TypeError at /checkout",
        severity: "high",
        occurred_at: "2026-03-10T00:00:00.000Z"
      })
    ).rejects.toThrow("service_insert_failed");
  });

  it("should throw when incident upsert returns no rows", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "svc_123" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const db: Queryable = { query };
    const store = createPostgresMetadataStore(db);

    await expect(
      store.upsertIncident({
        event_id: "550e8400-e29b-41d4-a716-446655440000",
        project_id: "proj_123",
        service_name: "checkout-api",
        environment: "production",
        fingerprint: "fp_123",
        fingerprint_version: "v1",
        title: "TypeError at /checkout",
        severity: "high",
        occurred_at: "2026-03-10T00:00:00.000Z"
      })
    ).rejects.toThrow("incident_upsert_failed");
  });

  it("should surface regressed status when resolved incident is reopened", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "svc_123" }] })
      .mockResolvedValueOnce({ rows: [{ id: "inc_123", status: "resolved" }] })
      .mockResolvedValueOnce({ rows: [{ duplicate: false }] })
      .mockResolvedValueOnce({ rows: [{ has_event_type: true, has_request_event: false }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          { incident_id: "inc_123", matched_fields: [], status: "regressed", regressed_now: true }
        ]
      });

    const db: Queryable = { query };
    const store = createPostgresMetadataStore(db);

    const result = await store.upsertIncident({
      event_id: "550e8400-e29b-41d4-a716-446655440000",
      project_id: "proj_123",
      service_name: "checkout-api",
      environment: "production",
      fingerprint: "fp_123",
      fingerprint_version: "v1",
      title: "TypeError at /checkout",
      severity: "high",
      occurred_at: "2026-03-10T00:00:00.000Z"
    });

    expect(result.status).toBe("regressed");
  });

  it("should correlate recent deployment metadata when reopening a resolved incident", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "svc_123" }] })
      .mockResolvedValueOnce({ rows: [{ id: "inc_123", status: "resolved" }] })
      .mockResolvedValueOnce({ rows: [{ duplicate: false }] })
      .mockResolvedValueOnce({ rows: [{ has_event_type: true, has_request_event: false }] })
      .mockResolvedValueOnce({
        rows: [
          {
            deployment_id: "dep_123",
            commit_sha: "abc123def456",
            version: "v2.4.0",
            branch: "main",
            deployed_at: "2026-03-10T23:30:00.000Z",
            minutes_since_deploy: 120
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            incident_id: "inc_123",
            matched_fields: ["normalized_message"],
            status: "regressed",
            occurrence_count: 2
          }
        ]
      });

    const db: Queryable = { query };
    const store = createPostgresMetadataStore(db);

    const result = await store.upsertIncident({
      event_id: "550e8400-e29b-41d4-a716-446655440000",
      event_type: "backend_exception",
      project_id: "proj_123",
      service_name: "checkout-api",
      environment: "production",
      fingerprint: "fp_123",
      fingerprint_version: "v1",
      title: "TypeError at /checkout",
      severity: "high",
      occurred_at: "2026-03-11T01:30:00.000Z"
    });

    expect(result.regressed_now).toBe(true);
    expect(result.regression_deploy).toEqual({
      deployment_id: "dep_123",
      commit_sha: "abc123def456",
      version: "v2.4.0",
      branch: "main",
      deployed_at: "2026-03-10T23:30:00.000Z",
      minutes_since_deploy: 120
    });
  });

  it("should surface new_context_type_added when an existing incident receives a new event type", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "svc_123" }] })
      .mockResolvedValueOnce({ rows: [{ id: "inc_123", status: "open" }] })
      .mockResolvedValueOnce({ rows: [{ duplicate: false }] })
      .mockResolvedValueOnce({ rows: [{ has_event_type: false, has_request_event: false }] })
      .mockResolvedValueOnce({
        rows: [
          {
            incident_id: "inc_123",
            matched_fields: ["normalized_message"],
            status: "open",
            occurrence_count: 2
          }
        ]
      });

    const store = createPostgresMetadataStore({ query });

    const result = await store.upsertIncident({
      event_id: "550e8400-e29b-41d4-a716-446655440000",
      event_type: "frontend_exception",
      project_id: "proj_123",
      service_name: "checkout-api",
      environment: "production",
      fingerprint: "fp_123",
      fingerprint_version: "v1",
      title: "TypeError at /checkout",
      severity: "high",
      occurred_at: "2026-03-10T00:00:00.000Z"
    });

    expect(result.new_context_type_added).toBe(true);
    expect(result.reproduction_confidence_changed).toBeUndefined();
  });

  it("should surface reproduction_confidence_changed when request context is first observed", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "svc_123" }] })
      .mockResolvedValueOnce({ rows: [{ id: "inc_123", status: "open" }] })
      .mockResolvedValueOnce({ rows: [{ duplicate: false }] })
      .mockResolvedValueOnce({ rows: [{ has_event_type: false, has_request_event: false }] })
      .mockResolvedValueOnce({
        rows: [
          {
            incident_id: "inc_123",
            matched_fields: ["normalized_message"],
            status: "open",
            occurrence_count: 2
          }
        ]
      });

    const store = createPostgresMetadataStore({ query });

    const result = await store.upsertIncident({
      event_id: "550e8400-e29b-41d4-a716-446655440000",
      event_type: "request_event",
      project_id: "proj_123",
      service_name: "checkout-api",
      environment: "production",
      fingerprint: "fp_123",
      fingerprint_version: "v1",
      title: "TypeError at /checkout",
      severity: "high",
      occurred_at: "2026-03-10T00:00:00.000Z"
    });

    expect(result.new_context_type_added).toBe(true);
    expect(result.reproduction_confidence_changed).toBe(true);
  });

  it("should persist deployment rows for deploy_metadata events idempotently by source event", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "svc_123" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            incident_id: "inc_123",
            matched_fields: ["normalized_message"],
            status: "open",
            occurrence_count: 1
          }
        ]
      });

    const db: Queryable = { query };
    const store = createPostgresMetadataStore(db);

    await store.upsertIncident({
      event_id: "550e8400-e29b-41d4-a716-446655440000",
      event_type: "deploy_metadata",
      project_id: "proj_123",
      service_name: "checkout-api",
      environment: "production",
      fingerprint: "fp_deploy_123",
      fingerprint_version: "v1",
      title: "deploy_metadata event",
      severity: "low",
      occurred_at: "2026-03-10T23:30:00.000Z",
      deploy_metadata: {
        commit_sha: "abc123def456",
        version: "v2.4.0",
        branch: "main",
        deployed_at: "2026-03-10T23:30:00.000Z"
      }
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO deployments"),
      expect.any(Array)
    );
  });

  it("should surface duplicate_event when incident linkage already exists", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "svc_123" }] })
      .mockResolvedValueOnce({ rows: [{ id: "inc_123", status: "open" }] })
      .mockResolvedValueOnce({ rows: [{ duplicate: true }] })
      .mockResolvedValueOnce({
        rows: [
          {
            incident_id: "inc_123",
            matched_fields: ["normalized_message"],
            status: "open",
            occurrence_count: 4
          }
        ]
      });

    const db: Queryable = { query };
    const store = createPostgresMetadataStore(db);

    const result = await store.upsertIncident({
      event_id: "550e8400-e29b-41d4-a716-446655440000",
      project_id: "proj_123",
      service_name: "checkout-api",
      environment: "production",
      fingerprint: "fp_123",
      fingerprint_version: "v1",
      title: "TypeError at /checkout",
      severity: "high",
      occurred_at: "2026-03-10T00:00:00.000Z"
    });

    expect(result.duplicate_event).toBe(true);
    expect(result.regressed_now).toBe(false);
  });

  it("should mark incident as spiking once", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1, rows: [] });
    const db: Queryable = { query };
    const store = createPostgresMetadataStore(db);

    const marked = await store.markIncidentSpiking({
      incident_id: "inc_123",
      detected_at: "2026-03-10T00:00:00.000Z"
    });

    expect(marked).toBe(true);
    expect(query).toHaveBeenCalledOnce();
  });

  it("should return false when incident spiking update does not affect a row", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({ rowCount: 0, rows: [] });
    const store = createPostgresMetadataStore({ query });

    const marked = await store.markIncidentSpiking({
      incident_id: "inc_123",
      detected_at: "2026-03-10T00:00:00.000Z"
    });

    expect(marked).toBe(false);
  });

  it("records retained incident events and reports demoted references", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ max_rank: 1 }] })
      .mockResolvedValueOnce({
        rows: [
          { event_id: "evt_latest_old", occurred_at: "2026-03-09T00:00:00.000Z", is_sampled: false }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          { event_id: "evt_high_old", occurred_at: "2026-03-08T00:00:00.000Z", is_sampled: false }
        ]
      })
      .mockResolvedValueOnce({ rows: [{ is_sampled: true }] })
      .mockResolvedValueOnce({ rows: [] });

    const store = createPostgresMetadataStore({ query });

    const result = await store.recordIncidentEventRetention({
      incident_id: "inc_123",
      event_id: "evt_new",
      event_type: "deploy_metadata",
      occurred_at: "2026-03-10T00:00:00.000Z",
      occurrence_count: 1,
      severity: "critical",
      level: null
    });

    expect(result).toEqual({
      is_sampled: true,
      demoted_event_references: [
        { event_id: "evt_high_old", occurred_at: "2026-03-08T00:00:00.000Z" },
        { event_id: "evt_latest_old", occurred_at: "2026-03-09T00:00:00.000Z" }
      ]
    });
    expect(query.mock.calls.map(([sql]) => String(sql))).toContain("COMMIT");
  });

  it("rolls back incident retention when persistence fails", async (): Promise<void> => {
    const query = vi.fn().mockImplementation(async (sql: string) => {
      if (sql === "BEGIN") {
        return { rows: [] };
      }
      if (sql.includes("FROM incidents i") && sql.includes("JOIN deployments d")) {
        return { rows: [] };
      }
      if (sql.includes("SELECT MAX(severity_rank)")) {
        return { rows: [{ max_rank: null }] };
      }
      if (sql.includes("retain_latest = false")) {
        return { rows: [] };
      }
      if (sql.includes("retain_highest_severity = false")) {
        return { rows: [] };
      }
      if (sql.includes("INSERT INTO incident_events")) {
        throw new Error("insert_failed");
      }
      if (sql === "ROLLBACK") {
        return { rows: [] };
      }

      throw new Error(`unexpected_sql:${sql.slice(0, 40)}`);
    });

    const store = createPostgresMetadataStore({ query });

    await expect(
      store.recordIncidentEventRetention({
        incident_id: "inc_123",
        event_id: "evt_new",
        event_type: "backend_exception",
        occurred_at: "2026-03-10T00:00:00.000Z",
        occurrence_count: 2,
        severity: "medium",
        level: "error"
      })
    ).rejects.toThrow("insert_failed");

    expect(query.mock.calls.map(([sql]) => String(sql))).toContain("ROLLBACK");
  });

  it("should preserve explicit matched fields during incident upsert", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "svc_123" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            incident_id: "inc_123",
            matched_fields: ["stack_trace"],
            status: "open",
            regressed_now: false
          }
        ]
      });
    const store = createPostgresMetadataStore({ query });

    const result = await store.upsertIncident({
      event_id: "550e8400-e29b-41d4-a716-446655440000",
      project_id: "proj_123",
      service_name: "checkout-api",
      environment: "production",
      fingerprint: "fp_123",
      fingerprint_version: "v1",
      title: "TypeError at /checkout",
      severity: "high",
      occurred_at: "2026-03-10T00:00:00.000Z",
      matched_fields: ["stack_trace"]
    });

    expect(result.matched_fields).toEqual(["stack_trace"]);
  });
});
