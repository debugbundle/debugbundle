import { beforeEach, expect, it, vi } from "vitest";
import { createCaptureRuleManagement } from "../../../packages/storage/src/capture-rule-management.js";
import type { Queryable } from "../../../packages/storage/src/types.js";
const { store } = vi.hoisted(() => ({
  store: {
    listCaptureRulesByProjectId: vi.fn(),
    listActiveCaptureRulesByProjectId: vi.fn(),
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
});
function database(allowed = true): Queryable {
  const query = vi.fn().mockImplementation(async (sql: string) => ({
    rows: sql.includes("SELECT p.id") && allowed ? [{ id: "proj_123" }] : []
  }));
  return { query, transaction: async (callback) => callback({ query }) };
}
it("clears sample-only fields when changing a capture rule to a non-sample action", async () => {
  await createCaptureRuleManagement(database()).updateCaptureRuleForProject({
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
    sample_event_class: null
  });
});
it("does not mutate capture rules after current canonical access is denied", async () => {
  const result = await createCaptureRuleManagement(database(false)).updateCaptureRuleForProject({
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
  await createCaptureRuleManagement(database()).updateCaptureRuleForProject({
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
