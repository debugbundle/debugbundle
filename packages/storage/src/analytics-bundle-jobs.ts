export type BuildAnalyticsBundleTrigger = "opportunity" | "manual" | "regeneration";

export interface BuildAnalyticsBundleJob {
  initiating_authority?: unknown;
  project_id: string;
  generation_id: string;
  requested_at: string;
  trigger: BuildAnalyticsBundleTrigger;
}
