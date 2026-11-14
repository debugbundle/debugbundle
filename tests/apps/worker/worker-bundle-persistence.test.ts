import { gunzipSync, gzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { BundleV1Schema } from "../../../packages/shared-types/src/index.js";
import { rustSdkEvents } from "../../helpers/rust-sdk-fixtures.js";
import { processNextBuildBundleJob } from "../../../apps/worker/src/processor.js";
import {
  buildBundleObjectKey,
  buildImprovementBundleObjectKey,
  buildReproductionObjectKey
} from "../../../packages/storage/src/index.js";
import {
  deployMetadataGoldenFixture,
  deployMetadataSourceEnvelope,
  createReservedBundleGeneration
} from "../../helpers/worker-bundle-delivery.js";

describe("worker bundle persistence", () => {
  it("preserves a completed recovery bundle when an older context job arrives later", async () => {
    const events = rustSdkEvents();
    const primary = events[0]!;
    const latest = events[2]!;
    const putObject = vi.fn().mockResolvedValue(undefined);
    const queue = { enqueue: vi.fn(), dequeue: vi.fn() };
    const dependencies = {
      queue,
      incidentStore: {
        getBundleBuildContext: vi.fn().mockResolvedValue({
          incident_id: "inc_recovery",
          project_id: "proj_recovery",
          service_id: null,
          service_name: primary.service.name,
          service_runtime: "rust",
          service_framework: null,
          environment: primary.service.environment,
          fingerprint: "fp_recovery",
          title: "Checkout failure",
          severity: "high",
          first_seen_at: primary.occurred_at,
          last_seen_at: primary.occurred_at,
          occurrence_count: 1,
          source_event_types: ["backend_exception"]
        }),
        reserveBundleGeneration: vi.fn().mockResolvedValue(
          createReservedBundleGeneration({
            source_event_id: latest.event_id,
            source_occurred_at: latest.occurred_at,
            trigger: "new_context_type"
          })
        ),
        listIncidentEventReferences: vi.fn().mockResolvedValue([
          {
            event_id: primary.event_id,
            event_type: primary.event_type,
            event_class: "incident_signal",
            occurred_at: primary.occurred_at
          }
        ]),
        listEvidenceContextCandidates: vi
          .fn()
          .mockImplementation(async (input: { failure_event_ids: string[] }) =>
            input.failure_event_ids.includes(primary.event_id)
              ? events.slice(1).map((event) => ({
                  event_id: event.event_id,
                  occurred_at: event.occurred_at,
                  received_at: event.occurred_at
                }))
              : []
          )
      },
      objectStore: {
        putObject,
        getObject: vi.fn(async (input: { key: string }) => {
          const event = events.find((event) => input.key.endsWith(`${event.event_id}.json.gz`));
          if (!event) throw new Error("unexpected fixture read");
          return gzipSync(Buffer.from(JSON.stringify(event)));
        })
      }
    };
    for (const event of [latest, events[1]!]) {
      queue.dequeue.mockResolvedValue({
        project_id: "proj_recovery",
        incident_id: "inc_recovery",
        event_id: event.event_id,
        occurred_at: event.occurred_at,
        occurrence_count: 1,
        trigger: "new_context_type",
        primary_event_id: primary.event_id,
        primary_occurred_at: primary.occurred_at
      });
      expect((await processNextBuildBundleJob(dependencies)).processed).toBe(true);
      const stored = putObject.mock.calls.at(-1)?.[0] as { body: Buffer };
      const bundle = BundleV1Schema.parse(JSON.parse(gunzipSync(stored.body).toString("utf8")));
      expect(
        bundle.context.recovery?.outcome,
        `stored writes: ${putObject.mock.calls.length}`
      ).toBe("recovered");
      expect(bundle.context.evidence?.primary_event_id).toBe(primary.event_id);
    }
    expect(putObject).toHaveBeenCalledTimes(1);
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
    const recordMetricDeltas = vi.fn().mockResolvedValue("recorded");
    const resolveOrganizationIdForProject = vi.fn().mockResolvedValue("org_123");
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
        reserveBundleGeneration: vi
          .fn()
          .mockResolvedValue(createReservedBundleGeneration({ generation_number: 1 }))
      },
      accountAnalyticsStore: {
        recordMetricDeltas
      },
      resolveOrganizationIdForProject,
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
    expect(recordMetricDeltas).toHaveBeenCalledWith({
      organization_id: "org_123",
      occurred_at: "2026-03-12T00:00:00.000Z",
      source: "worker.build_bundle",
      dedupe_key: "failure_bundle_generation:inc_123:1",
      deltas: {
        failure_bundles_created: 1
      }
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
        reserveBundleGeneration: vi
          .fn()
          .mockResolvedValue(createReservedBundleGeneration({ generation_number: 1 }))
      },
      accountAnalyticsStore: {
        recordMetricDeltas
      },
      resolveOrganizationIdForProject,
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
    expect(parsed.context.deploy).toBeNull();
    expect(parsed.context.git).toBeNull();
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
        reserveBundleGeneration: vi
          .fn()
          .mockResolvedValue(createReservedBundleGeneration({ generation_number: 1 }))
      },
      objectStore: {
        putObject: vi.fn().mockResolvedValue(undefined)
      }
    });

    expect(result).toEqual({ processed: true });
    expect(queue.readJobQueue).toHaveBeenCalledWith("build-reproduction");
    expect(queue.enqueue).not.toHaveBeenCalledWith("build-reproduction", expect.anything());
  });

  it("should allow replaying an already-recorded bundle generation even after the monthly quota is exhausted", async (): Promise<void> => {
    const reserveBundleGeneration = vi
      .fn()
      .mockResolvedValue(createReservedBundleGeneration({ generation_number: 2 }));
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

  it("should prune oldest retained incidents after persisting a new bundle", async (): Promise<void> => {
    const deleteObject = vi.fn().mockResolvedValue(undefined);
    const recordMetricDeltas = vi.fn().mockResolvedValue("recorded");
    const pruneRetainedBundleOwnersForProject = vi.fn().mockResolvedValue([
      {
        owner_type: "incident",
        project_id: "proj_old",
        incident_id: "inc_old",
        improvement_opportunity_id: null
      },
      {
        owner_type: "improvement",
        project_id: "proj_other",
        incident_id: null,
        improvement_opportunity_id: "imp_old"
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
        pruneRetainedBundleOwnersForProject
      },
      accountAnalyticsStore: {
        recordMetricDeltas
      },
      resolveOrganizationIdForProject: vi.fn().mockResolvedValue("org_123"),
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
    expect(pruneRetainedBundleOwnersForProject).toHaveBeenCalledWith({
      project_id: "proj_123",
      retained_bundle_limit: 450
    });
    expect(deleteObject).toHaveBeenCalledWith({
      key: buildBundleObjectKey("proj_old", "inc_old")
    });
    expect(deleteObject).toHaveBeenCalledWith({
      key: buildReproductionObjectKey("proj_old", "inc_old")
    });
    expect(deleteObject).toHaveBeenCalledWith({
      key: buildImprovementBundleObjectKey("proj_other", "imp_old")
    });
    expect(recordMetricDeltas).toHaveBeenCalledWith({
      organization_id: "org_123",
      occurred_at: "2026-03-12T00:00:00.000Z",
      source: "worker.build_bundle",
      dedupe_key: "retention_bundle_rotation:failure:inc_123:1",
      deltas: {
        retention_bundle_owners_rotated: 2
      }
    });
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
    const regressionBundle = BundleV1Schema.parse(
      JSON.parse(gunzipSync(regressionPayload.body).toString("utf8"))
    );
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
    const deployBundle = BundleV1Schema.parse(
      JSON.parse(gunzipSync(deployPayload.body).toString("utf8"))
    );
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
          event_id: "00000000-0000-4000-8000-000000000111",
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
        listIncidentEventReferences: vi.fn().mockResolvedValue([
          {
            event_id: "00000000-0000-4000-8000-000000000111",
            event_type: "backend_exception",
            occurred_at: "2026-03-12T00:00:00.000Z"
          }
        ]),
        reserveBundleGeneration: vi.fn().mockResolvedValue(
          createReservedBundleGeneration({
            generation_number: 3,
            source_event_id: "00000000-0000-4000-8000-000000000111",
            trigger: "deploy_metadata"
          })
        )
      },
      objectStore: {
        getObject: vi
          .fn()
          .mockResolvedValue(
            gzipSync(Buffer.from(JSON.stringify(deployMetadataSourceEnvelope), "utf8"))
          ),
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
});
