import type { IncidentRecord, ImprovementRecord, ProjectRecord } from "./api-types.js";

export function normalizeProjectRecord(
  project: Omit<ProjectRecord, "metrics"> & { metrics?: Partial<ProjectRecord["metrics"]> }
): ProjectRecord {
  return {
    ...project,
    color_tag: project.color_tag ?? null,
    metrics: {
      open_incidents: project.metrics?.open_incidents ?? 0,
      regressed_incidents: project.metrics?.regressed_incidents ?? 0,
      attention_incidents_today:
        project.metrics?.attention_incidents_today ?? project.metrics?.opened_incidents_today ?? 0,
      opened_incidents_today: project.metrics?.opened_incidents_today ?? 0,
      opened_incidents_month: project.metrics?.opened_incidents_month ?? 0,
      monthly_bundle_requests: project.metrics?.monthly_bundle_requests ?? 0,
      monthly_raw_ingested_events: project.metrics?.monthly_raw_ingested_events ?? 0,
      retained_bundles: project.metrics?.retained_bundles ?? 0,
      monthly_alert_deliveries: project.metrics?.monthly_alert_deliveries ?? 0
    }
  };
}

export function normalizeIncidentRecord(incident: IncidentRecord): IncidentRecord {
  return {
    ...incident,
    project_color_tag: incident.project_color_tag ?? null
  };
}

export function normalizeImprovementRecord(improvement: ImprovementRecord): ImprovementRecord {
  return {
    ...improvement,
    project_color_tag: improvement.project_color_tag ?? null
  };
}
