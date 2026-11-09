import { describe, expect, it, vi } from "vitest";
import { processNextBuildAnalyticsBundleJob } from "../../../apps/worker/src/analytics-bundle-processor.js";
import type {
  AnalyticsBundleGenerationRecord,
  AnalyticsBundleGenerationStore,
  AnalyticsMetricsStore,
  AnalyticsJourneySampleStore
} from "../../../packages/storage/src/index.js";
import { mockedObject } from "../../helpers/vitest.js";

const project = "11111111-1111-4111-8111-111111111111",
  generationId = "22222222-2222-4222-8222-222222222222";
describe("queued analytics initiator authority", () => {
  it("stops a revoked initiator before reading metrics or writing an artifact", async () => {
    const generation: AnalyticsBundleGenerationRecord = {
      generation_id: generationId,
      project_id: project,
      opportunity_id: null,
      requested_by_user_id: project,
      initiating_authority: {
        version: 1,
        kind: "member_token",
        user_id: project,
        token_id: generationId
      },
      analysis_kind: "usage_summary",
      analysis_spec: {},
      input_fingerprint: "test",
      status: "pending",
      object_key: null,
      failure_reason: null,
      created_at: "2026-11-07T00:00:00Z",
      updated_at: "2026-11-07T00:00:00Z",
      claimed_at: null,
      completed_at: null
    };
    const read = vi.fn(),
      write = vi.fn(),
      failed = vi.fn();
    const result = await processNextBuildAnalyticsBundleJob({
      queue: {
        dequeue: vi.fn().mockResolvedValue({
          project_id: project,
          generation_id: generationId,
          trigger: "manual",
          requested_at: generation.created_at
        })
      },
      analyticsBundleGenerationStore: mockedObject<AnalyticsBundleGenerationStore>({
        getAnalyticsBundleGenerationForProject: vi.fn().mockResolvedValue(generation),
        claimAnalyticsBundleGenerationForProject: vi
          .fn()
          .mockResolvedValue({ ...generation, status: "running" }),
        isAnalyticsBundleGenerationAuthorized: vi.fn().mockResolvedValue(false),
        markAnalyticsBundleGenerationFailed: failed
      }),
      analyticsMetricsStore: mockedObject<AnalyticsMetricsStore>({ getUsageSummary: read }),
      analyticsJourneySampleStore: mockedObject<AnalyticsJourneySampleStore>({}),
      objectStore: { putObject: write, getObject: vi.fn() }
    });
    expect(result).toEqual({ processed: true, reason: "analytics_bundle_generation_failed" });
    expect(failed).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "initiator_access_revoked" })
    );
    expect(read).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });
});
