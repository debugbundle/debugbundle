export type BuildAnalyticsBundleTrigger = "opportunity" | "manual" | "regeneration";

export interface BuildAnalyticsBundleJob {
  project_id: string;
  generation_id: string;
  requested_at: string;
  trigger: BuildAnalyticsBundleTrigger;
}
