import { gunzipSync } from "node:zlib";

import { describe, expect, it, vi } from "vitest";

import { maybeGenerateHostedIncidentImprovementBundle } from "../../../apps/worker/src/improvement-bundles.js";
import { buildImprovementBundleObjectKey } from "../../../packages/storage/src/index.js";
import { BundleV1Schema } from "../../../packages/shared-types/src/index.js";

function createBaseStore(overrides: Record<string, unknown> = {}) {
  return {
    getImprovementExecutionSettings: vi.fn().mockResolvedValue({
      plan: "team",
      automated_improvement_bundles_enabled: true,
      improvement_bundle_sensitivity: "balanced"
    }),
    listImprovementsForOrganization: vi.fn(),
    getImprovementForOrganization: vi.fn(),
    resolveImprovementForOrganization: vi.fn(),
    reopenImprovementForOrganization: vi.fn(),
    recordWarningHotspot: vi.fn(),
    recordRequestPattern: vi.fn(),
    recordIncidentPattern: vi.fn().mockResolvedValue({
      opportunity_id: "imp_incident",
      occurrence_count: 5,
      bundle_generation_number: 0,
      should_generate_bundle: true
    }),
    hasImprovementBundleGenerationForSourceEvent: vi.fn().mockResolvedValue(false),
    reserveImprovementBundleGeneration: vi.fn().mockResolvedValue({
      generation_number: 1,
      created_at: "2026-05-18T12:00:00.000Z",
      updated_at: "2026-05-18T12:00:00.000Z",
      source_event_id: "00000000-0000-0000-0000-000000000701",
      source_occurred_at: "2026-05-18T12:00:00.000Z",
      trigger: "occurrence_threshold"
    }),
    getImprovementBundleBuildContext: vi.fn().mockResolvedValue({
      opportunity_id: "imp_incident",
      project_id: "00000000-0000-0000-0000-000000000001",
      project_slug: "checkout",
      service_id: "00000000-0000-0000-0000-000000000101",
      service_name: "checkout-api",
      service_runtime: "node",
      service_framework: "fastify",
      environment: "production",
      kind: "recurring_incident",
      status: "open",
      severity: "high",
      confidence: 0.82,
      fingerprint: "fp_recurring_incident",
      title: "Recurring incident: Checkout timeout",
      summary: "Incident has recurred 5 times for checkout-api in production.",
      occurrence_count: 5,
      evidence: {
        kind: "recurring_incident",
        incident_id: "00000000-0000-0000-0000-000000000501",
        incident_title: "Checkout timeout",
        incident_occurrence_count: 5,
        threshold: 5
      },
      first_detected_at: "2026-05-18T11:00:00.000Z",
      last_detected_at: "2026-05-18T12:00:00.000Z",
      last_source_event_id: "00000000-0000-0000-0000-000000000701",
      bundle_generation_number: 1,
      bundle_created_at: "2026-05-18T12:00:00.000Z",
      bundle_updated_at: "2026-05-18T12:00:00.000Z",
      bundle_source_event_id: "00000000-0000-0000-0000-000000000701",
      bundle_failure_reason: null
    }),
    listImprovementEventReferences: vi.fn().mockResolvedValue([
      {
        event_id: "00000000-0000-0000-0000-000000000701",
        event_type: "backend_exception",
        occurred_at: "2026-05-18T12:00:00.000Z"
      }
    ]),
    markImprovementBundleGenerationFailure: vi.fn(),
    pruneRetainedBundleOwnersForProject: vi.fn().mockResolvedValue([]),
    ...overrides
  };
}

describe("worker incident improvement bundles", () => {
  it("generates a recurring-incident improvement bundle when the threshold is reached", async () => {
    const putObject = vi.fn().mockResolvedValue(undefined);
    const store = createBaseStore();

    await maybeGenerateHostedIncidentImprovementBundle({
      project_id: "00000000-0000-0000-0000-000000000001",
      incident_id: "00000000-0000-0000-0000-000000000501",
      event_id: "00000000-0000-0000-0000-000000000701",
      event_type: "backend_exception",
      service_name: "checkout-api",
      environment: "production",
      incident_title: "Checkout timeout",
      incident_severity: "high",
      incident_occurrence_count: 5,
      occurred_at: "2026-05-18T12:00:00.000Z",
      regressed_now: false,
      dependencies: {
        improvementOpportunityStore: store,
        objectStore: {
          getObject: vi.fn(),
          putObject
        },
        apiBaseUrl: "https://api.debugbundle.test",
        appBaseUrl: "https://app.debugbundle.test",
        docsBaseUrl: "https://debugbundle.test/docs"
      }
    });

    expect(store.recordIncidentPattern).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "recurring_incident",
        threshold: 5,
        incident_occurrence_count: 5
      })
    );
    expect(putObject).toHaveBeenCalledWith(
      expect.objectContaining({
        key: buildImprovementBundleObjectKey("00000000-0000-0000-0000-000000000001", "imp_incident")
      })
    );

    const payload = putObject.mock.calls[0]?.[0] as { body: Buffer };
    const parsed = BundleV1Schema.parse(JSON.parse(gunzipSync(payload.body).toString("utf8")));
    expect(parsed.summary.primary_signal).toBe("recurring_incident");
    expect(parsed.summary.recommended_action).toContain("incident bundle history");
  });

  it("generates a post-deploy regression improvement bundle immediately for a regressed incident", async () => {
    const putObject = vi.fn().mockResolvedValue(undefined);
    const store = createBaseStore({
      getImprovementBundleBuildContext: vi.fn().mockResolvedValue({
        ...(await createBaseStore().getImprovementBundleBuildContext()),
        kind: "post_deploy_regression",
        title: "Post-deploy regression: Checkout timeout",
        summary: "Incident regressed after deploy for checkout-api in production.",
        evidence: {
          kind: "post_deploy_regression",
          incident_id: "00000000-0000-0000-0000-000000000501",
          incident_title: "Checkout timeout",
          incident_occurrence_count: 2,
          threshold: 1,
          regression_deploy: {
            deployment_id: "00000000-0000-0000-0000-000000000901",
            commit_sha: "abc123",
            version: "2026.05.18",
            branch: "main",
            deployed_at: "2026-05-18T11:50:00.000Z",
            minutes_since_deploy: 10
          }
        }
      })
    });

    await maybeGenerateHostedIncidentImprovementBundle({
      project_id: "00000000-0000-0000-0000-000000000001",
      incident_id: "00000000-0000-0000-0000-000000000501",
      event_id: "00000000-0000-0000-0000-000000000702",
      event_type: "backend_exception",
      service_name: "checkout-api",
      environment: "production",
      incident_title: "Checkout timeout",
      incident_severity: "high",
      incident_occurrence_count: 2,
      occurred_at: "2026-05-18T12:00:00.000Z",
      regressed_now: true,
      regression_deploy: {
        deployment_id: "00000000-0000-0000-0000-000000000901",
        commit_sha: "abc123",
        version: "2026.05.18",
        branch: "main",
        deployed_at: "2026-05-18T11:50:00.000Z",
        minutes_since_deploy: 10
      },
      dependencies: {
        improvementOpportunityStore: store,
        objectStore: {
          getObject: vi.fn(),
          putObject
        }
      }
    });

    expect(store.recordIncidentPattern).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "post_deploy_regression",
        threshold: 1,
        confidence: 0.85
      })
    );

    const payload = putObject.mock.calls[0]?.[0] as { body: Buffer };
    const parsed = BundleV1Schema.parse(JSON.parse(gunzipSync(payload.body).toString("utf8")));
    expect(parsed.summary.primary_signal).toBe("post_deploy_regression");
    expect(parsed.context.deploy?.commit_sha).toBe("abc123");
  });

  it("returns early when incident improvement automation is unavailable or the recorded candidate does not trigger", async () => {
    const putObject = vi.fn();
    const missingSettingsStore = createBaseStore({
      getImprovementExecutionSettings: vi.fn().mockResolvedValue(null)
    });

    await maybeGenerateHostedIncidentImprovementBundle({
      project_id: "00000000-0000-0000-0000-000000000001",
      incident_id: "00000000-0000-0000-0000-000000000501",
      event_id: "00000000-0000-0000-0000-000000000703",
      event_type: "backend_exception",
      service_name: "checkout-api",
      environment: "production",
      incident_title: "Checkout timeout",
      incident_severity: "high",
      incident_occurrence_count: 5,
      occurred_at: "2026-05-18T12:00:00.000Z",
      regressed_now: false,
      dependencies: {
        improvementOpportunityStore: missingSettingsStore,
        objectStore: {
          getObject: vi.fn(),
          putObject
        }
      }
    });

    const noTriggerStore = createBaseStore({
      recordIncidentPattern: vi.fn().mockResolvedValue({
        opportunity_id: "imp_incident",
        occurrence_count: 2,
        bundle_generation_number: 0,
        should_generate_bundle: false
      })
    });

    await maybeGenerateHostedIncidentImprovementBundle({
      project_id: "00000000-0000-0000-0000-000000000001",
      incident_id: "00000000-0000-0000-0000-000000000501",
      event_id: "00000000-0000-0000-0000-000000000704",
      event_type: "backend_exception",
      service_name: "checkout-api",
      environment: "production",
      incident_title: "Checkout timeout",
      incident_severity: "high",
      incident_occurrence_count: 2,
      occurred_at: "2026-05-18T12:00:00.000Z",
      regressed_now: false,
      dependencies: {
        improvementOpportunityStore: noTriggerStore,
        objectStore: {
          getObject: vi.fn(),
          putObject
        }
      }
    });

    expect(putObject).not.toHaveBeenCalled();
  });
});
