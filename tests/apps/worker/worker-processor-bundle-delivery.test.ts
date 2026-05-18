import { gunzipSync, gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { BundleV1Schema, createEventEnvelope } from "../../../packages/shared-types/src/index.js";
import {
  GitHubDispatchDeliveryError,
  LifecycleWebhookDeliveryError,
  processNextBuildBundleJob,
  processNextBuildReproductionJob,
  processNextDeliverGitHubDispatchJob,
  processNextDeliverWebhookJob,
  processNextGroupIncidentJob
} from "../../../apps/worker/src/processor.js";
import { buildBundleObjectKey, buildReproductionObjectKey } from "../../../packages/storage/src/index.js";

const deployMetadataGoldenFixture = readFileSync(
  new URL("../../fixtures/build-bundle.deploy-metadata.golden.json", import.meta.url),
  "utf8"
).trim();

function createReservedBundleGeneration(overrides?: Partial<{
  generation_number: number;
  created_at: string;
  updated_at: string;
  source_event_id: string;
  source_occurred_at: string;
  trigger: "occurrence_threshold" | "regression_reopen" | "deploy_metadata" | "new_context_type" | "reproduction_confidence_change" | "regeneration";
}>): {
  generation_number: number;
  created_at: string;
  updated_at: string;
  source_event_id: string;
  source_occurred_at: string;
  trigger: "occurrence_threshold" | "regression_reopen" | "deploy_metadata" | "new_context_type" | "reproduction_confidence_change" | "regeneration";
} {
  return {
    generation_number: 1,
    created_at: "2026-03-12T00:00:00.000Z",
    updated_at: "2026-03-12T00:00:00.000Z",
    source_event_id: "evt_123",
    source_occurred_at: "2026-03-12T00:00:00.000Z",
    trigger: "occurrence_threshold",
    ...overrides
  };
}

function createReproductionBundle(input: { includeRequest: boolean }): unknown {
  return BundleV1Schema.parse({
    bundle_version: 1,
    bundle_id: "bnd_123",
    bundle_type: "failure",
    captured_at: "2026-03-12T00:00:00.000Z",
    sdk: {
      name: "debugbundle-node",
      version: "0.1.0"
    },
    project: {
      id: "proj_123",
      slug: "project-proj_123",
      environment: "production"
    },
    service: {
      id: "svc_123",
      name: "checkout-api",
      runtime: "node",
      framework: "fastify",
      version: null,
      region: null
    },
    signal: {
      signal_id: "inc_123",
      signal_type: input.includeRequest ? "request_failure" : "exception",
      severity: "high",
      fingerprint: "fp_123",
      first_seen_at: "2026-03-12T00:00:00.000Z",
      last_seen_at: "2026-03-12T00:00:00.000Z",
      occurrence_count: input.includeRequest ? 2 : 1,
      source_event_types: input.includeRequest ? ["backend_exception", "request_event"] : ["backend_exception"]
    },
    summary: {
      title: "Checkout request failed",
      description: "Checkout request failed",
      likely_cause: null,
      confidence: 0.75,
      recommended_action: null,
      severity: "high",
      error_type: null,
      error_message: null,
      first_application_frame: null,
      primary_signal: input.includeRequest ? "request_event" : "exception",
      signals: {
        new_deploy: false,
        regression_suspected: false,
        customer_visible: false
      }
    },
    impact: {
      affected_users_estimate: 1,
      affected_requests_estimate: 1,
      business_criticality: "high",
      customer_visible: false,
      regression_suspected: false
    },
    context: {
      error: null,
      request: input.includeRequest
        ? {
            version: 1,
            method: "POST",
            path: "/checkout",
            route_template: "/checkout",
            query: {
              coupon: "SAVE10"
            },
            headers: {
              "content-type": "application/json"
            },
            body: {
              amount: 42
            },
            request_id: "req_123"
          }
        : null,
      response: input.includeRequest
        ? {
            version: 1,
            status_code: 500,
            duration_ms: 120
          }
        : null,
      logs: null,
      frontend: null,
      environment: null,
      deploy: null,
      runtime: null,
      git: null,
      dependencies: null,
      probe_data: {
        version: 1,
        items: []
      },
      device: null
    },
    reproduction: {
      possible: false,
      confidence: 0,
      reason: "reproduction_not_generated",
      artifacts: null,
      feasibility_reference: null
    },
    verification: {
      verification_type: null,
      synthetic: false,
      local_verified: false,
      production_verified: false
    },
    links: {
      self: null,
      reproduction: null,
      incident: null,
      project: null,
      docs: null
    },
    redaction: {
      redacted: true,
      fields: [],
      notes: null
    },
    metadata: {
      created_at: "2026-03-12T00:00:00.000Z",
      updated_at: "2026-03-12T00:00:00.000Z",
      generator_version: "bundle-engine@0.1.0",
      generation_number: input.includeRequest ? 2 : 1
    }
  });
}

describe("worker processor \u2013 bundle, delivery & sampling", () => {
  it("should return no_jobs when group-incident queue is empty", async (): Promise<void> => {
    const result = await processNextGroupIncidentJob({
      queue: {
        enqueue: vi.fn(),
        dequeue: vi.fn().mockResolvedValue(null)
      },
      incidentStore: {
        upsertIncident: vi.fn(),
        insertIncidentEvent: vi.fn(),
        markIncidentSpiking: vi.fn()
      },
      frequencyCounter: {
        recordOccurrence: vi.fn()
      },
      lifecycleWebhookPublisher: {
        publish: vi.fn()
      }
    });

    expect(result).toEqual({ processed: false, reason: "no_jobs" });
  });

  it("should skip non-incident signals before incident upsert", async (): Promise<void> => {
    const upsertIncident = vi.fn();
    const insertIncidentEvent = vi.fn();
    const recordOccurrence = vi.fn();
    const publish = vi.fn();

    const result = await processNextGroupIncidentJob({
      queue: {
        enqueue: vi.fn(),
        dequeue: vi.fn().mockResolvedValue({
          project_id: "proj_123",
          event_id: "evt_context",
          event_type: "request_event",
          event_class: "context_signal",
          service_name: "checkout-api",
          environment: "production",
          fingerprint: "fp_context",
          normalized_message: "GET /health returned 404",
          occurred_at: "2026-03-12T00:00:00.000Z",
          severity: "low"
        })
      },
      incidentStore: {
        upsertIncident,
        insertIncidentEvent,
        markIncidentSpiking: vi.fn()
      },
      frequencyCounter: {
        recordOccurrence
      },
      lifecycleWebhookPublisher: {
        publish
      }
    });

    expect(result).toEqual({ processed: true, reason: "non_incident_signal" });
    expect(upsertIncident).not.toHaveBeenCalled();
    expect(insertIncidentEvent).not.toHaveBeenCalled();
    expect(recordOccurrence).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it("should return no_jobs when build-bundle queue is empty", async (): Promise<void> => {
    const result = await processNextBuildBundleJob({
      queue: {
        enqueue: vi.fn(),
        dequeue: vi.fn().mockResolvedValue(null)
      },
      incidentStore: {
        getBundleBuildContext: vi.fn(),
        reserveBundleGeneration: vi.fn()
      },
      objectStore: {
        putObject: vi.fn()
      }
    });

    expect(result).toEqual({ processed: false, reason: "no_jobs" });
  });

  it("should return no_jobs when build-reproduction queue is empty", async (): Promise<void> => {
    const result = await processNextBuildReproductionJob({
      queue: {
        enqueue: vi.fn(),
        dequeue: vi.fn().mockResolvedValue(null)
      },
      objectStore: {
        getObject: vi.fn(),
        putObject: vi.fn()
      }
    });

    expect(result).toEqual({ processed: false, reason: "no_jobs" });
  });

  it("should persist deterministic bundle scaffold for build-bundle jobs", async (): Promise<void> => {
    const queue = {
      enqueue: vi.fn(),
      dequeue: vi.fn().mockResolvedValue({
        project_id: "proj_123",
        incident_id: "inc_123",
        event_id: "evt_123",
        occurred_at: "2026-03-12T00:00:00.000Z",
        occurrence_count: 3,
        trigger: "occurrence_threshold"
      })
    };

    const putObject = vi.fn().mockResolvedValue(undefined);
    const getBundleBuildContext = vi.fn().mockResolvedValue({
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
      source_event_types: ["log_event", "backend_exception"]
    });

    const result = await processNextBuildBundleJob({
      queue,
      env: {
        DEBUGBUNDLE_API_URL: "https://api.debugbundle.test/",
        APP_BASE_URL: "https://app.debugbundle.test/",
        PUBLIC_SITE_URL: "https://debugbundle.test",
        DEBUGBUNDLE_DEPLOY_COMMIT: "efae41568986daaf8c54777ca8e63d838a4c319f",
        DEBUGBUNDLE_DEPLOY_VERSION: "efae41568986",
        DEBUGBUNDLE_DEPLOY_BRANCH: "main",
        DEBUGBUNDLE_DEPLOYED_AT: "2026-03-12T00:00:00.000Z",
        DEBUGBUNDLE_GIT_REPO: "debugbundle/debugbundle"
      },
      incidentStore: {
        getBundleBuildContext,
        reserveBundleGeneration: vi.fn().mockResolvedValue(createReservedBundleGeneration({ generation_number: 1 }))
      },
      objectStore: {
        putObject
      }
    });

    expect(result).toEqual({ processed: true });
    expect(putObject).toHaveBeenCalledWith(
      expect.objectContaining({
        key: buildBundleObjectKey("proj_123", "inc_123"),
        contentType: "application/json",
        contentEncoding: "gzip"
      })
    );
    expect(queue.enqueue).toHaveBeenCalledWith("build-reproduction", {
      project_id: "proj_123",
      incident_id: "inc_123",
      bundle_key: buildBundleObjectKey("proj_123", "inc_123"),
      bundle_version: 1,
      occurred_at: "2026-03-12T00:00:00.000Z"
    });

    const firstPayload = putObject.mock.calls[0]?.[0] as { body: Buffer };
    const secondResult = await processNextBuildBundleJob({
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
      env: {
        DEBUGBUNDLE_API_URL: "https://api.debugbundle.test/",
        APP_BASE_URL: "https://app.debugbundle.test/",
        PUBLIC_SITE_URL: "https://debugbundle.test",
        DEBUGBUNDLE_DEPLOY_COMMIT: "efae41568986daaf8c54777ca8e63d838a4c319f",
        DEBUGBUNDLE_DEPLOY_VERSION: "efae41568986",
        DEBUGBUNDLE_DEPLOY_BRANCH: "main",
        DEBUGBUNDLE_DEPLOYED_AT: "2026-03-12T00:00:00.000Z",
        DEBUGBUNDLE_GIT_REPO: "debugbundle/debugbundle"
      },
      incidentStore: {
        getBundleBuildContext,
        reserveBundleGeneration: vi.fn().mockResolvedValue(createReservedBundleGeneration({ generation_number: 1 }))
      },
      objectStore: {
        putObject
      }
    });

    expect(secondResult).toEqual({ processed: true });
    const secondPayload = putObject.mock.calls[1]?.[0] as { body: Buffer };
    expect(firstPayload.body.equals(secondPayload.body)).toBe(true);

    const parsed = BundleV1Schema.parse(JSON.parse(gunzipSync(firstPayload.body).toString("utf8")));
    expect(parsed.metadata.generation_number).toBe(1);
    expect(parsed.project.environment).toBe("production");
    expect(parsed.service.name).toBe("checkout-api");
    expect(parsed.service.runtime).toBe("node");
    expect(parsed.signal.severity).toBe("critical");
    expect(parsed.signal.fingerprint).toBe("fp_123");
    expect(parsed.signal.source_event_types).toEqual(["backend_exception", "log_event"]);
    expect(parsed.summary.title).toBe("TypeError at checkout");
    expect(parsed.summary.error_message).toBe("TypeError at checkout");
    expect(parsed.context.error?.message).toBe("TypeError at checkout");
    expect(parsed.summary.signals.new_deploy).toBe(false);
    expect(parsed.summary.signals.regression_suspected).toBe(false);
    expect(parsed.context.deploy).toEqual({
      version: 1,
      commit_sha: "efae41568986daaf8c54777ca8e63d838a4c319f",
      deploy_version: "efae41568986",
      branch: "main",
      deployed_at: "2026-03-12T00:00:00.000Z",
      regression_window: false
    });
    expect(parsed.context.git).toEqual({
      version: 1,
      commit: "efae41568986daaf8c54777ca8e63d838a4c319f",
      commit_short: "efae415",
      branch: "main",
      repo: "debugbundle/debugbundle",
      dirty: false,
      source: "env"
    });
    expect(parsed.context.probe_data).toEqual({ version: 1, items: [] });
    expect(parsed.links).toEqual({
      self: "https://api.debugbundle.test/v1/incidents/inc_123/bundle",
      reproduction: "https://api.debugbundle.test/v1/incidents/inc_123/reproduction",
      incident: "https://app.debugbundle.test/incidents/inc_123",
      project: "https://app.debugbundle.test/projects/proj_123",
      docs: "https://debugbundle.test/docs/bundles"
    });
  });

  it("should suppress duplicate build-reproduction enqueue on deterministic build-bundle replay", async (): Promise<void> => {
    const reproductionJob = {
      project_id: "proj_123",
      incident_id: "inc_123",
      bundle_key: buildBundleObjectKey("proj_123", "inc_123"),
      bundle_version: 1,
      occurred_at: "2026-03-12T00:00:00.000Z"
    };

    const queue = {
      enqueue: vi.fn(),
      dequeue: vi.fn().mockResolvedValue({
        project_id: "proj_123",
        incident_id: "inc_123",
        event_id: "evt_123",
        occurred_at: "2026-03-12T00:00:00.000Z",
        occurrence_count: 3,
        trigger: "occurrence_threshold"
      }),
      readJobQueue: vi.fn().mockResolvedValue([JSON.stringify(reproductionJob)])
    };

    const result = await processNextBuildBundleJob({
      queue,
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
        reserveBundleGeneration: vi.fn().mockResolvedValue(createReservedBundleGeneration({ generation_number: 1 }))
      },
      objectStore: {
        putObject: vi.fn().mockResolvedValue(undefined)
      }
    });

    expect(result).toEqual({ processed: true });
    expect(queue.readJobQueue).toHaveBeenCalledWith("build-reproduction");
    expect(queue.enqueue).not.toHaveBeenCalledWith("build-reproduction", expect.anything());
  });

  it("should stop new hosted bundle generation when the monthly bundle quota is exhausted", async (): Promise<void> => {
    const reserveBundleGeneration = vi.fn();
    const markBundleGenerationFailure = vi.fn().mockResolvedValue(undefined);
    const putObject = vi.fn();

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

    expect(result).toEqual({ processed: true });
    expect(markBundleGenerationFailure).toHaveBeenCalledWith({
      incident_id: "inc_123",
      reason: "monthly_quota_exceeded"
    });
    expect(reserveBundleGeneration).not.toHaveBeenCalled();
    expect(putObject).not.toHaveBeenCalled();
  });

  it("should allow replaying an already-recorded bundle generation even after the monthly quota is exhausted", async (): Promise<void> => {
    const reserveBundleGeneration = vi.fn().mockResolvedValue(createReservedBundleGeneration({ generation_number: 2 }));
    const putObject = vi.fn().mockResolvedValue(undefined);
    const releaseLease = vi.fn().mockResolvedValue(undefined);

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
        hasBundleGenerationForSourceEvent: vi.fn().mockResolvedValue(true),
        reserveBundleGeneration
      },
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

    expect(result).toEqual({ processed: true });
    expect(reserveBundleGeneration).toHaveBeenCalled();
    expect(putObject).toHaveBeenCalled();
    expect(releaseLease).toHaveBeenCalledWith("leases:bundle-regeneration:inc_123");
  });

  it("should record build_error failure when bundle generation throws after reservation", async (): Promise<void> => {
    const markBundleGenerationFailure = vi.fn().mockResolvedValue(undefined);
    const releaseLease = vi.fn().mockResolvedValue(undefined);

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
        reserveBundleGeneration: vi.fn().mockResolvedValue(createReservedBundleGeneration()),
        listIncidentEventReferences: vi.fn().mockResolvedValue([])
      },
      objectStore: {
        putObject: vi.fn().mockRejectedValue(new Error("s3_write_failed"))
      }
    });

    expect(result).toEqual({ processed: true });
    expect(markBundleGenerationFailure).toHaveBeenCalledWith({
      incident_id: "inc_123",
      reason: "build_error"
    });
    expect(releaseLease).toHaveBeenCalledWith("leases:bundle-regeneration:inc_123");
  });

  it("should prune oldest retained incidents after persisting a new bundle", async (): Promise<void> => {
    const deleteObject = vi.fn().mockResolvedValue(undefined);
    const pruneRetainedIncidentsForProject = vi.fn().mockResolvedValue([
      {
        project_id: "proj_old",
        incident_id: "inc_old"
      }
    ]);

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
        }),
        readJobQueue: vi.fn().mockResolvedValue([])
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
        reserveBundleGeneration: vi.fn().mockResolvedValue(createReservedBundleGeneration()),
        pruneRetainedIncidentsForProject
      },
      objectStore: {
        putObject: vi.fn().mockResolvedValue(undefined),
        deleteObject
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
            monthly_bundle_requests: { used: 1, limit: 750 },
            monthly_raw_ingested_events: { used: 0, limit: 10500 },
            retained_bundle_cap: { used: 451, limit: 450 },
            monthly_remote_activations: { used: 0, limit: 75 },
            monthly_alert_deliveries: { used: 0, limit: 225 },
            monthly_webhook_deliveries: { used: 0, limit: 750 }
          }
        })
      }
    });

    expect(result).toEqual({ processed: true });
    expect(pruneRetainedIncidentsForProject).toHaveBeenCalledWith({
      project_id: "proj_123",
      retained_bundle_limit: 450
    });
    expect(deleteObject).toHaveBeenCalledWith({
      key: buildBundleObjectKey("proj_old", "inc_old")
    });
    expect(deleteObject).toHaveBeenCalledWith({
      key: buildReproductionObjectKey("proj_old", "inc_old")
    });
  });

  it("should persist deterministic reproduction artifact bytes for build-reproduction jobs", async (): Promise<void> => {
    const bundle = createReproductionBundle({ includeRequest: true });

    const getObject = vi.fn().mockResolvedValue(gzipSync(Buffer.from(JSON.stringify(bundle), "utf8")));
    const putObject = vi.fn().mockResolvedValue(undefined);

    const result = await processNextBuildReproductionJob({
      queue: {
        enqueue: vi.fn(),
        dequeue: vi.fn().mockResolvedValue({
          project_id: "proj_123",
          incident_id: "inc_123",
          bundle_key: "bundles/proj_123/inc_123/bundle.json.gz",
          bundle_version: 1,
          occurred_at: "2026-03-12T00:00:00.000Z"
        })
      },
      objectStore: {
        getObject,
        putObject
      }
    });

    expect(result).toEqual({ processed: true });
    expect(getObject).toHaveBeenCalledWith({
      key: "bundles/proj_123/inc_123/bundle.json.gz"
    });
    expect(putObject).toHaveBeenCalledWith(
      expect.objectContaining({
        key: buildReproductionObjectKey("proj_123", "inc_123"),
        contentType: "application/json",
        contentEncoding: "gzip"
      })
    );

    const firstPayload = putObject.mock.calls[0]?.[0] as { body: Buffer };
    expect(JSON.parse(gunzipSync(firstPayload.body).toString("utf8"))).toEqual({
      possible: true,
      confidence: 0.8,
      reason: "request_context_available",
      artifacts: {
        curl: "curl -X POST 'https://example.invalid/checkout?coupon=SAVE10' -H 'content-type: application/json' --data-raw '{\"amount\":42}'",
        httpie:
          "printf '%s' '{\"amount\":42}' | http POST 'https://example.invalid/checkout?coupon=SAVE10' 'content-type:application/json'",
        json_spec: {
          method: "POST",
          url: "https://example.invalid/checkout?coupon=SAVE10",
          headers: {
            "content-type": "application/json"
          },
          body: {
            amount: 42
          }
        }
      },
      feasibility_reference: null
    });

    await processNextBuildReproductionJob({
      queue: {
        enqueue: vi.fn(),
        dequeue: vi.fn().mockResolvedValue({
          project_id: "proj_123",
          incident_id: "inc_123",
          bundle_key: "bundles/proj_123/inc_123/bundle.json.gz",
          bundle_version: 1,
          occurred_at: "2026-03-12T00:00:00.000Z"
        })
      },
      objectStore: {
        getObject,
        putObject
      }
    });

    const secondPayload = putObject.mock.calls[1]?.[0] as { body: Buffer };
    expect(firstPayload.body.equals(secondPayload.body)).toBe(true);
  });

  it("should persist low-confidence reproduction first and deterministically upgrade once request context appears", async (): Promise<void> => {
    const getObject = vi
      .fn()
      .mockResolvedValueOnce(gzipSync(Buffer.from(JSON.stringify(createReproductionBundle({ includeRequest: false })), "utf8")))
      .mockResolvedValueOnce(gzipSync(Buffer.from(JSON.stringify(createReproductionBundle({ includeRequest: true })), "utf8")))
      .mockResolvedValueOnce(gzipSync(Buffer.from(JSON.stringify(createReproductionBundle({ includeRequest: true })), "utf8")));
    const putObject = vi.fn().mockResolvedValue(undefined);

    expect(
      await processNextBuildReproductionJob({
        queue: {
          enqueue: vi.fn(),
          dequeue: vi.fn().mockResolvedValue({
            project_id: "proj_123",
            incident_id: "inc_123",
            bundle_key: "bundles/proj_123/inc_123/bundle.json.gz",
            bundle_version: 1,
            occurred_at: "2026-03-12T00:00:00.000Z"
          })
        },
        objectStore: {
          getObject,
          putObject
        }
      })
    ).toEqual({ processed: true });

    const initialPayload = putObject.mock.calls[0]?.[0] as { body: Buffer };
    expect(JSON.parse(gunzipSync(initialPayload.body).toString("utf8"))).toEqual({
      possible: false,
      confidence: 0.1,
      reason: "request_context_missing",
      artifacts: null,
      feasibility_reference: null
    });

    expect(
      await processNextBuildReproductionJob({
        queue: {
          enqueue: vi.fn(),
          dequeue: vi.fn().mockResolvedValue({
            project_id: "proj_123",
            incident_id: "inc_123",
            bundle_key: "bundles/proj_123/inc_123/bundle.json.gz",
            bundle_version: 1,
            occurred_at: "2026-03-12T00:10:00.000Z"
          })
        },
        objectStore: {
          getObject,
          putObject
        }
      })
    ).toEqual({ processed: true });

    const upgradedPayload = putObject.mock.calls[1]?.[0] as { body: Buffer };
    expect(JSON.parse(gunzipSync(upgradedPayload.body).toString("utf8"))).toEqual({
      possible: true,
      confidence: 0.8,
      reason: "request_context_available",
      artifacts: {
        curl: "curl -X POST 'https://example.invalid/checkout?coupon=SAVE10' -H 'content-type: application/json' --data-raw '{\"amount\":42}'",
        httpie:
          "printf '%s' '{\"amount\":42}' | http POST 'https://example.invalid/checkout?coupon=SAVE10' 'content-type:application/json'",
        json_spec: {
          method: "POST",
          url: "https://example.invalid/checkout?coupon=SAVE10",
          headers: {
            "content-type": "application/json"
          },
          body: {
            amount: 42
          }
        }
      },
      feasibility_reference: null
    });

    expect(
      await processNextBuildReproductionJob({
        queue: {
          enqueue: vi.fn(),
          dequeue: vi.fn().mockResolvedValue({
            project_id: "proj_123",
            incident_id: "inc_123",
            bundle_key: "bundles/proj_123/inc_123/bundle.json.gz",
            bundle_version: 1,
            occurred_at: "2026-03-12T00:10:00.000Z"
          })
        },
        objectStore: {
          getObject,
          putObject
        }
      })
    ).toEqual({ processed: true });

    const replayPayload = putObject.mock.calls[2]?.[0] as { body: Buffer };
    expect(upgradedPayload.body.equals(replayPayload.body)).toBe(true);
  });

  it("should encode trigger semantics in persisted build-bundle scaffold", async (): Promise<void> => {
    const putObject = vi.fn().mockResolvedValue(undefined);
    const getBundleBuildContext = vi.fn().mockResolvedValue({
      incident_id: "inc_123",
      project_id: "proj_123",
      service_id: "svc_123",
      service_name: "checkout-api",
      service_runtime: "node",
      service_framework: "fastify",
      environment: "production",
      fingerprint: "fp_123",
      title: "TypeError at checkout",
      severity: "high",
      first_seen_at: "2026-03-11T23:59:00.000Z",
      last_seen_at: "2026-03-12T00:00:00.000Z",
      occurrence_count: 2,
      source_event_types: ["backend_exception"]
    });

    await processNextBuildBundleJob({
      queue: {
        enqueue: vi.fn(),
        dequeue: vi.fn().mockResolvedValue({
          project_id: "proj_123",
          incident_id: "inc_123",
          event_id: "evt_123",
          occurred_at: "2026-03-12T00:00:00.000Z",
          occurrence_count: 2,
          trigger: "regression_reopen"
        })
      },
      incidentStore: {
        getBundleBuildContext,
        reserveBundleGeneration: vi.fn().mockResolvedValue(
          createReservedBundleGeneration({
            generation_number: 1,
            trigger: "regression_reopen"
          })
        )
      },
      objectStore: {
        putObject
      }
    });

    const regressionPayload = putObject.mock.calls[0]?.[0] as { body: Buffer };
    const regressionBundle = BundleV1Schema.parse(JSON.parse(gunzipSync(regressionPayload.body).toString("utf8")));
    expect(regressionBundle.summary.signals.regression_suspected).toBe(true);

    await processNextBuildBundleJob({
      queue: {
        enqueue: vi.fn(),
        dequeue: vi.fn().mockResolvedValue({
          project_id: "proj_123",
          incident_id: "inc_123",
          event_id: "evt_123",
          occurred_at: "2026-03-12T00:00:00.000Z",
          occurrence_count: 4,
          trigger: "deploy_metadata"
        })
      },
      env: {},
      incidentStore: {
        getBundleBuildContext,
        reserveBundleGeneration: vi.fn().mockResolvedValue(
          createReservedBundleGeneration({
            generation_number: 2,
            trigger: "deploy_metadata"
          })
        )
      },
      objectStore: {
        putObject
      }
    });

    const deployPayload = putObject.mock.calls[1]?.[0] as { body: Buffer };
    const deployBundle = BundleV1Schema.parse(JSON.parse(gunzipSync(deployPayload.body).toString("utf8")));
    expect(deployBundle.summary.signals.new_deploy).toBe(true);
  });

  it("should match deploy_metadata golden fixture output byte-for-byte", async (): Promise<void> => {
    const putObject = vi.fn().mockResolvedValue(undefined);

    const result = await processNextBuildBundleJob({
      queue: {
        enqueue: vi.fn(),
        dequeue: vi.fn().mockResolvedValue({
          project_id: "proj_fixture",
          incident_id: "inc_fixture",
          event_id: "evt_fixture",
          occurred_at: "2026-03-12T00:00:00.000Z",
          occurrence_count: 3,
          trigger: "deploy_metadata"
        })
      },
      env: {},
      incidentStore: {
        getBundleBuildContext: vi.fn().mockResolvedValue({
          incident_id: "inc_fixture",
          project_id: "proj_fixture",
          service_id: "svc_fixture",
          service_name: "checkout-api",
          service_runtime: "node",
          service_framework: "fastify",
          environment: "production",
          fingerprint: "fp_fixture",
          title: "TypeError at checkout",
          severity: "high",
          first_seen_at: "2026-03-11T23:59:00.000Z",
          last_seen_at: "2026-03-12T00:00:00.000Z",
          occurrence_count: 3,
          source_event_types: ["request_event", "backend_exception"]
        }),
        reserveBundleGeneration: vi.fn().mockResolvedValue(
          createReservedBundleGeneration({
            generation_number: 3,
            source_event_id: "evt_fixture",
            trigger: "deploy_metadata"
          })
        )
      },
      objectStore: {
        putObject
      }
    });

    expect(result).toEqual({ processed: true });
    const payload = putObject.mock.calls[0]?.[0] as { body: Buffer };
    const bundleJson = gunzipSync(payload.body).toString("utf8");

    expect(bundleJson).toBe(deployMetadataGoldenFixture);
    expect(BundleV1Schema.parse(JSON.parse(bundleJson))).toEqual(
      BundleV1Schema.parse(JSON.parse(deployMetadataGoldenFixture))
    );
  });

  it("should merge remote probe_event context deterministically using incident-aligned matching", async (): Promise<void> => {
    const putObject = vi.fn().mockResolvedValue(undefined);

    const result = await processNextBuildBundleJob({
      queue: {
        enqueue: vi.fn(),
        dequeue: vi.fn().mockResolvedValue({
          project_id: "proj_probe",
          incident_id: "inc_probe",
          event_id: "evt_build",
          occurred_at: "2026-03-12T00:00:00.000Z",
          occurrence_count: 3,
          trigger: "deploy_metadata"
        })
      },
      incidentStore: {
        getBundleBuildContext: vi.fn().mockResolvedValue({
          incident_id: "inc_probe",
          project_id: "proj_probe",
          service_id: "svc_probe",
          service_name: "checkout-api",
          service_runtime: "node",
          service_framework: "fastify",
          environment: "production",
          fingerprint: "fp_probe",
          title: "TypeError at checkout",
          severity: "high",
          first_seen_at: "2026-03-12T00:00:00.000Z",
          last_seen_at: "2026-03-12T00:01:00.000Z",
          occurrence_count: 3,
          source_event_types: ["backend_exception", "request_event"]
        }),
        reserveBundleGeneration: vi.fn().mockResolvedValue(
          createReservedBundleGeneration({
            generation_number: 3,
            source_event_id: "evt_build",
            trigger: "deploy_metadata"
          })
        ),
        listIncidentEventReferences: vi.fn().mockResolvedValue([
          {
            event_id: "00000000-0000-4000-8000-000000000101",
            event_type: "backend_exception",
            occurred_at: "2026-03-12T00:00:10.000Z"
          }
        ]),
        listProbeEventCandidatesForServiceWindow: vi.fn().mockResolvedValue([
          {
            event_id: "00000000-0000-4000-8000-000000000102",
            occurred_at: "2026-03-12T00:00:20.000Z"
          },
          {
            event_id: "00000000-0000-4000-8000-000000000103",
            occurred_at: "2026-03-12T00:00:25.000Z"
          },
          {
            event_id: "00000000-0000-4000-8000-000000000104",
            occurred_at: "2026-03-12T00:00:30.000Z"
          }
        ])
      },
      objectStore: {
        putObject,
        getObject: vi.fn((input: { key: string }) => {
          if (input.key.endsWith("00000000-0000-4000-8000-000000000101.json.gz")) {
            return Promise.resolve(gzipSync(
              Buffer.from(
                JSON.stringify(
                  createEventEnvelope({
                    event_id: "00000000-0000-4000-8000-000000000101",
                    event_type: "backend_exception",
                    occurred_at: "2026-03-12T00:00:10.000Z",
                    service: {
                      name: "checkout-api",
                      runtime: "node",
                      framework: "fastify",
                      environment: "production"
                    },
                    correlation: {
                      request_id: null,
                      trace_id: "trace-match",
                      session_id: null,
                      user_id_hash: null
                    },
                    payload: {
                      name: "TypeError",
                      message: "boom",
                      stack: "TypeError: boom\\n at src/checkout.ts:10:2",
                      handled: false,
                      request: {
                        method: "GET",
                        path: "/checkout",
                        query: {},
                        headers: {},
                        body: null
                      },
                      response: {
                        status_code: 500
                      },
                      runtime: {
                        version: "22.0.0"
                      },
                      probe_data: {
                        version: 1,
                        items: [
                          {
                            label: "checkout.tax",
                            data: {
                              step: "tax",
                              value: 12
                            },
                            timestamp: "2026-03-12T00:00:20.000Z",
                            activation_id: null
                          },
                          {
                            label: "checkout.inline_only",
                            data: {
                              from: "inline"
                            },
                            timestamp: "2026-03-12T00:00:15.000Z",
                            activation_id: null
                          }
                        ]
                      }
                    }
                  })
                ),
                "utf8"
              )
            ));
          }

          if (input.key.endsWith("00000000-0000-4000-8000-000000000102.json.gz")) {
            return Promise.resolve(gzipSync(
              Buffer.from(
                JSON.stringify(
                  createEventEnvelope({
                    event_id: "00000000-0000-4000-8000-000000000102",
                    event_type: "probe_event",
                    occurred_at: "2026-03-12T00:00:20.000Z",
                    service: {
                      name: "checkout-api",
                      runtime: "node",
                      framework: "fastify",
                      environment: "production"
                    },
                    correlation: {
                      request_id: null,
                      trace_id: "trace-match",
                      session_id: null,
                      user_id_hash: null
                    },
                    payload: {
                      label: "checkout.tax",
                      data: {
                        step: "tax",
                        value: 12
                      },
                      activation_id: null,
                      probe_label_pattern: "checkout.*"
                    }
                  })
                ),
                "utf8"
              )
            ));
          }

          if (input.key.endsWith("00000000-0000-4000-8000-000000000103.json.gz")) {
            return Promise.resolve(gzipSync(
              Buffer.from(
                JSON.stringify(
                  createEventEnvelope({
                    event_id: "00000000-0000-4000-8000-000000000103",
                    event_type: "probe_event",
                    occurred_at: "2026-03-12T00:00:25.000Z",
                    service: {
                      name: "checkout-api",
                      runtime: "node",
                      framework: "fastify",
                      environment: "production"
                    },
                    correlation: {
                      request_id: null,
                      trace_id: "trace-other",
                      session_id: null,
                      user_id_hash: null
                    },
                    payload: {
                      label: "checkout.miss",
                      data: {
                        ignored: true
                      },
                      activation_id: "00000000-0000-4000-8000-000000000012",
                      probe_label_pattern: "checkout.*"
                    }
                  })
                ),
                "utf8"
              )
            ));
          }

          return Promise.resolve(gzipSync(
            Buffer.from(
              JSON.stringify(
                createEventEnvelope({
                  event_id: "00000000-0000-4000-8000-000000000104",
                  event_type: "probe_event",
                  occurred_at: "2026-03-12T00:00:30.000Z",
                  service: {
                    name: "checkout-api",
                    runtime: "node",
                    framework: "fastify",
                    environment: "production"
                  },
                  correlation: {
                    request_id: null,
                    trace_id: null,
                    session_id: null,
                    user_id_hash: null
                  },
                  payload: {
                    label: "checkout.no_trace",
                    data: {
                      fallback: true
                    },
                    activation_id: "00000000-0000-4000-8000-000000000013",
                    probe_label_pattern: "checkout.*"
                  }
                })
              ),
              "utf8"
            )
          ));
        })
      }
    });

    expect(result).toEqual({ processed: true });

    const payload = putObject.mock.calls[0]?.[0] as { body: Buffer };
    const bundle = BundleV1Schema.parse(JSON.parse(gunzipSync(payload.body).toString("utf8")));

    expect(bundle.context.probe_data).toEqual({
      version: 1,
      items: [
        {
          label: "checkout.inline_only",
          data: {
            from: "inline"
          },
          timestamp: "2026-03-12T00:00:15.000Z",
          activation_id: null
        },
        {
          label: "checkout.tax",
          data: {
            step: "tax",
            value: 12
          },
          timestamp: "2026-03-12T00:00:20.000Z",
          activation_id: null
        },
        {
          label: "checkout.no_trace",
          data: {
            fallback: true
          },
          timestamp: "2026-03-12T00:00:30.000Z",
          activation_id: "00000000-0000-4000-8000-000000000013"
        }
      ]
    });
  });

  it("should normalize store timestamp text to strict ISO datetimes in build-bundle artifacts", async (): Promise<void> => {
    const putObject = vi.fn().mockResolvedValue(undefined);

    const result = await processNextBuildBundleJob({
      queue: {
        enqueue: vi.fn(),
        dequeue: vi.fn().mockResolvedValue({
          project_id: "proj_123",
          incident_id: "inc_123",
          event_id: "evt_123",
          occurred_at: "2026-03-12T00:00:00.000Z",
          occurrence_count: 2,
          trigger: "occurrence_threshold"
        })
      },
      incidentStore: {
        // Postgres text can include a space separator and timezone offset.
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
          severity: "high",
          first_seen_at: "2026-03-11 23:59:00+00",
          last_seen_at: "2026-03-12 00:00:00+00",
          occurrence_count: 2,
          source_event_types: ["backend_exception"]
        }),
        reserveBundleGeneration: vi.fn().mockResolvedValue(
          createReservedBundleGeneration({
            generation_number: 1,
            created_at: "2026-03-12 00:00:00+00",
            updated_at: "2026-03-12 00:00:00+00"
          })
        )
      },
      objectStore: {
        putObject
      }
    });

    expect(result).toEqual({ processed: true });

    const payload = putObject.mock.calls[0]?.[0] as { body: Buffer };
    const bundle = BundleV1Schema.parse(JSON.parse(gunzipSync(payload.body).toString("utf8")));

    expect(bundle.captured_at).toBe("2026-03-12T00:00:00.000Z");
    expect(bundle.signal.first_seen_at).toBe("2026-03-11T23:59:00.000Z");
    expect(bundle.signal.last_seen_at).toBe("2026-03-12T00:00:00.000Z");
    expect(bundle.metadata.created_at).toBe("2026-03-12T00:00:00.000Z");
    expect(bundle.metadata.updated_at).toBe("2026-03-12T00:00:00.000Z");
  });

  it("should derive rich bundle context blocks from incident event envelopes and use persisted generation metadata", async (): Promise<void> => {
    const putObject = vi.fn().mockResolvedValue(undefined);

    const result = await processNextBuildBundleJob({
      queue: {
        enqueue: vi.fn(),
        dequeue: vi.fn().mockResolvedValue({
          project_id: "proj_rich",
          incident_id: "inc_rich",
          event_id: "00000000-0000-4000-8000-000000000201",
          occurred_at: "2026-03-12T00:00:10.000Z",
          occurrence_count: 3,
          trigger: "deploy_metadata"
        })
      },
      incidentStore: {
        getBundleBuildContext: vi.fn().mockResolvedValue({
          incident_id: "inc_rich",
          project_id: "proj_rich",
          service_id: "svc_rich",
          service_name: "checkout-api",
          service_runtime: "node",
          service_framework: "fastify",
          environment: "production",
          fingerprint: "fp_rich",
          title: "TypeError at checkout",
          severity: "high",
          first_seen_at: "2026-03-12T00:00:05.000Z",
          last_seen_at: "2026-03-12T00:00:40.000Z",
          occurrence_count: 3,
          source_event_types: ["backend_exception", "request_event", "log_event", "frontend_exception", "deploy_metadata"]
        }),
        reserveBundleGeneration: vi.fn().mockResolvedValue({
          generation_number: 2,
          created_at: "2026-03-12T00:01:00.000Z",
          updated_at: "2026-03-12T00:01:00.000Z",
          source_event_id: "00000000-0000-4000-8000-000000000201",
          source_occurred_at: "2026-03-12T00:00:10.000Z",
          trigger: "deploy_metadata"
        }),
        listIncidentEventReferences: vi.fn().mockResolvedValue([
          {
            event_id: "00000000-0000-4000-8000-000000000201",
            event_type: "backend_exception",
            occurred_at: "2026-03-12T00:00:10.000Z"
          },
          {
            event_id: "00000000-0000-4000-8000-000000000202",
            event_type: "request_event",
            occurred_at: "2026-03-12T00:00:12.000Z"
          },
          {
            event_id: "00000000-0000-4000-8000-000000000203",
            event_type: "log_event",
            occurred_at: "2026-03-12T00:00:14.000Z"
          },
          {
            event_id: "00000000-0000-4000-8000-000000000204",
            event_type: "frontend_breadcrumb",
            occurred_at: "2026-03-12T00:00:16.000Z"
          },
          {
            event_id: "00000000-0000-4000-8000-000000000205",
            event_type: "frontend_exception",
            occurred_at: "2026-03-12T00:00:18.000Z"
          },
          {
            event_id: "00000000-0000-4000-8000-000000000206",
            event_type: "deploy_metadata",
            occurred_at: "2026-03-12T00:00:20.000Z"
          }
        ]),
        listProbeEventCandidatesForServiceWindow: vi.fn().mockResolvedValue([])
      },
      objectStore: {
        putObject,
        getObject: vi.fn((input: { key: string }) => {
          if (input.key.endsWith("00000000-0000-4000-8000-000000000201.json.gz")) {
            return Promise.resolve(gzipSync(
              Buffer.from(
                JSON.stringify(
                  createEventEnvelope({
                    event_id: "00000000-0000-4000-8000-000000000201",
                    event_type: "backend_exception",
                    occurred_at: "2026-03-12T00:00:10.000Z",
                    service: {
                      name: "checkout-api",
                      runtime: "node",
                      framework: "fastify",
                      environment: "production"
                    },
                    correlation: {
                      request_id: "req_123",
                      trace_id: "trace_123",
                      session_id: null,
                      user_id_hash: null
                    },
                    payload: {
                      name: "TypeError",
                      message: "boom",
                      stack: "TypeError: boom\n    at processOrder (src/checkout.ts:42:11)",
                      handled: false,
                      request: {
                        method: "POST",
                        path: "/checkout",
                        query: { coupon: "SAVE10" },
                        headers: { "content-type": "application/json" },
                        body: { amount: 42 }
                      },
                      response: {
                        status_code: 500
                      },
                      runtime: {
                        version: "22.0.0"
                      }
                    }
                  })
                ),
                "utf8"
              )
            ));
          }

          if (input.key.endsWith("00000000-0000-4000-8000-000000000202.json.gz")) {
            return Promise.resolve(gzipSync(
              Buffer.from(
                JSON.stringify(
                  createEventEnvelope({
                    event_id: "00000000-0000-4000-8000-000000000202",
                    event_type: "request_event",
                    occurred_at: "2026-03-12T00:00:12.000Z",
                    service: {
                      name: "checkout-api",
                      runtime: "node",
                      framework: "fastify",
                      environment: "production"
                    },
                    correlation: {
                      request_id: "req_123",
                      trace_id: "trace_123",
                      session_id: null,
                      user_id_hash: null
                    },
                    payload: {
                      method: "POST",
                      path: "/checkout",
                      query: { coupon: "SAVE10" },
                      headers: { "content-type": "application/json" },
                      body: { amount: 42 },
                      response_status: 500,
                      duration_ms: 120,
                      route_template: "/checkout"
                    }
                  })
                ),
                "utf8"
              )
            ));
          }

          if (input.key.endsWith("00000000-0000-4000-8000-000000000203.json.gz")) {
            return Promise.resolve(gzipSync(
              Buffer.from(
                JSON.stringify(
                  createEventEnvelope({
                    event_id: "00000000-0000-4000-8000-000000000203",
                    event_type: "log_event",
                    occurred_at: "2026-03-12T00:00:14.000Z",
                    service: {
                      name: "checkout-api",
                      runtime: "node",
                      framework: "fastify",
                      environment: "production"
                    },
                    payload: {
                      level: "error",
                      message: "payment failed",
                      attributes: { orderId: "ord_123" }
                    }
                  })
                ),
                "utf8"
              )
            ));
          }

          if (input.key.endsWith("00000000-0000-4000-8000-000000000204.json.gz")) {
            return Promise.resolve(gzipSync(
              Buffer.from(
                JSON.stringify(
                  createEventEnvelope({
                    event_id: "00000000-0000-4000-8000-000000000204",
                    event_type: "frontend_breadcrumb",
                    occurred_at: "2026-03-12T00:00:16.000Z",
                    service: {
                      name: "checkout-api",
                      runtime: "browser-js",
                      framework: "react",
                      environment: "production"
                    },
                    payload: {
                      breadcrumb_type: "route_change",
                      route: "/checkout",
                      data: { from: "/cart", to: "/checkout" }
                    }
                  })
                ),
                "utf8"
              )
            ));
          }

          if (input.key.endsWith("00000000-0000-4000-8000-000000000205.json.gz")) {
            return Promise.resolve(gzipSync(
              Buffer.from(
                JSON.stringify(
                  createEventEnvelope({
                    event_id: "00000000-0000-4000-8000-000000000205",
                    event_type: "frontend_exception",
                    occurred_at: "2026-03-12T00:00:18.000Z",
                    service: {
                      name: "checkout-api",
                      runtime: "browser-js",
                      framework: "react",
                      environment: "production"
                    },
                    payload: {
                      name: "TypeError",
                      message: "Cannot read properties of null",
                      stack: "TypeError: Cannot read properties of null\n    at CheckoutPage (src/Checkout.tsx:12:3)",
                      route: "/checkout",
                      browser: { name: "Chrome", version: "122.0.0" },
                      device: {
                        user_agent: "Mozilla/5.0",
                        os: { name: "macOS", version: "14.4" },
                        device_type: "desktop",
                        screen: { width: 1728, height: 1117 },
                        viewport: { width: 1440, height: 900 },
                        device_pixel_ratio: 2,
                        touch_capable: false,
                        language: "en-US",
                        connection_type: "4g",
                        color_scheme_preference: "light"
                      },
                      dom_context: {
                        mode: "lightweight",
                        html_excerpt: "<button>Pay</button>"
                      }
                    }
                  })
                ),
                "utf8"
              )
            ));
          }

          return Promise.resolve(gzipSync(
            Buffer.from(
              JSON.stringify(
                createEventEnvelope({
                  event_id: "00000000-0000-4000-8000-000000000206",
                  event_type: "deploy_metadata",
                  occurred_at: "2026-03-12T00:00:20.000Z",
                  service: {
                    name: "checkout-api",
                    runtime: "node",
                    framework: "fastify",
                    environment: "production"
                  },
                  payload: {
                    commit_sha: "abcdef1234567890",
                    version: "v2.4.0",
                    branch: "main",
                    environment: "production",
                    deployed_at: "2026-03-12T00:00:00.000Z"
                  }
                })
              ),
              "utf8"
            )
          ));
        })
      }
    });

    expect(result).toEqual({ processed: true });

    const payload = putObject.mock.calls[0]?.[0] as { body: Buffer };
    const bundle = BundleV1Schema.parse(JSON.parse(gunzipSync(payload.body).toString("utf8")));

    expect(bundle.metadata.generation_number).toBe(2);
    expect(bundle.metadata.created_at).toBe("2026-03-12T00:01:00.000Z");
    expect(bundle.metadata.updated_at).toBe("2026-03-12T00:01:00.000Z");
    expect(bundle.captured_at).toBe("2026-03-12T00:00:10.000Z");
    expect(bundle.signal.signal_id).toBe("00000000-0000-4000-8000-000000000201");
    expect(bundle.context.request).toEqual({
      version: 1,
      method: "POST",
      path: "/checkout",
      route_template: "/checkout",
      query: { coupon: "SAVE10" },
      headers: { "content-type": "application/json" },
      body: { amount: 42 },
      request_id: "req_123"
    });
    expect(bundle.context.response).toEqual({
      version: 1,
      status_code: 500,
      duration_ms: 120
    });
    expect(bundle.context.logs).toEqual({
      version: 1,
      items: [
        {
          level: "error",
          message: "payment failed",
          timestamp: "2026-03-12T00:00:14.000Z",
          attributes: { orderId: "ord_123" }
        }
      ]
    });
    expect(bundle.context.frontend).toEqual({
      version: 1,
      route_changes: [{ from: "/cart", to: "/checkout", ts: "2026-03-12T00:00:16.000Z" }],
      clicks: [],
      form_submissions: [],
      console_logs: [],
      network_requests: [],
      exceptions: [
        {
          name: "TypeError",
          message: "Cannot read properties of null",
          route: "/checkout",
          browser: { name: "Chrome", version: "122.0.0" },
          ts: "2026-03-12T00:00:18.000Z"
        }
      ],
      dom_context: {
        mode: "lightweight",
        html_excerpt: "<button>Pay</button>"
      }
    });
    expect(bundle.context.deploy).toEqual({
      version: 1,
      commit_sha: "abcdef1234567890",
      deploy_version: "v2.4.0",
      branch: "main",
      deployed_at: "2026-03-12T00:00:00.000Z",
      regression_window: false
    });
    expect(bundle.context.runtime).toEqual({
      version: 1,
      name: "node",
      runtime_version: "22.0.0",
      platform: null,
      arch: null,
      pid: null,
      cwd: null,
      uptime_sec: null,
      hostname: null,
      thread_id: null,
      framework: "fastify",
      framework_version: null,
      memory: null,
      framework_extras: null
    });
    expect(bundle.context.git).toEqual({
      version: 1,
      commit: "abcdef1234567890",
      commit_short: "abcdef1",
      branch: "main",
      repo: null,
      dirty: false,
      source: "env"
    });
    expect(bundle.context.device).toEqual({
      version: 1,
      user_agent: "Mozilla/5.0",
      browser: { name: "Chrome", version: "122.0.0" },
      os: { name: "macOS", version: "14.4" },
      device_type: "desktop",
      screen: { width: 1728, height: 1117 },
      viewport: { width: 1440, height: 900 },
      device_pixel_ratio: 2,
      touch_capable: false,
      language: "en-US",
      connection_type: "4g",
      color_scheme_preference: "light"
    });
  });

  it("should include sampled log candidates correlated with incident request context", async (): Promise<void> => {
    const putObject = vi.fn().mockResolvedValue(undefined);
    const matchingLogEventId = "00000000-0000-4000-8000-000000000302";
    const unrelatedLogEventId = "00000000-0000-4000-8000-000000000303";

    const result = await processNextBuildBundleJob({
      queue: {
        enqueue: vi.fn(),
        dequeue: vi.fn().mockResolvedValue({
          project_id: "proj_logs",
          incident_id: "inc_logs",
          event_id: "00000000-0000-4000-8000-000000000301",
          occurred_at: "2026-03-12T00:00:10.000Z",
          occurrence_count: 1,
          trigger: "occurrence_threshold"
        })
      },
      incidentStore: {
        getBundleBuildContext: vi.fn().mockResolvedValue({
          incident_id: "inc_logs",
          project_id: "proj_logs",
          service_id: "svc_logs",
          service_name: "debugbundle-api",
          service_runtime: "node",
          service_framework: "fastify",
          environment: "production",
          fingerprint: "fp_logs",
          title: "github_api_invalid_response",
          severity: "high",
          first_seen_at: "2026-03-12T00:00:10.000Z",
          last_seen_at: "2026-03-12T00:00:10.000Z",
          occurrence_count: 1,
          source_event_types: ["backend_exception"]
        }),
        reserveBundleGeneration: vi.fn().mockResolvedValue(createReservedBundleGeneration({
          source_event_id: "00000000-0000-4000-8000-000000000301",
          source_occurred_at: "2026-03-12T00:00:10.000Z"
        })),
        listIncidentEventReferences: vi.fn().mockResolvedValue([
          {
            event_id: "00000000-0000-4000-8000-000000000301",
            event_type: "backend_exception",
            occurred_at: "2026-03-12T00:00:10.000Z"
          }
        ]),
        listLogEventCandidatesForServiceWindow: vi.fn().mockResolvedValue([
          {
            event_id: matchingLogEventId,
            occurred_at: "2026-03-12T00:00:09.500Z"
          },
          {
            event_id: unrelatedLogEventId,
            occurred_at: "2026-03-12T00:00:09.750Z"
          }
        ]),
        listProbeEventCandidatesForServiceWindow: vi.fn().mockResolvedValue([])
      },
      objectStore: {
        putObject,
        getObject: vi.fn((input: { key: string }) => {
          if (input.key.endsWith("00000000-0000-4000-8000-000000000301.json.gz")) {
            return Promise.resolve(gzipSync(Buffer.from(JSON.stringify(createEventEnvelope({
              event_id: "00000000-0000-4000-8000-000000000301",
              event_type: "backend_exception",
              occurred_at: "2026-03-12T00:00:10.000Z",
              service: {
                name: "debugbundle-api",
                runtime: "node",
                framework: "fastify",
                environment: "production"
              },
              correlation: {
                request_id: "req_install_url",
                trace_id: "trace_install_url",
                session_id: null,
                user_id_hash: null
              },
              payload: {
                name: "Error",
                message: "github_api_invalid_response",
                stack: "Error: github_api_invalid_response\n    at getInstallUrl (apps/api/src/github-app.ts:1:1)",
                handled: false,
                request: {
                  method: "GET",
                  path: "/v1/github/app/install-url",
                  query: {},
                  headers: {},
                  body: null
                },
                response: {
                  status_code: 500
                },
                runtime: {
                  version: "24.0.0"
                }
              }
            })), "utf8")));
          }

          const eventId = input.key.endsWith(`${matchingLogEventId}.json.gz`) ? matchingLogEventId : unrelatedLogEventId;
          return Promise.resolve(gzipSync(Buffer.from(JSON.stringify(createEventEnvelope({
            event_id: eventId,
            event_type: "log_event",
            occurred_at: eventId === matchingLogEventId ? "2026-03-12T00:00:09.500Z" : "2026-03-12T00:00:09.750Z",
            service: {
              name: "debugbundle-api",
              runtime: "node",
              framework: "fastify",
              environment: "production"
            },
            correlation: {
              request_id: eventId === matchingLogEventId ? "req_install_url" : "req_other",
              trace_id: eventId === matchingLogEventId ? "trace_install_url" : "trace_other",
              session_id: null,
              user_id_hash: null
            },
            payload: {
              level: "error",
              message: eventId === matchingLogEventId ? "github app returned invalid response" : "unrelated failure",
              attributes: {
                upstream: "github"
              }
            }
          })), "utf8")));
        })
      }
    });

    expect(result).toEqual({ processed: true });

    const payload = putObject.mock.calls[0]?.[0] as { body: Buffer };
    const bundle = BundleV1Schema.parse(JSON.parse(gunzipSync(payload.body).toString("utf8")));

    expect(bundle.context.logs).toEqual({
      version: 1,
      items: [
        {
          level: "error",
          message: "github app returned invalid response",
          timestamp: "2026-03-12T00:00:09.500Z",
          attributes: {
            upstream: "github"
          }
        }
      ]
    });
  });

  it("should return incident_missing when build-bundle incident context cannot be loaded", async (): Promise<void> => {
    const result = await processNextBuildBundleJob({
      queue: {
        enqueue: vi.fn(),
        dequeue: vi.fn().mockResolvedValue({
          project_id: "proj_123",
          incident_id: "inc_missing",
          event_id: "evt_123",
          occurred_at: "2026-03-12T00:00:00.000Z",
          occurrence_count: 1,
          trigger: "occurrence_threshold"
        })
      },
      incidentStore: {
        getBundleBuildContext: vi.fn().mockResolvedValue(null),
        reserveBundleGeneration: vi.fn()
      },
      objectStore: {
        putObject: vi.fn()
      }
    });

    expect(result).toEqual({ processed: false, reason: "incident_missing" });
  });

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

  it("should return delivery_missing when deliver-webhook job points to unknown delivery", async (): Promise<void> => {
    const result = await processNextDeliverWebhookJob({
      queue: {
        enqueue: vi.fn(),
        dequeue: vi.fn().mockResolvedValue({ delivery_id: "del_missing", attempt: 1 })
      },
      webhookDeliveryStore: {
        getDeliveryIntent: vi.fn().mockResolvedValue(null),
        markDeliveryAttempt: vi.fn()
      },
      lifecycleWebhookTransport: {
        deliver: vi.fn()
      }
    });

    expect(result).toEqual({ processed: false, reason: "delivery_missing" });
  });

  it("should propagate response code from lifecycle delivery errors", async (): Promise<void> => {
    const queue = {
      enqueue: vi.fn().mockResolvedValue(undefined),
      dequeue: vi.fn().mockResolvedValue({ delivery_id: "del_123", attempt: 1 })
    };

    const webhookDeliveryStore = {
      getDeliveryIntent: vi.fn().mockResolvedValue({
        delivery_id: "del_123",
        webhook_id: "wh_123",
        project_id: "proj_123",
        incident_id: "inc_123",
        event_type: "incident.spike_detected",
        status: "pending",
        attempt_count: 0,
        occurred_at: "2026-03-11T00:00:00.000Z",
        target_url: "https://hooks.example.test/debugbundle",
        next_attempt_at: null,
        last_response_code: null,
        last_attempted_at: null,
        last_error: null,
        payload: { incident_id: "inc_123" },
        signing_secret: "secret_123"
      }),
      markDeliveryAttempt: vi.fn().mockResolvedValue({ status: "retrying", next_attempt: 2 })
    };

    const lifecycleWebhookTransport = {
      deliver: vi.fn().mockRejectedValue(new LifecycleWebhookDeliveryError("webhook_http_error_503", 503))
    };

    const result = await processNextDeliverWebhookJob({
      queue,
      webhookDeliveryStore,
      lifecycleWebhookTransport
    });

    expect(result).toEqual({ processed: true });
    expect(webhookDeliveryStore.markDeliveryAttempt).toHaveBeenCalledWith({
      delivery_id: "del_123",
      attempt: 1,
      delivered: false,
      error_message: "webhook_http_error_503",
      response_code: 503
    });
  });

  it("should return no_jobs when deliver-webhook queue is empty", async (): Promise<void> => {
    const result = await processNextDeliverWebhookJob({
      queue: {
        enqueue: vi.fn(),
        dequeue: vi.fn().mockResolvedValue(null)
      },
      webhookDeliveryStore: {
        getDeliveryIntent: vi.fn(),
        markDeliveryAttempt: vi.fn()
      },
      lifecycleWebhookTransport: {
        deliver: vi.fn()
      }
    });

    expect(result).toEqual({ processed: false, reason: "no_jobs" });
  });

  it("should mark webhook delivery as delivered when transport succeeds", async (): Promise<void> => {
    const queue = {
      enqueue: vi.fn(),
      dequeue: vi.fn().mockResolvedValue({ delivery_id: "del_123", attempt: 1 })
    };

    const webhookDeliveryStore = {
      getDeliveryIntent: vi.fn().mockResolvedValue({
        delivery_id: "del_123",
        webhook_id: "wh_123",
        project_id: "proj_123",
        incident_id: "inc_123",
        event_type: "bundle.reopened",
        status: "pending",
        attempt_count: 0,
        occurred_at: "2026-03-11T00:00:00.000Z",
        target_url: "https://hooks.example.test/debugbundle",
        next_attempt_at: null,
        last_response_code: null,
        last_attempted_at: null,
        last_error: null,
        payload: { incident_id: "inc_123" },
        signing_secret: "secret_123"
      }),
      markDeliveryAttempt: vi.fn().mockResolvedValue({ status: "delivered", next_attempt: null })
    };

    const lifecycleWebhookTransport = {
      deliver: vi.fn().mockResolvedValue(undefined)
    };

    const result = await processNextDeliverWebhookJob({
      queue,
      webhookDeliveryStore,
      lifecycleWebhookTransport
    });

    expect(result).toEqual({ processed: true });
    expect(webhookDeliveryStore.markDeliveryAttempt).toHaveBeenCalledWith({
      delivery_id: "del_123",
      attempt: 1,
      delivered: true,
      error_message: null,
      response_code: 200
    });
  });

  it("should pass verification.passed deliveries through the existing webhook transport", async (): Promise<void> => {
    const queue = {
      enqueue: vi.fn(),
      dequeue: vi.fn().mockResolvedValue({ delivery_id: "del_456", attempt: 1 })
    };

    const webhookDeliveryStore = {
      getDeliveryIntent: vi.fn().mockResolvedValue({
        delivery_id: "del_456",
        webhook_id: "wh_123",
        project_id: "proj_123",
        incident_id: "inc_test_123",
        event_type: "verification.passed",
        status: "retrying",
        attempt_count: 0,
        occurred_at: "2026-03-11T00:00:00.000Z",
        target_url: "https://hooks.example.test/debugbundle",
        next_attempt_at: "2026-03-11T00:00:30.000Z",
        last_response_code: null,
        last_attempted_at: null,
        last_error: null,
        payload: {
          event_type: "verification.passed",
          test: true
        },
        signing_secret: "secret_123"
      }),
      markDeliveryAttempt: vi.fn().mockResolvedValue({ status: "delivered", next_attempt: null })
    };

    const lifecycleWebhookTransport = {
      deliver: vi.fn().mockResolvedValue(undefined)
    };

    await expect(
      processNextDeliverWebhookJob({
        queue,
        webhookDeliveryStore,
        lifecycleWebhookTransport
      })
    ).resolves.toEqual({ processed: true });
    const deliveredEvent = lifecycleWebhookTransport.deliver.mock.calls[0]?.[0] as
      | { delivery_id?: string; event_type?: string; payload?: { event_type?: string; test?: boolean } }
      | undefined;
    expect(deliveredEvent?.delivery_id).toBe("del_456");
    expect(deliveredEvent?.event_type).toBe("verification.passed");
    expect(deliveredEvent?.payload?.event_type).toBe("verification.passed");
    expect(deliveredEvent?.payload?.test).toBe(true);
  });

  it("should record retry state on delivery failure without immediate re-enqueue", async (): Promise<void> => {
    const queue = {
      enqueue: vi.fn().mockResolvedValue(undefined),
      dequeue: vi.fn().mockResolvedValue({ delivery_id: "del_123", attempt: 1 })
    };

    const webhookDeliveryStore = {
      getDeliveryIntent: vi.fn().mockResolvedValue({
        delivery_id: "del_123",
        webhook_id: "wh_123",
        project_id: "proj_123",
        incident_id: "inc_123",
        event_type: "incident.spike_detected",
        status: "pending",
        attempt_count: 0,
        occurred_at: "2026-03-11T00:00:00.000Z",
        target_url: "https://hooks.example.test/debugbundle",
        next_attempt_at: null,
        last_response_code: null,
        last_attempted_at: null,
        last_error: null,
        payload: { incident_id: "inc_123" },
        signing_secret: "secret_123"
      }),
      markDeliveryAttempt: vi.fn().mockResolvedValue({ status: "retrying", next_attempt: 2 })
    };

    const lifecycleWebhookTransport = {
      deliver: vi.fn().mockRejectedValue(new Error("network_down"))
    };

    const result = await processNextDeliverWebhookJob({
      queue,
      webhookDeliveryStore,
      lifecycleWebhookTransport
    });

    expect(result).toEqual({ processed: true });
    expect(webhookDeliveryStore.markDeliveryAttempt).toHaveBeenCalledWith({
      delivery_id: "del_123",
      attempt: 1,
      delivered: false,
      error_message: "network_down",
      response_code: null
    });
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it("should mark github dispatch as delivered when transport succeeds", async (): Promise<void> => {
    const queue = {
      enqueue: vi.fn(),
      dequeue: vi.fn().mockResolvedValue({ delivery_id: "gdd_123", attempt: 1 })
    };

    const githubStore = {
      getGitHubDispatchDeliveryIntent: vi.fn().mockResolvedValue({
        delivery_id: "gdd_123",
        rule_id: "ghr_123",
        project_id: "proj_123",
        incident_id: "inc_123",
        installation_id: 99,
        repo_owner: "debugbundle",
        repo_name: "app",
        status: "pending",
        attempt_count: 0,
        next_attempt_at: null,
        last_attempt_at: null,
        last_error: null,
        github_status_code: null,
        dispatch_payload: {
          debugbundle_event: "bundle.created",
          incident_id: "inc_123",
          debugbundle: {
            project_id: "proj_123"
          }
        }
      }),
      markGitHubDispatchDeliveryAttempt: vi.fn().mockResolvedValue({ status: "delivered", next_attempt: null })
    };

    const githubDispatchTransport = {
      deliver: vi.fn().mockResolvedValue(undefined)
    };

    const result = await processNextDeliverGitHubDispatchJob({
      queue,
      githubStore,
      githubDispatchTransport
    });

    expect(result).toEqual({ processed: true });
    expect(githubStore.markGitHubDispatchDeliveryAttempt).toHaveBeenCalledWith({
      delivery_id: "gdd_123",
      attempt: 1,
      delivered: true,
      error_message: null,
      github_status_code: 204
    });
  });

  it("should propagate github response codes from dispatch failures", async (): Promise<void> => {
    const queue = {
      enqueue: vi.fn(),
      dequeue: vi.fn().mockResolvedValue({ delivery_id: "gdd_123", attempt: 1 })
    };

    const githubStore = {
      getGitHubDispatchDeliveryIntent: vi.fn().mockResolvedValue({
        delivery_id: "gdd_123",
        rule_id: "ghr_123",
        project_id: "proj_123",
        incident_id: "inc_123",
        installation_id: 99,
        repo_owner: "debugbundle",
        repo_name: "app",
        status: "pending",
        attempt_count: 0,
        next_attempt_at: null,
        last_attempt_at: null,
        last_error: null,
        github_status_code: null,
        dispatch_payload: {
          debugbundle_event: "bundle.created",
          incident_id: "inc_123",
          debugbundle: {
            project_id: "proj_123"
          }
        }
      }),
      markGitHubDispatchDeliveryAttempt: vi.fn().mockResolvedValue({ status: "retrying", next_attempt: 2 })
    };

    const githubDispatchTransport = {
      deliver: vi.fn().mockRejectedValue(new GitHubDispatchDeliveryError("github_dispatch_http_error_503", 503))
    };

    const result = await processNextDeliverGitHubDispatchJob({
      queue,
      githubStore,
      githubDispatchTransport
    });

    expect(result).toEqual({ processed: true });
    expect(githubStore.markGitHubDispatchDeliveryAttempt).toHaveBeenCalledWith({
      delivery_id: "gdd_123",
      attempt: 1,
      delivered: false,
      error_message: "github_dispatch_http_error_503",
      github_status_code: 503
    });
  });

  it("should propagate github Retry-After values from dispatch failures", async (): Promise<void> => {
    const queue = {
      enqueue: vi.fn(),
      dequeue: vi.fn().mockResolvedValue({ delivery_id: "gdd_123", attempt: 1 })
    };

    const githubStore = {
      getGitHubDispatchDeliveryIntent: vi.fn().mockResolvedValue({
        delivery_id: "gdd_123",
        rule_id: "ghr_123",
        project_id: "proj_123",
        incident_id: "inc_123",
        installation_id: 99,
        repo_owner: "debugbundle",
        repo_name: "app",
        status: "pending",
        attempt_count: 0,
        next_attempt_at: null,
        last_attempt_at: null,
        last_error: null,
        github_status_code: null,
        dispatch_payload: {
          debugbundle_event: "bundle.created",
          incident_id: "inc_123",
          debugbundle: {
            project_id: "proj_123"
          }
        }
      }),
      markGitHubDispatchDeliveryAttempt: vi.fn().mockResolvedValue({ status: "retrying", next_attempt: 2 })
    };

    const githubDispatchTransport = {
      deliver: vi.fn().mockRejectedValue(new GitHubDispatchDeliveryError("github_dispatch_http_error_429", 429, 17))
    };

    const result = await processNextDeliverGitHubDispatchJob({
      queue,
      githubStore,
      githubDispatchTransport
    });

    expect(result).toEqual({ processed: true });
    expect(githubStore.markGitHubDispatchDeliveryAttempt).toHaveBeenCalledWith({
      delivery_id: "gdd_123",
      attempt: 1,
      delivered: false,
      error_message: "github_dispatch_http_error_429",
      github_status_code: 429,
      retry_after_seconds: 17
    });
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

describe("deliver-webhook – onWebhookDisabled callback", () => {
  function makeDeliveryIntent(
    overrides: Record<string, unknown> = {}
  ): Record<string, unknown> {
    return {
      delivery_id: "del_1",
      webhook_id: "wh_1",
      project_id: "proj_1",
      incident_id: "inc_1",
      event_type: "bundle.created",
      status: "retrying",
      attempt_count: 5,
      occurred_at: "2026-03-11T00:00:00.000Z",
      target_url: "https://hooks.example.test/wh1",
      next_attempt_at: null,
      last_response_code: null,
      last_attempted_at: null,
      last_error: null,
      payload: { incident_id: "inc_1" },
      signing_secret: "secret_1",
      ...overrides
    };
  }

  it("should call onWebhookDisabled when markDeliveryAttempt indicates auto-disable", async (): Promise<void> => {
    const onWebhookDisabled = vi.fn().mockResolvedValue(undefined);

    await processNextDeliverWebhookJob({
      queue: {
        enqueue: vi.fn(),
        dequeue: vi.fn().mockResolvedValue({ delivery_id: "del_1", attempt: 6 })
      },
      webhookDeliveryStore: {
        getDeliveryIntent: vi.fn().mockResolvedValue(makeDeliveryIntent()),
        markDeliveryAttempt: vi.fn().mockResolvedValue({
          status: "failed",
          next_attempt: null,
          webhook_disabled: true,
          webhook_id: "wh_1"
        })
      },
      lifecycleWebhookTransport: {
        deliver: vi.fn().mockRejectedValue(
          new LifecycleWebhookDeliveryError("webhook_http_error_503", 503)
        )
      },
      onWebhookDisabled
    });

    expect(onWebhookDisabled).toHaveBeenCalledWith({
      webhook_id: "wh_1",
      target_url: "https://hooks.example.test/wh1"
    });
  });

  it("should not call onWebhookDisabled when mark result has no webhook_disabled flag", async (): Promise<void> => {
    const onWebhookDisabled = vi.fn().mockResolvedValue(undefined);

    await processNextDeliverWebhookJob({
      queue: {
        enqueue: vi.fn(),
        dequeue: vi.fn().mockResolvedValue({ delivery_id: "del_2", attempt: 1 })
      },
      webhookDeliveryStore: {
        getDeliveryIntent: vi.fn().mockResolvedValue(
          makeDeliveryIntent({
            delivery_id: "del_2",
            webhook_id: "wh_2",
            event_type: "bundle.updated",
            status: "pending",
            attempt_count: 0,
            target_url: "https://hooks.example.test/wh2",
            signing_secret: "secret_2"
          })
        ),
        markDeliveryAttempt: vi.fn().mockResolvedValue({
          status: "retrying",
          next_attempt: 2
        })
      },
      lifecycleWebhookTransport: {
        deliver: vi.fn().mockRejectedValue(new Error("network error"))
      },
      onWebhookDisabled
    });

    expect(onWebhookDisabled).not.toHaveBeenCalled();
  });

  it("should swallow onWebhookDisabled errors without affecting processing", async (): Promise<void> => {
    const onWebhookDisabled = vi
      .fn()
      .mockRejectedValue(new Error("email send failed"));

    const result = await processNextDeliverWebhookJob({
      queue: {
        enqueue: vi.fn(),
        dequeue: vi.fn().mockResolvedValue({ delivery_id: "del_3", attempt: 6 })
      },
      webhookDeliveryStore: {
        getDeliveryIntent: vi.fn().mockResolvedValue(
          makeDeliveryIntent({
            delivery_id: "del_3",
            webhook_id: "wh_3",
            target_url: "https://hooks.example.test/wh3",
            signing_secret: "secret_3"
          })
        ),
        markDeliveryAttempt: vi.fn().mockResolvedValue({
          status: "failed",
          next_attempt: null,
          webhook_disabled: true,
          webhook_id: "wh_3"
        })
      },
      lifecycleWebhookTransport: {
        deliver: vi.fn().mockRejectedValue(
          new LifecycleWebhookDeliveryError("webhook_http_error_500", 500)
        )
      },
      onWebhookDisabled
    });

    expect(result).toEqual({ processed: true });
    expect(onWebhookDisabled).toHaveBeenCalled();
  });
});
