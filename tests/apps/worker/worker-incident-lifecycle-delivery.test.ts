import { describe, expect, it, vi } from "vitest";
import { processNextGroupIncidentJob } from "../../../apps/worker/src/processor.js";

describe("worker incident lifecycle delivery", () => {
  it("should skip lifecycle publishes when incident is not regressed and not spiking", async (): Promise<void> => {
    const queue = {
      enqueue: vi.fn(),
      dequeue: vi.fn().mockResolvedValue({
        project_id: "proj_123",
        event_id: "evt_123",
        event_type: "log_event",
        service_name: "checkout-api",
        environment: "production",
        fingerprint: "fp_123",
        normalized_message: "boom",
        occurred_at: "2026-03-11T00:00:00.000Z",
        severity: "low"
      })
    };

    const incidentStore = {
      upsertIncident: vi.fn().mockResolvedValue({
        incident_id: "inc_123",
        matched_fields: ["normalized_message"],
        status: "open",
        regressed_now: false,
        occurrence_count: 2
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

    const lifecycleWebhookPublisher = {
      publish: vi.fn().mockResolvedValue(undefined)
    };

    const result = await processNextGroupIncidentJob({
      queue,
      incidentStore,
      frequencyCounter,
      lifecycleWebhookPublisher
    });

    expect(result).toEqual({ processed: true });
    expect(incidentStore.insertIncidentEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        incident_id: "inc_123",
        event_id: "evt_123",
        is_sampled: true
      })
    );
    expect(incidentStore.markIncidentSpiking).not.toHaveBeenCalled();
    expect(lifecycleWebhookPublisher.publish).not.toHaveBeenCalled();
  });

  it("should skip spike handling when group-incident job is a duplicate event", async (): Promise<void> => {
    const queue = {
      enqueue: vi.fn(),
      dequeue: vi.fn().mockResolvedValue({
        project_id: "proj_123",
        event_id: "evt_duplicate",
        event_type: "backend_exception",
        service_name: "checkout-api",
        environment: "production",
        fingerprint: "fp_123",
        normalized_message: "boom",
        occurred_at: "2026-03-11T00:00:00.000Z",
        severity: "high"
      })
    };

    const incidentStore = {
      upsertIncident: vi.fn().mockResolvedValue({
        incident_id: "inc_123",
        matched_fields: ["normalized_message"],
        status: "open",
        regressed_now: false,
        occurrence_count: 2,
        duplicate_event: true
      }),
      insertIncidentEvent: vi.fn().mockResolvedValue(undefined),
      markIncidentSpiking: vi.fn().mockResolvedValue(true)
    };

    const frequencyCounter = {
      recordOccurrence: vi.fn().mockResolvedValue({
        occurrences_1m: 4,
        occurrences_5m: 40,
        occurrences_1h: 60,
        occurrences_24h: 300,
        baseline_1h_per_5m: 5,
        spike_ratio_5m_to_1h: 8,
        has_sufficient_baseline: true,
        is_spiking: true
      })
    };

    const lifecycleWebhookPublisher = {
      publish: vi.fn().mockResolvedValue(undefined)
    };

    const result = await processNextGroupIncidentJob({
      queue,
      incidentStore,
      frequencyCounter,
      lifecycleWebhookPublisher
    });

    expect(result).toEqual({ processed: true });
    expect(incidentStore.insertIncidentEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        incident_id: "inc_123",
        event_id: "evt_duplicate",
        is_sampled: false
      })
    );
    expect(frequencyCounter.recordOccurrence).not.toHaveBeenCalled();
    expect(incidentStore.markIncidentSpiking).not.toHaveBeenCalled();
    expect(lifecycleWebhookPublisher.publish).not.toHaveBeenCalled();
  });

  it("should not publish reopened lifecycle event for duplicate resolved-incident reprocessing", async (): Promise<void> => {
    const queue = {
      enqueue: vi.fn(),
      dequeue: vi.fn().mockResolvedValue({
        project_id: "proj_123",
        event_id: "evt_duplicate",
        event_type: "backend_exception",
        service_name: "checkout-api",
        environment: "production",
        fingerprint: "fp_123",
        normalized_message: "boom",
        occurred_at: "2026-03-11T00:00:00.000Z",
        severity: "high"
      })
    };

    const incidentStore = {
      upsertIncident: vi.fn().mockResolvedValue({
        incident_id: "inc_123",
        matched_fields: ["normalized_message"],
        status: "resolved",
        regressed_now: true,
        occurrence_count: 2,
        duplicate_event: true
      }),
      insertIncidentEvent: vi.fn().mockResolvedValue(undefined),
      markIncidentSpiking: vi.fn().mockResolvedValue(true)
    };

    const frequencyCounter = {
      recordOccurrence: vi.fn().mockResolvedValue({
        occurrences_1m: 4,
        occurrences_5m: 40,
        occurrences_1h: 60,
        occurrences_24h: 300,
        baseline_1h_per_5m: 5,
        spike_ratio_5m_to_1h: 8,
        has_sufficient_baseline: true,
        is_spiking: true
      })
    };

    const lifecycleWebhookPublisher = {
      publish: vi.fn().mockResolvedValue(undefined)
    };

    const result = await processNextGroupIncidentJob({
      queue,
      incidentStore,
      frequencyCounter,
      lifecycleWebhookPublisher
    });

    expect(result).toEqual({ processed: true });
    expect(lifecycleWebhookPublisher.publish).not.toHaveBeenCalled();
    expect(frequencyCounter.recordOccurrence).not.toHaveBeenCalled();
    expect(incidentStore.markIncidentSpiking).not.toHaveBeenCalled();
  });

  it("should not publish spike lifecycle event when incident already marked as spiking", async (): Promise<void> => {
    const queue = {
      enqueue: vi.fn(),
      dequeue: vi.fn().mockResolvedValue({
        project_id: "proj_123",
        event_id: "evt_123",
        event_type: "backend_exception",
        service_name: "checkout-api",
        environment: "production",
        fingerprint: "fp_123",
        normalized_message: "boom",
        occurred_at: "2026-03-11T00:00:00.000Z",
        severity: "high"
      })
    };

    const incidentStore = {
      upsertIncident: vi.fn().mockResolvedValue({
        incident_id: "inc_123",
        matched_fields: ["normalized_message"],
        status: "open",
        regressed_now: false,
        occurrence_count: 2
      }),
      insertIncidentEvent: vi.fn().mockResolvedValue(undefined),
      markIncidentSpiking: vi.fn().mockResolvedValue(false)
    };

    const frequencyCounter = {
      recordOccurrence: vi.fn().mockResolvedValue({
        occurrences_1m: 4,
        occurrences_5m: 40,
        occurrences_1h: 60,
        occurrences_24h: 300,
        baseline_1h_per_5m: 5,
        spike_ratio_5m_to_1h: 8,
        has_sufficient_baseline: true,
        is_spiking: true
      })
    };

    const lifecycleWebhookPublisher = {
      publish: vi.fn().mockResolvedValue(undefined)
    };

    const result = await processNextGroupIncidentJob({
      queue,
      incidentStore,
      frequencyCounter,
      lifecycleWebhookPublisher
    });

    expect(result).toEqual({ processed: true });
    expect(incidentStore.markIncidentSpiking).toHaveBeenCalledOnce();
    expect(lifecycleWebhookPublisher.publish).not.toHaveBeenCalled();
  });

  it("should skip spike lifecycle handling when baseline is insufficient", async (): Promise<void> => {
    const queue = {
      enqueue: vi.fn(),
      dequeue: vi.fn().mockResolvedValue({
        project_id: "proj_123",
        event_id: "evt_123",
        event_type: "backend_exception",
        service_name: "checkout-api",
        environment: "production",
        fingerprint: "fp_123",
        normalized_message: "boom",
        occurred_at: "2026-03-11T00:00:00.000Z",
        severity: "high"
      })
    };

    const incidentStore = {
      upsertIncident: vi.fn().mockResolvedValue({
        incident_id: "inc_123",
        matched_fields: ["normalized_message"],
        status: "open",
        regressed_now: false,
        occurrence_count: 2
      }),
      insertIncidentEvent: vi.fn().mockResolvedValue(undefined),
      markIncidentSpiking: vi.fn().mockResolvedValue(true)
    };

    const frequencyCounter = {
      recordOccurrence: vi.fn().mockResolvedValue({
        occurrences_1m: 3,
        occurrences_5m: 30,
        occurrences_1h: 3,
        occurrences_24h: 3,
        baseline_1h_per_5m: 0.25,
        spike_ratio_5m_to_1h: 30,
        has_sufficient_baseline: false,
        is_spiking: true
      })
    };

    const lifecycleWebhookPublisher = {
      publish: vi.fn().mockResolvedValue(undefined)
    };

    const result = await processNextGroupIncidentJob({
      queue,
      incidentStore,
      frequencyCounter,
      lifecycleWebhookPublisher
    });

    expect(result).toEqual({ processed: true });
    expect(incidentStore.markIncidentSpiking).not.toHaveBeenCalled();
    expect(lifecycleWebhookPublisher.publish).not.toHaveBeenCalled();
  });

  it("should mark regression event as sampled regardless of occurrence count", async (): Promise<void> => {
    const queue = {
      enqueue: vi.fn(),
      dequeue: vi.fn().mockResolvedValue({
        project_id: "proj_123",
        event_id: "evt_regress",
        event_type: "backend_exception",
        service_name: "checkout-api",
        environment: "production",
        fingerprint: "fp_123",
        normalized_message: "TypeError at checkout",
        occurred_at: "2026-03-11T00:00:00.000Z",
        severity: "high"
      })
    };

    const incidentStore = {
      upsertIncident: vi.fn().mockResolvedValue({
        incident_id: "inc_123",
        matched_fields: ["normalized_message"],
        status: "regressed",
        regressed_now: true,
        occurrence_count: 42
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
        has_sufficient_baseline: false,
        is_spiking: false
      })
    };

    const lifecycleWebhookPublisher = {
      publish: vi.fn().mockResolvedValue(undefined)
    };

    await processNextGroupIncidentJob({
      queue,
      incidentStore,
      frequencyCounter,
      lifecycleWebhookPublisher
    });

    expect(incidentStore.insertIncidentEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        incident_id: "inc_123",
        event_id: "evt_regress",
        is_sampled: true
      })
    );
  });

  it("should mark event with deploy metadata as sampled for first-after-deploy tracking", async (): Promise<void> => {
    const queue = {
      enqueue: vi.fn(),
      dequeue: vi.fn().mockResolvedValue({
        project_id: "proj_123",
        event_id: "evt_deploy",
        event_type: "backend_exception",
        service_name: "checkout-api",
        environment: "production",
        fingerprint: "fp_123",
        normalized_message: "TypeError at checkout",
        occurred_at: "2026-03-11T00:00:00.000Z",
        severity: "high",
        deploy_metadata: {
          commit_sha: "abc123",
          version: "1.2.0",
          branch: "main",
          deployed_at: "2026-03-11T00:00:00.000Z"
        }
      })
    };

    const incidentStore = {
      upsertIncident: vi.fn().mockResolvedValue({
        incident_id: "inc_123",
        matched_fields: ["normalized_message"],
        status: "open",
        regressed_now: false,
        occurrence_count: 15
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
        has_sufficient_baseline: false,
        is_spiking: false
      })
    };

    const lifecycleWebhookPublisher = {
      publish: vi.fn().mockResolvedValue(undefined)
    };

    await processNextGroupIncidentJob({
      queue,
      incidentStore,
      frequencyCounter,
      lifecycleWebhookPublisher
    });

    expect(incidentStore.insertIncidentEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        incident_id: "inc_123",
        event_id: "evt_deploy",
        is_sampled: true
      })
    );
  });
});
