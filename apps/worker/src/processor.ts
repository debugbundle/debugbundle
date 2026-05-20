import { gunzipSync, gzipSync } from "node:zlib";

import {
  renderAllowanceLimitReachedEmail,
  renderAllowanceWarning80Email,
  renderRetentionRotationNoticeEmail,
  renderWebhookAutoDisabledEmail,
  type EmailTransport
} from "../../../packages/email/src/index.js";
import type { RuntimeLogger } from "../../../packages/runtime-logger/src/index.js";
import {
  FINGERPRINT_VERSION,
  classifyEvent,
  fingerprint,
  inferMatchedFields,
  normalizeEvent,
  validateEvent
} from "../../../packages/event-normalizer/src/index.js";
import { buildBundle, type BuildBundleInput } from "../../../packages/bundle-engine/src/index.js";
import { buildReproduction } from "../../../packages/repro-engine/src/index.js";
import type {
  AlertConditionType,
  AlertDeliveryStore,
  AlertRuleRecord,
  BillingStore,
  BuildReproductionJob,
  BundleBuildContext,
  BundleBuildContextStore,
  BuildBundleJob,
  CleanupRetentionJob,
  DeliverAlertEmailDigestJob,
  DeliverGitHubDispatchJob,
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
import {
  buildBundleRegenerationLeaseKey,
  buildBundleObjectKey,
  buildImprovementBundleObjectKey,
  buildRawEventObjectKey,
  buildReproductionObjectKey,
  getAllowanceLimitBehavior,
  getAllowanceMeterLabel,
  queueAllowanceLimitReachedNotification,
  queueAllowanceThresholdNotifications,
  queueRetentionRotationNotice
} from "../../../packages/storage/src/index.js";
import {
  BundleV1Schema,
  classifyRequestStatus,
  getRequestAnomalyThreshold,
  type BundleV1,
  type EventEnvelope
} from "../../../packages/shared-types/src/index.js";
import { evaluateRequestAnomalyCandidate } from "./request-anomaly.js";
import {
  maybeGenerateHostedImprovementBundle,
  maybeGenerateHostedIncidentImprovementBundle,
  type ImprovementBundleWorkerDependencies
} from "./improvement-bundles.js";

type BundleLinkBaseUrls = NonNullable<BuildBundleInput["linkBaseUrls"]>;

async function deletePrunedBundleArtifacts(input: {
  objectStore: Pick<Partial<ObjectStoreClient>, "deleteObject">;
  owner:
    | {
        owner_type: "incident";
        project_id: string;
        incident_id: string;
        improvement_opportunity_id: null;
      }
    | {
        owner_type: "improvement";
        project_id: string;
        incident_id: null;
        improvement_opportunity_id: string;
      };
}): Promise<void> {
  if (input.owner.owner_type === "incident") {
    await input.objectStore.deleteObject?.({
      key: buildBundleObjectKey(input.owner.project_id, input.owner.incident_id)
    });

    await input.objectStore.deleteObject?.({
      key: buildReproductionObjectKey(input.owner.project_id, input.owner.incident_id)
    });

    return;
  }

  await input.objectStore.deleteObject?.({
    key: buildImprovementBundleObjectKey(input.owner.project_id, input.owner.improvement_opportunity_id)
  });
}

export interface WorkerQueue {
  dequeue(jobName: "normalize-events"): Promise<NormalizeEventsJob | null>;
  dequeue(jobName: "group-incident"): Promise<GroupIncidentJob | null>;
  dequeue(jobName: "build-bundle"): Promise<BuildBundleJob | null>;
  dequeue(jobName: "build-reproduction"): Promise<BuildReproductionJob | null>;
  dequeue(jobName: "evaluate-alerts"): Promise<EvaluateAlertsJob | null>;
  dequeue(jobName: "deliver-alert-email-digest"): Promise<DeliverAlertEmailDigestJob | null>;
  dequeue(jobName: "generate-weekly-report"): Promise<GenerateWeeklyReportJob | null>;
  dequeue(jobName: "cleanup-retention"): Promise<CleanupRetentionJob | null>;
  enqueue(jobName: "group-incident", payload: GroupIncidentJob): Promise<void>;
  enqueue(jobName: "build-bundle", payload: BuildBundleJob): Promise<void>;
  enqueue(jobName: "build-reproduction", payload: BuildReproductionJob): Promise<void>;
  enqueue(jobName: "evaluate-alerts", payload: EvaluateAlertsJob): Promise<void>;
  enqueue(jobName: "deliver-alert-email-digest", payload: DeliverAlertEmailDigestJob): Promise<void>;
  dequeue(jobName: "deliver-webhook"): Promise<{ delivery_id: string; attempt: number } | null>;
  enqueue(jobName: "deliver-webhook", payload: { delivery_id: string; attempt: number }): Promise<void>;
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
    event_type: "bundle.created" | "bundle.updated" | "bundle.reopened" | "incident.spike_detected" | "improvement_bundle.created";
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
  queue: WorkerQueue;
  alertEvaluationQueue?: Pick<WorkerQueue, "enqueue">;
  logger?: Pick<RuntimeLogger, "warn">;
  incidentStore: Pick<MetadataStore, "upsertIncident" | "insertIncidentEvent" | "markIncidentSpiking"> &
    Partial<Pick<MetadataStore, "recordIncidentEventRetention">>;
  frequencyCounter: IncidentFrequencyCounter;
  lifecycleWebhookPublisher: IncidentLifecycleWebhookPublisher;
  githubDispatchPublisher?: IncidentLifecycleGitHubDispatchPublisher;
  objectStore?: Pick<ObjectStoreClient, "deleteObject">;
  improvementBundleWorker?: ImprovementBundleWorkerDependencies;
}

export interface BuildBundleWorkerDependencies {
  queue: WorkerQueue;
  logger?: Pick<RuntimeLogger, "error">;
  env?: Record<string, string | undefined>;
  incidentStore: Pick<BundleBuildContextStore, "getBundleBuildContext" | "reserveBundleGeneration"> &
    Partial<
      Pick<
        BundleBuildContextStore,
        | "listIncidentEventReferences"
        | "listProbeEventCandidatesForServiceWindow"
        | "listLogEventCandidatesForServiceWindow"
        | "hasBundleGenerationForSourceEvent"
        | "markBundleGenerationFailure"
        | "pruneRetainedBundleOwnersForProject"
      >
    >;
  objectStore: ObjectStoreClient & Partial<ObjectStoreReader>;
  billingStore?: Pick<BillingStore, "getBillingSummaryForProject">;
  operationalEmailDeliveryStore?: Pick<OperationalEmailDeliveryStore, "queueProjectOperationalEmailDelivery">;
}

function normalizeWorkerBaseUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed.length === 0) {
    return null;
  }

  return trimmed.replace(/\/+$/, "");
}

function appendUrlPath(baseUrl: string, path: string): string {
  return baseUrl.endsWith(path) ? baseUrl : `${baseUrl}${path}`;
}

function buildWorkerBundleLinkBaseUrls(env: Record<string, string | undefined>): BundleLinkBaseUrls {
  const publicSiteBaseUrl = normalizeWorkerBaseUrl(env["PUBLIC_SITE_URL"]);
  const docsBaseUrl = normalizeWorkerBaseUrl(env["DEBUGBUNDLE_DOCS_URL"]) ?? (publicSiteBaseUrl !== null ? appendUrlPath(publicSiteBaseUrl, "/docs") : null);

  return {
    api: normalizeWorkerBaseUrl(env["DEBUGBUNDLE_API_URL"] ?? env["API_BASE_URL"] ?? env["VITE_API_URL"]),
    app: normalizeWorkerBaseUrl(env["APP_BASE_URL"]),
    docs: docsBaseUrl
  };
}

function firstConfiguredValue(env: Record<string, string | undefined>, keys: string[]): string | null {
  for (const key of keys) {
    const value = normalizeWorkerBaseUrl(env[key]);
    if (value !== null) {
      return value;
    }
  }

  return null;
}

function buildWorkerBundleConfiguredDeploy(env: Record<string, string | undefined>): BuildBundleInput["configuredDeploy"] | undefined {
  const commitSha = firstConfiguredValue(env, ["DEBUGBUNDLE_DEPLOY_COMMIT", "DEBUGBUNDLE_GIT_COMMIT", "GITHUB_SHA", "COMMIT_SHA"]);
  const deployVersion = firstConfiguredValue(env, ["DEBUGBUNDLE_DEPLOY_VERSION", "RELEASE_VERSION", "APP_VERSION"]);
  const branch = firstConfiguredValue(env, ["DEBUGBUNDLE_DEPLOY_BRANCH", "DEBUGBUNDLE_GIT_BRANCH", "GITHUB_REF_NAME", "BRANCH"]);
  const deployedAt = firstConfiguredValue(env, ["DEBUGBUNDLE_DEPLOYED_AT", "DEPLOYED_AT"]);
  const repo = firstConfiguredValue(env, ["DEBUGBUNDLE_GIT_REPO", "GITHUB_REPOSITORY"]);

  if (commitSha === null && deployVersion === null && branch === null && deployedAt === null && repo === null) {
    return undefined;
  }

  return {
    commit_sha: commitSha,
    deploy_version: deployVersion,
    branch,
    deployed_at: deployedAt,
    repo
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
  deliver(input: Pick<GitHubDispatchDeliveryIntent, "delivery_id" | "installation_id" | "repo_owner" | "repo_name" | "dispatch_payload">): Promise<void>;
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

  constructor(message: string, statusCode: number | null = null, retryAfterSeconds: number | null = null) {
    super(message);
    this.statusCode = statusCode;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export interface DeliverGitHubDispatchWorkerDependencies {
  queue: WorkerQueue;
  logger?: Pick<RuntimeLogger, "warn">;
  githubStore: Pick<GitHubStore, "getGitHubDispatchDeliveryIntent" | "markGitHubDispatchDeliveryAttempt">;
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

async function publishGitHubDispatchIfConfigured(
  githubDispatchPublisher: IncidentLifecycleGitHubDispatchPublisher | undefined,
  input: Parameters<IncidentLifecycleGitHubDispatchPublisher["publish"]>[0]
): Promise<void> {
  if (githubDispatchPublisher === undefined) {
    return;
  }

  await githubDispatchPublisher.publish(input);
}

export interface DeliverWebhookWorkerDependencies {
  queue: WorkerQueue;
  logger?: Pick<RuntimeLogger, "warn">;
  webhookDeliveryStore: Pick<WebhookDeliveryStore, "getDeliveryIntent" | "markDeliveryAttempt">;
  lifecycleWebhookTransport: LifecycleWebhookTransport;
  onWebhookDisabled?: (input: { webhook_id: string; target_url: string }) => Promise<void>;
}

export interface BuildReproductionWorkerDependencies {
  queue: WorkerQueue;
  objectStore: ObjectStoreClient & ObjectStoreReader;
}

export interface AlertDeliveryTransport {
  deliver(input: {
    delivery_id: string;
    alert_id: string;
    project_id: string;
    incident_id: string;
    channel: AlertRuleRecord["channel"];
    config: Record<string, unknown>;
    payload: Record<string, unknown>;
  }): Promise<void>;
}

export interface AlertEmailDigestTransport {
  deliver(input: {
    digest_id: string;
    project_id: string;
    recipient: string;
    items: Array<{
      incident_id: string;
      condition_type: AlertConditionType;
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

export interface EvaluateAlertsWorkerDependencies {
  queue: WorkerQueue;
  alertStore: AlertDeliveryStore;
  alertTransport: AlertDeliveryTransport;
  billingStore?: Pick<BillingStore, "getBillingSummaryForProject">;
  operationalEmailDeliveryStore?: Pick<OperationalEmailDeliveryStore, "queueProjectOperationalEmailDelivery">;
}

export interface DeliverAlertEmailDigestWorkerDependencies {
  queue: WorkerQueue;
  alertStore: Pick<AlertDeliveryStore, "getAlertEmailDigest" | "markAlertEmailDigestResult">;
  alertEmailDigestTransport: AlertEmailDigestTransport;
}

export interface DeliverOperationalEmailWorkerDependencies {
  logger?: Pick<RuntimeLogger, "warn">;
  appBaseUrl?: string | null;
  operationalEmailDeliveryStore: Pick<
    OperationalEmailDeliveryStore,
    | "claimDueOperationalEmailDeliveries"
    | "getOperationalEmailDelivery"
    | "resolveOperationalEmailRecipientContext"
    | "markOperationalEmailDeliveryAttempt"
  >;
  emailTransport: EmailTransport;
}

export interface GenerateWeeklyReportWorkerDependencies {
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

const ALERT_EMAIL_DIGEST_WINDOW_SECONDS = 10;

type AllowanceNotificationPayload = {
  meter: string;
  used: number;
  limit: number;
  usage_window_ends_at?: string | null;
} & Record<string, unknown>;

type RetentionRotationNotificationPayload = {
  rotated_owner_count: number;
  retained_bundle_limit: number;
} & Record<string, unknown>;

type WebhookAutoDisabledNotificationPayload = {
  webhook_id: string;
  target_url: string;
} & Record<string, unknown>;

function getWorkerErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isAllowanceMeter(value: string): value is Parameters<typeof getAllowanceMeterLabel>[0] {
  return (
    value === "monthly_bundle_requests" ||
    value === "monthly_raw_ingested_events" ||
    value === "retained_bundle_cap" ||
    value === "monthly_remote_activations" ||
    value === "monthly_alert_deliveries" ||
    value === "monthly_webhook_deliveries"
  );
}

async function enqueueAlertEvaluation(
  queue: Pick<WorkerQueue, "enqueue"> | undefined,
  input: {
    project_id: string;
    incident_id: string;
    condition_type: AlertConditionType;
    dedupe_key: string;
    occurred_at: string;
    summary?: string;
    service_name: string;
    environment: string;
    severity: "low" | "medium" | "high" | "critical";
    regression_deploy?: RegressionDeployCorrelation | null;
  }
): Promise<void> {
  if (queue !== undefined) {
    await queue.enqueue("evaluate-alerts", input);
  }
}

function inferSeverity(
  event: EventEnvelope,
  capturePreset: "minimal" | "balanced" | "investigative" = "minimal",
  immediateClientErrorStatuses: readonly number[] = []
): "low" | "medium" | "high" | "critical" {
  if (
    event.event_type === "request_event"
    && classifyRequestStatus({
      responseStatus: event.payload.response_status,
      capturePreset,
      immediateClientErrorStatuses
    }) === "incident_signal"
  ) {
    return "high";
  }

  if (event.event_type === "backend_exception" || event.event_type === "frontend_exception") {
    return "high";
  }

  if (event.event_type === "error_suppressed") {
    return "medium";
  }

  return "low";
}

export async function processNextNormalizeEventsJob(
  dependencies: NormalizeWorkerDependencies
): Promise<WorkerProcessResult> {
  const job = await dependencies.queue.dequeue("normalize-events");
  if (job === null) {
    return { processed: false, reason: "no_jobs" };
  }

  const rawBody = await dependencies.objectStore.getObject({ key: job.object_key });
  const parsed = JSON.parse(gunzipSync(rawBody).toString("utf8")) as unknown;
  const validated = validateEvent(parsed);
  if (!validated.success) {
    return { processed: false, reason: "invalid_event" };
  }

  const normalized = normalizeEvent(validated.data);
  const computedFingerprint = fingerprint(normalized);
  const capturePreset = job.capture_preset ?? "minimal";
  const immediateClientErrorStatuses = job.immediate_client_error_statuses ?? [];
  const eventClass = classifyEvent(
    validated.data.event_type,
    validated.data.event_type === "log_event" ? validated.data.payload?.level : undefined,
    validated.data.event_type === "probe_event" ? validated.data.payload?.activation_id : undefined,
    validated.data.payload as Record<string, unknown>,
    capturePreset,
    immediateClientErrorStatuses
  );
  const matchedFields = inferMatchedFields(normalized);
  const severity = inferSeverity(validated.data, capturePreset, immediateClientErrorStatuses);

  const processedEvent = await dependencies.processedEventStore.upsertProcessedEvent({
    event_id: validated.data.event_id,
    project_id: job.project_id,
    event_type: validated.data.event_type,
    fingerprint: computedFingerprint,
    normalized_message: normalized.normalized_message
  });

  if (processedEvent?.inserted === false) {
    return { processed: true };
  }

  await maybeGenerateHostedImprovementBundle({
    project_id: job.project_id,
    event: validated.data,
    normalized,
    event_class: eventClass,
    dependencies: {
      objectStore: dependencies.objectStore,
      ...(dependencies.improvementBundleWorker ?? {})
    }
  });

  await dependencies.queue.enqueue("group-incident", {
    project_id: job.project_id,
    event_id: validated.data.event_id,
    event_type: validated.data.event_type,
    event_class: eventClass,
    service_name: validated.data.service.name,
    environment: validated.data.service.environment,
    fingerprint: computedFingerprint,
    fingerprint_version: FINGERPRINT_VERSION,
    normalized_message: normalized.normalized_message,
    matched_fields: matchedFields,
    occurred_at: validated.data.occurred_at,
    severity,
    ...(validated.data.event_type === "deploy_metadata"
      ? {
          deploy_metadata: {
            commit_sha: validated.data.payload.commit_sha,
            version: validated.data.payload.version,
            branch: validated.data.payload.branch,
            deployed_at: validated.data.payload.deployed_at
          }
        }
      : {})
  });

  if (
    dependencies.requestAnomalyCounter !== undefined &&
    validated.data.event_type === "request_event" &&
    eventClass === "context_signal" &&
    getRequestAnomalyThreshold({ responseStatus: normalized.http_status, capturePreset }) !== null
  ) {
    const anomalyJob = await evaluateRequestAnomalyCandidate({
      event: validated.data,
      normalized,
      project_id: job.project_id,
      capture_preset: capturePreset,
      fingerprint_version: FINGERPRINT_VERSION,
      requestAnomalyCounter: dependencies.requestAnomalyCounter
    });

    if (anomalyJob !== null) {
      await dependencies.queue.enqueue("group-incident", anomalyJob);
    }
  }

  return { processed: true };
}

export async function processNextGroupIncidentJob(
  dependencies: GroupIncidentWorkerDependencies
): Promise<WorkerProcessResult> {
  const job = await dependencies.queue.dequeue("group-incident");
  if (job === null) {
    return { processed: false, reason: "no_jobs" };
  }

  if (job.event_class !== undefined && job.event_class !== "incident_signal" && job.incident_trigger !== "request_anomaly") {
    return { processed: true, reason: "non_incident_signal" };
  }

  const incident = await dependencies.incidentStore.upsertIncident({
    event_id: job.event_id,
    event_type: job.event_type,
    project_id: job.project_id,
    service_name: job.service_name,
    environment: job.environment,
    fingerprint: job.fingerprint,
    fingerprint_version: job.fingerprint_version ?? FINGERPRINT_VERSION,
    ...(job.matched_fields !== undefined ? { matched_fields: job.matched_fields } : {}),
    title: job.normalized_message,
    severity: job.severity,
    occurred_at: job.occurred_at,
    ...(job.deploy_metadata !== undefined ? { deploy_metadata: job.deploy_metadata } : {})
  });

  if (incident.duplicate_event === true) {
    await dependencies.incidentStore.insertIncidentEvent({
      incident_id: incident.incident_id,
      event_id: job.event_id,
      event_type: job.event_type,
      event_class: job.event_class,
      occurred_at: job.occurred_at,
      is_sampled: false
    });
  } else {
    const retention =
      dependencies.incidentStore.recordIncidentEventRetention !== undefined
        ? await dependencies.incidentStore.recordIncidentEventRetention({
            incident_id: incident.incident_id,
            event_id: job.event_id,
            event_type: job.event_type,
            event_class: job.event_class,
            occurred_at: job.occurred_at,
            occurrence_count: incident.occurrence_count,
            severity: job.severity,
            level: null
          })
        : await (async () => {
            await dependencies.incidentStore.insertIncidentEvent({
              incident_id: incident.incident_id,
              event_id: job.event_id,
              event_type: job.event_type,
              event_class: job.event_class,
              occurred_at: job.occurred_at,
              is_sampled: true
            });

            return {
              is_sampled: true,
              demoted_event_references: []
            };
          })();

    if (dependencies.objectStore?.deleteObject !== undefined) {
      for (const demotedEvent of retention.demoted_event_references) {
        const key = buildRawEventObjectKey({
          projectId: job.project_id,
          eventId: demotedEvent.event_id,
          occurredAt: new Date(demotedEvent.occurred_at)
        });

        try {
          await dependencies.objectStore.deleteObject({ key });
        } catch (error) {
          dependencies.logger?.warn(
            {
              demoted_event_id: demotedEvent.event_id,
              error_message: getWorkerErrorMessage(error),
              incident_id: incident.incident_id,
              key,
              project_id: job.project_id
            },
            "worker_retention_prune_delete_failed"
          );
          // Retention pruning must never block incident processing.
        }
      }
    }
  }

  if (incident.duplicate_event !== true && dependencies.improvementBundleWorker !== undefined) {
    await maybeGenerateHostedIncidentImprovementBundle({
      project_id: job.project_id,
      incident_id: incident.incident_id,
      event_id: job.event_id,
      event_type: job.event_type,
      service_name: job.service_name,
      environment: job.environment,
      incident_title: job.normalized_message,
      incident_severity: job.severity,
      incident_occurrence_count: incident.occurrence_count,
      occurred_at: job.occurred_at,
      regressed_now: incident.regressed_now,
      regression_deploy: incident.regression_deploy ?? null,
      dependencies: dependencies.improvementBundleWorker
    });
  }

  const reachedBundleThreshold = [1, 3, 10].includes(incident.occurrence_count);
  const shouldEnqueueBundleBuild =
    incident.duplicate_event !== true &&
    (
      reachedBundleThreshold ||
      incident.regressed_now ||
      job.deploy_metadata !== undefined ||
      incident.new_context_type_added === true ||
      incident.reproduction_confidence_changed === true
    );

  if (shouldEnqueueBundleBuild) {
    const trigger: BuildBundleJob["trigger"] = incident.regressed_now
      ? "regression_reopen"
      : job.deploy_metadata !== undefined
        ? "deploy_metadata"
        : incident.reproduction_confidence_changed === true
          ? "reproduction_confidence_change"
          : incident.new_context_type_added === true
            ? "new_context_type"
        : "occurrence_threshold";

    await dependencies.queue.enqueue("build-bundle", {
      project_id: job.project_id,
      incident_id: incident.incident_id,
      event_id: job.event_id,
      occurred_at: job.occurred_at,
      occurrence_count: incident.occurrence_count,
      trigger
    });

    if (incident.occurrence_count === 1) {
      // First bundle build for this incident → emit bundle.created
      await dependencies.lifecycleWebhookPublisher.publish({
        event_type: "bundle.created",
        incident_id: incident.incident_id,
        project_id: job.project_id,
        occurred_at: job.occurred_at,
        service_name: job.service_name,
        environment: job.environment,
        severity: job.severity,
        bundle_type: "failure",
        is_verification: false,
        title: job.normalized_message
      });
      await publishGitHubDispatchIfConfigured(dependencies.githubDispatchPublisher, {
        event_type: "bundle.created",
        incident_id: incident.incident_id,
        project_id: job.project_id,
        occurred_at: job.occurred_at,
        service_name: job.service_name,
        environment: job.environment,
        severity: job.severity,
        bundle_type: "failure",
        title: job.normalized_message,
        occurrence_count: incident.occurrence_count,
        first_seen_at: job.occurred_at,
        bundle_version: incident.occurrence_count
      });
    } else if (!incident.regressed_now) {
      // Non-regression regeneration transitions emit bundle.updated
      await dependencies.lifecycleWebhookPublisher.publish({
        event_type: "bundle.updated",
        incident_id: incident.incident_id,
        project_id: job.project_id,
        occurred_at: job.occurred_at,
        service_name: job.service_name,
        environment: job.environment,
        severity: job.severity,
        bundle_type: "failure",
        is_verification: false,
        title: job.normalized_message
      });
      await publishGitHubDispatchIfConfigured(dependencies.githubDispatchPublisher, {
        event_type: "bundle.updated",
        incident_id: incident.incident_id,
        project_id: job.project_id,
        occurred_at: job.occurred_at,
        service_name: job.service_name,
        environment: job.environment,
        severity: job.severity,
        bundle_type: "failure",
        title: job.normalized_message,
        occurrence_count: incident.occurrence_count,
        first_seen_at: job.occurred_at,
        bundle_version: incident.occurrence_count
      });
    }
  }

  if (incident.duplicate_event !== true) {
    if (incident.occurrence_count === 1) {
      await enqueueAlertEvaluation(dependencies.alertEvaluationQueue, {
        project_id: job.project_id,
        incident_id: incident.incident_id,
        condition_type: "new_incident",
        dedupe_key: "new_incident",
        occurred_at: job.occurred_at,
        summary: job.normalized_message,
        service_name: job.service_name,
        environment: job.environment,
        severity: job.severity
      });
    }

    await enqueueAlertEvaluation(dependencies.alertEvaluationQueue, {
      project_id: job.project_id,
      incident_id: incident.incident_id,
      condition_type: "severity_threshold",
      dedupe_key: `severity_threshold:${job.severity}`,
      occurred_at: job.occurred_at,
      summary: job.normalized_message,
      service_name: job.service_name,
      environment: job.environment,
      severity: job.severity
    });

    if (incident.regressed_now) {
      await enqueueAlertEvaluation(dependencies.alertEvaluationQueue, {
        project_id: job.project_id,
        incident_id: incident.incident_id,
        condition_type: "incident_regressed",
        dedupe_key: "incident_regressed",
        occurred_at: job.occurred_at,
        summary: job.normalized_message,
        service_name: job.service_name,
        environment: job.environment,
        severity: job.severity,
        regression_deploy: incident.regression_deploy ?? null
      });

      if (incident.regression_deploy !== undefined && incident.regression_deploy !== null) {
        await enqueueAlertEvaluation(dependencies.alertEvaluationQueue, {
          project_id: job.project_id,
          incident_id: incident.incident_id,
          condition_type: "regression_after_deploy",
          dedupe_key: "regression_after_deploy",
          occurred_at: job.occurred_at,
          summary: job.normalized_message,
          service_name: job.service_name,
          environment: job.environment,
          severity: job.severity,
          regression_deploy: incident.regression_deploy
        });
      }
    }
  }

  if (incident.regressed_now && incident.duplicate_event !== true) {
    await dependencies.lifecycleWebhookPublisher.publish({
      event_type: "bundle.reopened",
      incident_id: incident.incident_id,
      project_id: job.project_id,
      occurred_at: job.occurred_at,
      service_name: job.service_name,
      environment: job.environment,
      severity: job.severity,
      bundle_type: "failure",
      is_verification: false,
      title: job.normalized_message,
      regression_deploy: incident.regression_deploy ?? null
    });
    await publishGitHubDispatchIfConfigured(dependencies.githubDispatchPublisher, {
      event_type: "bundle.reopened",
      incident_id: incident.incident_id,
      project_id: job.project_id,
      occurred_at: job.occurred_at,
      service_name: job.service_name,
      environment: job.environment,
      severity: job.severity,
      bundle_type: "failure",
      title: job.normalized_message,
      occurrence_count: incident.occurrence_count,
      first_seen_at: job.occurred_at,
      bundle_version: incident.occurrence_count
    });
  }

  if (incident.duplicate_event !== true && job.incident_trigger !== "request_anomaly") {
    const frequency = await dependencies.frequencyCounter.recordOccurrence({
      incident_id: incident.incident_id,
      event_id: job.event_id,
      occurred_at: job.occurred_at
    });

    if (frequency.has_sufficient_baseline && frequency.is_spiking) {
      const marked = await dependencies.incidentStore.markIncidentSpiking({
        incident_id: incident.incident_id,
        detected_at: job.occurred_at
      });

      if (marked) {
        await enqueueAlertEvaluation(dependencies.alertEvaluationQueue, {
          project_id: job.project_id,
          incident_id: incident.incident_id,
          condition_type: "error_spike",
          dedupe_key: "error_spike",
          occurred_at: job.occurred_at,
          summary: job.normalized_message,
          service_name: job.service_name,
          environment: job.environment,
          severity: job.severity
        });

        await dependencies.lifecycleWebhookPublisher.publish({
          event_type: "incident.spike_detected",
          incident_id: incident.incident_id,
          project_id: job.project_id,
          occurred_at: job.occurred_at,
          service_name: job.service_name,
          environment: job.environment,
          severity: job.severity,
          bundle_type: "failure",
          is_verification: false,
          title: job.normalized_message
        });
        await publishGitHubDispatchIfConfigured(dependencies.githubDispatchPublisher, {
          event_type: "incident.spike_detected",
          incident_id: incident.incident_id,
          project_id: job.project_id,
          occurred_at: job.occurred_at,
          service_name: job.service_name,
          environment: job.environment,
          severity: job.severity,
          bundle_type: "failure",
          title: job.normalized_message,
          occurrence_count: incident.occurrence_count,
          first_seen_at: job.occurred_at,
          bundle_version: incident.occurrence_count
        });
      }
    }
  }

  return { processed: true };
}

export async function processNextEvaluateAlertsJob(
  dependencies: EvaluateAlertsWorkerDependencies
): Promise<WorkerProcessResult> {
  const job = await dependencies.queue.dequeue("evaluate-alerts");
  if (job === null) {
    return { processed: false, reason: "no_jobs" };
  }

  const alerts = await dependencies.alertStore.listMatchingAlerts({
    project_id: job.project_id,
    condition_type: job.condition_type,
    service_name: job.service_name,
    environment: job.environment,
    severity: job.severity
  });

  let remainingAlertDeliveries: number | null = null;
  let alertAllowanceUsed: number | null = null;
  let alertAllowanceLimit: number | null = null;
  let alertUsageWindowStartsAt: string | null = null;
  let alertUsageWindowEndsAt: string | null = null;
  if (dependencies.billingStore !== undefined) {
    const billingSummary = await dependencies.billingStore.getBillingSummaryForProject({
      project_id: job.project_id,
      now: new Date().toISOString()
    });
    const allowance = billingSummary?.allowances.monthly_alert_deliveries;
    if (billingSummary !== null && allowance !== undefined) {
      remainingAlertDeliveries = Math.max(0, allowance.limit - allowance.used);
      alertAllowanceUsed = allowance.used;
      alertAllowanceLimit = allowance.limit;
      alertUsageWindowStartsAt = billingSummary.usage_window.starts_at;
      alertUsageWindowEndsAt = billingSummary.usage_window.ends_at;
    }
  }

  for (const alert of alerts) {
    const payload: Record<string, unknown> = {
      alert_id: alert.alert_id,
      condition_type: job.condition_type,
      incident_id: job.incident_id,
      project_id: job.project_id,
      occurred_at: job.occurred_at,
      summary: job.summary ?? null,
      service_name: job.service_name,
      environment: job.environment,
      severity: job.severity,
      regression_after_deploy: job.regression_deploy !== undefined && job.regression_deploy !== null,
      deploy_version: job.regression_deploy?.version ?? null,
      deploy_commit_sha: job.regression_deploy?.commit_sha ?? null,
      deploy_branch: job.regression_deploy?.branch ?? null,
      deploy_deployed_at: job.regression_deploy?.deployed_at ?? null,
      minutes_since_deploy: job.regression_deploy?.minutes_since_deploy ?? null
    };

    if (alert.channel === "email") {
      const toField = alert.config["to"];
      const recipient = typeof toField === "string" ? toField.trim().toLowerCase() : "";
      if (recipient.length === 0) {
        continue;
      }

      const queued = await dependencies.alertStore.queueAlertEmailDigestItem({
        alert_id: alert.alert_id,
        project_id: job.project_id,
        incident_id: job.incident_id,
        condition_type: job.condition_type,
        dedupe_key: job.dedupe_key,
        recipient,
        payload,
        aggregation_window_seconds: ALERT_EMAIL_DIGEST_WINDOW_SECONDS,
        allow_new_digest: remainingAlertDeliveries === null || remainingAlertDeliveries > 0
      });

      if (queued.created && queued.created_digest && remainingAlertDeliveries !== null) {
        const previousUsed = alertAllowanceUsed ?? 0;
        remainingAlertDeliveries -= 1;
        alertAllowanceUsed = previousUsed + 1;
        if (
          dependencies.operationalEmailDeliveryStore !== undefined &&
          alertAllowanceLimit !== null
        ) {
          await queueAllowanceThresholdNotifications({
            store: dependencies.operationalEmailDeliveryStore,
            project_id: job.project_id,
            meter: "monthly_alert_deliveries",
            previous_used: previousUsed,
            next_used: alertAllowanceUsed,
            limit: alertAllowanceLimit,
            usage_window_starts_at: alertUsageWindowStartsAt,
            usage_window_ends_at: alertUsageWindowEndsAt
          });
        }
      } else if (
        queued.created === false &&
        queued.digest_id === null &&
        dependencies.operationalEmailDeliveryStore !== undefined &&
        alertAllowanceLimit !== null &&
        remainingAlertDeliveries !== null &&
        remainingAlertDeliveries <= 0
      ) {
        await queueAllowanceLimitReachedNotification({
          store: dependencies.operationalEmailDeliveryStore,
          project_id: job.project_id,
          meter: "monthly_alert_deliveries",
          used: alertAllowanceUsed ?? alertAllowanceLimit,
          limit: alertAllowanceLimit,
          usage_window_starts_at: alertUsageWindowStartsAt,
          usage_window_ends_at: alertUsageWindowEndsAt
        });
      }
      continue;
    }

    if (remainingAlertDeliveries !== null && remainingAlertDeliveries <= 0) {
      if (
        dependencies.operationalEmailDeliveryStore !== undefined &&
        alertAllowanceLimit !== null
      ) {
        await queueAllowanceLimitReachedNotification({
          store: dependencies.operationalEmailDeliveryStore,
          project_id: job.project_id,
          meter: "monthly_alert_deliveries",
          used: alertAllowanceUsed ?? alertAllowanceLimit,
          limit: alertAllowanceLimit,
          usage_window_starts_at: alertUsageWindowStartsAt,
          usage_window_ends_at: alertUsageWindowEndsAt
        });
      }
      continue;
    }

    const intent = await dependencies.alertStore.createAlertDeliveryIntent({
      alert_id: alert.alert_id,
      project_id: job.project_id,
      incident_id: job.incident_id,
      condition_type: job.condition_type,
      dedupe_key: job.dedupe_key,
      channel: alert.channel,
      payload
    });

    if (!intent.created || intent.delivery_id === null) {
      continue;
    }

    if (remainingAlertDeliveries !== null) {
      const previousUsed = alertAllowanceUsed ?? 0;
      remainingAlertDeliveries -= 1;
      alertAllowanceUsed = previousUsed + 1;
      if (
        dependencies.operationalEmailDeliveryStore !== undefined &&
        alertAllowanceLimit !== null
      ) {
        await queueAllowanceThresholdNotifications({
          store: dependencies.operationalEmailDeliveryStore,
          project_id: job.project_id,
          meter: "monthly_alert_deliveries",
          previous_used: previousUsed,
          next_used: alertAllowanceUsed,
          limit: alertAllowanceLimit,
          usage_window_starts_at: alertUsageWindowStartsAt,
          usage_window_ends_at: alertUsageWindowEndsAt
        });
      }
    }

    try {
      await dependencies.alertTransport.deliver({
        delivery_id: intent.delivery_id,
        alert_id: alert.alert_id,
        project_id: job.project_id,
        incident_id: job.incident_id,
        channel: alert.channel,
        config: alert.config,
        payload
      });

      await dependencies.alertStore.markAlertDeliveryResult({
        delivery_id: intent.delivery_id,
        delivered: true,
        error_message: null
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await dependencies.alertStore.markAlertDeliveryResult({
        delivery_id: intent.delivery_id,
        delivered: false,
        error_message: message
      });
    }
  }

  return { processed: true };
}

export async function processNextDeliverAlertEmailDigestJob(
  dependencies: DeliverAlertEmailDigestWorkerDependencies
): Promise<WorkerProcessResult> {
  const job = await dependencies.queue.dequeue("deliver-alert-email-digest");
  if (job === null) {
    return { processed: false, reason: "no_jobs" };
  }

  const digest = await dependencies.alertStore.getAlertEmailDigest(job.digest_id);
  if (digest === null || digest.digest.status !== "pending") {
    return { processed: true };
  }

  if (digest.items.length === 0) {
    await dependencies.alertStore.markAlertEmailDigestResult({
      digest_id: digest.digest.digest_id,
      delivered: false,
      error_message: "alert_email_digest_empty"
    });
    return { processed: true };
  }

  try {
    await dependencies.alertEmailDigestTransport.deliver({
      digest_id: digest.digest.digest_id,
      project_id: digest.digest.project_id,
      recipient: digest.digest.recipient,
      items: digest.items.map((item) => ({
        incident_id: item.incident_id,
        condition_type: item.condition_type,
        payload: item.payload
      }))
    });

    await dependencies.alertStore.markAlertEmailDigestResult({
      digest_id: digest.digest.digest_id,
      delivered: true,
      error_message: null
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await dependencies.alertStore.markAlertEmailDigestResult({
      digest_id: digest.digest.digest_id,
      delivered: false,
      error_message: message
    });
  }

  return { processed: true };
}

export async function processNextDeliverOperationalEmailJob(
  dependencies: DeliverOperationalEmailWorkerDependencies
): Promise<WorkerProcessResult> {
  const claimed = await dependencies.operationalEmailDeliveryStore.claimDueOperationalEmailDeliveries(1);
  const next = claimed[0];
  if (next === undefined) {
    return { processed: false, reason: "no_jobs" };
  }

  const delivery = await dependencies.operationalEmailDeliveryStore.getOperationalEmailDelivery({
    delivery_id: next.delivery_id
  });
  if (delivery === null) {
    return { processed: true };
  }

  const recipientContext = await dependencies.operationalEmailDeliveryStore.resolveOperationalEmailRecipientContext({
    organization_id: delivery.organization_id,
    project_id: delivery.project_id
  });
  if (recipientContext === null) {
    await dependencies.operationalEmailDeliveryStore.markOperationalEmailDeliveryAttempt({
      delivery_id: delivery.delivery_id,
      attempt: next.attempt,
      delivered: false,
      error_message: "operational_email_recipient_missing"
    });
    return { processed: true };
  }

  try {
    const billingUrl = dependencies.appBaseUrl === null || dependencies.appBaseUrl === undefined
      ? undefined
      : `${dependencies.appBaseUrl}/billing`;
    const webhooksUrl = dependencies.appBaseUrl === null || dependencies.appBaseUrl === undefined
      ? undefined
      : `${dependencies.appBaseUrl}/projects/${delivery.project_id}/webhooks`;

    let rendered: ReturnType<typeof renderWebhookAutoDisabledEmail>;
    switch (delivery.kind) {
      case "webhook_auto_disabled": {
        const payload = delivery.payload as WebhookAutoDisabledNotificationPayload;
        if (typeof payload.webhook_id !== "string" || typeof payload.target_url !== "string") {
          throw new Error("operational_email_invalid_webhook_auto_disabled_payload");
        }
        rendered = renderWebhookAutoDisabledEmail({
          organizationName: recipientContext.organization_name,
          projectName: recipientContext.project_name,
          webhookId: payload.webhook_id,
          targetUrl: payload.target_url,
          ...(webhooksUrl === undefined ? {} : { webhooksUrl })
        });
        break;
      }
      case "allowance_warning_80":
      case "allowance_limit_reached": {
        const payload = delivery.payload as AllowanceNotificationPayload;
        if (
          typeof payload.meter !== "string" ||
          !isAllowanceMeter(payload.meter) ||
          typeof payload.used !== "number" ||
          typeof payload.limit !== "number"
        ) {
          throw new Error("operational_email_invalid_allowance_payload");
        }

        const input = {
          organizationName: recipientContext.organization_name,
          projectName: recipientContext.project_name,
          meterLabel: getAllowanceMeterLabel(payload.meter),
          used: payload.used,
          limit: payload.limit,
          currentBehavior: getAllowanceLimitBehavior(payload.meter)
        };
        const usageWindowEndsAt =
          typeof payload.usage_window_ends_at === "string" || payload.usage_window_ends_at === null
            ? payload.usage_window_ends_at
            : undefined;
        const allowanceInput = {
          ...input,
          ...(usageWindowEndsAt === undefined ? {} : { usageWindowEndsAt }),
          ...(billingUrl === undefined ? {} : { billingUrl })
        };

        rendered = delivery.kind === "allowance_warning_80"
          ? renderAllowanceWarning80Email(allowanceInput)
          : renderAllowanceLimitReachedEmail(allowanceInput);
        break;
      }
      case "retention_rotation_notice": {
        const payload = delivery.payload as RetentionRotationNotificationPayload;
        if (
          typeof payload.rotated_owner_count !== "number" ||
          typeof payload.retained_bundle_limit !== "number"
        ) {
          throw new Error("operational_email_invalid_retention_rotation_payload");
        }

        rendered = renderRetentionRotationNoticeEmail({
          organizationName: recipientContext.organization_name,
          projectName: recipientContext.project_name,
          rotatedOwnerCount: payload.rotated_owner_count,
          retainedBundleLimit: payload.retained_bundle_limit,
          ...(billingUrl === undefined ? {} : { billingUrl })
        });
        break;
      }
    }

    await dependencies.emailTransport.send({
      to: [recipientContext.recipient_email],
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html
    });

    await dependencies.operationalEmailDeliveryStore.markOperationalEmailDeliveryAttempt({
      delivery_id: delivery.delivery_id,
      attempt: next.attempt,
      delivered: true,
      error_message: null
    });
  } catch (error) {
    const errorMessage = getWorkerErrorMessage(error);
    dependencies.logger?.warn(
      {
        attempt: next.attempt,
        delivery_id: delivery.delivery_id,
        kind: delivery.kind,
        error_message: errorMessage,
        organization_id: delivery.organization_id,
        project_id: delivery.project_id
      },
      "worker_operational_email_delivery_failed"
    );
    await dependencies.operationalEmailDeliveryStore.markOperationalEmailDeliveryAttempt({
      delivery_id: delivery.delivery_id,
      attempt: next.attempt,
      delivered: false,
      error_message: errorMessage
    });
  }

  return { processed: true };
}

function parseEventEnvelopeFromRaw(rawBody: Buffer): EventEnvelope | null {
  try {
    const parsed = JSON.parse(gunzipSync(rawBody).toString("utf8")) as unknown;
    const validated = validateEvent(parsed);
    return validated.success ? validated.data : null;
  } catch {
    return null;
  }
}

function toIsoTimestamp(value: string): string {
  return new Date(value).toISOString();
}

type LoadedIncidentEnvelope = {
  eventId: string;
  eventType: EventEnvelope["event_type"];
  occurredAt: string;
  envelope: EventEnvelope;
};

type BundleProbeItem = { label: string; data: Record<string, unknown>; timestamp: string; activation_id: string | null };

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`).join(",")}}`;
  }

  return JSON.stringify(value);
}

function toProbeDedupKey(item: BundleProbeItem): string {
  return `${item.label}|${item.timestamp}|${item.activation_id ?? "null"}|${stableStringify(item.data)}`;
}

function collectInlineProbeItems(envelope: EventEnvelope): BundleProbeItem[] {
  if (envelope.event_type !== "backend_exception" && envelope.event_type !== "frontend_exception") {
    return [];
  }

  const probeDataBlock = envelope.payload.probe_data;
  if (probeDataBlock === undefined) {
    return [];
  }

  return probeDataBlock.items.map((item) => ({
    label: item.label,
    data: item.data,
    timestamp: toIsoTimestamp(item.timestamp),
    activation_id: item.activation_id
  }));
}

async function loadIncidentEnvelopes(input: {
  dependencies: BuildBundleWorkerDependencies;
  incidentId: string;
  projectId: string;
}): Promise<LoadedIncidentEnvelope[]> {
  if (
    input.dependencies.incidentStore.listIncidentEventReferences === undefined ||
    input.dependencies.objectStore.getObject === undefined
  ) {
    return [];
  }

  const incidentEventRefs = await input.dependencies.incidentStore.listIncidentEventReferences({
    incident_id: input.incidentId
  });

  const envelopes: LoadedIncidentEnvelope[] = [];
  for (const eventRef of incidentEventRefs) {
    const key = buildRawEventObjectKey({
      projectId: input.projectId,
      occurredAt: new Date(eventRef.occurred_at),
      eventId: eventRef.event_id
    });

    try {
      const rawBody = await input.dependencies.objectStore.getObject({ key });
      const envelope = parseEventEnvelopeFromRaw(rawBody);
      if (envelope === null) {
        continue;
      }

      envelopes.push({
        eventId: eventRef.event_id,
        eventType: eventRef.event_type,
        occurredAt: eventRef.occurred_at,
        envelope
      });
    } catch {
      // Ignore unreadable source events so bundle generation remains resilient.
    }
  }

  return envelopes;
}

async function collectProbeDataItems(input: {
  dependencies: BuildBundleWorkerDependencies;
  incident: BundleBuildContext;
  incidentEnvelopes: LoadedIncidentEnvelope[];
}): Promise<BundleProbeItem[]> {
  if (
    input.dependencies.incidentStore.listProbeEventCandidatesForServiceWindow === undefined ||
    input.dependencies.objectStore.getObject === undefined
  ) {
    return [];
  }

  const incidentTraceIds = new Set<string>();
  const items: BundleProbeItem[] = [];
  for (const incidentEnvelope of input.incidentEnvelopes) {
    items.push(...collectInlineProbeItems(incidentEnvelope.envelope));

    if (incidentEnvelope.eventType === "probe_event") {
      continue;
    }

    const traceId = incidentEnvelope.envelope.correlation?.trace_id;
    if (typeof traceId === "string" && traceId.length > 0) {
      incidentTraceIds.add(traceId);
    }
  }

  const windowStart = new Date(new Date(input.incident.first_seen_at).getTime() - 5 * 60 * 1000).toISOString();
  const windowEnd = new Date(new Date(input.incident.last_seen_at).getTime() + 5 * 60 * 1000).toISOString();

  const probeCandidates = await input.dependencies.incidentStore.listProbeEventCandidatesForServiceWindow({
    project_id: input.incident.project_id,
    service_name: input.incident.service_name,
    environment: input.incident.environment,
    window_start: windowStart,
    window_end: windowEnd
  });

  for (const candidate of probeCandidates) {
    const key = buildRawEventObjectKey({
      projectId: input.incident.project_id,
      occurredAt: new Date(candidate.occurred_at),
      eventId: candidate.event_id
    });

    try {
      const rawBody = await input.dependencies.objectStore.getObject({ key });
      const envelope = parseEventEnvelopeFromRaw(rawBody);
      if (envelope === null || envelope.event_type !== "probe_event") {
        continue;
      }

      const traceId = envelope.correlation?.trace_id;
      const shouldInclude =
        (typeof traceId === "string" && traceId.length > 0 && incidentTraceIds.has(traceId)) ||
        (traceId === null || traceId === undefined || traceId.length === 0);

      if (!shouldInclude) {
        continue;
      }

      items.push({
        label: envelope.payload.label,
        data: envelope.payload.data,
        timestamp: toIsoTimestamp(envelope.occurred_at),
        activation_id: envelope.payload.activation_id
      });
    } catch {
      // Ignore unreadable candidate objects to preserve deterministic completion.
    }
  }

  const deduped = new Map<string, BundleProbeItem>();
  for (const item of items) {
    const dedupKey = toProbeDedupKey(item);
    if (!deduped.has(dedupKey)) {
      deduped.set(dedupKey, item);
    }
  }

  return [...deduped.values()].sort((a, b) => {
    if (a.timestamp === b.timestamp) {
      return a.label.localeCompare(b.label);
    }
    return a.timestamp.localeCompare(b.timestamp);
  });
}

function addNonEmptyCorrelationValue(target: Set<string>, value: string | null | undefined): void {
  if (typeof value === "string" && value.length > 0) {
    target.add(value);
  }
}

async function collectCorrelatedLogEnvelopes(input: {
  dependencies: BuildBundleWorkerDependencies;
  incident: BundleBuildContext;
  incidentEnvelopes: LoadedIncidentEnvelope[];
}): Promise<LoadedIncidentEnvelope[]> {
  if (
    input.dependencies.incidentStore.listLogEventCandidatesForServiceWindow === undefined ||
    input.dependencies.objectStore.getObject === undefined
  ) {
    return [];
  }

  const existingEventIds = new Set(input.incidentEnvelopes.map((incidentEnvelope) => incidentEnvelope.eventId));
  const requestIds = new Set<string>();
  const traceIds = new Set<string>();
  for (const incidentEnvelope of input.incidentEnvelopes) {
    if (incidentEnvelope.envelope.event_type === "log_event") {
      continue;
    }

    addNonEmptyCorrelationValue(requestIds, incidentEnvelope.envelope.correlation?.request_id);
    addNonEmptyCorrelationValue(traceIds, incidentEnvelope.envelope.correlation?.trace_id);
  }

  if (requestIds.size === 0 && traceIds.size === 0) {
    return [];
  }

  const windowStart = new Date(new Date(input.incident.first_seen_at).getTime() - 5 * 60 * 1000).toISOString();
  const windowEnd = new Date(new Date(input.incident.last_seen_at).getTime() + 5 * 60 * 1000).toISOString();
  const candidates = await input.dependencies.incidentStore.listLogEventCandidatesForServiceWindow({
    project_id: input.incident.project_id,
    service_name: input.incident.service_name,
    environment: input.incident.environment,
    window_start: windowStart,
    window_end: windowEnd
  });

  const envelopes: LoadedIncidentEnvelope[] = [];
  for (const candidate of candidates) {
    if (existingEventIds.has(candidate.event_id)) {
      continue;
    }

    const key = buildRawEventObjectKey({
      projectId: input.incident.project_id,
      occurredAt: new Date(candidate.occurred_at),
      eventId: candidate.event_id
    });

    try {
      const rawBody = await input.dependencies.objectStore.getObject({ key });
      const envelope = parseEventEnvelopeFromRaw(rawBody);
      if (envelope === null || envelope.event_type !== "log_event") {
        continue;
      }

      const requestId = envelope.correlation?.request_id;
      const traceId = envelope.correlation?.trace_id;
      const matchesRequest = typeof requestId === "string" && requestIds.has(requestId);
      const matchesTrace = typeof traceId === "string" && traceIds.has(traceId);
      if (!matchesRequest && !matchesTrace) {
        continue;
      }

      envelopes.push({
        eventId: candidate.event_id,
        eventType: "log_event",
        occurredAt: candidate.occurred_at,
        envelope
      });
    } catch {
      // Ignore unreadable log candidates so bundle generation remains resilient.
    }
  }

  return envelopes.sort((left, right) => {
    if (left.occurredAt === right.occurredAt) {
      return left.eventId.localeCompare(right.eventId);
    }
    return left.occurredAt.localeCompare(right.occurredAt);
  });
}

export async function processNextBuildBundleJob(
  dependencies: BuildBundleWorkerDependencies
): Promise<WorkerProcessResult> {
  const job = await dependencies.queue.dequeue("build-bundle");
  if (job === null) {
    return { processed: false, reason: "no_jobs" };
  }

  try {
    const incident = await dependencies.incidentStore.getBundleBuildContext({
      project_id: job.project_id,
      incident_id: job.incident_id
    });
    if (incident === null) {
      return { processed: false, reason: "incident_missing" };
    }

    const alreadyRecorded =
      (await dependencies.incidentStore.hasBundleGenerationForSourceEvent?.({
        incident_id: job.incident_id,
        event_id: job.event_id
      })) ?? false;

    let billingSummary: Awaited<ReturnType<NonNullable<BuildBundleWorkerDependencies["billingStore"]>["getBillingSummaryForProject"]>> | null = null;

    if (!alreadyRecorded && dependencies.billingStore !== undefined) {
      billingSummary = await dependencies.billingStore.getBillingSummaryForProject({
        project_id: incident.project_id,
        now: new Date().toISOString()
      });
      const allowance = billingSummary?.allowances.monthly_bundle_requests;

      if (billingSummary !== null && allowance !== undefined && allowance.used >= allowance.limit) {
        if (dependencies.operationalEmailDeliveryStore !== undefined) {
          await queueAllowanceLimitReachedNotification({
            store: dependencies.operationalEmailDeliveryStore,
            project_id: incident.project_id,
            meter: "monthly_bundle_requests",
            used: allowance.used,
            limit: allowance.limit,
            usage_window_starts_at: billingSummary.usage_window.starts_at,
            usage_window_ends_at: billingSummary.usage_window.ends_at
          });
        }
        await dependencies.incidentStore.markBundleGenerationFailure?.({
          incident_id: incident.incident_id,
          reason: "monthly_quota_exceeded"
        });

        return { processed: true };
      }
    }

    const bundleMetadata = await dependencies.incidentStore.reserveBundleGeneration({
      incident_id: job.incident_id,
      event_id: job.event_id,
      occurred_at: job.occurred_at,
      trigger: job.trigger
    });
    const incidentEnvelopes = await loadIncidentEnvelopes({
      dependencies,
      incidentId: incident.incident_id,
      projectId: incident.project_id
    });
    const correlatedLogEnvelopes = await collectCorrelatedLogEnvelopes({
      dependencies,
      incident,
      incidentEnvelopes
    });
    const probeDataItems = await collectProbeDataItems({
      dependencies,
      incident,
      incidentEnvelopes
    });
    const workerEnv = dependencies.env ?? process.env;
    const configuredDeploy = buildWorkerBundleConfiguredDeploy(workerEnv);
    const bundle = buildBundle({
      job: {
        trigger: bundleMetadata.trigger
      },
      incident,
      linkBaseUrls: buildWorkerBundleLinkBaseUrls(workerEnv),
      ...(configuredDeploy === undefined ? {} : { configuredDeploy }),
      bundleMetadata: {
        generation_number: bundleMetadata.generation_number,
        created_at: bundleMetadata.created_at,
        updated_at: bundleMetadata.updated_at,
        source_event_id: bundleMetadata.source_event_id,
        source_occurred_at: bundleMetadata.source_occurred_at
      },
      sourceEnvelopes: [...incidentEnvelopes, ...correlatedLogEnvelopes].map((incidentEnvelope) => incidentEnvelope.envelope),
      probeDataItems: probeDataItems
    });

    const body = gzipSync(Buffer.from(JSON.stringify(bundle), "utf8"));
    const key = buildBundleObjectKey(job.project_id, job.incident_id);

    await dependencies.objectStore.putObject({
      key,
      body,
      contentType: "application/json",
      contentEncoding: "gzip"
    });

    if (!alreadyRecorded && billingSummary !== null && dependencies.operationalEmailDeliveryStore !== undefined) {
      const bundleAllowance = billingSummary.allowances.monthly_bundle_requests;
      await queueAllowanceThresholdNotifications({
        store: dependencies.operationalEmailDeliveryStore,
        project_id: incident.project_id,
        meter: "monthly_bundle_requests",
        previous_used: bundleAllowance.used,
        next_used: bundleAllowance.used + 1,
        limit: bundleAllowance.limit,
        usage_window_starts_at: billingSummary.usage_window.starts_at,
        usage_window_ends_at: billingSummary.usage_window.ends_at
      });
    }

    if (
      dependencies.billingStore !== undefined &&
      dependencies.incidentStore.pruneRetainedBundleOwnersForProject !== undefined &&
      dependencies.objectStore.deleteObject !== undefined
    ) {
      const hadPreBuildBillingSummary = billingSummary !== null;
      billingSummary ??= await dependencies.billingStore.getBillingSummaryForProject({
        project_id: incident.project_id,
        now: new Date().toISOString()
      });

      const retainedAllowance = billingSummary?.allowances.retained_bundle_cap;

      if (retainedAllowance !== undefined) {
        if (dependencies.operationalEmailDeliveryStore !== undefined) {
          const previousRetainedUsed = hadPreBuildBillingSummary
            ? retainedAllowance.used
            : Math.max(0, retainedAllowance.used - 1);
          const nextRetainedUsed = hadPreBuildBillingSummary
            ? Math.min(retainedAllowance.limit, retainedAllowance.used + 1)
            : retainedAllowance.used;
          await queueAllowanceThresholdNotifications({
            store: dependencies.operationalEmailDeliveryStore,
            project_id: incident.project_id,
            meter: "retained_bundle_cap",
            previous_used: previousRetainedUsed,
            next_used: nextRetainedUsed,
            limit: retainedAllowance.limit
          });
        }

        const prunedOwners = await dependencies.incidentStore.pruneRetainedBundleOwnersForProject({
          project_id: incident.project_id,
          retained_bundle_limit: retainedAllowance.limit
        });

        for (const prunedOwner of prunedOwners) {
          await deletePrunedBundleArtifacts({
            objectStore: dependencies.objectStore,
            owner: prunedOwner
          });
        }

        if (dependencies.operationalEmailDeliveryStore !== undefined && prunedOwners.length > 0) {
          await queueRetentionRotationNotice({
            store: dependencies.operationalEmailDeliveryStore,
            project_id: incident.project_id,
            rotated_owner_count: prunedOwners.length,
            retained_bundle_limit: retainedAllowance.limit,
            dedupe_date: new Date().toISOString().slice(0, 10)
          });
        }
      }
    }

    const reproductionJob: BuildReproductionJob = {
      project_id: job.project_id,
      incident_id: job.incident_id,
      bundle_key: key,
      bundle_version: 1,
      occurred_at: job.occurred_at
    };

    if (dependencies.queue.readJobQueue !== undefined) {
      const queued = await dependencies.queue.readJobQueue("build-reproduction");
      const serialized = JSON.stringify(reproductionJob);
      if (!queued.includes(serialized)) {
        await dependencies.queue.enqueue("build-reproduction", reproductionJob);
      }
    } else {
      await dependencies.queue.enqueue("build-reproduction", reproductionJob);
    }
  } catch (error) {
    dependencies.logger?.error(
      {
        event_id: job.event_id,
        error_message: getWorkerErrorMessage(error),
        incident_id: job.incident_id,
        project_id: job.project_id,
        trigger: job.trigger
      },
      "worker_build_bundle_failed"
    );
    await dependencies.incidentStore.markBundleGenerationFailure?.({
      incident_id: job.incident_id,
      reason: "build_error"
    });

    return { processed: true };
  } finally {
    await dependencies.queue.releaseLease?.(buildBundleRegenerationLeaseKey(job.incident_id));
  }

  return { processed: true };
}

export async function processNextBuildReproductionJob(
  dependencies: BuildReproductionWorkerDependencies
): Promise<WorkerProcessResult> {
  const job = await dependencies.queue.dequeue("build-reproduction");
  if (job === null) {
    return { processed: false, reason: "no_jobs" };
  }

  let compressedBundle: Buffer;
  try {
    compressedBundle = await dependencies.objectStore.getObject({ key: job.bundle_key });
  } catch {
    return { processed: false, reason: "bundle_missing" };
  }

  let bundle: BundleV1;
  try {
    bundle = BundleV1Schema.parse(JSON.parse(gunzipSync(compressedBundle).toString("utf8")));
  } catch {
    return { processed: false, reason: "bundle_invalid" };
  }

  const reproduction = buildReproduction(bundle);
  const body = gzipSync(Buffer.from(JSON.stringify(reproduction), "utf8"));

  await dependencies.objectStore.putObject({
    key: buildReproductionObjectKey(job.project_id, job.incident_id),
    body,
    contentType: "application/json",
    contentEncoding: "gzip"
  });

  return { processed: true };
}

export async function processNextDeliverWebhookJob(
  dependencies: DeliverWebhookWorkerDependencies
): Promise<WorkerProcessResult> {
  const job = await dependencies.queue.dequeue("deliver-webhook");
  if (job === null) {
    return { processed: false, reason: "no_jobs" };
  }

  const delivery = await dependencies.webhookDeliveryStore.getDeliveryIntent(job.delivery_id);
  if (delivery === null) {
    return { processed: false, reason: "delivery_missing" };
  }

  try {
    await dependencies.lifecycleWebhookTransport.deliver({
      delivery_id: delivery.delivery_id,
      project_id: delivery.project_id,
      incident_id: delivery.incident_id,
      event_type: delivery.event_type,
      occurred_at: delivery.occurred_at,
      target_url: delivery.target_url,
      signing_secret: delivery.signing_secret,
      payload: delivery.payload
    });

    await dependencies.webhookDeliveryStore.markDeliveryAttempt({
      delivery_id: delivery.delivery_id,
      attempt: job.attempt,
      delivered: true,
      error_message: null,
      response_code: 200
    });
    return { processed: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const responseCode = error instanceof LifecycleWebhookDeliveryError ? error.responseCode : null;
    dependencies.logger?.warn(
      {
        attempt: job.attempt,
        delivery_id: delivery.delivery_id,
        error_message: errorMessage,
        incident_id: delivery.incident_id,
        project_id: delivery.project_id,
        response_code: responseCode
      },
      "worker_webhook_delivery_failed"
    );
    const markResult = await dependencies.webhookDeliveryStore.markDeliveryAttempt({
      delivery_id: delivery.delivery_id,
      attempt: job.attempt,
      delivered: false,
      error_message: errorMessage,
      response_code: responseCode
    });

    if (markResult.webhook_disabled === true && markResult.webhook_id !== undefined && dependencies.onWebhookDisabled !== undefined) {
      try {
        await dependencies.onWebhookDisabled({ webhook_id: markResult.webhook_id, target_url: delivery.target_url });
      } catch {
        // Notification failure must not block delivery processing.
      }
    }

    return { processed: true };
  }
}

export async function processNextGenerateWeeklyReportJob(
  dependencies: GenerateWeeklyReportWorkerDependencies
): Promise<WorkerProcessResult> {
  const job = await dependencies.queue.dequeue("generate-weekly-report");
  if (job === null) {
    return { processed: false, reason: "no_jobs" };
  }

  const deliveryIds = job.delivery_ids ?? [job.delivery_id];
  const channelIds = job.weekly_report_channel_ids ?? [job.weekly_report_channel_id];
  const projectIds = job.project_ids ?? [job.project_id];
  const deliveries: Array<{
    delivery_id: string;
    channel: WeeklyReportChannelRecord;
    report: WeeklyProjectReportSummary;
  }> = [];

  for (let index = 0; index < deliveryIds.length; index += 1) {
    const deliveryId = deliveryIds[index] ?? job.delivery_id;
    const channelId = channelIds[index] ?? job.weekly_report_channel_id;
    const projectId = projectIds[index] ?? job.project_id;

    const report = await dependencies.weeklyReportingStore.getWeeklyProjectReport({
      project_id: projectId,
      window_start: job.window_start,
      window_end: job.window_end
    });

    if (report === null) {
      if (deliveryIds.length === 1) {
        return { processed: false, reason: "no_activity" };
      }

      await dependencies.weeklyReportDeliveryStore.markWeeklyReportDeliveryResult({
        delivery_id: deliveryId,
        delivered: false,
        error_message: "weekly_report_no_activity"
      });
      continue;
    }

    const channel = await dependencies.weeklyReportChannelStore.getWeeklyReportChannelById({
      channel_id: channelId
    });
    if (channel === null || channel.is_enabled === false) {
      await dependencies.weeklyReportDeliveryStore.markWeeklyReportDeliveryResult({
        delivery_id: deliveryId,
        delivered: false,
        error_message: "weekly_report_channel_not_found"
      });
      continue;
    }

    deliveries.push({
      delivery_id: deliveryId,
      channel,
      report
    });
  }

  const primaryDelivery = deliveries[0];
  if (primaryDelivery === undefined) {
    return { processed: true };
  }

  try {
    await dependencies.weeklyReportTransport.deliver({
      delivery_id: primaryDelivery.delivery_id,
      channel: primaryDelivery.channel,
      report: primaryDelivery.report,
      deliveries
    });

    for (const delivery of deliveries) {
      await dependencies.weeklyReportDeliveryStore.markWeeklyReportDeliveryResult({
        delivery_id: delivery.delivery_id,
        delivered: true,
        error_message: null
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    dependencies.logger?.warn(
      {
        channel_id: primaryDelivery.channel.channel_id,
        delivery_id: primaryDelivery.delivery_id,
        error_message: message,
        project_id: job.project_id
      },
      "worker_weekly_report_delivery_failed"
    );
    for (const delivery of deliveries) {
      await dependencies.weeklyReportDeliveryStore.markWeeklyReportDeliveryResult({
        delivery_id: delivery.delivery_id,
        delivered: false,
        error_message: message
      });
    }
  }

  return { processed: true };
}

export async function processNextCleanupRetentionJob(
  dependencies: CleanupRetentionWorkerDependencies
): Promise<WorkerProcessResult> {
  const job = await dependencies.queue.dequeue("cleanup-retention");
  if (job === null) {
    return { processed: false, reason: "no_jobs" };
  }

  await dependencies.retentionCleanupRunner.runCleanup(job);
  return { processed: true };
}

export async function processNextDeliverGitHubDispatchJob(
  dependencies: DeliverGitHubDispatchWorkerDependencies
): Promise<WorkerProcessResult> {
  const job = await dependencies.queue.dequeue("deliver-github-dispatch");
  if (job === null) {
    return { processed: false, reason: "no_jobs" };
  }

  const delivery = await dependencies.githubStore.getGitHubDispatchDeliveryIntent(job.delivery_id);
  if (delivery === null) {
    return { processed: false, reason: "delivery_missing" };
  }

  try {
    await dependencies.githubDispatchTransport.deliver({
      delivery_id: delivery.delivery_id,
      installation_id: delivery.installation_id,
      repo_owner: delivery.repo_owner,
      repo_name: delivery.repo_name,
      dispatch_payload: delivery.dispatch_payload
    });
    await dependencies.githubStore.markGitHubDispatchDeliveryAttempt({
      delivery_id: delivery.delivery_id,
      attempt: job.attempt,
      delivered: true,
      error_message: null,
      github_status_code: 204
    });
  } catch (error) {
    const dispatchError = error instanceof GitHubDispatchDeliveryError ? error : null;
    dependencies.logger?.warn(
      {
        attempt: job.attempt,
        delivery_id: delivery.delivery_id,
        error_message: error instanceof Error ? error.message : String(error),
        github_status_code: dispatchError?.statusCode ?? null,
        incident_id: delivery.incident_id,
        project_id: delivery.project_id,
        retry_after_seconds: dispatchError?.retryAfterSeconds ?? null
      },
      "worker_github_dispatch_failed"
    );
    await dependencies.githubStore.markGitHubDispatchDeliveryAttempt({
      delivery_id: delivery.delivery_id,
      attempt: job.attempt,
      delivered: false,
      error_message: error instanceof Error ? error.message : String(error),
      github_status_code: dispatchError?.statusCode ?? null,
      ...(dispatchError?.retryAfterSeconds !== null && dispatchError?.retryAfterSeconds !== undefined
        ? { retry_after_seconds: dispatchError.retryAfterSeconds }
        : {})
    });
  }

  return { processed: true };
}
