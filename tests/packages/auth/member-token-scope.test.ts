import { describe, expect, it, vi } from "vitest";
import { buildMemberTokenPolicy } from "../../../packages/auth/src/member-token-scope.js";
import {
  MemberTokenPolicySchema,
  MemberTokenScopeDeclarationSchema
} from "../../../packages/shared-types/src/index.js";

const project = "11111111-1111-4111-8111-111111111111";
const org = "22222222-2222-4222-8222-222222222222";
describe("interactive member scope policy", () => {
  it("uses only server-resolved origins and rejects elevated project permissions", async () => {
    const resolve = vi
      .fn()
      .mockResolvedValue({ effective_role: "viewer", origin_project_ids: [project] });
    const declaration = MemberTokenScopeDeclarationSchema.parse({
      mode: "projects",
      project_ids: [project],
      permissions: ["project:read"]
    });
    expect(
      await buildMemberTokenPolicy({
        declaration,
        organization_id: org,
        organization_role: "member",
        resolve_project: resolve
      })
    ).toEqual({
      version: 1,
      mode: "projects",
      permissions: ["project:read"],
      projects: [{ project_id: project, origin_project_ids: [project] }]
    });
    expect(
      await buildMemberTokenPolicy({
        declaration: { ...declaration, permissions: ["project:write"] },
        organization_id: org,
        organization_role: "member",
        resolve_project: resolve
      })
    ).toBeNull();
  });
  it("bounds organisation administration to the live current organisation", async () => {
    const resolve = vi.fn();
    const declaration = {
      mode: "organization" as const,
      organization_id: org,
      permissions: ["organization:admin" as const]
    };
    expect(
      await buildMemberTokenPolicy({
        declaration,
        organization_id: org,
        organization_role: "member",
        resolve_project: resolve
      })
    ).toBeNull();
    expect(
      await buildMemberTokenPolicy({
        declaration,
        organization_id: project,
        organization_role: "owner",
        resolve_project: resolve
      })
    ).toBeNull();
    expect(
      await buildMemberTokenPolicy({
        declaration,
        organization_id: org,
        organization_role: "admin",
        resolve_project: resolve
      })
    ).toEqual({ version: 1, ...declaration });
    expect(resolve).not.toHaveBeenCalled();
  });
  it("rejects duplicate projects and misplaced organisation permissions", () => {
    expect(
      MemberTokenScopeDeclarationSchema.safeParse({
        mode: "projects",
        project_ids: [project],
        permissions: ["organization:admin"]
      }).success
    ).toBe(false);
    expect(
      MemberTokenPolicySchema.safeParse({
        version: 1,
        mode: "projects",
        permissions: ["project:read"],
        projects: [
          { project_id: project, origin_project_ids: [project] },
          { project_id: project, origin_project_ids: [project] }
        ]
      }).success
    ).toBe(false);
  });
});
