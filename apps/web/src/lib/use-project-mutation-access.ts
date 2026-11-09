import { useEffect, useState } from "react";
import { listProjects } from "./api.js";
import { getProjectEffectiveRole, isSharedProjectAccessSuspended } from "./project-access.js";
import { useSession } from "./session.js";
import { useOutletContext } from "react-router-dom";
import type { ProjectRecord } from "./api.js";
/** UI visibility only; mutations still pass through the API's current-role checks.
 * Unknown/failed access reads hide controls rather than assuming the Owner role. */
export function useProjectMutationAccess(projectId: string | undefined): {
  canMutate: boolean;
  canManage: boolean;
} {
  const { session } = useSession(),
    inherited = useOutletContext<{ project?: ProjectRecord } | null>()?.project,
    key = `${session?.user_id}:${session?.organization_id}:${projectId}`,
    [access, setAccess] = useState<{ key: string; role: string } | null>(null);
  useEffect(() => {
    let active = true;
    setAccess(null);
    if (!projectId || !session || inherited?.project_id === projectId) return;
    void listProjects(projectId)
      .then((projects) => {
        const project = projects.find((item) => item.project_id === projectId);
        if (active && project && !isSharedProjectAccessSuspended(project))
          setAccess({ key, role: getProjectEffectiveRole(project) });
      })
      .catch(() => {
        /* Read failures leave mutation controls unavailable. */
      });
    return () => {
      active = false;
    };
  }, [key, projectId, session?.user_id, session?.organization_id, inherited]);
  const role =
    inherited !== undefined && inherited.project_id === projectId
      ? isSharedProjectAccessSuspended(inherited)
        ? null
        : getProjectEffectiveRole(inherited)
      : access?.key === key
        ? access.role
        : null;
  return {
    canMutate: role !== null && role !== "viewer",
    canManage: role === "owner" || role === "admin"
  };
}
