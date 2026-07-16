import type {
  CapturePreset,
  CaptureRuleEvaluationResult,
  EventClass,
  EventEnvelope,
  ImmediateClientErrorPathRule
} from "../../shared-types/src/index.js";
import type { AlertSeverityLifecycleEvent } from "./alert-lifecycle.js";
import type { BuildAnalyticsBundleJob } from "./analytics-bundle-jobs.js";
import type { EvaluateAnalyticsOpportunitiesJob } from "./analytics-opportunity-jobs.js";
import type {
  AlertConditionType,
  Queryable,
  RegressionDeployCorrelation
} from "./types.js";

export type { EvaluateAnalyticsOpportunitiesJob } from "./analytics-opportunity-jobs.js";

export interface QueueClient {
  enqueue(jobName: "normalize-events", payload: NormalizeEventsJob): Promise<void>;
  enqueue(jobName: "group-incident", payload: GroupIncidentJob): Promise<void>;
  enqueue(jobName: "build-bundle", payload: BuildBundleJob): Promise<void>;
  enqueue(jobName: "build-analytics-bundle", payload: BuildAnalyticsBundleJob): Promise<void>;
  enqueue(
    jobName: "evaluate-analytics-opportunities",
    payload: EvaluateAnalyticsOpportunitiesJob
  ): Promise<void>;
  enqueue(jobName: "build-reproduction", payload: BuildReproductionJob): Promise<void>;
  enqueue(jobName: "evaluate-alerts", payload: EvaluateAlertsJob): Promise<void>;
  enqueue(jobName: "deliver-alert-email-digest", payload: DeliverAlertEmailDigestJob): Promise<void>;
  enqueue(jobName: "deliver-webhook", payload: DeliverWebhookJob): Promise<void>;
  enqueue(jobName: "deliver-github-dispatch", payload: DeliverGitHubDispatchJob): Promise<void>;
  enqueue(jobName: "generate-weekly-report", payload: GenerateWeeklyReportJob): Promise<void>;
  enqueue(jobName: "cleanup-retention", payload: CleanupRetentionJob): Promise<void>;
}

export interface RedisQueueClient extends QueueClient {
  readJobQueue(jobName: RedisQueueJobName): Promise<string[]>;
  clearJobQueue(jobName: RedisQueueJobName): Promise<void>;
  acquireLease(key: string, ttlSeconds: number): Promise<boolean>;
  releaseLease(key: string): Promise<void>;
  dequeue(jobName: "normalize-events"): Promise<NormalizeEventsJob | null>;
  dequeue(jobName: "group-incident"): Promise<GroupIncidentJob | null>;
  dequeue(jobName: "build-bundle"): Promise<BuildBundleJob | null>;
  dequeue(jobName: "build-analytics-bundle"): Promise<BuildAnalyticsBundleJob | null>;
  dequeue(
    jobName: "evaluate-analytics-opportunities"
  ): Promise<EvaluateAnalyticsOpportunitiesJob | null>;
  dequeue(jobName: "build-reproduction"): Promise<BuildReproductionJob | null>;
  dequeue(jobName: "evaluate-alerts"): Promise<EvaluateAlertsJob | null>;
  dequeue(jobName: "deliver-alert-email-digest"): Promise<DeliverAlertEmailDigestJob | null>;
  dequeue(jobName: "deliver-webhook"): Promise<DeliverWebhookJob | null>;
  dequeue(jobName: "deliver-github-dispatch"): Promise<DeliverGitHubDispatchJob | null>;
  dequeue(jobName: "generate-weekly-report"): Promise<GenerateWeeklyReportJob | null>;
  dequeue(jobName: "cleanup-retention"): Promise<CleanupRetentionJob | null>;
  claim(jobName: "normalize-events"): Promise<ClaimedRedisJob<NormalizeEventsJob> | null>;
  claim(jobName: "group-incident"): Promise<ClaimedRedisJob<GroupIncidentJob> | null>;
  claim(jobName: "build-bundle"): Promise<ClaimedRedisJob<BuildBundleJob> | null>;
  claim(jobName: "build-analytics-bundle"): Promise<ClaimedRedisJob<BuildAnalyticsBundleJob> | null>;
  claim(
    jobName: "evaluate-analytics-opportunities"
  ): Promise<ClaimedRedisJob<EvaluateAnalyticsOpportunitiesJob> | null>;
  claim(jobName: "build-reproduction"): Promise<ClaimedRedisJob<BuildReproductionJob> | null>;
  claim(jobName: "evaluate-alerts"): Promise<ClaimedRedisJob<EvaluateAlertsJob> | null>;
  claim(jobName: "deliver-alert-email-digest"): Promise<ClaimedRedisJob<DeliverAlertEmailDigestJob> | null>;
  claim(jobName: "deliver-webhook"): Promise<ClaimedRedisJob<DeliverWebhookJob> | null>;
  claim(jobName: "deliver-github-dispatch"): Promise<ClaimedRedisJob<DeliverGitHubDispatchJob> | null>;
  claim(jobName: "generate-weekly-report"): Promise<ClaimedRedisJob<GenerateWeeklyReportJob> | null>;
  claim(jobName: "cleanup-retention"): Promise<ClaimedRedisJob<CleanupRetentionJob> | null>;
  reclaimStaleProcessingJobs(jobName: RedisQueueJobName, olderThanMs: number): Promise<number>;
  close(): Promise<void>;
}

export type RedisQueueJobName =
  | "normalize-events"
  | "group-incident"
  | "build-bundle"
  | "build-analytics-bundle"
  | "evaluate-analytics-opportunities"
  | "build-reproduction"
  | "evaluate-alerts"
  | "deliver-alert-email-digest"
  | "deliver-webhook"
  | "deliver-github-dispatch"
  | "generate-weekly-report"
  | "cleanup-retention";

export interface ClaimedRedisJob<Payload> {
  payload: Payload;
  ack(): Promise<void>;
}

export interface NormalizeEventsJob {
  project_id: string;
  event_id: string;
  object_key: string;
  capture_preset?: CapturePreset;
  immediate_client_error_statuses?: number[];
  immediate_client_error_path_rules?: ImmediateClientErrorPathRule[];
  capture_rule?: CaptureRuleEvaluationResult;
}

export interface GroupIncidentJob {
  project_id: string;
  event_id: string;
  event_type: EventEnvelope["event_type"];
  event_class: EventClass;
  incident_trigger?: "request_anomaly";
  service_name: string;
  environment: string;
  fingerprint: string;
  alert_notification_key?: string;
  fingerprint_version?: string;
  normalized_message: string;
  matched_fields?: string[];
  occurred_at: string;
  severity: "low" | "medium" | "high" | "critical";
  session_id_hash?: string | null;
  trace_id_hash?: string | null;
  deploy_metadata?: {
    commit_sha: string;
    version: string;
    branch: string;
    deployed_at: string;
  };
}

export interface BuildBundleJob {
  project_id: string;
  incident_id: string;
  event_id: string;
  occurred_at: string;
  occurrence_count: number;
  trigger:
    | "occurrence_threshold"
    | "regression_reopen"
    | "deploy_metadata"
    | "new_context_type"
    | "reproduction_confidence_change"
    | "regeneration";
}

export interface BuildReproductionJob {
  project_id: string;
  incident_id: string;
  bundle_key: string;
  bundle_version: number;
  occurred_at: string;
}

export interface EvaluateAlertsJob {
  project_id: string;
  incident_id: string;
  condition_type: AlertConditionType;
  dedupe_key: string;
  notification_key?: string;
  lifecycle_event?: AlertSeverityLifecycleEvent;
  occurred_at: string;
  summary?: string;
  service_name: string;
  environment: string;
  severity: "low" | "medium" | "high" | "critical";
  regression_deploy?: RegressionDeployCorrelation | null;
}

export interface DeliverAlertEmailDigestJob {
  digest_id: string;
}

export interface DeliverWebhookJob {
  delivery_id: string;
  attempt: number;
}

export interface DeliverGitHubDispatchJob {
  delivery_id: string;
  attempt: number;
}

export interface GenerateWeeklyReportJob {
  delivery_id: string;
  weekly_report_channel_id: string;
  project_id: string;
  delivery_ids?: string[];
  weekly_report_channel_ids?: string[];
  project_ids?: string[];
  window_start: string;
  window_end: string;
}

export interface CleanupRetentionJob {
  scheduled_at: string;
}

export interface CreateRedisQueueClientInput {
  redisUrl: string;
  snapshotStore?: Queryable;
  frequencySnapshotIntervalSeconds?: number;
}
