import { createHash } from "node:crypto";
import type { RuntimeLogger } from "../../../packages/runtime-logger/src/index.js";
import { fingerprint } from "../../../packages/event-normalizer/src/index.js";
import { type BuildBundleInput } from "../../../packages/bundle-engine/src/index.js";
import type {
  AlertConditionType,
  AlertDeliveryStore,
  AlertRuleRecord,
  BillingStore,
  BuildReproductionJob,
  BundleBuildContextStore,
  BuildBundleJob,
  BuildAnalyticsBundleJob,
  CleanupRetentionJob,
  DeliverAlertEmailDigestJob,
  DeliverGitHubDispatchJob,
  EvaluateAnalyticsOpportunitiesJob,
  EvaluateAlertsJob,
  GenerateWeeklyReportJob,
  GitHubDispatchDeliveryIntent,
  GitHubStore,
  GroupIncidentJob,
  IncidentFrequencyCounter,
  MetadataStore,
  ObjectStoreClient,
  ObjectStoreReader,
  OperationalEmailDeliveryStore,
  RequestAnomalyCounter,
  RegressionDeployCorrelation,
  WeeklyReportChannelRecord,
  WeeklyReportChannelStore,
  WeeklyProjectReportSummary,
  WeeklyReportDeliveryStore,
  WeeklyReportingStore,
  WebhookEventType,
  WebhookDeliveryStore,
  NormalizeEventsJob
} from "../../../packages/storage/src/index.js";
import { describeBrowserResourceInterruption, type EventEnvelope } from "../../../packages/shared-types/src/index.js";
import { type ImprovementBundleWorkerDependencies } from "./improvement-bundles.js";
import { type WorkerAccountAnalyticsDependencies } from "./account-analytics.js";
import { type AnalyticsIncidentCorrelationRecorder } from "./analytics-incident-correlation.js";

export type BundleLinkBaseUrls = NonNullable<BuildBundleInput["linkBaseUrls"]>;

export interface WorkerQueue {
  /** Stable durable identity for the currently claimed job, never its lease token. */
  getActiveJobId?(): string | null;
  dequeue(jobName: "normalize-events"): Promise<NormalizeEventsJob | null>;
  dequeue(jobName: "group-incident"): Promise<GroupIncidentJob | null>;
  dequeue(jobName: "build-bundle"): Promise<BuildBundleJob | null>;
  dequeue(jobName: "build-analytics-bundle"): Promise<BuildAnalyticsBundleJob | null>;
  dequeue(jobName: "build-reproduction"): Promise<BuildReproductionJob | null>;
  dequeue(
    jobName: "evaluate-analytics-opportunities"
  ): Promise<EvaluateAnalyticsOpportunitiesJob | null>;
  dequeue(jobName: "evaluate-alerts"): Promise<EvaluateAlertsJob | null>;
  dequeue(jobName: "deliver-alert-email-digest"): Promise<DeliverAlertEmailDigestJob | null>;
  dequeue(jobName: "generate-weekly-report"): Promise<GenerateWeeklyReportJob | null>;
  dequeue(jobName: "cleanup-retention"): Promise<CleanupRetentionJob | null>;
  enqueue(jobName: "group-incident", payload: GroupIncidentJob): Promise<void>;
  enqueue(jobName: "build-bundle", payload: BuildBundleJob): Promise<void>;
  enqueue(jobName: "build-reproduction", payload: BuildReproductionJob): Promise<void>;
  enqueue(
    jobName: "evaluate-analytics-opportunities",
    payload: EvaluateAnalyticsOpportunitiesJob
  ): Promise<void>;
  enqueue(jobName: "evaluate-alerts", payload: EvaluateAlertsJob): Promise<void>;
  enqueue(
    jobName: "deliver-alert-email-digest",
    payload: DeliverAlertEmailDigestJob
  ): Promise<void>;
  dequeue(jobName: "deliver-webhook"): Promise<{ delivery_id: string; attempt: number } | null>;
  enqueue(
    jobName: "deliver-webhook",
    payload: { delivery_id: string; attempt: number }
  ): Promise<void>;
  dequeue(jobName: "deliver-github-dispatch"): Promise<DeliverGitHubDispatchJob | null>;
  enqueue(jobName: "deliver-github-dispatch", payload: DeliverGitHubDispatchJob): Promise<void>;
  enqueue(jobName: "generate-weekly-report", payload: GenerateWeeklyReportJob): Promise<void>;
  enqueue(jobName: "cleanup-retention", payload: CleanupRetentionJob): Promise<void>;
  readJobQueue?(jobName: "build-reproduction"): Promise<string[]>;
  releaseLease?(key: string): Promise<void>;
}

export interface ProcessedEventStore {
  upsertProcessedEvent(input: {
    event_id: string;
    project_id: string;
    event_type: string;
    fingerprint: string;
    normalized_message: string;
  }): Promise<{ inserted: boolean }>;
}

export interface NormalizeWorkerDependencies {
  recordBrowserRecoveryContext?: (projectId: string, event: EventEnvelope) => Promise<void>;
  deferImprovement?: (
    input: Omit<
      Parameters<typeof import("./improvement-bundles.js").maybeGenerateHostedImprovementBundle>[0],
      "dependencies"
    > & { object_key: string }
  ) => Promise<void>;
  queue: WorkerQueue;
  objectStore: ObjectStoreReader & Partial<ObjectStoreClient>;
  processedEventStore: ProcessedEventStore;
  requestAnomalyCounter?: RequestAnomalyCounter;
  improvementBundleWorker?: ImprovementBundleWorkerDependencies;
}

export interface IncidentLifecycleWebhookPublisher {
  publish(input: {
    event_type: WebhookEventType;
    incident_id: string;
    project_id: string;
    occurred_at: string;
    service_name: string;
    environment: string;
    severity: "low" | "medium" | "high" | "critical";
    bundle_type?: "failure" | "improvement";
    is_verification?: boolean;
    title?: string;
    regression_deploy?: RegressionDeployCorrelation | null;
  }): Promise<void>;
}

export interface IncidentLifecycleGitHubDispatchPublisher {
  publish(input: {
    event_type:
      | "bundle.created"
      | "bundle.updated"
      | "bundle.reopened"
      | "incident.spike_detected"
      | "improvement_bundle.created";
    incident_id?: string | null;
    improvement_id?: string;
    project_id: string;
    occurred_at: string;
    service_name: string;
    environment: string;
    severity: "low" | "medium" | "high" | "critical";
    bundle_type?: "failure" | "improvement";
    title?: string;
    occurrence_count?: number;
    first_seen_at?: string;
    bundle_version?: number;
  }): Promise<void>;
}

export interface GroupIncidentWorkerDependencies {
  deferImprovement?: (
    input: Omit<
      Parameters<
        typeof import("./improvement-bundles.js").maybeGenerateHostedIncidentImprovementBundle
      >[0],
      "dependencies"
    >
  ) => Promise<void>;
  queue: WorkerQueue;
  alertEvaluationQueue?: Pick<WorkerQueue, "enqueue">;
  logger?: Pick<RuntimeLogger, "warn">;
  incidentStore: Pick<
    MetadataStore,
    "upsertIncident" | "insertIncidentEvent" | "markIncidentSpiking"
  > &
    Partial<Pick<MetadataStore, "recordIncidentEventRetention">>;
  frequencyCounter: IncidentFrequencyCounter;
  lifecycleWebhookPublisher: IncidentLifecycleWebhookPublisher;
  githubDispatchPublisher?: IncidentLifecycleGitHubDispatchPublisher;
  objectStore?: Pick<ObjectStoreClient, "deleteObject">;
  improvementBundleWorker?: ImprovementBundleWorkerDependencies;
  analyticsCorrelationStore?: AnalyticsIncidentCorrelationRecorder;
}

export interface BuildBundleWorkerDependencies {
  queue: WorkerQueue;
  logger?: Pick<RuntimeLogger, "error">;
  env?: Record<string, string | undefined>;
  incidentStore: Pick<
    BundleBuildContextStore,
    "getBundleBuildContext" | "reserveBundleGeneration"
  > &
    Partial<
      Pick<
        BundleBuildContextStore,
        | "listIncidentEventReferences"
        | "getDeploymentForServiceAt"
        | "listProbeEventCandidatesForServiceWindow"
        | "listLogEventCandidatesForServiceWindow"
        | "listRequestEventCandidatesForServiceWindow"
        | "hasBundleGenerationForSourceEvent"
        | "markBundleGenerationFailure"
        | "pruneRetainedBundleOwnersForProject"
      >
    >;
  objectStore: ObjectStoreClient & Partial<ObjectStoreReader>;
  billingStore?: Pick<BillingStore, "getBillingSummaryForProject">;
  operationalEmailDeliveryStore?: Pick<
    OperationalEmailDeliveryStore,
    "queueProjectOperationalEmailDelivery"
  >;
}

export interface BuildReproductionWorkerDependencies extends WorkerAccountAnalyticsDependencies {
  queue: WorkerQueue;
  objectStore: ObjectStoreClient & ObjectStoreReader;
}

export function normalizeWorkerBaseUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed.length === 0) {
    return null;
  }

  return trimmed.replace(/\/+$/, "");
}

export function appendUrlPath(baseUrl: string, path: string): string {
  return baseUrl.endsWith(path) ? baseUrl : `${baseUrl}${path}`;
}

export function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}

export function buildAlertNotificationContext(input: {
  projectId: string;
  event: EventEnvelope;
  normalized: {
    error_type: string | null;
    normalized_message: string;
    route_template: string | null;
    browser_event_kind?: "window_error" | "resource_error" | null;
    resource_host?: string | null;
    resource_path?: string | null;
  };
  fingerprint: string;
}): { notification_key: string; coalescing_key?: string; coalescing_window_seconds?: number } {
  const browserEvent =
    input.event.event_type === "frontend_exception" ? input.event.payload.browser_event : undefined;
  const sessionId = input.event.correlation?.session_id?.trim();
  if (
    browserEvent?.kind === "resource_error" &&
    browserEvent.opaque === true &&
    typeof sessionId === "string" &&
    sessionId.length > 0
  ) {
    const pageUrl = browserEvent.page?.url;
    let pagePath = input.normalized.route_template ?? null;
    let pageOrigin: string | null = null;
    if (typeof pageUrl === "string") {
      try {
        const parsed = new URL(pageUrl);
        pagePath = parsed.pathname || "/";
        pageOrigin = parsed.origin;
      } catch {
        pagePath = pageUrl.split(/[?#]/, 1)[0] || pagePath;
      }
    }
    if (typeof pagePath !== "string" || pagePath.length === 0) {
      return buildPathSpecificAlertNotificationContext(input);
    }
    return {
      notification_key: buildPathSpecificAlertNotificationContext(input).notification_key,
      coalescing_key: createHash("sha256")
        .update(
          stableJson({
            kind: "browser_resource_page_burst",
            project_id: input.projectId,
            service_name: input.event.service.name,
            environment: input.event.service.environment,
            session_id: sessionId,
            page_path: pagePath,
            page_origin: pageOrigin,
            resource_host: input.normalized.resource_host ?? null,
            hidden_preload: describeBrowserResourceInterruption(browserEvent) !== null,
            // Capture-time buckets keep delayed worker batches from merging later visits.
            burst_window: Math.floor(Date.parse(input.event.occurred_at) / 10_000),
            browser_event_kind: browserEvent.kind
          })
        )
        .digest("hex"),
      coalescing_window_seconds: 10
    };
  }

  if (
    input.event.event_type === "frontend_exception" &&
    input.event.payload.browser_event?.opaque === true
  ) {
    return buildPathSpecificAlertNotificationContext(input);
  }

  return { notification_key: input.fingerprint };
}

function buildPathSpecificAlertNotificationContext(input: {
  event: EventEnvelope;
  normalized: {
    error_type: string | null;
    normalized_message: string;
    browser_event_kind?: string | null;
    resource_host?: string | null;
    resource_path?: string | null;
  };
}): { notification_key: string } {
  return {
    notification_key: createHash("sha256")
      .update(
        stableJson({
          kind: "opaque_browser_alert",
          event_type: input.event.event_type,
          service_name: input.event.service.name,
          environment: input.event.service.environment,
          error_type: input.normalized.error_type,
          normalized_message: input.normalized.normalized_message,
          browser_event_kind: input.normalized.browser_event_kind ?? null,
          resource_host: input.normalized.resource_host ?? null,
          resource_path: input.normalized.resource_path ?? null
        })
      )
      .digest("hex")
  };
}

export function buildWorkerBundleLinkBaseUrls(
  env: Record<string, string | undefined>
): BundleLinkBaseUrls {
  const publicSiteBaseUrl = normalizeWorkerBaseUrl(env["PUBLIC_SITE_URL"]);
  const docsBaseUrl =
    normalizeWorkerBaseUrl(env["DEBUGBUNDLE_DOCS_URL"]) ??
    (publicSiteBaseUrl !== null ? appendUrlPath(publicSiteBaseUrl, "/docs") : null);

  return {
    api: normalizeWorkerBaseUrl(
      env["DEBUGBUNDLE_API_URL"] ?? env["API_BASE_URL"] ?? env["VITE_API_URL"]
    ),
    app: normalizeWorkerBaseUrl(env["APP_BASE_URL"]),
    docs: docsBaseUrl
  };
}

export interface LifecycleWebhookTransport {
  deliver(input: {
    delivery_id: string;
    project_id: string;
    incident_id: string | null;
    event_type: WebhookEventType;
    occurred_at: string;
    target_url: string;
    signing_secret: string;
    payload: Record<string, unknown>;
  }): Promise<void>;
}

export interface GitHubDispatchTransport {
  deliver(
    input: Pick<
      GitHubDispatchDeliveryIntent,
      "delivery_id" | "installation_id" | "repo_owner" | "repo_name" | "dispatch_payload"
    >
  ): Promise<void>;
}

export class LifecycleWebhookDeliveryError extends Error {
  responseCode: number | null;

  constructor(message: string, responseCode: number | null = null) {
    super(message);
    this.name = "LifecycleWebhookDeliveryError";
    this.responseCode = responseCode;
  }
}

export class GitHubDispatchDeliveryError extends Error {
  statusCode: number | null;
  retryAfterSeconds: number | null;

  constructor(
    message: string,
    statusCode: number | null = null,
    retryAfterSeconds: number | null = null
  ) {
    super(message);
    this.statusCode = statusCode;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export interface DeliverGitHubDispatchWorkerDependencies extends WorkerAccountAnalyticsDependencies {
  queue: WorkerQueue;
  logger?: Pick<RuntimeLogger, "warn">;
  githubStore: Pick<
    GitHubStore,
    "getGitHubDispatchDeliveryIntent" | "markGitHubDispatchDeliveryAttempt"
  >;
  githubDispatchTransport: GitHubDispatchTransport;
}

export interface RetentionCleanupRunner {
  runCleanup(input: CleanupRetentionJob): Promise<void>;
}

export interface CleanupRetentionWorkerDependencies {
  queue: {
    dequeue(jobName: "cleanup-retention"): Promise<CleanupRetentionJob | null>;
  };
  retentionCleanupRunner: RetentionCleanupRunner;
}

export async function publishGitHubDispatchIfConfigured(
  githubDispatchPublisher: IncidentLifecycleGitHubDispatchPublisher | undefined,
  input: Parameters<IncidentLifecycleGitHubDispatchPublisher["publish"]>[0]
): Promise<void> {
  if (githubDispatchPublisher === undefined) {
    return;
  }

  await githubDispatchPublisher.publish(input);
}

export interface DeliverWebhookWorkerDependencies extends WorkerAccountAnalyticsDependencies {
  queue: WorkerQueue;
  logger?: Pick<RuntimeLogger, "warn">;
  webhookDeliveryStore: Pick<WebhookDeliveryStore, "getDeliveryIntent" | "markDeliveryAttempt">;
  lifecycleWebhookTransport: LifecycleWebhookTransport;
  onWebhookDisabled?: (input: { webhook_id: string; target_url: string }) => Promise<void>;
}

export interface AlertDeliveryTransport {
  deliver(input: {
    delivery_id: string;
    alert_id: string;
    project_id: string;
    incident_id: string;
    channel: AlertRuleRecord["channel"];
    config: Record<string, unknown>;
    signing_secret?: string | null;
    webhook_payload_version?: number;
    payload: Record<string, unknown>;
  }): Promise<void>;
}

export interface AlertEmailDigestTransport {
  deliver(input: {
    digest_id: string;
    project_id: string;
    recipient: string;
    total_incident_count?: number;
    items: Array<{
      incident_id: string;
      condition_type: AlertConditionType;
      condition_types?: AlertConditionType[];
      payload: Record<string, unknown>;
    }>;
  }): Promise<void>;
}

export class AlertDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AlertDeliveryError";
  }
}

export interface EvaluateAlertsWorkerDependencies extends WorkerAccountAnalyticsDependencies {
  queue: WorkerQueue;
  alertStore: AlertDeliveryStore;
  alertTransport: AlertDeliveryTransport;
  billingStore?: Pick<BillingStore, "getBillingSummaryForProject">;
  operationalEmailDeliveryStore?: Pick<
    OperationalEmailDeliveryStore,
    "queueProjectOperationalEmailDelivery"
  >;
}

export interface DeliverAlertEmailDigestWorkerDependencies extends WorkerAccountAnalyticsDependencies {
  queue: WorkerQueue;
  alertStore: Pick<AlertDeliveryStore, "getAlertEmailDigest" | "markAlertEmailDigestResult">;
  alertEmailDigestTransport: AlertEmailDigestTransport;
}

export interface GenerateWeeklyReportWorkerDependencies extends WorkerAccountAnalyticsDependencies {
  queue: {
    dequeue(jobName: "generate-weekly-report"): Promise<GenerateWeeklyReportJob | null>;
  };
  logger?: Pick<RuntimeLogger, "warn">;
  weeklyReportingStore: Pick<WeeklyReportingStore, "getWeeklyProjectReport">;
  weeklyReportChannelStore: Pick<WeeklyReportChannelStore, "getWeeklyReportChannelById">;
  weeklyReportDeliveryStore: WeeklyReportDeliveryStore;
  weeklyReportTransport: WeeklyReportTransport;
}

export interface WeeklyReportTransport {
  deliver(input: {
    delivery_id: string;
    channel: WeeklyReportChannelRecord;
    report: WeeklyProjectReportSummary;
    deliveries?: Array<{
      delivery_id: string;
      channel: WeeklyReportChannelRecord;
      report: WeeklyProjectReportSummary;
    }>;
  }): Promise<void>;
}

export interface WorkerProcessResult {
  processed: boolean;
  reason?: string;
}

export function getWorkerErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
