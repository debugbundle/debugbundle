import { expect, it, vi } from "vitest";
import {
  createEvidenceContextRetentionStore,
  cleanupDiagnosticContextRaw
} from "../../../packages/storage/src/evidence-context-retention.js";
it("retains the raw cleanup reference until object deletion succeeds", async () => {
  const reference = {
    project_id: "project",
    event_id: "event",
    occurred_at: "2026-10-26T00:00:00.000Z"
  };
  const list = vi.fn().mockResolvedValue([reference]),
    remove = vi.fn().mockResolvedValue(undefined);
  const store = { listExpiredDiagnosticRawEvents: list, deleteExpiredDiagnosticRawEvents: remove };
  const deleteObject = vi
    .fn()
    .mockRejectedValueOnce(new Error("retry"))
    .mockResolvedValue(undefined);
  expect(
    await cleanupDiagnosticContextRaw(
      store,
      { deleteObject },
      { now: "2026-11-03T00:00:00.000Z", limit: 10 }
    )
  ).toEqual({ found: 1, deleted: 0 });
  expect(remove).not.toHaveBeenCalled();
  expect(
    await cleanupDiagnosticContextRaw(
      store,
      { deleteObject },
      { now: "2026-11-03T00:00:00.000Z", limit: 10 }
    )
  ).toEqual({ found: 1, deleted: 1 });
  expect(remove).toHaveBeenCalledWith({ references: [reference] });
  expect(deleteObject).toHaveBeenCalledWith({
    key: "raw-events/project/2026/10/26/00/event.json.gz"
  });
});
it("includes overflow context tombstones and keeps incident raw errors on their existing retention path", async () => {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  await createEvidenceContextRetentionStore({ query }).listExpiredDiagnosticRawEvents({
    now: "2026-11-03T00:00:00.000Z",
    limit: 10
  });
  expect(query.mock.calls[0]?.[0]).toContain("kind <> 'failure'");
  expect(query.mock.calls[0]?.[0]).not.toContain("is_retained=true");
});
