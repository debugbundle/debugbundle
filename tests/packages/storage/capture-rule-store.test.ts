import { describe, expect, it, vi } from "vitest";

import { createPostgresCaptureRuleStore } from "../../../packages/storage/src/capture-rule-store.js";
import { createPostgresCaptureRuleThresholdStore } from "../../../packages/storage/src/capture-rule-threshold-store.js";

describe("capture rule store", () => {
  describe("listCaptureRulesByProjectId", () => {
    it("returns persisted rules ordered by update time", async () => {
      const row = {
        id: "00000000-0000-4000-8000-000000000101",
        project_id: "proj_123",
        name: "Demote analytics resource noise",
        description: null,
        enabled: true,
        action: "demote",
        matcher: {
          event_types: ["frontend_exception"],
          browser_event_kind: "resource_error",
          resource_url: { host: "analytics.example.com" }
        },
        sample_rate: null,
        sample_event_class: null,
        threshold_count: null,
        threshold_window_seconds: null,
        threshold_group_by: null,
        created_by_user_id: null,
        created_from_incident_id: null,
        created_from_event_id: null,
        expires_at: null,
        hit_count: 0,
        last_matched_at: null,
        created_at: "2026-05-26T10:00:00.000Z",
        updated_at: "2026-05-26T10:00:00.000Z"
      };
      const query = vi.fn().mockResolvedValue({ rows: [row] });

      const store = createPostgresCaptureRuleStore({ query });
      const result = await store.listCaptureRulesByProjectId("proj_123");

      expect(result).toEqual([row]);
      expect(query.mock.calls[0]?.[1]).toEqual(["proj_123"]);
    });

    it("normalizes Postgres numeric and timestamp values to the capture rule contract", async () => {
      const query = vi.fn().mockResolvedValue({
        rows: [
          {
            id: "00000000-0000-4000-8000-000000000101",
            project_id: "proj_123",
            name: "Sample blocked slideshow requests",
            description: null,
            enabled: true,
            action: "sample",
            matcher: {
              event_types: ["request_event"],
              first_party: true,
              status_codes: [403]
            },
            sample_rate: "0.25",
            sample_event_class: "preserve",
            created_by_user_id: null,
            created_from_incident_id: null,
            created_from_event_id: null,
            expires_at: new Date("2026-05-28T10:00:00.000Z"),
            hit_count: "12",
            last_matched_at: new Date("2026-05-27T10:00:00.000Z"),
            created_at: new Date("2026-05-26T10:00:00.000Z"),
            updated_at: new Date("2026-05-26T11:00:00.000Z")
          }
        ]
      });

      const store = createPostgresCaptureRuleStore({ query });
      const [result] = await store.listCaptureRulesByProjectId("proj_123");

      expect(result).toEqual({
        id: "00000000-0000-4000-8000-000000000101",
        project_id: "proj_123",
        name: "Sample blocked slideshow requests",
        description: null,
        enabled: true,
        action: "sample",
        matcher: {
          event_types: ["request_event"],
          first_party: true,
          status_codes: [403]
        },
        sample_rate: 0.25,
        sample_event_class: "preserve",
        threshold_count: null,
        threshold_window_seconds: null,
        threshold_group_by: null,
        created_by_user_id: null,
        created_from_incident_id: null,
        created_from_event_id: null,
        expires_at: "2026-05-28T10:00:00.000Z",
        hit_count: 12,
        last_matched_at: "2026-05-27T10:00:00.000Z",
        created_at: "2026-05-26T10:00:00.000Z",
        updated_at: "2026-05-26T11:00:00.000Z"
      });
    });
  });

  describe("createCaptureRule", () => {
    it("inserts a persisted rule and returns it", async () => {
      const row = {
        id: "00000000-0000-4000-8000-000000000101",
        project_id: "proj_123",
        name: "Drop blocked analytics",
        description: null,
        enabled: true,
        action: "drop" as const,
        matcher: {
          event_types: ["frontend_exception"] as const,
          browser_event_kind: "resource_error" as const,
          resource_url: { host: "analytics.example.com" }
        },
        sample_rate: null,
        sample_event_class: null,
        threshold_count: null,
        threshold_window_seconds: null,
        threshold_group_by: null,
        created_by_user_id: "user_123",
        created_from_incident_id: "inc_123",
        created_from_event_id: "evt_123",
        expires_at: null,
        hit_count: 0,
        last_matched_at: null,
        created_at: "2026-05-26T10:00:00.000Z",
        updated_at: "2026-05-26T10:00:00.000Z"
      };
      const query = vi.fn().mockResolvedValue({ rows: [row] });

      const store = createPostgresCaptureRuleStore({ query });
      const result = await store.createCaptureRule({
        id: row.id,
        project_id: row.project_id,
        name: row.name,
        description: row.description,
        enabled: row.enabled,
        action: row.action,
        matcher: row.matcher,
        sample_rate: null,
        sample_event_class: null,
        created_by_user_id: row.created_by_user_id,
        created_from_incident_id: row.created_from_incident_id,
        created_from_event_id: row.created_from_event_id,
        expires_at: row.expires_at
      });

      expect(result).toEqual(row);
      expect(String(query.mock.calls[0]?.[0])).toContain("INSERT INTO capture_rules");
      const params = query.mock.calls[0]?.[1] as unknown[];
      expect(params[6]).toBe(JSON.stringify(row.matcher));
    });

    it("persists and normalizes threshold fields on threshold rules", async () => {
      const row = {
        id: "00000000-0000-4000-8000-000000000102",
        project_id: "proj_123",
        name: "Threshold Vite assets",
        description: null,
        enabled: true,
        action: "threshold" as const,
        matcher: {
          event_types: ["frontend_exception"] as const,
          browser_event_kind: "resource_error" as const,
          resource_url: { host: "app.example.com", path_prefix: "/assets/" }
        },
        sample_rate: null,
        sample_event_class: null,
        threshold_count: "10",
        threshold_window_seconds: "3600",
        threshold_group_by: "resource" as const,
        created_by_user_id: null,
        created_from_incident_id: null,
        created_from_event_id: null,
        expires_at: null,
        hit_count: "0",
        last_matched_at: null,
        created_at: new Date("2026-11-24T10:00:00.000Z"),
        updated_at: new Date("2026-11-24T10:00:00.000Z")
      };
      const query = vi.fn().mockResolvedValue({ rows: [row] });

      const store = createPostgresCaptureRuleStore({ query });
      const result = await store.createCaptureRule({
        id: row.id,
        project_id: row.project_id,
        name: row.name,
        description: null,
        enabled: true,
        action: "threshold",
        matcher: row.matcher,
        sample_rate: null,
        sample_event_class: null,
        threshold_count: 10,
        threshold_window_seconds: 3600,
        threshold_group_by: "resource",
        created_by_user_id: null,
        created_from_incident_id: null,
        created_from_event_id: null,
        expires_at: null
      });

      expect(result).toMatchObject({
        action: "threshold",
        threshold_count: 10,
        threshold_window_seconds: 3600,
        threshold_group_by: "resource"
      });
    });
  });

  describe("updateCaptureRule", () => {
    it("updates the provided fields and returns the rule", async () => {
      const row = {
        id: "00000000-0000-4000-8000-000000000101",
        project_id: "proj_123",
        name: "Sample first-party chunk errors",
        description: "Keep some signal without opening everything.",
        enabled: true,
        action: "sample" as const,
        matcher: {
          event_types: ["frontend_exception"] as const,
          browser_event_kind: "resource_error" as const,
          first_party: true,
          resource_url: { path_prefix: "/assets/" }
        },
        sample_rate: 0.1,
        sample_event_class: "context" as const,
        threshold_count: null,
        threshold_window_seconds: null,
        threshold_group_by: null,
        created_by_user_id: null,
        created_from_incident_id: null,
        created_from_event_id: null,
        expires_at: null,
        hit_count: 12,
        last_matched_at: "2026-05-26T10:00:00.000Z",
        created_at: "2026-05-26T09:00:00.000Z",
        updated_at: "2026-05-26T10:00:00.000Z"
      };
      const query = vi.fn().mockResolvedValue({ rows: [row] });

      const store = createPostgresCaptureRuleStore({ query });
      const result = await store.updateCaptureRule({
        id: row.id,
        project_id: row.project_id,
        name: row.name,
        action: row.action,
        matcher: row.matcher,
        sample_rate: row.sample_rate,
        sample_event_class: row.sample_event_class
      });

      expect(result).toEqual(row);
      const sql = String(query.mock.calls[0]?.[0] ?? "");
      expect(sql).toContain("UPDATE capture_rules");
      expect(sql).toContain("updated_at = NOW()");
    });

    it("throws when no updatable fields are supplied", async () => {
      const store = createPostgresCaptureRuleStore({ query: vi.fn() });

      await expect(
        store.updateCaptureRule({
          id: "00000000-0000-4000-8000-000000000101",
          project_id: "proj_123"
        })
      ).rejects.toThrow("capture_rule_update_empty");
    });
  });

  describe("deleteCaptureRule", () => {
    it("returns true when a rule is deleted", async () => {
      const query = vi
        .fn()
        .mockResolvedValue({ rows: [{ id: "00000000-0000-4000-8000-000000000101" }] });

      const store = createPostgresCaptureRuleStore({ query });

      await expect(
        store.deleteCaptureRule({
          id: "00000000-0000-4000-8000-000000000101",
          project_id: "proj_123"
        })
      ).resolves.toBe(true);
    });
  });

  describe("recordCaptureRuleMatch", () => {
    it("increments hit counts and updates last_matched_at", async () => {
      const query = vi.fn().mockResolvedValue({ rows: [] });
      const store = createPostgresCaptureRuleStore({ query });

      await store.recordCaptureRuleMatch({
        id: "00000000-0000-4000-8000-000000000101",
        project_id: "proj_123",
        matched_at: "2026-05-26T10:00:00.000Z"
      });

      const sql = String(query.mock.calls[0]?.[0] ?? "");
      expect(sql).toContain("hit_count = hit_count + 1");
      expect(query.mock.calls[0]?.[1]).toEqual([
        "2026-05-26T10:00:00.000Z",
        "00000000-0000-4000-8000-000000000101",
        "proj_123"
      ]);
    });
  });

  describe("capture rule threshold store", () => {
    it("bounds rolling-window counts to [lower_bound, received_at] so out-of-order arrivals exclude later events", async () => {
      const query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              enabled: true,
              action: "threshold",
              expires_at: null,
              threshold_count: 3,
              threshold_window_seconds: 3600,
              updated_at: "2026-11-24T08:00:00.000Z"
            }
          ]
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              event_id: "00000000-0000-4000-8000-000000000201",
              resource_route: "/gallery/{param}",
              occurred_at: "2026-11-24T09:00:00.000Z"
            }
          ]
        });

      const thresholdStore = createPostgresCaptureRuleThresholdStore({ query });
      const result = await thresholdStore.evaluateThresholdGate({
        project_id: "00000000-0000-4000-8000-000000000010",
        service_name: "web",
        environment: "production",
        fingerprint: "fp_resource_1",
        event_id: "00000000-0000-4000-8000-000000000201",
        occurred_at: "2026-11-24T09:00:00.000Z",
        received_at: "2026-11-24T09:00:00.000Z",
        resource_route: "/gallery/42",
        rule_id: "00000000-0000-4000-8000-000000000101",
        threshold_count: 3,
        threshold_window_seconds: 3600,
        threshold_group_by: "resource",
        bucket_key: JSON.stringify(["resource", "cdn.example.com", "/assets/app.js"]),
        rule_updated_at: "2026-11-24T08:00:00.000Z"
      });

      expect(result).toEqual({ status: "pending", count: 1 });
      const selectCall = query.mock.calls[5];
      expect(String(selectCall?.[0] ?? "")).toContain("AND received_at >= $6::timestamptz");
      expect(String(selectCall?.[0] ?? "")).toContain(
        "AND received_at <= $7::timestamptz + make_interval(secs => $8)"
      );
      expect(selectCall?.[1]).toEqual([
        "00000000-0000-4000-8000-000000000010",
        "00000000-0000-4000-8000-000000000101",
        "web",
        "production",
        JSON.stringify(["resource", "cdn.example.com", "/assets/app.js"]),
        "2026-11-24T08:00:00.000Z",
        "2026-11-24T09:00:00.000Z",
        3600,
        3
      ]);
    });
  });
});
