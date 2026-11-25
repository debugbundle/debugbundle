import { describe, expect, it, vi } from "vitest";

import { processNextGroupIncidentJob } from "../../../apps/worker/src/processor.js";

describe("worker processor – capture-rule threshold grouping", () => {
  const baseJob = {
    project_id: "proj_123",
    event_id: "evt_11",
    event_type: "frontend_exception" as const,
    event_class: "incident_signal" as const,
    service_name: "web",
    environment: "production",
    fingerprint: "fp_resource_v3",
    fingerprint_version: "v3",
    normalized_message: "Browser resource load error",
    incident_title: "App script failed to load",
    resource_route: "/checkout",
    matched_fields: ["browser_event_kind", "resource_host", "capture_rule_threshold"],
    occurred_at: "2026-11-24T10:11:00.000Z",
    severity: "medium" as const,
    capture_rule_threshold: {
      rule_id: "00000000-0000-4000-8000-000000000301",
      threshold_count: 11,
      threshold_window_seconds: 3600,
      threshold_group_by: "resource" as const,
      bucket_key: JSON.stringify(["resource", "app.example.com", "/assets/app-123.js"]),
      rule_updated_at: "2026-11-24T09:00:00.000Z",
      received_at: "2026-11-24T10:11:00.000Z"
    }
  };

  it("defers incident creation, bundles, webhooks, and alerts while below threshold", async () => {
    const queue = {
      dequeue: vi.fn().mockResolvedValue(baseJob),
      enqueue: vi.fn()
    };
    const incidentStore = {
      upsertIncident: vi.fn(),
      insertIncidentEvent: vi.fn(),
      markIncidentSpiking: vi.fn()
    };
    const frequencyCounter = { recordOccurrence: vi.fn() };
    const lifecycleWebhookPublisher = { publish: vi.fn() };
    const alertEvaluationQueue = { enqueue: vi.fn() };
    const captureRuleThresholdStore = {
      evaluateThresholdGate: vi.fn().mockResolvedValue({ status: "pending", count: 10 }),
      consumeThresholdEvents: vi.fn(),
      pruneExpiredCaptureRuleThresholdEvents: vi.fn()
    };

    const result = await processNextGroupIncidentJob({
      queue,
      incidentStore,
      frequencyCounter,
      lifecycleWebhookPublisher,
      alertEvaluationQueue,
      captureRuleThresholdStore
    });

    expect(result).toEqual({ processed: true, reason: "threshold_pending" });
    expect(incidentStore.upsertIncident).not.toHaveBeenCalled();
    expect(queue.enqueue).not.toHaveBeenCalled();
    expect(lifecycleWebhookPublisher.publish).not.toHaveBeenCalled();
    expect(alertEvaluationQueue.enqueue).not.toHaveBeenCalled();
    expect(captureRuleThresholdStore.consumeThresholdEvents).not.toHaveBeenCalled();
  });

  it("opens once on threshold crossing using created_now even when occurrence_count starts at 11", async () => {
    const priorEvents = Array.from({ length: 10 }, (_, index) => ({
      event_id: `00000000-0000-4000-8000-0000000000${String(index + 1).padStart(2, "0")}`,
      occurred_at: `2026-11-24T10:${String(index + 1).padStart(2, "0")}:00.000Z`,
      resource_route: `/route-${index + 1}`
    }));
    const consumedIds = [...priorEvents.map((entry) => entry.event_id), baseJob.event_id];

    const queue = {
      dequeue: vi.fn().mockResolvedValue(baseJob),
      enqueue: vi.fn().mockResolvedValue(undefined)
    };
    const incidentStore = {
      upsertIncident: vi.fn().mockResolvedValue({
        incident_id: "inc_threshold_1",
        matched_fields: baseJob.matched_fields,
        status: "open" as const,
        created_now: true,
        regressed_now: false,
        occurrence_count: 11,
        duplicate_event: false
      }),
      insertIncidentEvent: vi.fn().mockResolvedValue(undefined),
      recordIncidentEventRetention: vi.fn().mockResolvedValue({
        is_sampled: true,
        demoted_event_references: []
      }),
      markIncidentSpiking: vi.fn().mockResolvedValue(false)
    };
    const frequencyCounter = {
      recordOccurrence: vi.fn().mockResolvedValue({
        occurrences_1m: 1,
        occurrences_5m: 1,
        occurrences_1h: 1,
        occurrences_24h: 1,
        baseline_1h_per_5m: 1,
        spike_ratio_5m_to_1h: 1,
        has_sufficient_baseline: false,
        is_spiking: false
      })
    };
    const lifecycleWebhookPublisher = { publish: vi.fn().mockResolvedValue(undefined) };
    const alertEvaluationQueue = { enqueue: vi.fn().mockResolvedValue(undefined) };
    const captureRuleThresholdStore = {
      evaluateThresholdGate: vi.fn().mockResolvedValue({
        status: "crossed",
        prior_events: priorEvents,
        consumed_event_ids: consumedIds
      }),
      consumeThresholdEvents: vi.fn().mockResolvedValue(undefined),
      pruneExpiredCaptureRuleThresholdEvents: vi.fn()
    };

    const result = await processNextGroupIncidentJob({
      queue,
      incidentStore,
      frequencyCounter,
      lifecycleWebhookPublisher,
      alertEvaluationQueue,
      captureRuleThresholdStore
    });

    expect(result).toEqual({ processed: true });
    expect(incidentStore.upsertIncident).toHaveBeenCalledWith(
      expect.objectContaining({
        prior_events: priorEvents
      })
    );
    expect(captureRuleThresholdStore.consumeThresholdEvents).toHaveBeenCalledWith({
      event_ids: consumedIds
    });
    expect(incidentStore.recordIncidentEventRetention).toHaveBeenCalledWith(
      expect.objectContaining({
        incident_id: "inc_threshold_1",
        occurrence_count: 11,
        retain_first: true
      })
    );
    expect(queue.enqueue).toHaveBeenCalledWith(
      "build-bundle",
      expect.objectContaining({
        incident_id: "inc_threshold_1",
        occurrence_count: 11,
        trigger: "occurrence_threshold"
      })
    );
    expect(lifecycleWebhookPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: "bundle.created",
        incident_id: "inc_threshold_1"
      })
    );
    expect(alertEvaluationQueue.enqueue).toHaveBeenCalledWith(
      "evaluate-alerts",
      expect.objectContaining({
        condition_type: "new_incident",
        incident_id: "inc_threshold_1"
      })
    );
  });
});
