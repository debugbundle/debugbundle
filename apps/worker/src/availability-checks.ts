import { gzipSync } from "node:zlib";

import { createEventEnvelope, type EventEnvelope } from "../../../packages/shared-types/src/index.js";
import {
  buildRawEventObjectKey,
  executeAvailabilityCheck,
  type AvailabilityCheckStore,
  type ClaimedAvailabilityCheck,
  type IncidentLifecycleService,
  type MetadataStore
} from "../../../packages/storage/src/index.js";

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
  now?: Date;
}

export interface AvailabilityCheckProcessResult {
  processed: boolean;
  reason?: "no_checks_due" | "check_missing";
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

export async function processNextAvailabilityCheck(
  input: ProcessAvailabilityChecksInput
): Promise<AvailabilityCheckProcessResult> {
  const now = input.now ?? new Date();
  const claimed = await input.availabilityCheckStore.claimNextDueCheck({
    now: now.toISOString(),
    claim_timeout_before: new Date(now.getTime() - 5 * 60_000).toISOString()
  });

  if (claimed === null) {
    await input.availabilityCheckStore.purgeExpiredResults({ now: now.toISOString() });
    await input.availabilityCheckStore.purgeExpiredDailyRollups({ now: now.toISOString() });
    return { processed: false, reason: "no_checks_due" };
  }

  const startedAt = new Date().toISOString();
  const result = await executeAvailabilityCheck(claimed);
  const completedAt = new Date().toISOString();
  const recorded = await input.availabilityCheckStore.recordCheckExecution({
    check_id: claimed.check_id,
    claimed_at: claimed.claimed_at,
    started_at: startedAt,
    completed_at: completedAt,
    scheduled_for: claimed.due_at,
    result
  });

  if (recorded === null) {
    return { processed: true, reason: "check_missing" };
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

  return { processed: true };
}
