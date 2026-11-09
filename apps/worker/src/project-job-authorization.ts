import type {
  ProjectJobAuthorization,
  ProjectJobRequestAuthority
} from "../../../packages/storage/src/project-job-authorization.js";

/** Ingestion/system jobs keep their original path. A new saved initiator fails
 * closed when its live checker or immutable scope snapshot is unavailable. */
export function isProjectJobRequestAuthorized(
  checker: ProjectJobAuthorization | undefined,
  job: ProjectJobRequestAuthority & { project_id: string }
): Promise<boolean> {
  if (job.initiating_authority === undefined)
    return Promise.resolve(job.scope_origin_ids === undefined);
  if (checker === undefined || !Array.isArray(job.scope_origin_ids)) return Promise.resolve(false);
  return checker.isAuthorized({
    project_id: job.project_id,
    origin_project_ids: job.scope_origin_ids,
    initiator: job.initiating_authority,
    action: "read",
    require_current_full_scope: true
  });
}
