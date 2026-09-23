import { expect, it, vi } from "vitest";
import { createPostgresMetadataStore } from "../../../packages/storage/src/index.js";

it("bounds request candidates and prioritizes indexed correlation over legacy incident samples", async () => {
  const reference = {
    event_id: "00000000-0000-4000-8000-000000000001",
    occurred_at: "2026-09-22T00:00:01.000Z"
  };
  const query = vi.fn().mockResolvedValue({ rows: [reference] });
  const result = await createPostgresMetadataStore({
    query
  }).listRequestEventCandidatesForServiceWindow({
    project_id: "project",
    service_name: "web",
    environment: "production",
    window_start: "2026-09-22T00:00:00.000Z",
    window_end: "2026-09-22T00:00:30.000Z",
    resource_event_ids: ["resource"]
  });
  expect(result).toEqual([reference]);
  expect(query.mock.calls[0]![1]).toEqual([
    "project",
    "production",
    "web",
    "2026-09-22T00:00:00.000Z",
    "2026-09-22T00:00:30.000Z",
    ["resource"]
  ]);
  const sql = String(query.mock.calls[0]![0]);
  expect(sql).toContain("ie.is_sampled = true");
  expect(sql).toContain("recovery.project_id = $1");
  expect(sql).toContain("resource.session_hash = recovery.session_hash");
  expect(sql).toContain("ORDER BY MIN(priority)");
  expect(sql).toContain("LIMIT 50");
});
