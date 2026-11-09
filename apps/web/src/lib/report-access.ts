import type { ProjectRecord, SessionRecord } from "./api.js";
import { getProjectEffectiveRole, isSharedProjectAccessSuspended } from "./project-access.js";
/** Visibility hints only. Domain services recheck the actual whole scope. */
export function reportManageableProjects(
  projects: ProjectRecord[],
  session: SessionRecord
): ProjectRecord[] {
  return projects.filter(
    (project) =>
      project.organization_id === session.organization_id &&
      !isSharedProjectAccessSuspended(project) &&
      ["owner", "admin"].includes(getProjectEffectiveRole(project))
  );
}
