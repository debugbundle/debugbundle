import { describe, expect, it, vi } from "vitest";

import { createPostgresCaptureRuleStore } from "../../../packages/storage/src/capture-rule-store.js";

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
          resource_url: { host: "analytics.example.com" },
        },
        sample_rate: null,
        sample_event_class: null,
        created_by_user_id: null,
        created_from_incident_id: null,
        created_from_event_id: null,
        expires_at: null,
        hit_count: 0,
        last_matched_at: null,
        created_at: "2026-05-26T10:00:00.000Z",
        updated_at: "2026-05-26T10:00:00.000Z",
      };
      const query = vi.fn().mockResolvedValue({ rows: [row] });

      const store = createPostgresCaptureRuleStore({ query });
      const result = await store.listCaptureRulesByProjectId("proj_123");

      expect(result).toEqual([row]);
      expect(query.mock.calls[0]?.[1]).toEqual(["proj_123"]);
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
          resource_url: { host: "analytics.example.com" },
        },
        sample_rate: null,
        sample_event_class: null,
        created_by_user_id: "user_123",
        created_from_incident_id: "inc_123",
        created_from_event_id: "evt_123",
        expires_at: null,
        hit_count: 0,
        last_matched_at: null,
        created_at: "2026-05-26T10:00:00.000Z",
        updated_at: "2026-05-26T10:00:00.000Z",
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
        expires_at: row.expires_at,
      });

      expect(result).toEqual(row);
      expect(String(query.mock.calls[0]?.[0])).toContain("INSERT INTO capture_rules");
      const params = query.mock.calls[0]?.[1] as unknown[];
      expect(params[6]).toBe(JSON.stringify(row.matcher));
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
          resource_url: { path_prefix: "/assets/" },
        },
        sample_rate: 0.1,
        sample_event_class: "context" as const,
        created_by_user_id: null,
        created_from_incident_id: null,
        created_from_event_id: null,
        expires_at: null,
        hit_count: 12,
        last_matched_at: "2026-05-26T10:00:00.000Z",
        created_at: "2026-05-26T09:00:00.000Z",
        updated_at: "2026-05-26T10:00:00.000Z",
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
        sample_event_class: row.sample_event_class,
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
          project_id: "proj_123",
        })
      ).rejects.toThrow("capture_rule_update_empty");
    });
  });

  describe("deleteCaptureRule", () => {
    it("returns true when a rule is deleted", async () => {
      const query = vi.fn().mockResolvedValue({ rows: [{ id: "00000000-0000-4000-8000-000000000101" }] });

      const store = createPostgresCaptureRuleStore({ query });

      await expect(
        store.deleteCaptureRule({
          id: "00000000-0000-4000-8000-000000000101",
          project_id: "proj_123",
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
        matched_at: "2026-05-26T10:00:00.000Z",
      });

      const sql = String(query.mock.calls[0]?.[0] ?? "");
      expect(sql).toContain("hit_count = hit_count + 1");
      expect(query.mock.calls[0]?.[1]).toEqual([
        "2026-05-26T10:00:00.000Z",
        "00000000-0000-4000-8000-000000000101",
        "proj_123",
      ]);
    });
  });
});
