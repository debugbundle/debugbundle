import { hasBusinessEntitlement } from "../../shared-types/src/tier-capabilities.js";
import type {
  MemberTokenPolicy,
  OrganizationRole,
  ProjectRole,
  TierName
} from "../../shared-types/src/index.js";

export type ProjectAction =
  | "read"
  | "write"
  | "manage_members"
  | "manage_settings"
  | "manage_integrations"
  | "manage_credentials"
  | "delete";
const ROLE_RANK: Record<ProjectRole, number> = { viewer: 0, member: 1, admin: 2, owner: 3 };

/** Positive grants combine; a direct lower role is not an inherited deny. */
export function resolveEffectiveProjectRole(input: {
  owner: boolean;
  plan: TierName;
  direct_role?: Exclude<ProjectRole, "owner"> | null;
  organization_role?: OrganizationRole | null;
  all_projects_role?: "member" | "viewer" | null;
  allow_inherited?: boolean;
  self_hosted?: boolean;
  suspended?: boolean;
}): ProjectRole | null {
  if (input.suspended) return null;
  if (input.owner) return "owner";
  let role: ProjectRole | null = input.direct_role ?? null;
  if (hasBusinessEntitlement(input.plan, input.self_hosted) && input.allow_inherited) {
    const inherited =
      input.organization_role === "owner"
        ? "owner"
        : input.organization_role === "admin"
          ? "admin"
          : (input.all_projects_role ?? null);
    if (inherited !== null && (role === null || ROLE_RANK[inherited] > ROLE_RANK[role]))
      role = inherited;
  }
  return role;
}

export function canPerformProjectAction(role: ProjectRole | null, action: ProjectAction): boolean {
  if (role === null) return false;
  if (action === "read") return true;
  if (role === "owner") return true;
  if (action === "delete") return false;
  if (action === "write") return role === "admin" || role === "member";
  return role === "admin";
}

function tokenAllowsAction(policy: MemberTokenPolicy, action: ProjectAction): boolean {
  if (action === "delete") return false;
  if (policy.permissions.includes("project:admin")) return true;
  if (action === "read")
    return (
      policy.permissions.includes("project:read") || policy.permissions.includes("project:write")
    );
  return action === "write" && policy.permissions.includes("project:write");
}

/** Caller must also check the holder's live access. Origin sets are trusted DB
 * projections; never accept them as client query/body scope assertions. */
export function tokenAllowsProject(
  policy: MemberTokenPolicy | undefined,
  input: {
    project_id: string;
    organization_id: string;
    origin_project_ids: readonly string[];
    action: ProjectAction;
  }
): boolean {
  if (policy === undefined) return true;
  if (!tokenAllowsAction(policy, input.action)) return false;
  if (policy.mode === "organization") return policy.organization_id === input.organization_id;
  const accepted = new Set(policy.projects.flatMap((project) => project.origin_project_ids));
  return (
    input.origin_project_ids.length > 0 &&
    input.origin_project_ids.every((origin) => accepted.has(origin))
  );
}
