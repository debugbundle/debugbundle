import type { ProjectRecord } from "./api.js";

export type ProjectRelationship = "owned" | "shared";
export type ProjectSharingState = "private" | "shared_by_you" | "shared_with_you";
export type ProjectEffectiveRole = "owner" | "admin" | "member";

export type AccessibleProjectRecord = ProjectRecord & {
  owner_user_id?: string;
  owner_email?: string;
  relationship?: ProjectRelationship;
  sharing_state?: ProjectSharingState;
  effective_role?: ProjectEffectiveRole;
};

export function asAccessibleProject(project: ProjectRecord): AccessibleProjectRecord {
  return project as AccessibleProjectRecord;
}

export function getProjectRelationship(project: ProjectRecord): ProjectRelationship {
  return asAccessibleProject(project).relationship ?? "owned";
}

export function isSharedProject(project: ProjectRecord): boolean {
  return getProjectSharingState(project) !== "private";
}

export function getProjectSharingState(project: ProjectRecord): ProjectSharingState {
  const accessibleProject = asAccessibleProject(project);

  if (accessibleProject.sharing_state !== undefined) {
    return accessibleProject.sharing_state;
  }

  return getProjectRelationship(project) === "shared" ? "shared_with_you" : "private";
}

export function getProjectEffectiveRole(project: ProjectRecord | null | undefined): ProjectEffectiveRole {
  if (project === null || project === undefined) {
    return "owner";
  }

  return asAccessibleProject(project).effective_role ?? "owner";
}

export function getProjectOwnerEmail(project: ProjectRecord): string | null {
  return asAccessibleProject(project).owner_email ?? null;
}

export function formatProjectRelationship(project: ProjectRecord): string {
  const sharingState = getProjectSharingState(project);

  if (sharingState === "shared_with_you") {
    return "Shared with you";
  }

  if (sharingState === "shared_by_you") {
    return "Shared by you";
  }

  return "Owned by you";
}
