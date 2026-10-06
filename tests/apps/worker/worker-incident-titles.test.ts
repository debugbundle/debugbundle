import { describe, expect, it, vi } from "vitest";
import {
  deriveIncidentTitle,
  humanizeEventType,
  isMachineGeneratedIncidentTitle,
  processNextGroupIncidentJob
} from "../../../apps/worker/src/processor.js";

describe("worker incident titles", () => {
  it("preserves the worker helper exports", () => {
    expect(deriveIncidentTitle({ event_type: "log_event", normalized_message: "log_event" })).toBe(
      "Application log error"
    );
    expect(humanizeEventType("error_suppressed")).toBe("Error Suppressed");
    expect(
      isMachineGeneratedIncidentTitle({ event_type: "log_event", normalized_message: "{}" })
    ).toBe(true);
  });

  it("uses one concise title for persisted incidents and all notification channels, including old queued jobs", async () => {
    const message = `IllegalStateException: patients unavailable ${"at {dynamic}//io.undertow.ManagedFilter.doFilter(ManagedFilter.java:{dynamic}) ".repeat(100)}`;
    const queue = {
      dequeue: vi.fn().mockResolvedValue({
        project_id: "proj_123",
        event_id: "evt_123",
        event_type: "log_event",
        service_name: "wildfly",
        environment: "staging",
        fingerprint: "unchanged_fingerprint",
        normalized_message: message,
        occurred_at: "2026-10-05T10:00:00.000Z",
        severity: "low"
      }),
      enqueue: vi.fn().mockResolvedValue(undefined)
    };
    const incidentStore = {
      upsertIncident: vi.fn().mockResolvedValue({
        incident_id: "inc_123",
        matched_fields: ["normalized_message"],
        status: "open",
        regressed_now: false,
        occurrence_count: 1,
        duplicate_event: false
      }),
      insertIncidentEvent: vi.fn().mockResolvedValue(undefined),
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
        has_sufficient_baseline: true,
        is_spiking: false
      })
    };
    const alertEvaluationQueue = { enqueue: vi.fn().mockResolvedValue(undefined) };
    const lifecycleWebhookPublisher = { publish: vi.fn().mockResolvedValue(undefined) };
    const githubDispatchPublisher = { publish: vi.fn().mockResolvedValue(undefined) };

    await processNextGroupIncidentJob({
      queue,
      incidentStore,
      frequencyCounter,
      alertEvaluationQueue,
      lifecycleWebhookPublisher,
      githubDispatchPublisher
    });

    const title = "IllegalStateException: patients unavailable";
    expect(incidentStore.upsertIncident).toHaveBeenCalledWith(
      expect.objectContaining({ title, fingerprint: "unchanged_fingerprint" })
    );
    expect(alertEvaluationQueue.enqueue).toHaveBeenCalledWith(
      "evaluate-alerts",
      expect.objectContaining({ summary: title })
    );
    expect(lifecycleWebhookPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: "bundle.created", title })
    );
    expect(githubDispatchPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: "bundle.created", title })
    );
  });
});
