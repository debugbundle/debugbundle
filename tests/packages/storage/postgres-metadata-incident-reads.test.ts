import { describe, expect, it, vi } from "vitest";
import {
  createPostgresMetadataStore,
  type Queryable
} from "../../../packages/storage/src/index.js";

describe("postgres metadata incident-reads", () => {
  it("should filter active incident lists to open and regressed incidents", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const store = createPostgresMetadataStore({ query });

    await store.listIncidentsForOrganization({
      organization_id: "org_123",
      status: "active",
      limit: 20
    });

    const sql = String(query.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("i.status IN ('open', 'regressed')");
    expect(query.mock.calls[0]?.[1]).toEqual(["org_123", null, 20]);
  });

  it("should list incident logs with optional level and cursor filters", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          event_id: "550e8400-e29b-41d4-a716-446655440000",
          event_type: "log_event",
          occurred_at: "2026-03-10T00:00:00.000Z",
          is_sampled: true,
          level: "error"
        }
      ]
    });
    const db: Queryable = { query };
    const store = createPostgresMetadataStore(db);

    const logs = await store.listIncidentLogsForOrganization({
      organization_id: "org_123",
      incident_id: "inc_123",
      level: "error",
      cursor: {
        occurred_at: "2026-03-11T00:10:00.000Z",
        event_id: "550e8400-e29b-41d4-a716-446655440001"
      },
      limit: 10
    });

    expect(logs).toEqual([
      {
        event_id: "550e8400-e29b-41d4-a716-446655440000",
        event_type: "log_event",
        occurred_at: "2026-03-10T00:00:00.000Z",
        is_sampled: true,
        level: "error"
      }
    ]);

    expect(query).toHaveBeenCalledWith(expect.any(String), [
      "inc_123",
      "org_123",
      "error",
      "2026-03-11T00:10:00.000Z",
      "550e8400-e29b-41d4-a716-446655440001",
      10,
      null
    ]);
  });

  it("should list incident logs without optional filters", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const db: Queryable = { query };
    const store = createPostgresMetadataStore(db);

    const logs = await store.listIncidentLogsForOrganization({
      organization_id: "org_123",
      incident_id: "inc_123",
      limit: 5
    });

    expect(logs).toEqual([]);
    expect(query).toHaveBeenCalledWith(expect.any(String), [
      "inc_123",
      "org_123",
      null,
      null,
      null,
      5,
      null
    ]);
  });

  it("should list and fetch organization-scoped incidents", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            incident_id: "inc_123",
            project_id: "proj_123",
            project_name: "Main App",
            service_id: "svc_123",
            service_name: "checkout-api",
            latest_deployment_id: null,
            environment: "production",
            fingerprint: "fp_123",
            fingerprint_version: "v1",
            title: "TypeError",
            severity: "high",
            status: "open",
            first_seen_at: "2026-03-10T00:00:00.000Z",
            last_seen_at: "2026-03-10T00:10:00.000Z",
            occurrence_count: 3,
            spike_detected_at: null,
            resolved_at: null,
            regressed_at: null,
            matched_fields: ["normalized_message"]
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            incident_id: "inc_123",
            project_id: "proj_123",
            service_id: "svc_123",
            latest_deployment_id: null,
            environment: "production",
            fingerprint: "fp_123",
            fingerprint_version: "v1",
            title: "TypeError",
            severity: "high",
            status: "open",
            first_seen_at: "2026-03-10T00:00:00.000Z",
            last_seen_at: "2026-03-10T00:10:00.000Z",
            occurrence_count: 3,
            spike_detected_at: null,
            resolved_at: null,
            regressed_at: null,
            matched_fields: ["normalized_message"]
          }
        ]
      });

    const store = createPostgresMetadataStore({ query });

    const listed = await store.listIncidentsForOrganization({
      organization_id: "org_123",
      limit: 20
    });
    const fetched = await store.getIncidentForOrganization({
      organization_id: "org_123",
      incident_id: "inc_123"
    });

    expect(listed).toHaveLength(1);
    expect(fetched?.incident_id).toBe("inc_123");
  });

  it("should derive incident_reason from primary incident-signal metadata for 5xx request incidents", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          incident_id: "inc_5xx",
          project_id: "proj_123",
          project_name: "Main App",
          service_id: "svc_123",
          service_name: "checkout-api",
          latest_deployment_id: null,
          environment: "production",
          fingerprint: "fp_5xx",
          fingerprint_version: "v1",
          title: "request GET /checkout",
          severity: "high",
          status: "open",
          first_seen_at: "2026-03-10T00:00:00.000Z",
          last_seen_at: "2026-03-10T00:10:00.000Z",
          occurrence_count: 3,
          spike_detected_at: null,
          resolved_at: null,
          regressed_at: null,
          matched_fields: ["route_template", "http_method", "http_status"],
          incident_reason_event_type: "request_event",
          incident_reason_event_class: "incident_signal",
          incident_reason_level: null
        }
      ]
    });

    const store = createPostgresMetadataStore({ query });

    const listed = await store.listIncidentsForOrganization({
      organization_id: "org_123",
      limit: 20
    });

    expect(listed).toEqual([
      expect.objectContaining({
        incident_id: "inc_5xx",
        incident_reason: {
          kind: "request_failure",
          description: "request_event matched the immediate request failure incident rule",
          event_type: "request_event",
          event_class: "incident_signal",
          matched_policy:
            "Immediate request failure statuses bypass capture_request_events suppression"
        }
      })
    ]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("FROM incident_events ie"), [
      "org_123",
      null,
      20
    ]);
  });

  it("should filter incident listing by first_seen_after when provided", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const store = createPostgresMetadataStore({ query });

    await store.listIncidentsForOrganization({
      organization_id: "org_123",
      first_seen_after: "2026-03-10T00:00:00.000Z",
      limit: 20
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("i.first_seen_at >= $3::timestamptz"),
      ["org_123", null, "2026-03-10T00:00:00.000Z", 20]
    );
  });

  it("should filter incident listing by attention_after when provided", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const store = createPostgresMetadataStore({ query });

    await store.listIncidentsForOrganization({
      organization_id: "org_123",
      attention_after: "2026-03-10T00:00:00.000Z",
      limit: 20
    });

    expect(query).toHaveBeenCalledWith(expect.stringContaining("i.regressed_at IS NOT NULL"), [
      "org_123",
      null,
      "2026-03-10T00:00:00.000Z",
      20
    ]);
  });

  it("should derive incident_reason for request anomaly incidents from matched_fields when no primary incident-signal row exists", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          incident_id: "inc_request_anomaly",
          project_id: "proj_123",
          project_name: "Main App",
          service_id: "svc_123",
          service_name: "checkout-api",
          latest_deployment_id: null,
          environment: "production",
          fingerprint: "fp_request_anomaly",
          fingerprint_version: "v1",
          title: "Request anomaly: GET /checkout/:orderId returned 404 repeatedly",
          severity: "medium",
          status: "open",
          first_seen_at: "2026-03-10T00:00:00.000Z",
          last_seen_at: "2026-03-10T00:10:00.000Z",
          occurrence_count: 24,
          spike_detected_at: null,
          resolved_at: null,
          regressed_at: null,
          matched_fields: ["request_anomaly", "route_template", "http_method", "http_status"],
          incident_reason_event_type: null,
          incident_reason_event_class: null,
          incident_reason_level: null
        }
      ]
    });

    const store = createPostgresMetadataStore({ query });

    const listed = await store.listIncidentsForOrganization({
      organization_id: "org_123",
      limit: 20
    });

    expect(listed).toEqual([
      expect.objectContaining({
        incident_id: "inc_request_anomaly",
        incident_reason: {
          kind: "request_failure",
          description: "request_event crossed the repeated request anomaly threshold",
          event_type: "request_event",
          event_class: "incident_signal",
          matched_policy:
            "Repeated contextual request failures crossed the request anomaly threshold"
        }
      })
    ]);
  });

  it("preserves the primary incident reason when request_anomaly metadata exists alongside a backend exception", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          incident_id: "inc_backend_primary",
          project_id: "proj_123",
          project_name: "Main App",
          service_id: "svc_123",
          service_name: "checkout-api",
          latest_deployment_id: null,
          environment: "production",
          fingerprint: "fp_backend_primary",
          fingerprint_version: "v1",
          title: "TypeError in checkout handler",
          severity: "high",
          status: "open",
          first_seen_at: "2026-03-10T00:00:00.000Z",
          last_seen_at: "2026-03-10T00:10:00.000Z",
          occurrence_count: 3,
          spike_detected_at: null,
          resolved_at: undefined,
          regressed_at: null,
          matched_fields: ["request_anomaly", "message"],
          incident_reason_event_type: "backend_exception",
          incident_reason_event_class: "incident_signal",
          incident_reason_level: null
        }
      ]
    });

    const store = createPostgresMetadataStore({ query });

    const listed = await store.listIncidentsForOrganization({
      organization_id: "org_123",
      limit: 20
    });

    expect(listed).toEqual([
      expect.objectContaining({
        incident_id: "inc_backend_primary",
        incident_reason: expect.objectContaining({
          event_type: "backend_exception"
        })
      })
    ]);
    expect(listed[0]).not.toHaveProperty("resolved_at");
  });

  it("should apply incident filters and cursor pagination when listing incidents", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          incident_id: "inc_123",
          project_id: "proj_123",
          project_name: "Main App",
          service_id: "svc_123",
          service_name: "checkout-api",
          latest_deployment_id: null,
          environment: "production",
          fingerprint: "fp_123",
          fingerprint_version: "v1",
          title: "TypeError",
          severity: "high",
          status: "open",
          first_seen_at: "2026-03-10T00:00:00.000Z",
          last_seen_at: "2026-03-10T00:10:00.000Z",
          occurrence_count: 3,
          spike_detected_at: null,
          resolved_at: null,
          regressed_at: null,
          matched_fields: ["normalized_message"]
        }
      ]
    });

    const store = createPostgresMetadataStore({ query });

    const listed = await store.listIncidentsForOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      environment: "production",
      service: "checkout-api",
      status: "open",
      severity: "high",
      limit: 10,
      cursor: {
        last_seen_at: "2026-03-10T00:09:00.000Z",
        incident_id: "inc_122"
      }
    });

    expect(listed).toHaveLength(1);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("AND i.project_id=ANY(debugbundle_project_origins($3::uuid))"),
      [
        "org_123",
        null,
        "proj_123",
        "production",
        "checkout-api",
        "open",
        "high",
        "2026-03-10T00:09:00.000Z",
        "inc_122",
        10
      ]
    );
  });

  it("should resolve an organization-scoped incident idempotently", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          incident_id: "inc_123",
          project_id: "proj_123",
          project_name: "Main App",
          service_id: "svc_123",
          service_name: "checkout-api",
          latest_deployment_id: null,
          environment: "production",
          fingerprint: "fp_123",
          fingerprint_version: "v1",
          title: "TypeError",
          severity: "high",
          status: "resolved",
          first_seen_at: "2026-03-10T00:00:00.000Z",
          last_seen_at: "2026-03-10T00:10:00.000Z",
          occurrence_count: 3,
          spike_detected_at: null,
          resolved_at: "2026-03-10T00:12:00.000Z",
          regressed_at: null,
          matched_fields: ["normalized_message"]
        }
      ],
      rowCount: 1
    });

    const store = createPostgresMetadataStore({ query });

    const resolved = await store.resolveIncidentForOrganization({
      organization_id: "org_123",
      incident_id: "inc_123",
      resolved_by_member_id: "usr_123",
      resolved_at: "2026-03-10T00:12:00.000Z"
    });

    expect(resolved).toEqual({
      incident_id: "inc_123",
      project_id: "proj_123",
      project_name: "Main App",
      project_color_tag: null,
      service_id: "svc_123",
      service_name: "checkout-api",
      latest_deployment_id: null,
      environment: "production",
      fingerprint: "fp_123",
      fingerprint_version: "v1",
      title: "TypeError",
      severity: "high",
      status: "resolved",
      first_seen_at: "2026-03-10T00:00:00.000Z",
      last_seen_at: "2026-03-10T00:10:00.000Z",
      occurrence_count: 3,
      spike_detected_at: null,
      resolved_at: "2026-03-10T00:12:00.000Z",
      regressed_at: null,
      matched_fields: ["normalized_message"]
    });
    expect(query).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledWith(expect.stringContaining("UPDATE incidents"), [
      "org_123",
      "inc_123",
      "usr_123",
      "2026-03-10T00:12:00.000Z",
      null
    ]);
  });

  it("should reopen an organization-scoped incident clearing resolution fields", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          incident_id: "inc_123",
          project_id: "proj_123",
          project_name: "Main App",
          service_id: "svc_123",
          service_name: "checkout-api",
          latest_deployment_id: null,
          environment: "production",
          fingerprint: "fp_123",
          fingerprint_version: "v1",
          title: "TypeError",
          severity: "high",
          status: "open",
          first_seen_at: "2026-03-10T00:00:00.000Z",
          last_seen_at: "2026-03-10T00:10:00.000Z",
          occurrence_count: 3,
          spike_detected_at: null,
          resolved_at: null,
          regressed_at: null,
          matched_fields: ["normalized_message"]
        }
      ],
      rowCount: 1
    });

    const store = createPostgresMetadataStore({ query });

    const reopened = await store.reopenIncidentForOrganization({
      organization_id: "org_123",
      incident_id: "inc_123"
    });

    expect(reopened).toEqual({
      incident_id: "inc_123",
      project_id: "proj_123",
      project_name: "Main App",
      project_color_tag: null,
      service_id: "svc_123",
      service_name: "checkout-api",
      latest_deployment_id: null,
      environment: "production",
      fingerprint: "fp_123",
      fingerprint_version: "v1",
      title: "TypeError",
      severity: "high",
      status: "open",
      first_seen_at: "2026-03-10T00:00:00.000Z",
      last_seen_at: "2026-03-10T00:10:00.000Z",
      occurrence_count: 3,
      spike_detected_at: null,
      resolved_at: null,
      regressed_at: null,
      matched_fields: ["normalized_message"]
    });
    expect(query).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledWith(expect.stringContaining("UPDATE incidents"), [
      "org_123",
      "inc_123",
      null
    ]);
  });

  it("should return null when reopening an incident that is already open", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({
      rows: [],
      rowCount: 0
    });

    const store = createPostgresMetadataStore({ query });

    const reopened = await store.reopenIncidentForOrganization({
      organization_id: "org_123",
      incident_id: "inc_123"
    });

    expect(reopened).toBeNull();
    expect(query).toHaveBeenCalledOnce();
    expect(String(query.mock.calls[0]?.[0] ?? "")).toContain("AND i.status <> 'open'");
  });
});
