import { deriveProjectCurrentState } from "../../../../packages/shared-types/src/availability-health.js";
import { listProjectAvailabilityChecks, listProjects } from "./api.js";
import { isSharedProjectAccessSuspended } from "./project-access.js";

/** Read current recorded health only; this never runs checks or loads their history. */
export async function loadWorkspaceHealthAlert(
  isCurrent: () => boolean = () => true
): Promise<boolean | null> {
  if (!isCurrent()) return null;
  try {
    const projects = (await listProjects()).filter(
      (project) => !isSharedProjectAccessSuspended(project)
    );
    let unavailable = false;
    // Bound background requests even for accounts with many accessible projects.
    for (let index = 0; index < projects.length; index += 4) {
      if (!isCurrent()) return null;
      const results = await Promise.allSettled(
        projects.slice(index, index + 4).map(async (project) => {
          const { checks } = await listProjectAvailabilityChecks(project.project_id, 100);
          return (
            deriveProjectCurrentState(
              checks
                .filter((check) => check.enabled && check.paused_reason === null)
                .map((check) => check.status)
            ) === "down"
          );
        })
      );
      if (!isCurrent()) return null;
      if (results.some((result) => result.status === "fulfilled" && result.value)) return true;
      unavailable ||= results.some((result) => result.status === "rejected");
    }
    return unavailable ? null : false;
  } catch {
    return null;
  }
}
