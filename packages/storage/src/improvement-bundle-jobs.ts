export interface BuildImprovementBundleJob {
  project_id: string;
  opportunity_id: string;
  event_id: string;
  event_type?: "log_event" | "request_event";
  occurred_at: string;
  occurrence_count: number;
  trigger: "occurrence_threshold" | "regeneration";
}
