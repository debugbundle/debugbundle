import type { ProjectRecord } from "./api.js";

export function getActiveIncidentCount(metrics: ProjectRecord["metrics"]): number {
  return metrics.open_incidents + metrics.regressed_incidents;
}
