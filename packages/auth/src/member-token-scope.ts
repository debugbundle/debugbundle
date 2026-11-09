import {
  MemberTokenPolicySchema,
  type MemberTokenPolicy,
  type MemberTokenScopeDeclaration,
  type OrganizationRole,
  type ProjectRole
} from "../../shared-types/src/index.js";
import { canPerformProjectAction } from "./project-authorization.js";

/** Verified interactive issuance only. Live authority is still rechecked at use. */
export async function buildMemberTokenPolicy(input: {
  declaration: MemberTokenScopeDeclaration;
  organization_id: string;
  organization_role: OrganizationRole;
  resolve_project: (id: string) => Promise<{
    effective_role: ProjectRole;
    origin_project_ids?: string[];
    shared_access_suspended?: boolean;
  } | null>;
}): Promise<MemberTokenPolicy | null> {
  const declaration = input.declaration;
  if (declaration.mode === "organization") {
    if (declaration.organization_id !== input.organization_id) return null;
    if (
      declaration.permissions.some(
        (permission) => permission === "organization:admin" || permission === "project:admin"
      ) &&
      input.organization_role !== "owner" &&
      input.organization_role !== "admin"
    )
      return null;
    return { version: 1, ...declaration };
  }
  const projects: { project_id: string; origin_project_ids: string[] }[] = [];
  for (const id of declaration.project_ids) {
    const access = await input.resolve_project(id);
    if (access === null || access.shared_access_suspended) return null;
    const action = declaration.permissions.includes("project:admin")
      ? "manage_settings"
      : declaration.permissions.includes("project:write")
        ? "write"
        : "read";
    if (!canPerformProjectAction(access.effective_role, action)) return null;
    projects.push({ project_id: id, origin_project_ids: access.origin_project_ids ?? [id] });
  }
  const parsed = MemberTokenPolicySchema.safeParse({
    version: 1,
    mode: "projects",
    permissions: declaration.permissions,
    projects
  });
  return parsed.success ? parsed.data : null;
}
