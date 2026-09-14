import { expect, it, vi } from "vitest";
import { createEventEnvelope } from "../../../packages/shared-types/src/index.js";
import { processNextBuildBundleJob } from "../../../apps/worker/src/processor.js";
import { maybeGenerateHostedImprovementBundle } from "../../../apps/worker/src/improvement-bundles.js";

it("should record build_error failure when bundle generation throws after reservation", async (): Promise<void> => {
  const markBundleGenerationFailure = vi.fn().mockResolvedValue(undefined);
  const releaseLease = vi.fn().mockResolvedValue(undefined);
  const recordMetricDeltas = vi.fn().mockResolvedValue("recorded");

  const result = processNextBuildBundleJob({
    queue: {
      enqueue: vi.fn(),
      dequeue: vi.fn().mockResolvedValue({
        project_id: "proj_123",
        incident_id: "inc_123",
        event_id: "evt_123",
        occurred_at: "2026-03-12T00:00:00.000Z",
        occurrence_count: 3,
        trigger: "occurrence_threshold"
      }),
      readJobQueue: vi.fn().mockResolvedValue([]),
      releaseLease
    },
    incidentStore: {
      getBundleBuildContext: vi.fn().mockResolvedValue({
        incident_id: "inc_123",
        project_id: "proj_123",
        service_id: "svc_123",
        service_name: "checkout-api",
        service_runtime: "node",
        service_framework: "fastify",
        environment: "production",
        fingerprint: "fp_123",
        title: "TypeError at checkout",
        severity: "critical",
        first_seen_at: "2026-03-11T23:59:00.000Z",
        last_seen_at: "2026-03-12T00:00:00.000Z",
        occurrence_count: 3,
        source_event_types: ["backend_exception"]
      }),
      hasBundleGenerationForSourceEvent: vi.fn().mockResolvedValue(false),
      markBundleGenerationFailure,
      reserveBundleGeneration: vi.fn().mockResolvedValue({
        generation_number: 1,
        created_at: "2026-03-12T00:00:00.000Z",
        updated_at: "2026-03-12T00:00:00.000Z",
        source_event_id: "evt_123",
        source_occurred_at: "2026-03-12T00:00:00.000Z",
        trigger: "occurrence_threshold"
      }),
      listIncidentEventReferences: vi.fn().mockResolvedValue([])
    },
    accountAnalyticsStore: {
      recordMetricDeltas
    },
    resolveOrganizationIdForProject: vi.fn().mockResolvedValue("org_123"),
    objectStore: {
      putObject: vi.fn().mockRejectedValue(new Error("s3_write_failed"))
    }
  });

  await expect(result).rejects.toThrow("s3_write_failed");
  expect(markBundleGenerationFailure).toHaveBeenCalledWith({
    incident_id: "inc_123",
    reason: "build_error"
  });
  expect(recordMetricDeltas).toHaveBeenCalledWith({
    organization_id: "org_123",
    occurred_at: "2026-03-12T00:00:00.000Z",
    source: "worker.build_bundle",
    dedupe_key: "failure_bundle_generation_failed:inc_123:evt_123",
    deltas: {
      failure_bundle_generations_failed: 1
    }
  });
  expect(releaseLease).toHaveBeenCalledWith("leases:bundle-regeneration:inc_123");
});

it("marks hosted improvement bundle generation as failed when persistence throws", async () => {
  const sampleEvent = createEventEnvelope({
    event_id: "00000000-0000-0000-0000-000000000031",
    event_type: "log_event",
    sdk_name: "debugbundle-node",
    sdk_version: "0.1.0",
    occurred_at: "2026-05-18T12:00:00.000Z",
    service: {
      name: "checkout-api",
      environment: "production",
      runtime: "node",
      framework: "fastify"
    },
    payload: {
      level: "warning",
      message: "Persistence failure warning",
      attributes: {}
    }
  });
  const markImprovementBundleGenerationFailure = vi.fn().mockResolvedValue(undefined);
  const recordMetricDeltas = vi.fn().mockResolvedValue("recorded");

  const result = maybeGenerateHostedImprovementBundle({
    project_id: "proj_123",
    event: sampleEvent,
    normalized: {
      event_type: "log_event",
      environment: "production",
      error_type: null,
      normalized_message: "Persistence failure warning",
      route_template: null,
      http_method: null,
      http_status: null,
      top_frames: [],
      payload: sampleEvent.payload
    },
    event_class: "context_signal",
    dependencies: {
      improvementOpportunityStore: {
        getImprovementExecutionSettings: vi.fn().mockResolvedValue({
          plan: "solo",
          automated_improvement_bundles_enabled: true,
          improvement_bundle_sensitivity: "balanced"
        }),
        listImprovementsForOrganization: vi.fn(),
        getImprovementForOrganization: vi.fn(),
        resolveImprovementForOrganization: vi.fn(),
        reopenImprovementForOrganization: vi.fn(),
        recordWarningHotspot: vi.fn().mockResolvedValue({
          opportunity_id: "imp_failure",
          occurrence_count: 5,
          bundle_generation_number: 0,
          should_generate_bundle: true
        }),
        recordRequestPattern: vi.fn(),
        hasImprovementBundleGenerationForSourceEvent: vi.fn().mockResolvedValue(false),
        reserveImprovementBundleGeneration: vi.fn().mockResolvedValue({
          generation_number: 1,
          created_at: "2026-05-18T12:00:00.000Z",
          updated_at: "2026-05-18T12:00:00.000Z",
          source_event_id: sampleEvent.event_id,
          source_occurred_at: sampleEvent.occurred_at,
          trigger: "occurrence_threshold"
        }),
        getImprovementBundleBuildContext: vi.fn().mockResolvedValue({
          opportunity_id: "imp_failure",
          project_id: "proj_123",
          project_slug: "checkout",
          service_id: "svc_123",
          service_name: "checkout-api",
          service_runtime: "node",
          service_framework: "fastify",
          environment: "production",
          kind: "warning_hotspot",
          status: "open",
          severity: "medium",
          confidence: 0.7,
          fingerprint: "fp_warning_failure",
          title: "Warning hotspot: Persistence failure warning",
          summary: "Repeated warning log pattern detected for checkout-api in production.",
          occurrence_count: 5,
          evidence: {
            kind: "warning_hotspot",
            log_level: "warning",
            normalized_message: "Persistence failure warning",
            threshold: 5
          },
          first_detected_at: "2026-05-18T11:55:00.000Z",
          last_detected_at: "2026-05-18T12:00:00.000Z",
          last_source_event_id: sampleEvent.event_id,
          bundle_generation_number: 1,
          bundle_created_at: "2026-05-18T12:00:00.000Z",
          bundle_updated_at: "2026-05-18T12:00:00.000Z",
          bundle_source_event_id: sampleEvent.event_id,
          bundle_failure_reason: null
        }),
        listImprovementEventReferences: vi.fn().mockResolvedValue([]),
        markImprovementBundleGenerationFailure,
        pruneRetainedBundleOwnersForProject: vi.fn().mockResolvedValue([])
      },
      billingStore: {
        getBillingSummaryForProject: vi.fn().mockResolvedValue({
          plan: "solo",
          stripe_customer_id: null,
          active_projects: 1,
          capacity_units: {
            total: 3,
            included: 3,
            additional_purchased: 0,
            pending_reduction: null
          },
          usage_window: {
            starts_at: "2026-05-01T00:00:00.000Z",
            ends_at: "2026-06-01T00:00:00.000Z"
          },
          allowances: {
            monthly_bundle_requests: { used: 4, limit: 250 },
            monthly_raw_ingested_events: { used: 0, limit: 0 },
            retained_bundle_cap: { used: 0, limit: 150 },
            monthly_remote_activations: { used: 0, limit: 25 },
            monthly_alert_deliveries: { used: 0, limit: 75 },
            monthly_webhook_deliveries: { used: 0, limit: 250 }
          }
        })
      },
      objectStore: {
        getObject: vi.fn(),
        putObject: vi.fn().mockRejectedValue(new Error("s3_write_failed"))
      },
      accountAnalyticsStore: {
        recordMetricDeltas
      },
      resolveOrganizationIdForProject: vi.fn().mockResolvedValue("org_123")
    }
  });

  await expect(result).rejects.toThrow("s3_write_failed");
  expect(markImprovementBundleGenerationFailure).toHaveBeenCalledWith({
    opportunity_id: "imp_failure",
    reason: "build_error"
  });
  expect(recordMetricDeltas).toHaveBeenCalledWith({
    organization_id: "org_123",
    occurred_at: "2026-05-18T12:00:00.000Z",
    source: "worker.improvement_bundle",
    dedupe_key:
      "improvement_bundle_generation_failed:imp_failure:00000000-0000-0000-0000-000000000031",
    deltas: {
      improvement_bundle_generations_failed: 1
    }
  });
});

it("should stop new hosted bundle generation when the monthly bundle quota is exhausted", async (): Promise<void> => {
  const reserveBundleGeneration = vi.fn();
  const markBundleGenerationFailure = vi.fn().mockResolvedValue(undefined);
  const putObject = vi.fn();
  const recordMetricDeltas = vi.fn().mockResolvedValue("recorded");

  const result = await processNextBuildBundleJob({
    queue: {
      enqueue: vi.fn(),
      dequeue: vi.fn().mockResolvedValue({
        project_id: "proj_123",
        incident_id: "inc_123",
        event_id: "evt_123",
        occurred_at: "2026-03-12T00:00:00.000Z",
        occurrence_count: 3,
        trigger: "occurrence_threshold"
      })
    },
    incidentStore: {
      getBundleBuildContext: vi.fn().mockResolvedValue({
        incident_id: "inc_123",
        project_id: "proj_123",
        service_id: "svc_123",
        service_name: "checkout-api",
        service_runtime: "node",
        service_framework: "fastify",
        environment: "production",
        fingerprint: "fp_123",
        title: "TypeError at checkout",
        severity: "critical",
        first_seen_at: "2026-03-11T23:59:00.000Z",
        last_seen_at: "2026-03-12T00:00:00.000Z",
        occurrence_count: 3,
        source_event_types: ["backend_exception"]
      }),
      hasBundleGenerationForSourceEvent: vi.fn().mockResolvedValue(false),
      markBundleGenerationFailure,
      reserveBundleGeneration
    },
    accountAnalyticsStore: {
      recordMetricDeltas
    },
    resolveOrganizationIdForProject: vi.fn().mockResolvedValue("org_123"),
    objectStore: {
      putObject
    },
    billingStore: {
      getBillingSummaryForProject: vi.fn().mockResolvedValue({
        plan: "solo",
        stripe_customer_id: null,
        active_projects: 2,
        capacity_units: {
          total: 3,
          included: 3,
          additional_purchased: 0
        },
        usage_window: {
          starts_at: "2026-03-01T00:00:00.000Z",
          ends_at: "2026-04-01T00:00:00.000Z"
        },
        allowances: {
          monthly_bundle_requests: { used: 750, limit: 750 },
          monthly_raw_ingested_events: { used: 0, limit: 10500 },
          retained_bundle_cap: { used: 0, limit: 450 },
          monthly_remote_activations: { used: 0, limit: 75 },
          monthly_alert_deliveries: { used: 0, limit: 225 },
          monthly_webhook_deliveries: { used: 0, limit: 750 }
        }
      })
    }
  });

  expect(result).toEqual({ processed: true, reason: "monthly_quota_exceeded" });
  expect(markBundleGenerationFailure).toHaveBeenCalledWith({
    incident_id: "inc_123",
    reason: "monthly_quota_exceeded"
  });
  expect(recordMetricDeltas).toHaveBeenCalledWith({
    organization_id: "org_123",
    occurred_at: "2026-03-12T00:00:00.000Z",
    source: "worker.build_bundle",
    dedupe_key: "failure_bundle_generation_failed:inc_123:evt_123",
    deltas: {
      failure_bundle_generations_failed: 1
    }
  });
  expect(reserveBundleGeneration).not.toHaveBeenCalled();
  expect(putObject).not.toHaveBeenCalled();
});
