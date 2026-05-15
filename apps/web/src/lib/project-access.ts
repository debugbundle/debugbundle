import type { ProjectRecord } from "./api.js";

export type ProjectRelationship = "owned" | "shared";
export type ProjectEffectiveRole = "owner" | "admin" | "member";

export type AccessibleProjectRecord = ProjectRecord & {
  owner_user_id?: string;
  owner_email?: string;
  relationship?: ProjectRelationship;
  effective_role?: ProjectEffectiveRole;
};

export function asAccessibleProject(project: ProjectRecord): AccessibleProjectRecord {
  return project as AccessibleProjectRecord;
}

export function getProjectRelationship(project: ProjectRecord): ProjectRelationship {
  return asAccessibleProject(project).relationship ?? "owned";
}

export function isSharedProject(project: ProjectRecord): boolean {
  return getProjectRelationship(project) === "shared";
}

export function getProjectEffectiveRole(project: ProjectRecord): ProjectEffectiveRole {
  return asAccessibleProject(project).effective_role ?? "owner";
}

export function getProjectOwnerEmail(project: ProjectRecord): string | null {
  return asAccessibleProject(project).owner_email ?? null;
}

export function formatProjectRelationship(project: ProjectRecord): string {
  return isSharedProject(project) ? "Shared with you" : "Owned by you";
}
