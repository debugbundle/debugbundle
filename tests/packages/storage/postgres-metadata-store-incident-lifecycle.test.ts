import { describe, expect, it, vi } from "vitest";

import { createPostgresMetadataStore, type Queryable } from "../../../packages/storage/src/index.js";

describe("postgres metadata store incident lifecycle", () => {
  it("resolves single incidents only when they are not already resolved", async (): Promise<void> => {
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
      ]
    });
    const db: Queryable = { query };
    const store = createPostgresMetadataStore(db);

    await store.resolveIncidentForOrganization({
      organization_id: "org_123",
      incident_id: "inc_123",
      resolved_by_member_id: "usr_123",
      resolved_at: "2026-03-10T00:12:00.000Z"
    });

    const sql = String(query.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("AND i.status <> 'resolved'");
    expect(sql).not.toContain("AND i.status <> 'open'");
  });

  it("resolves regressed incidents as a fresh resolution and clears regression state", async (): Promise<void> => {
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
          resolved_at: "2026-03-10T00:20:00.000Z",
          regressed_at: null,
          matched_fields: ["normalized_message"]
        }
      ]
    });
    const store = createPostgresMetadataStore({ query });

    const incident = await store.resolveIncidentForOrganization({
      organization_id: "org_123",
      incident_id: "inc_123",
      resolved_by_member_id: "usr_123",
      resolved_at: "2026-03-10T00:20:00.000Z"
    });

    const sql = String(query.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("WHEN i.status = 'regressed' THEN $4::timestamptz");
    expect(sql).toContain("WHEN i.status = 'regressed' THEN $3::uuid");
    expect(sql).toContain("regressed_at = NULL");
    expect(incident?.resolved_at).toBe("2026-03-10T00:20:00.000Z");
    expect(incident?.regressed_at).toBeNull();
  });

  it("bulk resolves incidents only when they are not already resolved", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          input_order: 1,
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
      ]
    });
    const db: Queryable = { query };
    const store = createPostgresMetadataStore(db);

    await store.resolveIncidentsForOrganization({
      organization_id: "org_123",
      incident_ids: ["inc_123"],
      resolved_by_member_id: "usr_123",
      resolved_at: "2026-03-10T00:12:00.000Z"
    });

    const sql = String(query.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("AND i.status <> 'resolved'");
    expect(sql).not.toContain("AND i.status <> 'open'");
  });
});
