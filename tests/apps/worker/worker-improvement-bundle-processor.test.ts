import { gunzipSync, gzipSync } from "node:zlib";

import { describe, expect, it, vi } from "vitest";

import { processNextBuildImprovementBundleJob } from "../../../apps/worker/src/improvement-bundle-processor.js";
import { buildImprovementBundleObjectKey } from "../../../packages/storage/src/index.js";
import { createEventEnvelope } from "../../../packages/shared-types/src/index.js";

describe("worker improvement bundle retry processor", () => {
  it("rebuilds a hosted improvement bundle from a queued retry job", async () => {
    const putObject = vi.fn().mockResolvedValue(undefined);
    const releaseLease = vi.fn().mockResolvedValue(undefined);
    const markImprovementBundleGenerationFailure = vi.fn().mockResolvedValue(undefined);
    const sourceEvent = createEventEnvelope({
      event_id: "00000000-0000-0000-0000-000000000031",
      event_type: "log_event",
      sdk_name: "debugbundle-node",
      sdk_version: "0.2.0",
      occurred_at: "2026-05-18T12:00:00.000Z",
      service: {
        name: "checkout-api",
        environment: "production",
        runtime: "node",
        framework: "fastify"
      },
      payload: {
        level: "warning",
        message: "payment provider warning",
        attributes: {}
      }
    });

    const result = await processNextBuildImprovementBundleJob({
      queue: {
        dequeue: vi.fn().mockResolvedValue({
          project_id: "proj_123",
          opportunity_id: "imp_retry",
          event_id: "00000000-0000-0000-0000-000000000031",
          event_type: "log_event",
          occurred_at: "2026-05-18T12:00:00.000Z",
          occurrence_count: 8,
          trigger: "regeneration"
        }),
        releaseLease
      },
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
          recordRequestPattern: vi.fn(),
          hasImprovementBundleGenerationForSourceEvent: vi.fn().mockResolvedValue(true),
          reserveImprovementBundleGeneration: vi.fn().mockResolvedValue({
            generation_number: 2,
            created_at: "2026-05-18T12:00:00.000Z",
            updated_at: "2026-05-18T12:05:00.000Z",
            source_event_id: "00000000-0000-0000-0000-000000000031",
            source_occurred_at: "2026-05-18T12:00:00.000Z",
            trigger: "regeneration"
          }),
          getImprovementBundleBuildContext: vi.fn().mockResolvedValue({
            opportunity_id: "imp_retry",
            project_id: "proj_123",
            project_slug: "checkout",
            service_id: "svc_123",
            service_name: "checkout-api",
            service_runtime: "node",
            service_framework: "fastify",
            environment: "production",
            kind: "warning_hotspot",
            status: "open",
            severity: "high",
            confidence: 0.9,
            fingerprint: "fp_warning_retry",
            title: "Warning hotspot: payment provider warning",
            summary: "Repeated warning log pattern detected for checkout-api in production.",
            occurrence_count: 8,
            evidence: {
              kind: "warning_hotspot",
              log_level: "warning",
              normalized_message: "payment provider warning",
              threshold: 5
            },
            related_incident_ids: [],
            first_detected_at: "2026-05-18T11:55:00.000Z",
            last_detected_at: "2026-05-18T12:00:00.000Z",
            last_source_event_id: "00000000-0000-0000-0000-000000000031",
            bundle_generation_number: 2,
            bundle_created_at: "2026-05-18T12:00:00.000Z",
            bundle_updated_at: "2026-05-18T12:05:00.000Z",
            bundle_source_event_id: "00000000-0000-0000-0000-000000000031",
            bundle_failure_reason: null
          }),
          listImprovementEventReferences: vi.fn().mockResolvedValue([]),
          markImprovementBundleGenerationFailure,
          pruneRetainedBundleOwnersForProject: vi.fn().mockResolvedValue([])
        },
        objectStore: {
          getObject: vi.fn().mockResolvedValue(gzipSync(Buffer.from(JSON.stringify(sourceEvent), "utf8"))),
          putObject
        }
      }
    });

    expect(result).toEqual({ processed: true });
    expect(markImprovementBundleGenerationFailure).not.toHaveBeenCalled();
    expect(putObject).toHaveBeenCalledWith(
      expect.objectContaining({
        key: buildImprovementBundleObjectKey("proj_123", "imp_retry"),
        contentType: "application/json",
        contentEncoding: "gzip"
      })
    );
    const body = putObject.mock.calls[0]?.[0]?.body as Buffer;
    expect(JSON.parse(gunzipSync(body).toString("utf8"))).toEqual(
      expect.objectContaining({
        bundle_type: "improvement",
        bundle_id: "improvement_bundle_imp_retry",
        sdk: {
          name: "debugbundle-node",
          version: "0.2.0"
        },
        metadata: expect.objectContaining({ generation_number: 2 })
      })
    );
    expect(releaseLease).toHaveBeenCalledWith("leases:improvement-bundle-regeneration:imp_retry");
  });
});
