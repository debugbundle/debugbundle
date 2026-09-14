import { expect, it } from "vitest";
import { buildBundle, type BuildBundleInput } from "../../../packages/bundle-engine/src/index.js";
import { createEventEnvelope } from "../../../packages/shared-types/src/index.js";

const occurredAt = "2026-09-13T12:00:00.000Z";
const sourceId = "00000000-0000-4000-8000-000000000001";
function deploy(
  commit: string,
  service: string,
  environment: string,
  deployedAt: string,
  observedAt = deployedAt
) {
  return createEventEnvelope({
    event_id: `${sourceId.slice(0, -1)}${commit}`,
    event_type: "deploy_metadata",
    occurred_at: observedAt,
    service: { name: service, environment },
    payload: {
      commit_sha: commit.repeat(40),
      version: commit,
      branch: "main",
      environment,
      deployed_at: deployedAt
    }
  });
}
function fixture(): BuildBundleInput {
  return {
    job: { trigger: "occurrence_threshold" },
    incident: {
      incident_id: "incident",
      project_id: "project",
      service_id: "service",
      service_name: "api",
      service_runtime: "java",
      service_framework: null,
      environment: "production",
      fingerprint: "fp",
      title: "Failed",
      severity: "high",
      first_seen_at: occurredAt,
      last_seen_at: occurredAt,
      occurrence_count: 1,
      source_event_types: ["backend_exception"]
    },
    bundleMetadata: {
      generation_number: 1,
      created_at: occurredAt,
      updated_at: occurredAt,
      source_event_id: sourceId,
      source_occurred_at: occurredAt
    },
    sourceEnvelopes: [],
    probeDataItems: []
  };
}

it("attributes a deployment by workload, environment and incident occurrence time", () => {
  const input = fixture();
  input.sourceEnvelopes = [
    deploy("a", "api", "production", "2026-09-12T12:00:00.000Z"),
    deploy("b", "api", "staging", "2026-09-13T11:00:00.000Z"),
    deploy("c", "other-api", "production", "2026-09-13T11:30:00.000Z"),
    deploy("d", "api", "production", "2026-09-14T12:00:00.000Z")
  ];
  const bundle = buildBundle(input);
  expect(bundle.context.deploy?.commit_sha).toBe("a".repeat(40));
  expect(bundle.context.git?.commit).toBe("a".repeat(40));
  expect(buildBundle({ ...input, sourceEnvelopes: [...input.sourceEnvelopes].reverse() })).toEqual(
    bundle
  );
});

it("orders deploys by deployment time even when older metadata arrives late", () => {
  const input = fixture();
  input.sourceEnvelopes = [
    deploy("a", "api", "production", "2026-09-12T12:00:00.000Z", occurredAt),
    deploy("b", "api", "production", "2026-09-13T11:00:00.000Z")
  ];
  expect(buildBundle(input).context.deploy?.commit_sha).toBe("b".repeat(40));
});

it("leaves deployment unknown when only another workload's evidence is present", () => {
  const input = fixture();
  input.sourceEnvelopes = [deploy("a", "other-api", "production", occurredAt)];
  expect(buildBundle(input).context.deploy).toBeNull();
  expect(buildBundle(input).context.git).toBeNull();
});

it("uses newer scoped deployment history when the raw incident window contains an older release", () => {
  const input = fixture();
  input.sourceEnvelopes = [deploy("a", "api", "production", "2026-09-12T12:00:00.000Z")];
  input.configuredDeploy = { commit_sha: "b".repeat(40), deployed_at: "2026-09-13T11:00:00.000Z" };
  const bundle = buildBundle(input);
  expect(bundle.context.deploy?.commit_sha).toBe("b".repeat(40));
  expect(bundle.context.git?.commit).toBe("b".repeat(40));
});
