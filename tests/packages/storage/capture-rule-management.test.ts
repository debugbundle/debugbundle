import { beforeEach, expect, it, vi } from "vitest";
import {
  CaptureRuleValidationError,
  createCaptureRuleManagement
} from "../../../packages/storage/src/capture-rule-management.js";
import type { Queryable } from "../../../packages/storage/src/types.js";

const { store } = vi.hoisted(() => ({
  store: {
    listCaptureRulesByProjectId: vi.fn(),
    listActiveCaptureRulesByProjectId: vi.fn(),
    getCaptureRuleById: vi.fn(),
    createCaptureRule: vi.fn(),
    updateCaptureRule: vi.fn(),
    deleteCaptureRule: vi.fn(),
    recordCaptureRuleMatch: vi.fn()
  }
}));
vi.mock("../../../packages/storage/src/capture-rule-store.js", () => ({
  createPostgresCaptureRuleStore: () => store
}));

beforeEach(() => {
  vi.clearAllMocks();
  store.updateCaptureRule.mockResolvedValue(null);
  store.getCaptureRuleById.mockResolvedValue(null);
});

function database(allowed = true): { db: Queryable; query: ReturnType<typeof vi.fn> } {
  const query = vi.fn().mockImplementation(async (sql: string) => ({
    rows: sql.includes("SELECT p.id") && allowed ? [{ id: "proj_123" }] : []
  }));
  return {
    db: { query, transaction: async (callback) => callback({ query }) },
    query
  };
}

it("clears sample-only and threshold-only fields when changing a capture rule to a non-sample non-threshold action", async () => {
  const { db } = database();
  await createCaptureRuleManagement(db).updateCaptureRuleForProject({
    organization_id: "org_123",
    project_id: "proj_123",
    rule_id: "00000000-0000-4000-8000-000000000101",
    update: { action: "drop" }
  });
  expect(store.updateCaptureRule).toHaveBeenCalledWith({
    id: "00000000-0000-4000-8000-000000000101",
    project_id: "proj_123",
    action: "drop",
    sample_rate: null,
    sample_event_class: null,
    threshold_count: null,
    threshold_window_seconds: null,
    threshold_group_by: null
  });
});

it("clears pending threshold events when pausing or updating threshold policy", async () => {
  const { db, query } = database();
  store.updateCaptureRule.mockResolvedValueOnce({
    id: "00000000-0000-4000-8000-000000000101",
    project_id: "proj_123",
    enabled: false
  });
  await createCaptureRuleManagement(db).updateCaptureRuleForProject({
    organization_id: "org_123",
    project_id: "proj_123",
    rule_id: "00000000-0000-4000-8000-000000000101",
    update: { enabled: false }
  });
  expect(query).toHaveBeenCalledWith("DELETE FROM capture_rule_threshold_events WHERE rule_id = $1", [
    "00000000-0000-4000-8000-000000000101"
  ]);
});

it("rejects merged threshold updates whose matcher violates resource-threshold constraints", async () => {
  const { db } = database();
  store.getCaptureRuleById.mockResolvedValueOnce({
    id: "00000000-0000-4000-8000-000000000101",
    project_id: "proj_123",
    name: "Existing backend rule",
    description: null,
    enabled: true,
    action: "demote",
    matcher: {
      event_types: ["request_event"],
      request_url: { host: "api.example.com", path_prefix: "/v1/" }
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
    created_at: "2026-11-24T10:00:00.000Z",
    updated_at: "2026-11-24T10:00:00.000Z"
  });

  await expect(
    createCaptureRuleManagement(db).updateCaptureRuleForProject({
      organization_id: "org_123",
      project_id: "proj_123",
      rule_id: "00000000-0000-4000-8000-000000000101",
      update: {
        action: "threshold",
        threshold_count: 10,
        threshold_window_seconds: 3600,
        threshold_group_by: "resource"
      }
    })
  ).rejects.toBeInstanceOf(CaptureRuleValidationError);
  expect(store.updateCaptureRule).not.toHaveBeenCalled();
});

it("does not mutate capture rules after current canonical access is denied", async () => {
  const { db } = database(false);
  const result = await createCaptureRuleManagement(db).updateCaptureRuleForProject({
    organization_id: "org_123",
    actor_user_id: "user",
    project_id: "proj_123",
    rule_id: "rule",
    update: { enabled: false }
  });
  expect(result).toBeNull();
  expect(store.updateCaptureRule).not.toHaveBeenCalled();
});

it("forwards explicit current-project scope changes without inventing a matcher edit", async () => {
  const { db } = database();
  await createCaptureRuleManagement(db).updateCaptureRuleForProject({
    organization_id: "org_123",
    project_id: "proj_123",
    rule_id: "rule",
    update: { project_scope: "current_project" }
  });
  expect(store.updateCaptureRule).toHaveBeenCalledWith({
    id: "rule",
    project_id: "proj_123",
    project_scope: "current_project"
  });
});
