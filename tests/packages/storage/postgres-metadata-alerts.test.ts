import { describe, expect, it, vi } from "vitest";
import { createPostgresMetadataStore } from "../../../packages/storage/src/index.js";

describe("postgres metadata alerts", () => {
  it("should list alerts for an in-scope project", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "proj_123" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            alert_id: "alt_123",
            project_id: "proj_123",
            created_by_user_id: "usr_123",
            service_id: null,
            channel: "email",
            condition_type: "new_incident",
            severity_min: null,
            severity_lifecycle_scope: null,
            cooldown_seconds: 0,
            config: { to: "owner@example.com" },
            is_enabled: true,
            created_at: "2026-03-15T00:00:00.000Z",
            updated_at: "2026-03-15T00:00:00.000Z"
          }
        ]
      });
    const store = createPostgresMetadataStore({ query });

    const alerts = await store.listAlertsForOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      limit: 10
    });

    expect(alerts).toEqual([
      {
        alert_id: "alt_123",
        project_id: "proj_123",
        created_by_user_id: "usr_123",
        service_id: null,
        channel: "email",
        condition_type: "new_incident",
        severity_min: null,
        severity_lifecycle_scope: null,
        cooldown_seconds: 0,
        config: { to: "owner@example.com" },
        is_enabled: true,
        created_at: "2026-03-15T00:00:00.000Z",
        updated_at: "2026-03-15T00:00:00.000Z"
      }
    ]);
  });

  it("should create, update, and delete a scoped alert", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "proj_123" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            alert_id: "alt_123",
            project_id: "proj_123",
            created_by_user_id: "usr_123",
            service_id: null,
            channel: "email",
            condition_type: "new_incident",
            severity_min: null,
            severity_lifecycle_scope: null,
            cooldown_seconds: 0,
            config: { to: "owner@example.com" },
            is_enabled: true,
            created_at: "2026-03-15T00:00:00.000Z",
            updated_at: "2026-03-15T00:00:00.000Z"
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            alert_id: "alt_123",
            project_id: "proj_123",
            created_by_user_id: "usr_123",
            service_id: "svc_123",
            channel: "webhook",
            condition_type: "severity_threshold",
            severity_min: "high",
            severity_lifecycle_scope: "both",
            cooldown_seconds: 0,
            config: { target_url: "https://hooks.example.test/alerts" },
            is_enabled: false,
            created_at: "2026-03-15T00:00:00.000Z",
            updated_at: "2026-03-15T00:05:00.000Z"
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [{ alert_id: "alt_123" }] });
    const store = createPostgresMetadataStore({ query });

    const created = await store.createAlertForOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      created_by_user_id: "usr_123",
      channel: "email",
      condition_type: "new_incident",
      cooldown_seconds: 0,
      config: { to: "owner@example.com" },
      is_enabled: true
    });
    const updated = await store.updateAlertForOrganization({
      organization_id: "org_123",
      alert_id: "alt_123",
      channel: "webhook",
      condition_type: "severity_threshold",
      service_id: "svc_123",
      severity_min: "high",
      cooldown_seconds: 0,
      config: { target_url: "https://hooks.example.test/alerts" },
      is_enabled: false
    });
    const deleted = await store.deleteAlertForOrganization({
      organization_id: "org_123",
      alert_id: "alt_123"
    });

    expect(created).toEqual({
      alert_id: "alt_123",
      project_id: "proj_123",
      created_by_user_id: "usr_123",
      service_id: null,
      channel: "email",
      condition_type: "new_incident",
      severity_min: null,
      severity_lifecycle_scope: null,
      cooldown_seconds: 0,
      config: { to: "owner@example.com" },
      is_enabled: true,
      created_at: "2026-03-15T00:00:00.000Z",
      updated_at: "2026-03-15T00:00:00.000Z"
    });
    expect(updated).toEqual({
      alert_id: "alt_123",
      project_id: "proj_123",
      created_by_user_id: "usr_123",
      service_id: "svc_123",
      channel: "webhook",
      condition_type: "severity_threshold",
      severity_min: "high",
      severity_lifecycle_scope: "both",
      cooldown_seconds: 0,
      config: { target_url: "https://hooks.example.test/alerts" },
      is_enabled: false,
      created_at: "2026-03-15T00:00:00.000Z",
      updated_at: "2026-03-15T00:05:00.000Z"
    });
    expect(deleted).toEqual({ alert_id: "alt_123" });
  });

  it("returns null for alert operations when the project scope check fails", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    const store = createPostgresMetadataStore({ query });

    const listed = await store.listAlertsForOrganization({
      organization_id: "org_123",
      project_id: "proj_missing",
      limit: 10
    });
    const created = await store.createAlertForOrganization({
      organization_id: "org_123",
      project_id: "proj_missing",
      created_by_user_id: "usr_123",
      service_id: "svc_123",
      channel: "email",
      condition_type: "new_incident",
      cooldown_seconds: 0,
      config: { to: "owner@example.com" },
      is_enabled: true
    });

    expect(listed).toBeNull();
    expect(created).toBeNull();
  });

  it("omits optional alert update fields when they are not provided", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValueOnce({
      rows: [
        {
          alert_id: "alt_456",
          project_id: "proj_123",
          created_by_user_id: "usr_123",
          service_id: null,
          channel: "email",
          condition_type: "new_incident",
          severity_min: null,
          severity_lifecycle_scope: null,
          cooldown_seconds: 0,
          config: {},
          is_enabled: true,
          created_at: "2026-03-15T00:00:00.000Z",
          updated_at: "2026-03-15T00:10:00.000Z"
        }
      ]
    });
    const store = createPostgresMetadataStore({ query });

    const updated = await store.updateAlertForOrganization({
      organization_id: "org_123",
      alert_id: "alt_456",
      channel: "email",
      condition_type: "new_incident",
      is_enabled: true
    });

    expect(updated).toEqual({
      alert_id: "alt_456",
      project_id: "proj_123",
      created_by_user_id: "usr_123",
      service_id: null,
      channel: "email",
      condition_type: "new_incident",
      severity_min: null,
      severity_lifecycle_scope: null,
      cooldown_seconds: 0,
      config: {},
      is_enabled: true,
      created_at: "2026-03-15T00:00:00.000Z",
      updated_at: "2026-03-15T00:10:00.000Z"
    });
    expect(query).toHaveBeenCalledWith(expect.any(String), [
      "alt_456",
      "org_123",
      false,
      null,
      "email",
      "new_incident",
      false,
      null,
      true,
      null,
      false,
      0,
      false,
      null,
      true,
      null,
      null,
      null,
      expect.stringMatching(/^dbundle_asec_[A-Za-z0-9_-]{43}$/),
      false
    ]);
  });
});
