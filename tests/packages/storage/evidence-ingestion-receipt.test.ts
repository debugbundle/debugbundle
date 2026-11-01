import { expect, it, vi } from "vitest";
import { createIngestionPersistenceService } from "../../../packages/storage/src/ingestion-services.js";
import { createEventEnvelope } from "../../../packages/shared-types/src/index.js";

function recovery() {
  return createEventEnvelope({
    event_id: "550e8400-e29b-41d4-a716-446655440001",
    event_type: "diagnostic_context",
    occurred_at: "2026-10-26T10:02:00.000Z",
    service: { name: "api", environment: "test" },
    payload: {
      version: 1,
      kind: "recovery",
      failure_ref: "550e8400-e29b-41d4-a716-446655440002",
      scope: { kind: "operation", operation_id: "550e8400-e29b-41d4-a716-446655440003" },
      attempt_id: "550e8400-e29b-41d4-a716-446655440004",
      state: "attempt_completed"
    }
  });
}

it("queues a retry with its durable first receipt, including an initially future-dated event", async () => {
  const enqueue = vi.fn(),
    putObject = vi.fn();
  const claim = vi
    .fn()
    .mockResolvedValue({ matches: true, received_at: "2026-10-26T10:00:00.000Z" });
  const service = createIngestionPersistenceService({
    objectStore: { putObject },
    queue: { enqueue },
    evidenceReceipts: { claim }
  });
  await service.persistAndEnqueue(recovery(), "project", {
    receivedAt: "2026-10-26T10:03:00.000Z"
  });
  expect(claim).toHaveBeenCalledOnce();
  expect(enqueue).toHaveBeenCalledWith(
    "normalize-events",
    expect.objectContaining({ received_at: "2026-10-26T10:00:00.000Z" })
  );
});

it("refuses a changed payload under an existing evidence identity before any raw write or queue operation", async () => {
  const enqueue = vi.fn(),
    putObject = vi.fn();
  const claim = vi
    .fn()
    .mockResolvedValue({ matches: false, received_at: "2026-10-26T10:00:00.000Z" });
  const service = createIngestionPersistenceService({
    objectStore: { putObject },
    queue: { enqueue },
    evidenceReceipts: { claim }
  });
  await expect(service.persistAndEnqueue(recovery(), "project")).rejects.toThrow(
    "evidence_receipt_conflict"
  );
  expect(putObject).not.toHaveBeenCalled();
  expect(enqueue).not.toHaveBeenCalled();
});

it("fails closed for evidence without durable receipts while retaining legacy persistence", async () => {
  const enqueue = vi.fn(),
    putObject = vi.fn();
  const service = createIngestionPersistenceService({
    objectStore: { putObject },
    queue: { enqueue }
  });
  await expect(service.persistAndEnqueue(recovery(), "project")).rejects.toThrow(
    "evidence_receipts_unavailable"
  );
  expect(putObject).not.toHaveBeenCalled();
  const legacy = createEventEnvelope({
    event_type: "log_event",
    service: { name: "api", environment: "test" },
    context: { evidence_reference: { custom: "legacy" } },
    payload: { level: "error", message: "failure", attributes: {} }
  });
  await service.persistAndEnqueue(legacy, "project");
  expect(putObject).toHaveBeenCalledOnce();
  expect(enqueue.mock.calls[0]?.[1]).not.toHaveProperty("received_at");
});

it("keeps ordinary ingestion off the evidence receipt database path", async () => {
  const claim = vi.fn(),
    enqueue = vi.fn(),
    putObject = vi.fn();
  const service = createIngestionPersistenceService({
    objectStore: { putObject },
    queue: { enqueue },
    evidenceReceipts: { claim }
  });
  const event = createEventEnvelope({
    event_type: "log_event",
    service: { name: "api", environment: "test" },
    payload: { level: "error", message: "failure", attributes: {} }
  });
  expect(
    await service.claimEvidenceReceipt?.(event, "project", "2026-10-26T10:00:00.000Z")
  ).toEqual({ matches: true, received_at: "2026-10-26T10:00:00.000Z" });
  await service.persistAndEnqueue(event, "project");
  expect(claim).not.toHaveBeenCalled();
  expect(putObject).toHaveBeenCalledOnce();
});
