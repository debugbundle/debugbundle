import type { IncidentRetrievalRecord, ImprovementRetrievalRecord } from "./types.js";

interface ProjectRoutingMetadata {
  project_id: string;
  canonical_project_id?: string;
  canonical_service_name?: string | null;
  project_view_service_name?: string | null;
}

function projectRouting(
  record: ProjectRoutingMetadata,
  requestedProjectId?: string
): { project_id: string; origin_project_id?: string; service_name?: string } {
  const canonical = record.canonical_project_id ?? record.project_id;
  const view = requestedProjectId ?? canonical;
  const logicalName = record.canonical_service_name,
    viewName = record.project_view_service_name;
  return {
    project_id: view,
    ...(canonical !== record.project_id || view !== record.project_id
      ? { origin_project_id: record.project_id }
      : {}),
    ...(view === canonical && logicalName != null
      ? { service_name: logicalName }
      : viewName != null
        ? { service_name: viewName }
        : {})
  };
}

/** Only metadata routing changes. Immutable evidence and its storage keys retain their origins. */
export function projectEvidenceView(
  record: IncidentRetrievalRecord,
  requestedProjectId?: string
): IncidentRetrievalRecord {
  const view = { ...record, ...projectRouting(record, requestedProjectId) };
  removeRoutingInternals(view);
  return view;
}

export function projectImprovementView(
  record: ImprovementRetrievalRecord,
  requestedProjectId?: string
): ImprovementRetrievalRecord {
  const view = { ...record, ...projectRouting(record, requestedProjectId) };
  removeRoutingInternals(view);
  return view;
}

function removeRoutingInternals(view: ProjectRoutingMetadata): void {
  delete view.canonical_service_name;
  delete view.project_view_service_name;
  if (view.canonical_project_id == null) delete view.canonical_project_id;
}
