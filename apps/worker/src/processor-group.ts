import { FINGERPRINT_VERSION } from "../../../packages/event-normalizer/src/index.js";
import type {
  AlertConditionType,
  BuildBundleJob,
  GroupIncidentJob,
  RegressionDeployCorrelation
} from "../../../packages/storage/src/index.js";
import {
  buildRegressionAlertDedupeKey,
  buildSeverityThresholdDedupeKey,
  buildRawEventObjectKey
} from "../../../packages/storage/src/index.js";
import { maybeGenerateHostedIncidentImprovementBundle } from "./improvement-bundles.js";
import { recordAnalyticsIncidentCorrelationBestEffort } from "./analytics-incident-correlation.js";
import {
  type WorkerQueue,
  type GroupIncidentWorkerDependencies,
  publishGitHubDispatchIfConfigured,
  type WorkerProcessResult,
  getWorkerErrorMessage
} from "./processor-shared.js";

export function humanizeEventType(eventType: GroupIncidentJob["event_type"]): string {
  return eventType
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function isMachineGeneratedIncidentTitle(
  job: Pick<GroupIncidentJob, "event_type" | "normalized_message">
): boolean {
  const normalizedMessage = job.normalized_message.trim();
  if (normalizedMessage.length === 0) {
    return true;
  }

  if (normalizedMessage.startsWith("[") || normalizedMessage.startsWith("{")) {
    return true;
  }

  return normalizedMessage === job.event_type;
}

export function deriveIncidentTitle(
  job: Pick<GroupIncidentJob, "event_type" | "normalized_message" | "incident_title">
): string {
  if (job.incident_title !== undefined) return job.incident_title;
  if (!isMachineGeneratedIncidentTitle(job)) {
    return job.normalized_message;
  }

  switch (job.event_type) {
    case "backend_exception":
      return "Backend exception";
    case "frontend_exception":
      return "Frontend exception";
    case "request_event":
      return "Request failure";
    case "log_event":
      return "Application log error";
    default:
      return humanizeEventType(job.event_type);
  }
}

export async function enqueueAlertEvaluation(
  queue: Pick<WorkerQueue, "enqueue"> | undefined,
  input: {
    project_id: string;
    incident_id: string;
    condition_type: AlertConditionType;
    dedupe_key: string;
    notification_key?: string;
    coalescing_window_seconds?: number;
    coalescing_key?: string;
    lifecycle_event?: "new_incident" | "incident_regressed";
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

export async function processNextGroupIncidentJob(
  dependencies: GroupIncidentWorkerDependencies
): Promise<WorkerProcessResult> {
  const job = await dependencies.queue.dequeue("group-incident");
  if (job === null) {
    return { processed: false, reason: "no_jobs" };
  }

  const allowsContextDrivenIncidentEnrichment =
    job.event_class === "context_signal" && job.event_type === "deploy_metadata";

  if (
    job.event_class !== undefined &&
    job.event_class !== "incident_signal" &&
    job.incident_trigger !== "request_anomaly" &&
    !allowsContextDrivenIncidentEnrichment
  ) {
    return { processed: true, reason: "non_incident_signal" };
  }

  const incidentTitle = deriveIncidentTitle(job);
  const alertCoalescing =
    job.alert_coalescing_window_seconds === undefined
      ? {}
      : { coalescing_window_seconds: job.alert_coalescing_window_seconds, ...(job.alert_coalescing_key === undefined ? {} : { coalescing_key: job.alert_coalescing_key }) };

  const incident = await dependencies.incidentStore.upsertIncident({
    event_id: job.event_id,
    event_type: job.event_type,
    project_id: job.project_id,
    service_name: job.service_name,
    environment: job.environment,
    fingerprint: job.fingerprint,
    fingerprint_version: job.fingerprint_version ?? FINGERPRINT_VERSION,
    ...(job.matched_fields !== undefined ? { matched_fields: job.matched_fields } : {}),
    title: incidentTitle,
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
      ...(job.resource_route === undefined ? {} : { resource_route: job.resource_route }),
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
            ...(job.resource_route === undefined ? {} : { resource_route: job.resource_route }),
            level: null
          })
        : await (async () => {
            await dependencies.incidentStore.insertIncidentEvent({
              incident_id: incident.incident_id,
              event_id: job.event_id,
              event_type: job.event_type,
              event_class: job.event_class,
              occurred_at: job.occurred_at,
              ...(job.resource_route === undefined ? {} : { resource_route: job.resource_route }),
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

  await recordAnalyticsIncidentCorrelationBestEffort({
    recorder: dependencies.analyticsCorrelationStore,
    logger: dependencies.logger,
    job,
    incidentId: incident.incident_id
  });

  if (
    incident.duplicate_event !== true &&
    (dependencies.improvementBundleWorker !== undefined ||
      dependencies.deferImprovement !== undefined)
  ) {
    const improvementInput = {
      project_id: job.project_id,
      incident_id: incident.incident_id,
      event_id: job.event_id,
      event_type: job.event_type,
      service_name: job.service_name,
      environment: job.environment,
      incident_title: incidentTitle,
      incident_severity: job.severity,
      incident_occurrence_count: incident.occurrence_count,
      occurred_at: job.occurred_at,
      regressed_now: incident.regressed_now,
      regression_deploy: incident.regression_deploy ?? null
    };
    if (dependencies.deferImprovement) {
      await dependencies.deferImprovement(improvementInput);
    } else if (dependencies.improvementBundleWorker) {
      await maybeGenerateHostedIncidentImprovementBundle({
        ...improvementInput,
        dependencies: dependencies.improvementBundleWorker
      });
    }
  }

  const reachedBundleThreshold = [1, 3, 10].includes(incident.occurrence_count);
  const shouldEnqueueBundleBuild =
    incident.duplicate_event !== true &&
    (reachedBundleThreshold ||
      incident.regressed_now ||
      job.deploy_metadata !== undefined ||
      incident.new_context_type_added === true ||
      incident.reproduction_confidence_changed === true);

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
        title: incidentTitle
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
        title: incidentTitle,
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
        title: incidentTitle
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
        title: incidentTitle,
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
        notification_key: job.alert_notification_key ?? job.fingerprint,
        ...alertCoalescing,
        occurred_at: job.occurred_at,
        summary: incidentTitle,
        service_name: job.service_name,
        environment: job.environment,
        severity: job.severity
      });
    }
    const severityLifecycleEvent = incident.regressed_now ? "incident_regressed" : "new_incident";
    await enqueueAlertEvaluation(dependencies.alertEvaluationQueue, {
      project_id: job.project_id,
      incident_id: incident.incident_id,
      condition_type: "severity_threshold",
      dedupe_key: buildSeverityThresholdDedupeKey({
        severity: job.severity,
        lifecycleEvent: severityLifecycleEvent,
        transitionId: job.event_id
      }),
      notification_key: job.alert_notification_key ?? job.fingerprint,
      ...alertCoalescing,
      lifecycle_event: severityLifecycleEvent,
      occurred_at: job.occurred_at,
      summary: incidentTitle,
      service_name: job.service_name,
      environment: job.environment,
      severity: job.severity
    });

    if (incident.regressed_now) {
      await enqueueAlertEvaluation(dependencies.alertEvaluationQueue, {
        project_id: job.project_id,
        incident_id: incident.incident_id,
        condition_type: "incident_regressed",
        dedupe_key: buildRegressionAlertDedupeKey({
          conditionType: "incident_regressed",
          transitionId: job.event_id
        }),
        notification_key: job.alert_notification_key ?? job.fingerprint,
        ...alertCoalescing,
        occurred_at: job.occurred_at,
        summary: incidentTitle,
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
          dedupe_key: buildRegressionAlertDedupeKey({
            conditionType: "regression_after_deploy",
            transitionId: job.event_id
          }),
          notification_key: job.alert_notification_key ?? job.fingerprint,
          ...alertCoalescing,
          occurred_at: job.occurred_at,
          summary: incidentTitle,
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
      title: incidentTitle,
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
      title: incidentTitle,
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
          notification_key: job.alert_notification_key ?? job.fingerprint,
          ...alertCoalescing,
          occurred_at: job.occurred_at,
          summary: incidentTitle,
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
          title: incidentTitle
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
          title: incidentTitle,
          occurrence_count: incident.occurrence_count,
          first_seen_at: job.occurred_at,
          bundle_version: incident.occurrence_count
        });
      }
    }
  }

  return { processed: true };
}
