import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultRegenerationDependencies } from "../../../apps/api/src/default-regeneration-dependencies.js";
import { captureProjectJobAuthority } from "../../../packages/storage/src/project-job-authorization.js";
import type {
  createPostgresImprovementOpportunityStore,
  createPostgresMetadataStore
} from "../../../packages/storage/src/index.js";
import { mockedObject } from "../../helpers/vitest.js";

vi.mock("../../../packages/storage/src/project-job-authorization.js", async (original) => ({
  ...(await original<
    typeof import("../../../packages/storage/src/project-job-authorization.js")
  >()),
  captureProjectJobAuthority: vi.fn()
}));
const project = "11111111-1111-4111-8111-111111111111",
  user = "22222222-2222-4222-8222-222222222222";
const initiator = { version: 1 as const, kind: "browser_session" as const, user_id: user };
beforeEach(() => {
  vi.mocked(captureProjectJobAuthority).mockReset();
});
function setup() {
  const enqueue = vi.fn(),
    markFailure = vi.fn(),
    acquireLease = vi.fn().mockResolvedValue(true);
  const queue = { enqueue, dequeue: vi.fn(), acquireLease, releaseLease: vi.fn() };
  const dependencies = createDefaultRegenerationDependencies({
    db: { query: vi.fn() },
    queue,
    metadataStore: mockedObject<ReturnType<typeof createPostgresMetadataStore>>({
      getBundleSourceForOrganization: vi.fn().mockResolvedValue({
        event_id: user,
        occurred_at: "2026-11-07T00:00:00Z",
        occurrence_count: 1
      }),
      markBundleGenerationFailure: markFailure
    }),
    improvementOpportunityStore: mockedObject<
      ReturnType<typeof createPostgresImprovementOpportunityStore>
    >({
      getImprovementForOrganization: vi
        .fn()
        .mockResolvedValue({ project_id: project, kind: "warning_hotspot", occurrence_count: 1 }),
      listImprovementEventReferences: vi
        .fn()
        .mockResolvedValue([
          { event_id: user, event_type: "log_event", occurred_at: "2026-11-07T00:00:00Z" }
        ])
    })
  });
  return { ...dependencies, enqueue, markFailure, acquireLease };
}
describe("artifact regeneration admission", () => {
  it("carries the verified initiator and captured scope into both artifact queues", async () => {
    const input = setup();
    vi.mocked(captureProjectJobAuthority).mockResolvedValue({
      initiating_authority: initiator,
      scope_origin_ids: [project]
    });
    await expect(
      input.bundleRegeneration.requestRegeneration({
        organization_id: project,
        project_id: project,
        incident_id: user,
        initiating_authority: initiator
      })
    ).resolves.toBe(true);
    await expect(
      input.improvementBundleRegeneration.requestRegeneration({
        organization_id: project,
        project_id: project,
        opportunity_id: user,
        initiating_authority: initiator
      })
    ).resolves.toBe(true);
    expect(input.enqueue).toHaveBeenCalledWith(
      "build-bundle",
      expect.objectContaining({ initiating_authority: initiator, scope_origin_ids: [project] })
    );
    expect(input.enqueue).toHaveBeenCalledWith(
      "build-improvement-bundle",
      expect.objectContaining({ initiating_authority: initiator, scope_origin_ids: [project] })
    );
  });
  it("refuses a stale scope before taking leases or changing generation state", async () => {
    const input = setup();
    vi.mocked(captureProjectJobAuthority).mockResolvedValue(null);
    expect(
      await input.bundleRegeneration.requestRegeneration({
        organization_id: project,
        project_id: project,
        incident_id: user,
        initiating_authority: initiator
      })
    ).toBe(false);
    expect(
      await input.improvementBundleRegeneration.requestRegeneration({
        organization_id: project,
        project_id: project,
        opportunity_id: user,
        initiating_authority: initiator
      })
    ).toBe(false);
    expect(input.acquireLease).not.toHaveBeenCalled();
    expect(input.markFailure).not.toHaveBeenCalled();
    expect(input.enqueue).not.toHaveBeenCalled();
  });
  it("keeps the accepted legacy queue shape unchanged", async () => {
    const input = setup();
    expect(
      await input.bundleRegeneration.requestRegeneration({
        organization_id: project,
        project_id: project,
        incident_id: user
      })
    ).toBe(true);
    expect(captureProjectJobAuthority).not.toHaveBeenCalled();
    expect(input.enqueue).toHaveBeenCalledWith("build-bundle", {
      project_id: project,
      incident_id: user,
      event_id: user,
      occurred_at: "2026-11-07T00:00:00Z",
      occurrence_count: 1,
      trigger: "regeneration"
    });
  });
});
