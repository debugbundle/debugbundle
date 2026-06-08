import { describe, expect, it, vi } from "vitest";

import { createPostgresCapturePolicyStore } from "../../../packages/storage/src/capture-policy-store.js";

describe("capture policy store", () => {
  describe("getCapturePolicyByProjectId", () => {
    it("returns the policy record when a row exists", async () => {
      const row = {
        project_id: "proj_123",
        preset: "balanced",
        capture_logs: "warning",
        capture_request_events: null,
        capture_breadcrumbs: null,
        capture_probe_events: null,
        immediate_client_error_statuses: null,
        updated_at: "2026-03-15T00:00:00.000Z",
      };
      const query = vi.fn().mockResolvedValue({ rows: [row] });

      const store = createPostgresCapturePolicyStore({ query });
      const result = await store.getCapturePolicyByProjectId("proj_123");

      expect(result).toEqual(row);
      expect(query).toHaveBeenCalledOnce();
      expect(query.mock.calls[0]![1]).toEqual(["proj_123"]);
    });

    it("returns null when no row exists", async () => {
      const query = vi.fn().mockResolvedValue({ rows: [] });

      const store = createPostgresCapturePolicyStore({ query });
      const result = await store.getCapturePolicyByProjectId("proj_not_found");

      expect(result).toBeNull();
    });
  });

  describe("upsertCapturePolicy", () => {
    it("inserts a new policy and returns the record", async () => {
      const row = {
        project_id: "proj_123",
        preset: "minimal",
        capture_logs: null,
        capture_request_events: null,
        capture_breadcrumbs: null,
        capture_probe_events: null,
        immediate_client_error_statuses: null,
        updated_at: "2026-03-15T00:00:00.000Z",
      };
      const query = vi.fn().mockResolvedValue({ rows: [row] });

      const store = createPostgresCapturePolicyStore({ query });
      const result = await store.upsertCapturePolicy({
        project_id: "proj_123",
        preset: "minimal",
      });

      expect(result).toEqual(row);
      expect(query).toHaveBeenCalledOnce();
      // Should use INSERT ... ON CONFLICT
      const sql = query.mock.calls[0]![0] as string;
      expect(sql).toContain("INSERT INTO capture_policies");
      expect(sql).toContain("ON CONFLICT");
    });

    it("updates an existing policy with selective overrides", async () => {
      const row = {
        project_id: "proj_123",
        preset: "balanced",
        capture_logs: "info",
        capture_request_events: null,
        capture_breadcrumbs: null,
        capture_probe_events: null,
        immediate_client_error_statuses: [401, 403],
        updated_at: "2026-03-15T01:00:00.000Z",
      };
      const query = vi.fn().mockResolvedValue({ rows: [row] });

      const store = createPostgresCapturePolicyStore({ query });
      const result = await store.upsertCapturePolicy({
        project_id: "proj_123",
        preset: "balanced",
        capture_logs: "info",
        immediate_client_error_statuses: [401, 403],
      });

      expect(result).toEqual(row);
    });

    it("passes null overrides through correctly", async () => {
      const row = {
        project_id: "proj_123",
        preset: "investigative",
        capture_logs: null,
        capture_request_events: "all",
        capture_breadcrumbs: null,
        capture_probe_events: null,
        immediate_client_error_statuses: [],
        updated_at: "2026-03-15T02:00:00.000Z",
      };
      const query = vi.fn().mockResolvedValue({ rows: [row] });

      const store = createPostgresCapturePolicyStore({ query });
      const result = await store.upsertCapturePolicy({
        project_id: "proj_123",
        preset: "investigative",
        capture_logs: null,
        capture_request_events: "all",
        immediate_client_error_statuses: [],
      });

      expect(result).toEqual(row);
      // Verify all 8 params are passed
      const params = query.mock.calls[0]![1] as unknown[];
      expect(params).toHaveLength(8);
      expect(params[6]).toBe(JSON.stringify([]));
      expect(params[7]).toBeNull();
    });
  });

  describe("createDefaultCapturePolicy", () => {
    it("creates a default policy based on the tier plan", async () => {
      const row = {
        project_id: "proj_123",
        preset: "balanced",
        capture_logs: null,
        capture_request_events: null,
        capture_breadcrumbs: null,
        capture_probe_events: null,
        immediate_client_error_statuses: null,
        updated_at: "2026-03-15T00:00:00.000Z",
      };
      const query = vi.fn().mockResolvedValue({ rows: [row] });

      const store = createPostgresCapturePolicyStore({ query });
      const result = await store.createDefaultCapturePolicy("proj_123", "free");

      expect(result).toEqual(row);
      // Should use preset "balanced" for free tier
      const params = query.mock.calls[0]![1] as unknown[];
      expect(params[0]).toBe("proj_123");
      expect(params[1]).toBe("balanced");
    });

    it("creates a balanced default for solo tier", async () => {
      const row = {
        project_id: "proj_solo",
        preset: "balanced",
        capture_logs: null,
        capture_request_events: null,
        capture_breadcrumbs: null,
        capture_probe_events: null,
        immediate_client_error_statuses: null,
        updated_at: "2026-03-15T00:00:00.000Z",
      };
      const query = vi.fn().mockResolvedValue({ rows: [row] });

      const store = createPostgresCapturePolicyStore({ query });
      const result = await store.createDefaultCapturePolicy("proj_solo", "solo");

      expect(result).toEqual(row);
      const params = query.mock.calls[0]![1] as unknown[];
      expect(params[1]).toBe("balanced");
    });

    it("falls back to minimal for unknown plans", async () => {
      const row = {
        project_id: "proj_unknown",
        preset: "minimal",
        capture_logs: null,
        capture_request_events: null,
        capture_breadcrumbs: null,
        capture_probe_events: null,
        immediate_client_error_statuses: null,
        updated_at: "2026-03-15T00:00:00.000Z",
      };
      const query = vi.fn().mockResolvedValue({ rows: [row] });

      const store = createPostgresCapturePolicyStore({ query });
      const result = await store.createDefaultCapturePolicy("proj_unknown", "enterprise");

      expect(result).toEqual(row);
      const params = query.mock.calls[0]![1] as unknown[];
      expect(params[1]).toBe("minimal");
    });
  });
});
