import { gunzipSync, gzipSync } from "node:zlib";
import { afterEach, expect, it, vi } from "vitest";
import { processNextBuildBundleJob } from "../../../apps/worker/src/processor.js";
import { createEventEnvelope } from "../../../packages/shared-types/src/index.js";

afterEach(() => vi.unstubAllEnvs());

it.each([false, true, "history"])(
  "never assigns the platform release to customer bundle metadata (customer deploy: %s)",
  async (hasDeploy) => {
    vi.stubEnv("GITHUB_REPOSITORY", "platform/ci-repository");
    const occurredAt = "2026-09-13T12:00:00.000Z";
    const eventId = "00000000-0000-4000-8000-000000000001";
    const customerSha = "a".repeat(40);
    const platformSha = "b".repeat(40);
    const putObject = vi.fn();
    const getDeploymentForServiceAt = vi
      .fn()
      .mockResolvedValue(
        hasDeploy === "history" ? { commit_sha: customerSha, deployed_at: occurredAt } : null
      );
    const deploy = createEventEnvelope({
      event_id: eventId,
      event_type: "deploy_metadata",
      occurred_at: occurredAt,
      service: { name: "customer-api", environment: "production" },
      payload: {
        commit_sha: customerSha,
        version: "customer-release",
        branch: "main",
        deployed_at: occurredAt,
        environment: "production"
      }
    });
    await processNextBuildBundleJob({
      queue: {
        dequeue: vi.fn().mockResolvedValue({
          project_id: "customer",
          incident_id: "incident",
          event_id: eventId,
          occurred_at: occurredAt,
          occurrence_count: 1,
          trigger: "occurrence_threshold"
        }),
        enqueue: vi.fn()
      },
      env: {
        DEBUGBUNDLE_DEPLOY_COMMIT: platformSha,
        DEBUGBUNDLE_DEPLOYED_AT: occurredAt,
        DEBUGBUNDLE_GIT_REPO: "platform/repo"
      },
      incidentStore: {
        getDeploymentForServiceAt,
        getBundleBuildContext: vi.fn().mockResolvedValue({
          incident_id: "incident",
          project_id: "customer",
          service_id: "service",
          service_name: "customer-api",
          service_runtime: "php",
          service_framework: "laravel",
          environment: "production",
          fingerprint: "fingerprint",
          title: "Scheduler failed",
          severity: "high",
          first_seen_at: occurredAt,
          last_seen_at: occurredAt,
          occurrence_count: 1,
          source_event_types: []
        }),
        reserveBundleGeneration: vi.fn().mockResolvedValue({
          generation_number: 1,
          created_at: occurredAt,
          updated_at: occurredAt,
          source_event_id: eventId,
          source_occurred_at: occurredAt,
          trigger: "occurrence_threshold"
        }),
        listIncidentEventReferences: vi
          .fn()
          .mockResolvedValue(
            hasDeploy === true
              ? [{ event_id: eventId, event_type: "deploy_metadata", occurred_at: occurredAt }]
              : []
          )
      },
      objectStore: {
        getObject: vi.fn().mockResolvedValue(gzipSync(Buffer.from(JSON.stringify(deploy)))),
        putObject
      }
    });
    expect(putObject).toHaveBeenCalledOnce();
    expect(getDeploymentForServiceAt).toHaveBeenCalledWith({
      project_id: "customer",
      service_id: "service",
      environment: "production",
      occurred_at: occurredAt
    });
    const stored = putObject.mock.calls[0]![0] as { body: Buffer };
    const serialized = gunzipSync(stored.body).toString("utf8");
    expect(serialized).not.toContain(platformSha);
    expect(serialized).not.toContain("platform/repo");
    const bundle = JSON.parse(serialized);
    expect(bundle.context.git?.repo ?? null).toBeNull();
    expect(bundle.context.deploy?.commit_sha ?? null).toBe(hasDeploy ? customerSha : null);
    expect(bundle.context.git?.commit ?? null).toBe(hasDeploy ? customerSha : null);
  }
);
