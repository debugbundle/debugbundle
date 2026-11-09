import { describe, expect, it } from "vitest";
import {
  canPerformProjectAction,
  resolveEffectiveProjectRole,
  tokenAllowsProject
} from "../../../packages/auth/src/project-authorization.js";

const project = "11111111-1111-4111-8111-111111111111";
const origin = "22222222-2222-4222-8222-222222222222";
const other = "33333333-3333-4333-8333-333333333333";

describe("fixed project authorization", () => {
  it("unlocks self-hosted inherited roles without skipping the explicit opt-in or suspension", () => {
    const input = {
      owner: false,
      plan: "free" as const,
      organization_role: "admin" as const,
      self_hosted: true,
      allow_inherited: true
    };
    expect(resolveEffectiveProjectRole(input)).toBe("admin");
    expect(resolveEffectiveProjectRole({ ...input, allow_inherited: false })).toBeNull();
    expect(resolveEffectiveProjectRole({ ...input, suspended: true })).toBeNull();
    expect(resolveEffectiveProjectRole({ ...input, self_hosted: false })).toBeNull();
  });
  it("combines positive grants and denies every source while suspended", () => {
    expect(
      resolveEffectiveProjectRole({
        owner: false,
        direct_role: "viewer",
        organization_role: "admin",
        plan: "business",
        allow_inherited: true
      })
    ).toBe("admin");
    expect(
      resolveEffectiveProjectRole({
        owner: false,
        direct_role: "member",
        organization_role: "admin",
        plan: "team",
        allow_inherited: true
      })
    ).toBe("member");
    expect(
      resolveEffectiveProjectRole({
        owner: true,
        direct_role: "admin",
        plan: "business",
        suspended: true
      })
    ).toBeNull();
  });

  it("requires explicit inheritance and excludes new org powers from legacy principals", () => {
    expect(
      resolveEffectiveProjectRole({
        owner: false,
        plan: "business",
        organization_role: "member",
        all_projects_role: "viewer",
        allow_inherited: true
      })
    ).toBe("viewer");
    expect(
      resolveEffectiveProjectRole({
        owner: false,
        plan: "business",
        organization_role: "admin",
        allow_inherited: false
      })
    ).toBeNull();
    expect(
      resolveEffectiveProjectRole({
        owner: false,
        plan: "business",
        organization_role: "member",
        allow_inherited: true
      })
    ).toBeNull();
  });

  it("preserves project Admin peer management and limits Viewer to reads", () => {
    expect(canPerformProjectAction("admin", "manage_members")).toBe(true);
    expect(canPerformProjectAction("admin", "delete")).toBe(false);
    expect(canPerformProjectAction("viewer", "read")).toBe(true);
    expect(canPerformProjectAction("viewer", "write")).toBe(false);
    expect(canPerformProjectAction("member", "write")).toBe(true);
    expect(canPerformProjectAction("member", "manage_members")).toBe(false);
  });

  it("never widens selected token origins after canonical consolidation", () => {
    const policy = {
      version: 1 as const,
      mode: "projects" as const,
      permissions: ["project:read" as const],
      projects: [{ project_id: project, origin_project_ids: [origin] }]
    };
    expect(
      tokenAllowsProject(policy, {
        project_id: project,
        organization_id: other,
        origin_project_ids: [origin],
        action: "read"
      })
    ).toBe(true);
    expect(
      tokenAllowsProject(policy, {
        project_id: project,
        organization_id: other,
        origin_project_ids: [origin, other],
        action: "read"
      })
    ).toBe(false);
    expect(
      tokenAllowsProject(policy, {
        project_id: project,
        organization_id: other,
        origin_project_ids: [origin],
        action: "write"
      })
    ).toBe(false);
  });

  it("binds explicit org-wide tokens to one org and still requires project permissions", () => {
    const policy = {
      version: 1 as const,
      mode: "organization" as const,
      organization_id: other,
      permissions: ["project:write" as const]
    };
    expect(
      tokenAllowsProject(policy, {
        project_id: project,
        organization_id: other,
        origin_project_ids: [origin],
        action: "write"
      })
    ).toBe(true);
    expect(
      tokenAllowsProject(policy, {
        project_id: project,
        organization_id: project,
        origin_project_ids: [origin],
        action: "read"
      })
    ).toBe(false);
    expect(
      tokenAllowsProject(policy, {
        project_id: project,
        organization_id: other,
        origin_project_ids: [origin],
        action: "manage_settings"
      })
    ).toBe(false);
  });
});
