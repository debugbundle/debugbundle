import { describe, expect, it, vi } from "vitest";

import {
  processNextGroupIncidentJob
} from "../../../apps/worker/src/processor.js";
import { type MockedMethods } from "../../helpers/vitest.ts";

type GroupIncidentDependencies = Parameters<typeof processNextGroupIncidentJob>[0];

describe("worker processor \u2013 group-incident", () => {
  it("should process group-incident job and emit reopened + spike lifecycle events", async (): Promise<void> => {
    const queue = {
      enqueue: vi.fn(),
      dequeue: vi.fn().mockResolvedValue({
        project_id: "proj_123",
        event_id: "evt_123",
        event_type: "backend_exception",
        service_name: "checkout-api",
        environment: "production",
        fingerprint: "fp_123",
        fingerprint_version: "v2",
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
        occurrence_count: 1
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
    expect(incidentStore.upsertIncident).toHaveBeenCalledWith(
      expect.objectContaining({
        fingerprint_version: "v2"
      })
    );
    expect(incidentStore.insertIncidentEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        incident_id: "inc_123",
        event_id: "evt_123",
        is_sampled: true
      })
    );
    expect(lifecycleWebhookPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: "bundle.reopened", incident_id: "inc_123" })
    );
    expect(lifecycleWebhookPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: "incident.spike_detected", incident_id: "inc_123" })
    );
  });

  it("should keep the current latest occurrence sampled", async (): Promise<void> => {
    const queue = {
      enqueue: vi.fn(),
      dequeue: vi.fn().mockResolvedValue({
        project_id: "proj_123",
        event_id: "evt_latest",
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
        status: "open",
        regressed_now: false,
        occurrence_count: 2,
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
    expect(incidentStore.recordIncidentEventRetention).toHaveBeenCalledWith(
      expect.objectContaining({
        incident_id: "inc_123",
        event_id: "evt_latest",
        severity: "high",
        occurrence_count: 2
      })
    );
  });

  it("should delete demoted raw event blobs when an occurrence falls out of the sampled set", async (): Promise<void> => {
    const queue = {
      enqueue: vi.fn(),
      dequeue: vi.fn().mockResolvedValue({
        project_id: "proj_123",
        event_id: "evt_latest_3",
        event_type: "backend_exception",
        service_name: "checkout-api",
        environment: "production",
        fingerprint: "fp_123",
        normalized_message: "TypeError at checkout",
        occurred_at: "2026-03-11T00:00:02.000Z",
        severity: "high"
      })
    };

    const incidentStore = {
      upsertIncident: vi.fn().mockResolvedValue({
        incident_id: "inc_123",
        matched_fields: ["normalized_message"],
        status: "open",
        regressed_now: false,
        occurrence_count: 3,
        duplicate_event: false
      }),
      insertIncidentEvent: vi.fn().mockResolvedValue(undefined),
      recordIncidentEventRetention: vi.fn().mockResolvedValue({
        is_sampled: true,
        demoted_event_references: [
          {
            event_id: "evt_latest_2",
            occurred_at: "2026-03-11T00:00:01.000Z"
          }
        ]
      }),
      markIncidentSpiking: vi.fn().mockResolvedValue(false)
    };

    const objectStore = {
      deleteObject: vi.fn().mockResolvedValue(undefined)
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
      lifecycleWebhookPublisher,
      objectStore
    });

    expect(result).toEqual({ processed: true });
    expect(objectStore.deleteObject).toHaveBeenCalledWith({
      key: "raw-events/proj_123/2026/03/11/00/evt_latest_2.json.gz"
    });
  });

  it("should include deploy correlation details when reopening a resolved incident within 24h of deploy", async (): Promise<void> => {
    const queue = {
      enqueue: vi.fn(),
      dequeue: vi.fn().mockResolvedValue({
        project_id: "proj_123",
        event_id: "evt_123",
        event_type: "backend_exception",
        service_name: "checkout-api",
        environment: "production",
        fingerprint: "fp_123",
        normalized_message: "TypeError at checkout",
        occurred_at: "2026-03-11T01:30:00.000Z",
        severity: "high"
      })
    };

    const incidentStore = {
      upsertIncident: vi.fn().mockResolvedValue({
        incident_id: "inc_123",
        matched_fields: ["normalized_message"],
        status: "regressed",
        regressed_now: true,
        occurrence_count: 2,
        regression_deploy: {
          deployment_id: "dep_123",
          commit_sha: "abc123def456",
          version: "v2.4.0",
          branch: "main",
          deployed_at: "2026-03-10T23:30:00.000Z",
          minutes_since_deploy: 120
        }
      }),
      insertIncidentEvent: vi.fn().mockResolvedValue(undefined),
      markIncidentSpiking: vi.fn().mockResolvedValue(false)
    };

    const frequencyCounter = {
      recordOccurrence: vi.fn().mockResolvedValue({
        occurrences_1m: 1,
        occurrences_5m: 1,
        occurrences_1h: 2,
        occurrences_24h: 10,
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
    expect(lifecycleWebhookPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: "bundle.reopened",
        incident_id: "inc_123",
        regression_deploy: {
          deployment_id: "dep_123",
          commit_sha: "abc123def456",
          version: "v2.4.0",
          branch: "main",
          deployed_at: "2026-03-10T23:30:00.000Z",
          minutes_since_deploy: 120
        }
      })
    );
  });

  it.each([1, 3, 10])(
    "should enqueue build-bundle when occurrence threshold %s is reached",
    async (occurrenceCount: number): Promise<void> => {
      const queue = {
        enqueue: vi.fn().mockResolvedValue(undefined),
        dequeue: vi.fn().mockResolvedValue({
          project_id: "proj_123",
          event_id: `evt_threshold_${occurrenceCount}`,
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
          status: "open",
          regressed_now: false,
          occurrence_count: occurrenceCount,
          duplicate_event: false
        }),
        insertIncidentEvent: vi.fn().mockResolvedValue(undefined),
        markIncidentSpiking: vi.fn().mockResolvedValue(false)
      };

      const frequencyCounter = {
        recordOccurrence: vi.fn().mockResolvedValue({
          occurrences_1m: 1,
          occurrences_5m: 1,
          occurrences_1h: 5,
          occurrences_24h: 10,
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
      expect(queue.enqueue).toHaveBeenCalledWith(
        "build-bundle",
        expect.objectContaining({
          project_id: "proj_123",
          incident_id: "inc_123",
          trigger: "occurrence_threshold",
          occurrence_count: occurrenceCount
        })
      );
    }
  );

  it("should enqueue build-bundle when incident is reopened by regression", async (): Promise<void> => {
    const queue = {
      enqueue: vi.fn().mockResolvedValue(undefined),
      dequeue: vi.fn().mockResolvedValue({
        project_id: "proj_123",
        event_id: "evt_regression",
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
        occurrence_count: 2,
        duplicate_event: false
      }),
      insertIncidentEvent: vi.fn().mockResolvedValue(undefined),
      markIncidentSpiking: vi.fn().mockResolvedValue(false)
    };

    const frequencyCounter = {
      recordOccurrence: vi.fn().mockResolvedValue({
        occurrences_1m: 1,
        occurrences_5m: 1,
        occurrences_1h: 5,
        occurrences_24h: 10,
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
    expect(queue.enqueue).toHaveBeenCalledWith(
      "build-bundle",
      expect.objectContaining({
        project_id: "proj_123",
        incident_id: "inc_123",
        trigger: "regression_reopen",
        occurrence_count: 2
      })
    );
  });

  it("should not enqueue build-bundle when duplicate replay marks regression without transition", async (): Promise<void> => {
    const queue = {
      enqueue: vi.fn().mockResolvedValue(undefined),
      dequeue: vi.fn().mockResolvedValue({
        project_id: "proj_123",
        event_id: "evt_duplicate_regression",
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
        status: "resolved",
        regressed_now: true,
        occurrence_count: 2,
        duplicate_event: true
      }),
      insertIncidentEvent: vi.fn().mockResolvedValue(undefined),
      markIncidentSpiking: vi.fn().mockResolvedValue(false)
    };

    const frequencyCounter = {
      recordOccurrence: vi.fn().mockResolvedValue({
        occurrences_1m: 1,
        occurrences_5m: 1,
        occurrences_1h: 5,
        occurrences_24h: 10,
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
    expect(queue.enqueue).not.toHaveBeenCalledWith("build-bundle", expect.anything());
  });

  it("should enqueue build-bundle when a new context type is added to an existing incident", async (): Promise<void> => {
    const queue = {
      enqueue: vi.fn().mockResolvedValue(undefined),
      dequeue: vi.fn().mockResolvedValue({
        project_id: "proj_123",
        event_id: "evt_new_context",
        event_type: "frontend_exception",
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
        status: "open",
        regressed_now: false,
        occurrence_count: 2,
        duplicate_event: false,
        new_context_type_added: true,
        reproduction_confidence_changed: false
      }),
      insertIncidentEvent: vi.fn().mockResolvedValue(undefined),
      markIncidentSpiking: vi.fn().mockResolvedValue(false)
    };

    const frequencyCounter = {
      recordOccurrence: vi.fn().mockResolvedValue({
        occurrences_1m: 1,
        occurrences_5m: 1,
        occurrences_1h: 5,
        occurrences_24h: 10,
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
    expect(queue.enqueue).toHaveBeenCalledWith(
      "build-bundle",
      expect.objectContaining({
        project_id: "proj_123",
        incident_id: "inc_123",
        trigger: "new_context_type",
        occurrence_count: 2
      })
    );
  });

  it("should enqueue build-bundle when reproduction confidence changes", async (): Promise<void> => {
    const queue = {
      enqueue: vi.fn().mockResolvedValue(undefined),
      dequeue: vi.fn().mockResolvedValue({
        project_id: "proj_123",
        event_id: "evt_repro_confidence",
        event_type: "request_event",
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
        status: "open",
        regressed_now: false,
        occurrence_count: 2,
        duplicate_event: false,
        new_context_type_added: true,
        reproduction_confidence_changed: true
      }),
      insertIncidentEvent: vi.fn().mockResolvedValue(undefined),
      markIncidentSpiking: vi.fn().mockResolvedValue(false)
    };

    const frequencyCounter = {
      recordOccurrence: vi.fn().mockResolvedValue({
        occurrences_1m: 1,
        occurrences_5m: 1,
        occurrences_1h: 5,
        occurrences_24h: 10,
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
    expect(queue.enqueue).toHaveBeenCalledWith(
      "build-bundle",
      expect.objectContaining({
        project_id: "proj_123",
        incident_id: "inc_123",
        trigger: "reproduction_confidence_change",
        occurrence_count: 2
      })
    );
  });

  it.each([
    {
      name: "regression_reopen over deploy/reproduction/new-context/threshold",
      eventType: "request_event" as const,
      occurrenceCount: 3,
      regressedNow: true,
      hasDeployMetadata: true,
      newContextTypeAdded: true,
      reproductionConfidenceChanged: true,
      expectedTrigger: "regression_reopen"
    },
    {
      name: "deploy_metadata over reproduction/new-context/threshold",
      eventType: "request_event" as const,
      occurrenceCount: 3,
      regressedNow: false,
      hasDeployMetadata: true,
      newContextTypeAdded: true,
      reproductionConfidenceChanged: true,
      expectedTrigger: "deploy_metadata"
    },
    {
      name: "reproduction_confidence_change over new-context/threshold",
      eventType: "request_event" as const,
      occurrenceCount: 3,
      regressedNow: false,
      hasDeployMetadata: false,
      newContextTypeAdded: true,
      reproductionConfidenceChanged: true,
      expectedTrigger: "reproduction_confidence_change"
    },
    {
      name: "new_context_type over threshold",
      eventType: "frontend_exception" as const,
      occurrenceCount: 3,
      regressedNow: false,
      hasDeployMetadata: false,
      newContextTypeAdded: true,
      reproductionConfidenceChanged: false,
      expectedTrigger: "new_context_type"
    }
  ])(
    "should deterministically select %s trigger precedence when regeneration conditions overlap",
    async ({
      eventType,
      occurrenceCount,
      regressedNow,
      hasDeployMetadata,
      newContextTypeAdded,
      reproductionConfidenceChanged,
      expectedTrigger
    }): Promise<void> => {
      const queue = {
        enqueue: vi.fn().mockResolvedValue(undefined),
        dequeue: vi.fn().mockResolvedValue({
          project_id: "proj_123",
          event_id: `evt_precedence_${expectedTrigger}`,
          event_type: eventType,
          service_name: "checkout-api",
          environment: "production",
          fingerprint: "fp_123",
          normalized_message: "TypeError at checkout",
          occurred_at: "2026-03-11T00:00:00.000Z",
          severity: "high",
          ...(hasDeployMetadata
            ? {
                deploy_metadata: {
                  commit_sha: "abc123",
                  version: "v2.4.0",
                  branch: "main",
                  deployed_at: "2026-03-10T23:00:00.000Z"
                }
              }
            : {})
        })
      };

      const incidentStore = {
        upsertIncident: vi.fn().mockResolvedValue({
          incident_id: "inc_123",
          matched_fields: ["normalized_message"],
          status: regressedNow ? "regressed" : "open",
          regressed_now: regressedNow,
          occurrence_count: occurrenceCount,
          duplicate_event: false,
          ...(newContextTypeAdded ? { new_context_type_added: true } : {}),
          ...(reproductionConfidenceChanged ? { reproduction_confidence_changed: true } : {})
        }),
        insertIncidentEvent: vi.fn().mockResolvedValue(undefined),
        markIncidentSpiking: vi.fn().mockResolvedValue(false)
      };

      const frequencyCounter = {
        recordOccurrence: vi.fn().mockResolvedValue({
          occurrences_1m: 1,
          occurrences_5m: 1,
          occurrences_1h: 5,
          occurrences_24h: 10,
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
      expect(queue.enqueue).toHaveBeenCalledWith(
        "build-bundle",
        expect.objectContaining({
          project_id: "proj_123",
          incident_id: "inc_123",
          trigger: expectedTrigger,
          occurrence_count: occurrenceCount
        })
      );
    }
  );

  it.each([
    {
      name: "regression_reopen over deploy/reproduction/new-context/threshold",
      eventType: "request_event" as const,
      occurrenceCount: 3,
      regressedNow: true,
      hasDeployMetadata: true,
      newContextTypeAdded: true,
      reproductionConfidenceChanged: true,
      expectedTrigger: "regression_reopen"
    },
    {
      name: "deploy_metadata over reproduction/new-context/threshold",
      eventType: "request_event" as const,
      occurrenceCount: 3,
      regressedNow: false,
      hasDeployMetadata: true,
      newContextTypeAdded: true,
      reproductionConfidenceChanged: true,
      expectedTrigger: "deploy_metadata"
    },
    {
      name: "reproduction_confidence_change over new-context/threshold",
      eventType: "request_event" as const,
      occurrenceCount: 3,
      regressedNow: false,
      hasDeployMetadata: false,
      newContextTypeAdded: true,
      reproductionConfidenceChanged: true,
      expectedTrigger: "reproduction_confidence_change"
    },
    {
      name: "new_context_type over threshold",
      eventType: "frontend_exception" as const,
      occurrenceCount: 3,
      regressedNow: false,
      hasDeployMetadata: false,
      newContextTypeAdded: true,
      reproductionConfidenceChanged: false,
      expectedTrigger: "new_context_type"
    }
  ])(
    "should not enqueue another build-bundle job on duplicate replay when %s precedence conditions co-occur",
    async ({
      eventType,
      occurrenceCount,
      regressedNow,
      hasDeployMetadata,
      newContextTypeAdded,
      reproductionConfidenceChanged,
      expectedTrigger
    }): Promise<void> => {
      const groupJob = {
        project_id: "proj_123",
        event_id: `evt_precedence_duplicate_${expectedTrigger}`,
        event_type: eventType,
        service_name: "checkout-api",
        environment: "production",
        fingerprint: "fp_123",
        normalized_message: "TypeError at checkout",
        occurred_at: "2026-03-11T00:00:00.000Z",
        severity: "high",
        ...(hasDeployMetadata
          ? {
              deploy_metadata: {
                commit_sha: "abc123",
                version: "v2.4.0",
                branch: "main",
                deployed_at: "2026-03-10T23:00:00.000Z"
              }
            }
          : {})
      };

      const queue = {
        enqueue: vi.fn().mockResolvedValue(undefined),
        dequeue: vi.fn().mockResolvedValueOnce(groupJob).mockResolvedValueOnce(groupJob)
      };

      const incidentStore = {
        upsertIncident: vi
          .fn()
          .mockResolvedValueOnce({
            incident_id: "inc_123",
            matched_fields: ["normalized_message"],
            status: regressedNow ? "regressed" : "open",
            regressed_now: regressedNow,
            occurrence_count: occurrenceCount,
            duplicate_event: false,
            ...(newContextTypeAdded ? { new_context_type_added: true } : {}),
            ...(reproductionConfidenceChanged ? { reproduction_confidence_changed: true } : {})
          })
          .mockResolvedValueOnce({
            incident_id: "inc_123",
            matched_fields: ["normalized_message"],
            status: regressedNow ? "regressed" : "open",
            regressed_now: regressedNow,
            occurrence_count: occurrenceCount,
            duplicate_event: true,
            ...(newContextTypeAdded ? { new_context_type_added: true } : {}),
            ...(reproductionConfidenceChanged ? { reproduction_confidence_changed: true } : {})
          }),
        insertIncidentEvent: vi.fn().mockResolvedValue(undefined),
        markIncidentSpiking: vi.fn().mockResolvedValue(false)
      };

      const frequencyCounter = {
        recordOccurrence: vi.fn().mockResolvedValue({
          occurrences_1m: 1,
          occurrences_5m: 1,
          occurrences_1h: 5,
          occurrences_24h: 10,
          baseline_1h_per_5m: 1,
          spike_ratio_5m_to_1h: 1,
          has_sufficient_baseline: true,
          is_spiking: false
        })
      };

      const lifecycleWebhookPublisher = {
        publish: vi.fn().mockResolvedValue(undefined)
      };

      expect(
        await processNextGroupIncidentJob({
          queue,
          incidentStore,
          frequencyCounter,
          lifecycleWebhookPublisher
        })
      ).toEqual({ processed: true });

      expect(
        await processNextGroupIncidentJob({
          queue,
          incidentStore,
          frequencyCounter,
          lifecycleWebhookPublisher
        })
      ).toEqual({ processed: true });

      expect(queue.enqueue).toHaveBeenCalledTimes(1);
      expect(queue.enqueue).toHaveBeenCalledWith(
        "build-bundle",
        expect.objectContaining({
          project_id: "proj_123",
          incident_id: "inc_123",
          trigger: expectedTrigger,
          occurrence_count: occurrenceCount
        })
      );
      expect(frequencyCounter.recordOccurrence).toHaveBeenCalledTimes(1);
    }
  );

  it("should keep build-bundle enqueue and lifecycle side effects jointly stable on duplicate replay for regression+deploy overlap", async (): Promise<void> => {
    const groupJob = {
      project_id: "proj_123",
      event_id: "evt_regression_deploy_focused",
      event_type: "deploy_metadata" as const,
      service_name: "checkout-api",
      environment: "production",
      fingerprint: "fp_123",
      normalized_message: "TypeError at checkout",
      occurred_at: "2026-03-11T00:00:00.000Z",
      severity: "high" as const,
      deploy_metadata: {
        commit_sha: "abc123",
        version: "v2.4.0",
        branch: "main",
        deployed_at: "2026-03-10T23:00:00.000Z"
      }
    };

    const queue = {
      enqueue: vi.fn().mockResolvedValue(undefined),
      dequeue: vi.fn().mockResolvedValueOnce(groupJob).mockResolvedValueOnce(groupJob)
    };

    const regressionDeploy = {
      deployment_id: "dep_123",
      commit_sha: "abc123",
      version: "v2.4.0",
      branch: "main",
      deployed_at: "2026-03-10T23:00:00.000Z",
      minutes_since_deploy: 60
    };

    const incidentStore = {
      upsertIncident: vi
        .fn()
        .mockResolvedValueOnce({
          incident_id: "inc_123",
          matched_fields: ["normalized_message"],
          status: "regressed",
          regressed_now: true,
          occurrence_count: 2,
          duplicate_event: false,
          regression_deploy: regressionDeploy
        })
        .mockResolvedValueOnce({
          incident_id: "inc_123",
          matched_fields: ["normalized_message"],
          status: "regressed",
          regressed_now: true,
          occurrence_count: 2,
          duplicate_event: true,
          regression_deploy: regressionDeploy
        }),
      insertIncidentEvent: vi.fn().mockResolvedValue(undefined),
      markIncidentSpiking: vi.fn().mockResolvedValue(false)
    };

    const frequencyCounter = {
      recordOccurrence: vi.fn().mockResolvedValue({
        occurrences_1m: 1,
        occurrences_5m: 1,
        occurrences_1h: 5,
        occurrences_24h: 10,
        baseline_1h_per_5m: 1,
        spike_ratio_5m_to_1h: 1,
        has_sufficient_baseline: true,
        is_spiking: false
      })
    };

    const lifecycleWebhookPublisher = {
      publish: vi.fn().mockResolvedValue(undefined)
    };

    expect(
      await processNextGroupIncidentJob({
        queue,
        incidentStore,
        frequencyCounter,
        lifecycleWebhookPublisher
      })
    ).toEqual({ processed: true });

    expect(
      await processNextGroupIncidentJob({
        queue,
        incidentStore,
        frequencyCounter,
        lifecycleWebhookPublisher
      })
    ).toEqual({ processed: true });

    expect(queue.enqueue).toHaveBeenCalledTimes(1);
    expect(queue.enqueue).toHaveBeenCalledWith(
      "build-bundle",
      expect.objectContaining({
        project_id: "proj_123",
        incident_id: "inc_123",
        trigger: "regression_reopen",
        occurrence_count: 2
      })
    );
    expect(lifecycleWebhookPublisher.publish).toHaveBeenCalledTimes(1);
    expect(lifecycleWebhookPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: "bundle.reopened",
        incident_id: "inc_123",
        regression_deploy: regressionDeploy
      })
    );
    expect(frequencyCounter.recordOccurrence).toHaveBeenCalledTimes(1);
    expect(incidentStore.markIncidentSpiking).toHaveBeenCalledTimes(0);
  });

  it("should publish bundle.updated once on non-regression deploy overlap while keeping duplicate replay no-op", async (): Promise<void> => {
    const groupJob = {
      project_id: "proj_123",
      event_id: "evt_non_regression_deploy_overlap",
      event_type: "request_event" as const,
      service_name: "checkout-api",
      environment: "production",
      fingerprint: "fp_123",
      normalized_message: "TypeError at checkout",
      occurred_at: "2026-03-11T00:00:00.000Z",
      severity: "high" as const,
      deploy_metadata: {
        commit_sha: "abc123",
        version: "v2.4.0",
        branch: "main",
        deployed_at: "2026-03-10T23:00:00.000Z"
      }
    };

    const queue = {
      enqueue: vi.fn().mockResolvedValue(undefined),
      dequeue: vi.fn().mockResolvedValueOnce(groupJob).mockResolvedValueOnce(groupJob)
    };

    const incidentStore = {
      upsertIncident: vi
        .fn()
        .mockResolvedValueOnce({
          incident_id: "inc_123",
          matched_fields: ["normalized_message"],
          status: "open",
          regressed_now: false,
          occurrence_count: 3,
          duplicate_event: false,
          new_context_type_added: true,
          reproduction_confidence_changed: true
        })
        .mockResolvedValueOnce({
          incident_id: "inc_123",
          matched_fields: ["normalized_message"],
          status: "open",
          regressed_now: false,
          occurrence_count: 3,
          duplicate_event: true,
          new_context_type_added: true,
          reproduction_confidence_changed: true
        }),
      insertIncidentEvent: vi.fn().mockResolvedValue(undefined),
      markIncidentSpiking: vi.fn().mockResolvedValue(false)
    };

    const frequencyCounter = {
      recordOccurrence: vi.fn().mockResolvedValue({
        occurrences_1m: 1,
        occurrences_5m: 1,
        occurrences_1h: 5,
        occurrences_24h: 10,
        baseline_1h_per_5m: 1,
        spike_ratio_5m_to_1h: 1,
        has_sufficient_baseline: true,
        is_spiking: false
      })
    };

    const lifecycleWebhookPublisher = {
      publish: vi.fn().mockResolvedValue(undefined)
    };

    expect(
      await processNextGroupIncidentJob({
        queue,
        incidentStore,
        frequencyCounter,
        lifecycleWebhookPublisher
      })
    ).toEqual({ processed: true });

    expect(
      await processNextGroupIncidentJob({
        queue,
        incidentStore,
        frequencyCounter,
        lifecycleWebhookPublisher
      })
    ).toEqual({ processed: true });

    expect(queue.enqueue).toHaveBeenCalledTimes(1);
    expect(queue.enqueue).toHaveBeenCalledWith(
      "build-bundle",
      expect.objectContaining({
        project_id: "proj_123",
        incident_id: "inc_123",
        trigger: "deploy_metadata",
        occurrence_count: 3
      })
    );
    expect(lifecycleWebhookPublisher.publish).toHaveBeenCalledTimes(1);
    expect(lifecycleWebhookPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: "bundle.updated",
        incident_id: "inc_123",
        project_id: "proj_123"
      })
    );
    expect(frequencyCounter.recordOccurrence).toHaveBeenCalledTimes(1);
    expect(incidentStore.markIncidentSpiking).toHaveBeenCalledTimes(0);
  });

});

describe("worker processor – group-incident lifecycle publish", () => {
  function makeGroupIncidentDeps(overrides: {
    occurrence_count: number;
    regressed_now?: boolean;
    publishMock: MockedMethods<GroupIncidentDependencies["lifecycleWebhookPublisher"]>["publish"];
  }) {
    return {
      queue: {
        enqueue: vi.fn().mockResolvedValue(undefined),
        dequeue: vi.fn().mockResolvedValue({
          project_id: "proj_1",
          event_id: "evt_1",
          event_type: "backend_exception",
          service_name: "api-service",
          environment: "production",
          fingerprint: "fp_test",
          normalized_message: "TypeError: cannot read property",
          occurred_at: "2026-03-15T12:00:00.000Z",
          severity: "high" as const
        })
      },
      alertEvaluationQueue: {
        enqueue: vi.fn().mockResolvedValue(undefined)
      },
      incidentStore: {
        upsertIncident: vi.fn().mockResolvedValue({
          incident_id: "inc_test",
          matched_fields: ["normalized_message"],
          status: "open",
          regressed_now: overrides.regressed_now ?? false,
          occurrence_count: overrides.occurrence_count
        }),
        insertIncidentEvent: vi.fn().mockResolvedValue(undefined),
        markIncidentSpiking: vi.fn().mockResolvedValue(false)
      },
      frequencyCounter: {
        recordOccurrence: vi.fn().mockResolvedValue({
          occurrences_1m: 1,
          occurrences_5m: 1,
          occurrences_1h: 1,
          occurrences_24h: 1,
          baseline_1h_per_5m: 0,
          spike_ratio_5m_to_1h: 1,
          has_sufficient_baseline: false,
          is_spiking: false
        })
      },
      lifecycleWebhookPublisher: { publish: overrides.publishMock }
    };
  }

  it("should publish bundle.created on first occurrence (occurrence_count === 1)", async (): Promise<void> => {
    const publishMock = vi.fn().mockResolvedValue(undefined);

    await processNextGroupIncidentJob(
      makeGroupIncidentDeps({ occurrence_count: 1, publishMock })
    );

    expect(publishMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: "bundle.created",
        incident_id: "inc_test",
        project_id: "proj_1",
        bundle_type: "failure",
        is_verification: false,
        title: "TypeError: cannot read property"
      })
    );
  });

  it("should publish bundle.updated on subsequent threshold occurrence (occurrence_count = 3)", async (): Promise<void> => {
    const publishMock = vi.fn().mockResolvedValue(undefined);

    await processNextGroupIncidentJob(
      makeGroupIncidentDeps({ occurrence_count: 3, publishMock })
    );

    const calls = publishMock.mock.calls.map(
      (c: unknown[]) => (c[0] as Record<string, unknown>)["event_type"]
    );
    expect(calls).toContain("bundle.updated");
    expect(calls).not.toContain("bundle.created");
  });

  it("should not publish bundle.created or bundle.updated for non-threshold counts (e.g. 5)", async (): Promise<void> => {
    const publishMock = vi.fn().mockResolvedValue(undefined);

    await processNextGroupIncidentJob(
      makeGroupIncidentDeps({ occurrence_count: 5, publishMock })
    );

    const bundleCalls = publishMock.mock.calls.filter((c: unknown[]) => {
      const et = (c[0] as Record<string, unknown>)["event_type"];
      return et === "bundle.created" || et === "bundle.updated";
    });
    expect(bundleCalls).toHaveLength(0);
  });
});
