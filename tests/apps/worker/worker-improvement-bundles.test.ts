import { gunzipSync, gzipSync } from "node:zlib";

import { describe, expect, it, vi } from "vitest";

import { maybeGenerateHostedImprovementBundle } from "../../../apps/worker/src/improvement-bundles.js";
import { buildBundleObjectKey, buildImprovementBundleObjectKey, buildReproductionObjectKey } from "../../../packages/storage/src/index.js";
import { BundleV1Schema, createEventEnvelope } from "../../../packages/shared-types/src/index.js";

describe("worker improvement bundles", () => {
  it("builds and emits a hosted warning-hotspot improvement bundle for Solo projects", async () => {
    const sampleEvent = createEventEnvelope({
      event_id: "00000000-0000-0000-0000-000000000001",
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
        message: "Payment provider warning 429",
        attributes: {
          dependency: "stripe"
        }
      }
    });

    const putObject = vi.fn().mockResolvedValue(undefined);
    const createDeliveryIntent = vi.fn().mockResolvedValue({ delivery_id: "del_123" });

    await maybeGenerateHostedImprovementBundle({
      project_id: "proj_123",
      event: sampleEvent,
      normalized: {
        event_type: "log_event",
        environment: "production",
        error_type: null,
        normalized_message: "Payment provider warning {dynamic}",
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
            opportunity_id: "imp_123",
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
            opportunity_id: "imp_123",
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
            fingerprint: "fp_warning",
            title: "Warning hotspot: Payment provider warning {dynamic}",
            summary: "Repeated warning log pattern detected for checkout-api in production.",
            occurrence_count: 5,
            evidence: {
              kind: "warning_hotspot",
              log_level: "warning",
              normalized_message: "Payment provider warning {dynamic}",
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
          listImprovementEventReferences: vi.fn().mockResolvedValue([
            {
              event_id: sampleEvent.event_id,
              event_type: "log_event",
              occurred_at: sampleEvent.occurred_at
            }
          ]),
          markImprovementBundleGenerationFailure: vi.fn(),
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
        webhookDeliveryStore: {
          listMatchingWebhooks: vi.fn().mockResolvedValue([
            {
              webhook_id: "wh_123",
              target_url: "https://hooks.example.test/improvements",
              signing_secret: "secret_123"
            }
          ]),
          createDeliveryIntent
        },
        objectStore: {
          getObject: vi.fn().mockResolvedValue(gzipSync(Buffer.from(JSON.stringify(sampleEvent), "utf8"))),
          putObject
        },
        apiBaseUrl: "https://api.debugbundle.test",
        appBaseUrl: "https://app.debugbundle.test",
        docsBaseUrl: "https://debugbundle.test/docs"
      }
    });

    expect(putObject).toHaveBeenCalledWith(
      expect.objectContaining({
        key: buildImprovementBundleObjectKey("proj_123", "imp_123"),
        contentType: "application/json",
        contentEncoding: "gzip"
      })
    );

    const payload = putObject.mock.calls[0]?.[0] as { body: Buffer };
    const parsed = BundleV1Schema.parse(JSON.parse(gunzipSync(payload.body).toString("utf8")));
    expect(parsed.bundle_type).toBe("improvement");
    expect(parsed.signal.signal_type).toBe("warning");
    expect(parsed.links.self).toBe("https://api.debugbundle.test/v1/projects/proj_123/improvements/imp_123/bundle");
    expect(parsed.context.logs?.items).toHaveLength(1);

    expect(createDeliveryIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        incident_id: null,
        event_type: "improvement_bundle.created"
      })
    );
  });

  it("does not generate hosted improvement bundles for Free projects", async () => {
    const recordWarningHotspot = vi.fn();

    await maybeGenerateHostedImprovementBundle({
      project_id: "proj_free",
      event: createEventEnvelope({
        event_id: "00000000-0000-0000-0000-000000000002",
        event_type: "log_event",
        occurred_at: "2026-05-18T12:00:00.000Z",
        service: {
          name: "checkout-api",
          environment: "production"
        },
        payload: {
          level: "warning",
          message: "Free tier warning",
          attributes: {}
        }
      }),
      normalized: {
        event_type: "log_event",
        environment: "production",
        error_type: null,
        normalized_message: "Free tier warning",
        route_template: null,
        http_method: null,
        http_status: null,
        top_frames: [],
        payload: {}
      },
      event_class: "context_signal",
      dependencies: {
        improvementOpportunityStore: {
          getImprovementExecutionSettings: vi.fn().mockResolvedValue({
            plan: "free",
            automated_improvement_bundles_enabled: false,
            improvement_bundle_sensitivity: "balanced"
          }),
          listImprovementsForOrganization: vi.fn(),
          getImprovementForOrganization: vi.fn(),
          resolveImprovementForOrganization: vi.fn(),
          reopenImprovementForOrganization: vi.fn(),
          recordWarningHotspot,
          recordRequestPattern: vi.fn(),
          getImprovementBundleBuildContext: vi.fn(),
          listImprovementEventReferences: vi.fn(),
          hasImprovementBundleGenerationForSourceEvent: vi.fn(),
          reserveImprovementBundleGeneration: vi.fn(),
          markImprovementBundleGenerationFailure: vi.fn(),
          pruneRetainedBundleOwnersForProject: vi.fn().mockResolvedValue([])
        },
        objectStore: {
          getObject: vi.fn()
        }
      }
    });

    expect(recordWarningHotspot).not.toHaveBeenCalled();
  });

  it("marks generation failure and stops when quota is exhausted", async () => {
    const markImprovementBundleGenerationFailure = vi.fn().mockResolvedValue(undefined);
    const putObject = vi.fn();

    await maybeGenerateHostedImprovementBundle({
      project_id: "proj_123",
      event: createEventEnvelope({
        event_id: "00000000-0000-0000-0000-000000000003",
        event_type: "log_event",
        occurred_at: "2026-05-18T12:00:00.000Z",
        service: {
          name: "checkout-api",
          environment: "production"
        },
        payload: {
          level: "warning",
          message: "Quota warning",
          attributes: {}
        }
      }),
      normalized: {
        event_type: "log_event",
        environment: "production",
        error_type: null,
        normalized_message: "Quota warning",
        route_template: null,
        http_method: null,
        http_status: null,
        top_frames: [],
        payload: {}
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
            opportunity_id: "imp_quota",
            occurrence_count: 5,
            bundle_generation_number: 0,
            should_generate_bundle: true
          }),
          recordRequestPattern: vi.fn(),
          hasImprovementBundleGenerationForSourceEvent: vi.fn().mockResolvedValue(false),
          reserveImprovementBundleGeneration: vi.fn(),
          getImprovementBundleBuildContext: vi.fn(),
          listImprovementEventReferences: vi.fn(),
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
              monthly_bundle_requests: { used: 250, limit: 250 },
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
          putObject
        }
      }
    });

    expect(markImprovementBundleGenerationFailure).toHaveBeenCalledWith({
      opportunity_id: "imp_quota",
      reason: "monthly_quota_exceeded"
    });
    expect(putObject).not.toHaveBeenCalled();
  });

  it("builds a hosted slow-request improvement bundle from request events", async () => {
    const sampleEvent = createEventEnvelope({
      event_id: "00000000-0000-0000-0000-000000000030",
      event_type: "request_event",
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
        method: "GET",
        path: "/checkout/123",
        query: {},
        headers: {
          accept: "application/json"
        },
        body: null,
        response_status: 200,
        duration_ms: 1800,
        route_template: "/checkout/{param}"
      }
    });
    const putObject = vi.fn().mockResolvedValue(undefined);
    const recordRequestPattern = vi.fn().mockResolvedValue({
      opportunity_id: "imp_slow",
      occurrence_count: 5,
      bundle_generation_number: 0,
      should_generate_bundle: true
    });

    await maybeGenerateHostedImprovementBundle({
      project_id: "proj_123",
      event: sampleEvent,
      normalized: {
        event_type: "request_event",
        environment: "production",
        error_type: null,
        normalized_message: "request GET /checkout/{param}",
        route_template: "/checkout/{param}",
        http_method: "GET",
        http_status: 200,
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
          recordWarningHotspot: vi.fn(),
          recordRequestPattern,
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
            opportunity_id: "imp_slow",
            project_id: "proj_123",
            project_slug: "checkout",
            service_id: "svc_123",
            service_name: "checkout-api",
            service_runtime: "node",
            service_framework: "fastify",
            environment: "production",
            kind: "slow_request",
            status: "open",
            severity: "medium",
            confidence: 0.7,
            fingerprint: "fp_slow",
            title: "Slow request pattern: GET /checkout/{param}",
            summary: "Repeated slow requests detected for GET /checkout/{param} in production.",
            occurrence_count: 5,
            evidence: {
              kind: "slow_request",
              route_template: "/checkout/{param}",
              http_method: "GET",
              response_status: 200,
              duration_ms: 1800,
              threshold: 5,
              slow_request_duration_threshold_ms: 1500
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
          listImprovementEventReferences: vi.fn().mockResolvedValue([
            {
              event_id: sampleEvent.event_id,
              event_type: "request_event",
              occurred_at: sampleEvent.occurred_at
            }
          ]),
          markImprovementBundleGenerationFailure: vi.fn(),
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
          getObject: vi.fn().mockResolvedValue(gzipSync(Buffer.from(JSON.stringify(sampleEvent), "utf8"))),
          putObject
        }
      }
    });

    expect(recordRequestPattern).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "slow_request",
        route_template: "/checkout/{param}",
        http_method: "GET"
      })
    );
    const payload = putObject.mock.calls[0]?.[0] as { body: Buffer };
    const parsed = BundleV1Schema.parse(JSON.parse(gunzipSync(payload.body).toString("utf8")));
    expect(parsed.signal.signal_type).toBe("warning");
    expect(parsed.context.request?.route_template).toBe("/checkout/{param}");
    expect(parsed.context.response?.duration_ms).toBe(1800);
  });

  it("builds a hosted request-failure-pattern bundle only for contextual request failures", async () => {
    const sampleEvent = createEventEnvelope({
      event_id: "00000000-0000-0000-0000-000000000031",
      event_type: "request_event",
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
        method: "POST",
        path: "/checkout",
        query: {},
        headers: {
          accept: "application/json"
        },
        body: {
          amount: 42
        },
        response_status: 404,
        duration_ms: 250,
        route_template: "/checkout"
      }
    });
    const putObject = vi.fn().mockResolvedValue(undefined);
    const recordRequestPattern = vi.fn().mockResolvedValue({
      opportunity_id: "imp_request_fail",
      occurrence_count: 5,
      bundle_generation_number: 0,
      should_generate_bundle: true
    });

    await maybeGenerateHostedImprovementBundle({
      project_id: "proj_123",
      event: sampleEvent,
      normalized: {
        event_type: "request_event",
        environment: "production",
        error_type: null,
        normalized_message: "request POST /checkout",
        route_template: "/checkout",
        http_method: "POST",
        http_status: 404,
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
          recordWarningHotspot: vi.fn(),
          recordRequestPattern,
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
            opportunity_id: "imp_request_fail",
            project_id: "proj_123",
            project_slug: "checkout",
            service_id: "svc_123",
            service_name: "checkout-api",
            service_runtime: "node",
            service_framework: "fastify",
            environment: "production",
            kind: "request_failure_pattern",
            status: "open",
            severity: "medium",
            confidence: 0.7,
            fingerprint: "fp_request_fail",
            title: "Request failure pattern: POST /checkout returned 404",
            summary: "Repeated request failures detected for POST /checkout (404) in production.",
            occurrence_count: 5,
            evidence: {
              kind: "request_failure_pattern",
              route_template: "/checkout",
              http_method: "POST",
              response_status: 404,
              duration_ms: 250,
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
          listImprovementEventReferences: vi.fn().mockResolvedValue([
            {
              event_id: sampleEvent.event_id,
              event_type: "request_event",
              occurred_at: sampleEvent.occurred_at
            }
          ]),
          markImprovementBundleGenerationFailure: vi.fn(),
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
          getObject: vi.fn().mockResolvedValue(gzipSync(Buffer.from(JSON.stringify(sampleEvent), "utf8"))),
          putObject
        }
      }
    });

    expect(recordRequestPattern).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "request_failure_pattern",
        response_status: 404
      })
    );
    const payload = putObject.mock.calls[0]?.[0] as { body: Buffer };
    const parsed = BundleV1Schema.parse(JSON.parse(gunzipSync(payload.body).toString("utf8")));
    expect(parsed.signal.signal_type).toBe("request_failure");
    expect(parsed.context.response?.status_code).toBe(404);
    expect(parsed.context.request?.method).toBe("POST");
  });

  it("does not create request-failure improvements for incident-opening request signals", async () => {
    const recordRequestPattern = vi.fn();

    await maybeGenerateHostedImprovementBundle({
      project_id: "proj_123",
      event: createEventEnvelope({
        event_id: "00000000-0000-0000-0000-000000000032",
        event_type: "request_event",
        occurred_at: "2026-05-18T12:00:00.000Z",
        service: {
          name: "checkout-api",
          environment: "production"
        },
        payload: {
          method: "POST",
          path: "/checkout",
          query: {},
          headers: {},
          body: null,
          response_status: 500,
          duration_ms: 250,
          route_template: "/checkout"
        }
      }),
      normalized: {
        event_type: "request_event",
        environment: "production",
        error_type: null,
        normalized_message: "request POST /checkout",
        route_template: "/checkout",
        http_method: "POST",
        http_status: 500,
        top_frames: [],
        payload: {}
      },
      event_class: "incident_signal",
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
          recordWarningHotspot: vi.fn(),
          recordRequestPattern,
          getImprovementBundleBuildContext: vi.fn(),
          listImprovementEventReferences: vi.fn(),
          hasImprovementBundleGenerationForSourceEvent: vi.fn(),
          reserveImprovementBundleGeneration: vi.fn(),
          markImprovementBundleGenerationFailure: vi.fn(),
          pruneRetainedBundleOwnersForProject: vi.fn().mockResolvedValue([])
        },
        objectStore: {
          getObject: vi.fn()
        }
      }
    });

    expect(recordRequestPattern).not.toHaveBeenCalled();
  });

  it("prunes retained incident and improvement artifacts after persisting a hosted improvement bundle", async () => {
    const sampleEvent = createEventEnvelope({
      event_id: "00000000-0000-0000-0000-000000000004",
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
        message: "Retention warning",
        attributes: {}
      }
    });
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
    const deleteObject = vi.fn().mockResolvedValue(undefined);

    await maybeGenerateHostedImprovementBundle({
      project_id: "proj_123",
      event: sampleEvent,
      normalized: {
        event_type: "log_event",
        environment: "production",
        error_type: null,
        normalized_message: "Retention warning",
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
            opportunity_id: "imp_123",
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
            opportunity_id: "imp_123",
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
            fingerprint: "fp_warning",
            title: "Warning hotspot: Retention warning",
            summary: "Repeated warning log pattern detected for checkout-api in production.",
            occurrence_count: 5,
            evidence: {
              kind: "warning_hotspot",
              log_level: "warning",
              normalized_message: "Retention warning",
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
          markImprovementBundleGenerationFailure: vi.fn(),
          pruneRetainedBundleOwnersForProject
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
              retained_bundle_cap: { used: 151, limit: 150 },
              monthly_remote_activations: { used: 0, limit: 25 },
              monthly_alert_deliveries: { used: 0, limit: 75 },
              monthly_webhook_deliveries: { used: 0, limit: 250 }
            }
          })
        },
        objectStore: {
          getObject: vi.fn(),
          putObject: vi.fn().mockResolvedValue(undefined),
          deleteObject
        }
      }
    });

    expect(pruneRetainedBundleOwnersForProject).toHaveBeenCalledWith({
      project_id: "proj_123",
      retained_bundle_limit: 150
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
  });
});
