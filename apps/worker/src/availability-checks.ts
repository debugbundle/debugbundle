import { gzipSync } from "node:zlib";

import type { RuntimeLogger } from "../../../packages/runtime-logger/src/index.js";
import { createEventEnvelope, type EventEnvelope } from "../../../packages/shared-types/src/index.js";
import {
  buildRawEventObjectKey,
  executeAvailabilityCheck,
  type AvailabilityCheckStore,
  type ClaimedAvailabilityCheck,
  type IncidentLifecycleService,
  type MetadataStore
} from "../../../packages/storage/src/index.js";
import { captureWorkerDogfoodingCapacityWarning } from "./dogfooding.js";

type AvailabilityAlertConditionType =
  | "new_incident"
  | "severity_threshold"
  | "incident_regressed"
  | "regression_after_deploy";

type AvailabilityAlertQueue = {
  enqueue(
    jobName: "evaluate-alerts",
    payload: {
      project_id: string;
      incident_id: string;
      condition_type: AvailabilityAlertConditionType;
      dedupe_key: string;
      notification_key: string;
      occurred_at: string;
      summary: string;
      service_name: string;
      environment: string;
      severity: "low" | "medium" | "high" | "critical";
      regression_deploy?: {
        deployment_id: string;
        commit_sha: string | null;
        version: string | null;
        branch: string | null;
        deployed_at: string;
        minutes_since_deploy: number;
      } | null;
    }
  ): Promise<void>;
  enqueue(
    jobName: "build-bundle",
    payload: {
      project_id: string;
      incident_id: string;
      event_id: string;
      occurred_at: string;
      occurrence_count: number;
      trigger: "occurrence_threshold" | "regression_reopen";
    }
  ): Promise<void>;
};

type AvailabilityObjectStore = {
  putObject(input: {
    key: string;
    body: Buffer;
    contentType: string;
    contentEncoding?: string;
  }): Promise<void>;
  deleteObject?(input: { key: string }): Promise<void>;
};

type AvailabilityLifecycleWebhookPublisher = {
  publish(input: {
    event_type: "bundle.created" | "bundle.updated" | "bundle.reopened";
    incident_id: string;
    project_id: string;
    occurred_at: string;
    service_name: string;
    environment: string;
    severity: "low" | "medium" | "high" | "critical";
    bundle_type: "failure";
    is_verification: false;
    title: string;
    regression_deploy?: {
      deployment_id: string;
      commit_sha: string | null;
      version: string | null;
      branch: string | null;
      deployed_at: string;
      minutes_since_deploy: number;
    } | null;
  }): Promise<void>;
};

type AvailabilityGitHubDispatchPublisher = {
  publish?(input: {
    event_type: "bundle.created" | "bundle.updated" | "bundle.reopened";
    incident_id: string;
    project_id: string;
    occurred_at: string;
    service_name: string;
    environment: string;
    severity: "low" | "medium" | "high" | "critical";
    bundle_type: "failure";
    title: string;
    occurrence_count: number;
    first_seen_at: string;
    bundle_version: number;
  }): Promise<void>;
};

type AvailabilityIncidentStore = Pick<
  MetadataStore,
  "upsertIncident" | "insertIncidentEvent" | "recordIncidentEventRetention"
>;

export interface ProcessAvailabilityChecksInput {
  availabilityCheckStore: AvailabilityCheckStore;
  incidentStore: AvailabilityIncidentStore;
  incidentLifecycle: Pick<IncidentLifecycleService, "resolveIncidentForOrganization">;
  queue: AvailabilityAlertQueue;
  objectStore: AvailabilityObjectStore;
  lifecycleWebhookPublisher: AvailabilityLifecycleWebhookPublisher;
  githubDispatchPublisher?: AvailabilityGitHubDispatchPublisher | null;
  logger?: Pick<RuntimeLogger, "info" | "warn" | "error">;
  batchSize?: number;
  concurrency?: number;
  purgeRetainedDataOnNoDue?: boolean;
  now?: Date;
}

export interface AvailabilityCheckProcessResult {
  processed: boolean;
  reason?: "no_checks_due" | "check_missing";
  claimed_count?: number;
  completed_count?: number;
  failed_count?: number;
  oldest_due_lag_ms?: number;
  timeout_count?: number;
  avg_duration_ms?: number | null;
}

interface ClaimedCheckProcessResult {
  completed: boolean;
  reason?: "check_missing" | "check_failed";
  duration_ms?: number;
  timed_out?: boolean;
}

interface AvailabilityCapacitySummary {
  claimed_count: number;
  completed_count: number;
  failed_count: number;
  oldest_due_lag_ms: number;
  timeout_count: number;
  avg_duration_ms: number | null;
  capacity_warning: "none" | "warning" | "critical";
  saturated: boolean;
}

function getSyntheticResponseStatus(
  result: Awaited<ReturnType<typeof executeAvailabilityCheck>>
): number {
  if (result.http_status !== null) {
    return result.http_status;
  }

  return result.status === "timeout" ? 598 : 599;
}

function buildAvailabilityIncidentTitle(check: ClaimedAvailabilityCheck): string {
  return `Availability check failed: ${check.name}`;
}

function buildAvailabilityFingerprint(check: ClaimedAvailabilityCheck): string {
  return `availability_check:${check.check_id}`;
}

function buildAvailabilityServiceName(check: ClaimedAvailabilityCheck): string {
  return check.service_name ?? "availability";
}

function redactUrlForAvailabilityEvidence(url: string): string {
  const parsed = new URL(url);
  for (const key of Array.from(parsed.searchParams.keys())) {
    parsed.searchParams.set(key, "[redacted]");
  }
  parsed.hash = "";
  return parsed.toString();
}

async function enqueueAvailabilityAlert(
  queue: AvailabilityAlertQueue,
  input: {
    project_id: string;
    incident_id: string;
    condition_type: AvailabilityAlertConditionType;
    dedupe_key: string;
    notification_key: string;
    occurred_at: string;
    summary: string;
    service_name: string;
    environment: string;
    severity: "low" | "medium" | "high" | "critical";
    regression_deploy?: {
      deployment_id: string;
      commit_sha: string | null;
      version: string | null;
      branch: string | null;
      deployed_at: string;
      minutes_since_deploy: number;
    } | null;
  }
): Promise<void> {
  await queue.enqueue("evaluate-alerts", input);
}

async function publishGitHubDispatchIfConfigured(
  publisher: AvailabilityGitHubDispatchPublisher | null | undefined,
  input: Parameters<NonNullable<AvailabilityGitHubDispatchPublisher["publish"]>>[0]
): Promise<void> {
  if (publisher?.publish === undefined) {
    return;
  }

  await publisher.publish(input);
}

function buildSyntheticAvailabilityEvent(input: {
  check: ClaimedAvailabilityCheck;
  event_id: string;
  occurred_at: string;
  result: Awaited<ReturnType<typeof executeAvailabilityCheck>>;
}): EventEnvelope {
  return createEventEnvelope({
    event_id: input.event_id,
    event_type: "request_event",
    project_id: input.check.project_id,
    sdk_name: "debugbundle-availability",
    sdk_version: "1.0.0",
    service: {
      name: buildAvailabilityServiceName(input.check),
      environment: input.check.environment
    },
    occurred_at: input.occurred_at,
    correlation: {
      request_id: null,
      trace_id: null,
      session_id: null,
      user_id_hash: null
    },
    payload: {
      method: input.check.method,
      path: input.result.checked_url_path,
      query: input.result.checked_url_query,
      headers: {
        host: input.result.checked_url_host,
        "x-debugbundle-check-id": input.check.check_id,
        "x-debugbundle-check-name": input.check.name,
        "x-debugbundle-check-url": redactUrlForAvailabilityEvidence(input.check.url),
        "x-debugbundle-check-status": input.result.status,
        "x-debugbundle-check-expected-status": `${input.check.expected_status_min}-${input.check.expected_status_max}`
      },
      body: null,
      response_status: getSyntheticResponseStatus(input.result),
      duration_ms: input.result.duration_ms,
      route_template: null,
      response_headers: {
        "x-debugbundle-final-url": input.result.final_url,
        "x-debugbundle-redirect-count": String(input.result.redirect_count)
      },
      response_body:
        input.result.error_message === null
          ? null
          : {
              error_kind: input.result.error_kind,
              error_message: input.result.error_message
            }
    }
  });
}

async function persistSyntheticAvailabilityEvent(input: {
  objectStore: AvailabilityObjectStore;
  check: ClaimedAvailabilityCheck;
  event: EventEnvelope;
}): Promise<void> {
  const objectKey = buildRawEventObjectKey({
    projectId: input.check.project_id,
    eventId: input.event.event_id,
    occurredAt: new Date(input.event.occurred_at)
  });

  await input.objectStore.putObject({
    key: objectKey,
    body: gzipSync(Buffer.from(JSON.stringify(input.event), "utf8")),
    contentType: "application/json",
    contentEncoding: "gzip"
  });
}

async function recordAvailabilityIncident(input: {
  availabilityCheckStore: AvailabilityCheckStore;
  incidentStore: AvailabilityIncidentStore;
  queue: AvailabilityAlertQueue;
  objectStore: AvailabilityObjectStore;
  lifecycleWebhookPublisher: AvailabilityLifecycleWebhookPublisher;
  githubDispatchPublisher?: AvailabilityGitHubDispatchPublisher | null;
  check: ClaimedAvailabilityCheck;
  event_id: string;
  occurred_at: string;
  result: Awaited<ReturnType<typeof executeAvailabilityCheck>>;
}): Promise<void> {
  const title = buildAvailabilityIncidentTitle(input.check);
  const serviceName = buildAvailabilityServiceName(input.check);
  const fingerprint = buildAvailabilityFingerprint(input.check);
  const severity = "high" as const;

  const incident = await input.incidentStore.upsertIncident({
    event_id: input.event_id,
    event_type: "request_event",
    project_id: input.check.project_id,
    service_name: serviceName,
    environment: input.check.environment,
    fingerprint,
    fingerprint_version: "availability-v1",
    matched_fields: ["availability_check", input.check.check_id],
    title,
    severity,
    occurred_at: input.occurred_at
  });

  if (incident.duplicate_event === true) {
    await input.incidentStore.insertIncidentEvent({
      incident_id: incident.incident_id,
      event_id: input.event_id,
      event_type: "request_event",
      event_class: "incident_signal",
      occurred_at: input.occurred_at,
      is_sampled: false
    });
  } else {
    const retention = await input.incidentStore.recordIncidentEventRetention({
      incident_id: incident.incident_id,
      event_id: input.event_id,
      event_type: "request_event",
      event_class: "incident_signal",
      occurred_at: input.occurred_at,
      occurrence_count: incident.occurrence_count,
      severity,
      level: null
    });

    if (input.objectStore.deleteObject !== undefined) {
      for (const demotedEvent of retention.demoted_event_references) {
        const key = buildRawEventObjectKey({
          projectId: input.check.project_id,
          eventId: demotedEvent.event_id,
          occurredAt: new Date(demotedEvent.occurred_at)
        });
        await input.objectStore.deleteObject({ key }).catch(() => undefined);
      }
    }
  }

  await input.availabilityCheckStore.linkIncidentToCheck({
    check_id: input.check.check_id,
    incident_id: incident.incident_id,
    linked_at: input.occurred_at
  });
  await input.availabilityCheckStore.appendIncidentToDailyRollup({
    check_id: input.check.check_id,
    project_id: input.check.project_id,
    day: input.occurred_at.slice(0, 10),
    incident_id: incident.incident_id
  });

  const reachedBundleThreshold = [1, 3, 10].includes(incident.occurrence_count);
  if (reachedBundleThreshold || incident.regressed_now) {
    await input.queue.enqueue("build-bundle", {
      project_id: input.check.project_id,
      incident_id: incident.incident_id,
      event_id: input.event_id,
      occurred_at: input.occurred_at,
      occurrence_count: incident.occurrence_count,
      trigger: incident.regressed_now ? "regression_reopen" : "occurrence_threshold"
    });

    if (incident.occurrence_count === 1) {
      await input.lifecycleWebhookPublisher.publish({
        event_type: "bundle.created",
        incident_id: incident.incident_id,
        project_id: input.check.project_id,
        occurred_at: input.occurred_at,
        service_name: serviceName,
        environment: input.check.environment,
        severity,
        bundle_type: "failure",
        is_verification: false,
        title
      });
      await publishGitHubDispatchIfConfigured(input.githubDispatchPublisher, {
        event_type: "bundle.created",
        incident_id: incident.incident_id,
        project_id: input.check.project_id,
        occurred_at: input.occurred_at,
        service_name: serviceName,
        environment: input.check.environment,
        severity,
        bundle_type: "failure",
        title,
        occurrence_count: incident.occurrence_count,
        first_seen_at: input.occurred_at,
        bundle_version: incident.occurrence_count
      });
    } else if (!incident.regressed_now) {
      await input.lifecycleWebhookPublisher.publish({
        event_type: "bundle.updated",
        incident_id: incident.incident_id,
        project_id: input.check.project_id,
        occurred_at: input.occurred_at,
        service_name: serviceName,
        environment: input.check.environment,
        severity,
        bundle_type: "failure",
        is_verification: false,
        title
      });
      await publishGitHubDispatchIfConfigured(input.githubDispatchPublisher, {
        event_type: "bundle.updated",
        incident_id: incident.incident_id,
        project_id: input.check.project_id,
        occurred_at: input.occurred_at,
        service_name: serviceName,
        environment: input.check.environment,
        severity,
        bundle_type: "failure",
        title,
        occurrence_count: incident.occurrence_count,
        first_seen_at: input.occurred_at,
        bundle_version: incident.occurrence_count
      });
    }
  }

  if (incident.duplicate_event !== true) {
    if (incident.occurrence_count === 1) {
      await enqueueAvailabilityAlert(input.queue, {
        project_id: input.check.project_id,
        incident_id: incident.incident_id,
        condition_type: "new_incident",
        dedupe_key: "new_incident",
        notification_key: fingerprint,
        occurred_at: input.occurred_at,
        summary: title,
        service_name: serviceName,
        environment: input.check.environment,
        severity
      });
    }

    await enqueueAvailabilityAlert(input.queue, {
      project_id: input.check.project_id,
      incident_id: incident.incident_id,
      condition_type: "severity_threshold",
      dedupe_key: `severity_threshold:${severity}`,
      notification_key: fingerprint,
      occurred_at: input.occurred_at,
      summary: title,
      service_name: serviceName,
      environment: input.check.environment,
      severity
    });
  }

  if (incident.regressed_now && incident.duplicate_event !== true) {
    await input.lifecycleWebhookPublisher.publish({
      event_type: "bundle.reopened",
      incident_id: incident.incident_id,
      project_id: input.check.project_id,
      occurred_at: input.occurred_at,
      service_name: serviceName,
      environment: input.check.environment,
      severity,
      bundle_type: "failure",
      is_verification: false,
      title,
      regression_deploy: incident.regression_deploy ?? null
    });
    await publishGitHubDispatchIfConfigured(input.githubDispatchPublisher, {
      event_type: "bundle.reopened",
      incident_id: incident.incident_id,
      project_id: input.check.project_id,
      occurred_at: input.occurred_at,
      service_name: serviceName,
      environment: input.check.environment,
      severity,
      bundle_type: "failure",
      title,
      occurrence_count: incident.occurrence_count,
      first_seen_at: input.occurred_at,
      bundle_version: incident.occurrence_count
    });
    await enqueueAvailabilityAlert(input.queue, {
      project_id: input.check.project_id,
      incident_id: incident.incident_id,
      condition_type: "incident_regressed",
      dedupe_key: "incident_regressed",
      notification_key: fingerprint,
      occurred_at: input.occurred_at,
      summary: title,
      service_name: serviceName,
      environment: input.check.environment,
      severity,
      regression_deploy: incident.regression_deploy ?? null
    });
  }
}

async function runWithConcurrency<Item, Result>(
  items: Item[],
  concurrency: number,
  worker: (item: Item) => Promise<Result>
): Promise<Result[]> {
  const results: Result[] = [];
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      for (;;) {
        const index = nextIndex;
        nextIndex += 1;
        const item = items[index];
        if (item === undefined) {
          return;
        }

        results[index] = await worker(item);
      }
    })
  );

  return results;
}

async function processClaimedAvailabilityCheck(
  input: ProcessAvailabilityChecksInput & {
    check: ClaimedAvailabilityCheck;
  }
): Promise<ClaimedCheckProcessResult> {
  const startedAt = new Date().toISOString();
  const result = await executeAvailabilityCheck(input.check);
  const completedAt = new Date().toISOString();
  const recorded = await input.availabilityCheckStore.recordCheckExecution({
    check_id: input.check.check_id,
    claimed_at: input.check.claimed_at,
    started_at: startedAt,
    completed_at: completedAt,
    scheduled_for: input.check.due_at,
    result
  });

  if (recorded === null) {
    return { completed: false, reason: "check_missing" };
  }

  if (recorded.emit_failure_event) {
    const eventId = recorded.result.result_id;
    const event = buildSyntheticAvailabilityEvent({
      check: recorded.check,
      event_id: eventId,
      occurred_at: recorded.result.completed_at,
      result: recorded.result
    });
    await persistSyntheticAvailabilityEvent({
      objectStore: input.objectStore,
      check: recorded.check,
      event
    });
    await recordAvailabilityIncident({
      availabilityCheckStore: input.availabilityCheckStore,
      incidentStore: input.incidentStore,
      queue: input.queue,
      objectStore: input.objectStore,
      lifecycleWebhookPublisher: input.lifecycleWebhookPublisher,
      ...(input.githubDispatchPublisher === undefined
        ? {}
        : { githubDispatchPublisher: input.githubDispatchPublisher }),
      check: recorded.check,
      event_id: eventId,
      occurred_at: recorded.result.completed_at,
      result: recorded.result
    });
  }

  if (recorded.resolve_incident_id !== null) {
    await input.incidentLifecycle.resolveIncidentForOrganization({
      organization_id: recorded.check.organization_id,
      incident_id: recorded.resolve_incident_id,
      resolved_by_member_id: recorded.check.owner_user_id,
      resolved_at: recorded.result.completed_at
    });
  }

  return {
    completed: true,
    duration_ms: recorded.result.duration_ms,
    timed_out: recorded.result.status === "timeout"
  };
}

function summarizeAvailabilityCapacity(input: {
  now: Date;
  checks: ClaimedAvailabilityCheck[];
  batchSize: number;
  concurrency: number;
  results: ClaimedCheckProcessResult[];
}): AvailabilityCapacitySummary {
  const completedResults = input.results.filter((result) => result.completed);
  const durationTotal = completedResults.reduce((sum, result) => sum + (result.duration_ms ?? 0), 0);
  const oldestDueLagMs = input.checks.reduce((oldest, check) => {
    const lag = input.now.getTime() - new Date(check.due_at).getTime();
    return Math.max(oldest, Number.isFinite(lag) ? lag : 0);
  }, 0);
  const minIntervalMs = input.checks.reduce((min, check) => {
    const intervalMs = check.interval_seconds * 1000;
    return Math.min(min, intervalMs);
  }, Number.POSITIVE_INFINITY);
  const thresholdMs = Number.isFinite(minIntervalMs) ? minIntervalMs : 30_000;
  const saturated = input.checks.length >= input.batchSize;
  const capacityWarning =
    saturated && oldestDueLagMs > thresholdMs * 2
      ? "critical"
      : saturated && (oldestDueLagMs > thresholdMs || oldestDueLagMs > 5_000)
        ? "warning"
        : "none";

  return {
    claimed_count: input.checks.length,
    completed_count: completedResults.length,
    failed_count: input.results.filter((result) => result.reason === "check_failed").length,
    oldest_due_lag_ms: Math.max(0, oldestDueLagMs),
    timeout_count: input.results.filter((result) => result.timed_out === true).length,
    avg_duration_ms: completedResults.length === 0 ? null : durationTotal / completedResults.length,
    capacity_warning: capacityWarning,
    saturated
  };
}

export async function processAvailabilityCheckBatch(
  input: ProcessAvailabilityChecksInput
): Promise<AvailabilityCheckProcessResult> {
  const now = input.now ?? new Date();
  const batchSize = Math.max(1, input.batchSize ?? 1);
  const concurrency = Math.max(1, Math.min(input.concurrency ?? 1, batchSize));
  const claimInput = {
    now: now.toISOString(),
    claim_timeout_before: new Date(now.getTime() - 5 * 60_000).toISOString()
  };
  const claimed =
    "claimDueChecks" in input.availabilityCheckStore &&
    typeof input.availabilityCheckStore.claimDueChecks === "function"
      ? await input.availabilityCheckStore.claimDueChecks({
          ...claimInput,
          limit: batchSize
        })
      : await input.availabilityCheckStore.claimNextDueCheck(claimInput).then((check) =>
          check === null ? [] : [check]
        );

  if (claimed.length === 0) {
    if (input.purgeRetainedDataOnNoDue !== false) {
      await input.availabilityCheckStore.purgeExpiredResults({ now: now.toISOString() });
      await input.availabilityCheckStore.purgeExpiredDailyRollups({ now: now.toISOString() });
    }
    return { processed: false, reason: "no_checks_due" };
  }

  const results = await runWithConcurrency(claimed, concurrency, async (check) => {
    try {
      return await processClaimedAvailabilityCheck({
        ...input,
        check
      });
    } catch (error) {
      input.logger?.error(
        {
          error_message: error instanceof Error ? error.message : "availability_check_failed",
          check_id: check.check_id,
          project_id: check.project_id
        },
        "availability_check_failed"
      );
      return { completed: false, reason: "check_failed" as const };
    }
  });

  const summary = summarizeAvailabilityCapacity({
    now,
    checks: claimed,
    batchSize,
    concurrency,
    results
  });

  if (summary.claimed_count !== undefined && summary.claimed_count > 0) {
    input.logger?.info(
      {
        claimed_count: summary.claimed_count,
        completed_count: summary.completed_count,
        failed_count: summary.failed_count,
        oldest_due_lag_ms: summary.oldest_due_lag_ms,
        timeout_count: summary.timeout_count,
        avg_duration_ms: summary.avg_duration_ms,
        concurrency,
        batch_size: batchSize,
        saturated: summary.saturated
      },
      "availability_check_batch_processed"
    );
  }

  if (summary.capacity_warning !== "none") {
    input.logger?.warn(
      {
        severity: summary.capacity_warning,
        oldest_due_lag_ms: summary.oldest_due_lag_ms,
        claimed_count: summary.claimed_count,
        concurrency,
        batch_size: batchSize,
        timeout_count: summary.timeout_count,
        avg_duration_ms: summary.avg_duration_ms,
        saturated: summary.saturated
      },
      "availability_check_capacity_warning"
    );
    captureWorkerDogfoodingCapacityWarning({
      severity: summary.capacity_warning,
      oldest_due_lag_ms: summary.oldest_due_lag_ms ?? 0,
      claimed_count: summary.claimed_count ?? claimed.length,
      concurrency,
      batch_size: batchSize,
      timeout_count: summary.timeout_count ?? 0,
      avg_duration_ms: summary.avg_duration_ms ?? null,
      saturated: summary.saturated
    });
  }

  return {
    processed: true,
    ...(claimed.length === 1 && results[0]?.reason === "check_missing" ? { reason: "check_missing" as const } : {}),
    claimed_count: summary.claimed_count,
    completed_count: summary.completed_count,
    failed_count: summary.failed_count,
    oldest_due_lag_ms: summary.oldest_due_lag_ms,
    timeout_count: summary.timeout_count,
    avg_duration_ms: summary.avg_duration_ms
  };
}

export async function processNextAvailabilityCheck(
  input: ProcessAvailabilityChecksInput
): Promise<AvailabilityCheckProcessResult> {
  const result = await processAvailabilityCheckBatch({
    ...input,
    batchSize: 1,
    concurrency: 1
  });

  return result.reason === undefined
    ? { processed: result.processed }
    : { processed: result.processed, reason: result.reason };
}
