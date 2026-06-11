export interface BuildImprovementBundleJob {
  project_id: string;
  opportunity_id: string;
  event_id: string;
  occurred_at: string;
  occurrence_count: number;
  trigger: "occurrence_threshold" | "regeneration";
}
