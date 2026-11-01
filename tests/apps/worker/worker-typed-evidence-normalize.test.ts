import { gzipSync } from "node:zlib";
import { expect, it, vi } from "vitest";
import { createEventEnvelope } from "../../../packages/shared-types/src/index.js";
import { processNextNormalizeEventsJob } from "../../../apps/worker/src/processor-normalize.js";

it.each(["promoted_by_policy", "unpromoted", "demoted"] as const)("uses authoritative policy for typed failure ownership without promoting repeated 4xx: %s", async (mode) => {
  const event = createEventEnvelope({ event_type: "request_event", service: { name: "api", environment: "test", runtime: "node" },
    payload: { method: "GET", path: "/v1/orders/123", query: {}, headers: {}, response_status: 403, duration_ms: 1 } });
  const queue = { enqueue: vi.fn().mockResolvedValue(undefined), dequeue: vi.fn().mockResolvedValue({ project_id: "project", event_id: event.event_id,
    object_key: "synthetic", capture_preset: "balanced", received_at: event.occurred_at,
    immediate_client_error_statuses: mode === "promoted_by_policy" ? [403] : [],
    ...(mode === "demoted" ? { capture_rule: { rule_id: "00000000-0000-4000-8000-000000000001", action: "demote", outcome: "demote", sample_rate: null, sample_event_class: null } } : {}) }) };
  const recordEvidenceContext = vi.fn().mockResolvedValue(undefined);
  await processNextNormalizeEventsJob({ queue, recordEvidenceContext,
    objectStore: { getObject: vi.fn().mockResolvedValue(gzipSync(Buffer.from(JSON.stringify(event)))) },
    processedEventStore: { upsertProcessedEvent: vi.fn().mockResolvedValue({ inserted: true }) },
    requestAnomalyCounter: { recordObservation: vi.fn().mockResolvedValue({ occurrences_5m: 1000,
      spike_ratio_5m_to_1h: 100, occurrences_1m: 100, occurrences_1h: 1000, occurrences_24h: 1000,
      baseline_1h_per_5m: 1, has_sufficient_baseline: true, is_spiking: true }) } });
  expect(recordEvidenceContext).toHaveBeenCalledTimes(1);
  expect(recordEvidenceContext.mock.calls[0]?.[3]).toBe(mode === "promoted_by_policy" ? "incident_signal" : "context_signal");
  expect(queue.enqueue).toHaveBeenCalledTimes(1);
});
