import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  buildProjectMergePlan,
  projectMergeRevision,
  type ProjectMergeSnapshot
} from "../../../packages/storage/src/project-merge-plan.js";

const target = "10000000-0000-4000-8000-000000000001";
const source = "10000000-0000-4000-8000-000000000002";
const owner = "10000000-0000-4000-8000-000000000003";
const account = "10000000-0000-4000-8000-000000000004";
const definition = "10000000-0000-4000-8000-000000000005";
it("uses ordinal JSON key order for locale-independent plan revisions", () => {
  const expected = createHash("sha256").update('{"a":1,"z":3,"é":2}').digest("hex");
  expect(projectMergeRevision({ é: 2, z: 3, a: 1 })).toBe(expected);
});

function snapshot(): ProjectMergeSnapshot {
  return {
    runtime_contract: "project-services-v1",
    inventory_complete: true,
    projects: [target, source].map((id) => ({
      project_id: id,
      organization_id: account,
      owner_user_id: owner,
      canonical_project_id: id,
      access_revision: "same-access",
      settings_revision: "same-effective-policy",
      configuration_revision: "configuration-1",
      pending_invites: false,
      active_operation_id: null,
      origin_ids: [id],
      services: id === target ? [] : [{ service_definition_id: definition, name: "web" }],
      row_count: 20
    })),
    resource_limits: []
  };
}
const request = () => ({
  target_project_id: target,
  source_project_ids: [source],
  service_mappings: [{ source_project_id: source, service_definition_id: definition, name: "Site" }]
});
const plan = (state = snapshot()) => buildProjectMergePlan(request(), state, owner);

describe("checked project consolidation preview", () => {
  it("suggests the source project name for the common single-application case", () => {
    const state = snapshot();
    state.projects[1]!.project_name = "Site";
    expect(
      buildProjectMergePlan({ ...request(), service_mappings: [] }, state, owner)
        .suggested_service_mappings
    ).toEqual([{ source_project_id: source, service_definition_id: definition, name: "Site" }]);
    state.projects[1]!.project_name = "dbundle_proj_synthetic_credential";
    expect(
      buildProjectMergePlan({ ...request(), service_mappings: [] }, state, owner)
        .suggested_service_mappings[0]?.name
    ).toBe("web");
  });
  it("offers deterministic collision-free suggestions and reports resource bounds", () => {
    const state = snapshot();
    state.projects[0]!.reserved_names = ["web"];
    state.resource_limits = [{ resource: "health_checks", count: 2, limit: 10 }];
    const result = buildProjectMergePlan({ ...request(), service_mappings: [] }, state, owner);
    expect(result.suggested_service_mappings).toEqual([
      {
        source_project_id: source,
        service_definition_id: definition,
        name: `web (${source.slice(0, 8)})`
      }
    ]);
    expect(result.resource_limits).toEqual(state.resource_limits);
    expect(result.blockers).toContainEqual({
      code: "service_mapping_required",
      project_id: source,
      resource: null
    });
  });
  it("plans explicit services under one canonical project without changing its input", () => {
    const state = snapshot();
    const before = JSON.stringify(state);
    const result = plan(state);
    expect(result.blockers).toEqual([]);
    expect(result.ready).toBe(true);
    expect(result.target_project_id).toBe(target);
    expect(result.service_mappings[0]?.name).toBe("Site");
    expect(result.plan_digest).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(state)).toBe(before);
  });

  it("keeps the digest stable during ordinary traffic but invalidates configuration changes", () => {
    const state = snapshot();
    const before = plan(state);
    state.projects[1]!.row_count += 10;
    expect(plan(state).plan_digest).toBe(before.plan_digest);
    state.projects[1]!.configuration_revision = "changed";
    expect(plan(state).plan_digest).not.toBe(before.plan_digest);
  });

  it("does not include unrelated inaccessible projects in the digest or response", () => {
    const state = snapshot();
    const before = plan(state);
    state.projects.push({ ...state.projects[0]!, project_id: account, owner_user_id: account });
    expect(plan(state)).toEqual(before);
  });

  it.each([
    ["organization_id", "other", "account_conflict"],
    ["owner_user_id", "other", "project_not_found"],
    ["access_revision", "other", "access_conflict"],
    ["settings_revision", "other", "settings_conflict"],
    ["pending_invites", true, "pending_invites"],
    ["active_operation_id", "other", "operation_conflict"],
    ["canonical_project_id", target, "project_consolidated"]
  ] as const)("blocks incompatible %s rather than changing policy", (field, value, code) => {
    const state = snapshot();
    Object.assign(state.projects[1]!, { [field]: value });
    expect(plan(state).blockers.map((b) => b.code)).toContain(code);
    expect(plan(state).ready).toBe(false);
  });

  it("blocks unknown dependencies and combined resource limits", () => {
    const state = snapshot();
    state.inventory_complete = false;
    state.resource_limits.push({ resource: "health_checks", count: 11, limit: 10 });
    expect(plan(state).blockers.map((b) => b.code)).toEqual([
      "inventory_incomplete",
      "resource_limit"
    ]);
  });

  it("rejects missing, duplicate and many-to-one service mappings", () => {
    const state = snapshot();
    state.projects[0]!.services.push({ service_definition_id: account, name: "Site" });
    expect(plan(state).blockers.map((b) => b.code)).toContain("service_name_conflict");
    expect(
      buildProjectMergePlan({ ...request(), service_mappings: [] }, snapshot(), owner).blockers.map(
        (b) => b.code
      )
    ).toContain("service_mapping_required");
    expect(() =>
      buildProjectMergePlan({ ...request(), source_project_ids: [source, source] }, state, owner)
    ).toThrow("invalid_merge_request");
  });

  it("includes every inherited origin and rejects overlapping origin closures", () => {
    const state = snapshot();
    state.projects[1]!.origin_ids.push(account);
    expect(plan(state).origin_ids).toEqual([target, source, account].sort());
    state.projects[0]!.origin_ids.push(account);
    expect(plan(state).blockers.map((b) => b.code)).toContain("origin_conflict");
  });

  it("bounds the work and never offers a force bypass", () => {
    const state = snapshot();
    state.projects[1]!.row_count = 1_000_000;
    expect(plan(state).blockers.map((b) => b.code)).toContain("supported_size_exceeded");
    expect(() => buildProjectMergePlan({ ...request(), force: true }, state, owner)).toThrow(
      "invalid_merge_request"
    );
  });

  it("fails closed when a selected project is absent or the actor is not its owner", () => {
    const state = snapshot();
    state.projects.pop();
    expect(plan(state).blockers.map((b) => b.code)).toContain("project_not_found");
    expect(buildProjectMergePlan(request(), snapshot(), account).ready).toBe(false);
  });
});
