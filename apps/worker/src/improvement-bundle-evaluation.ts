import {
  getTierCapabilities,
  type EventClass,
  type EventEnvelope
} from "../../../packages/shared-types/src/index.js";
import type { NormalizedEvent } from "../../../packages/event-normalizer/src/index.js";
import {
  createHostedImprovementConfidence,
  createHostedImprovementSeverity,
  createHostedRequestFailureSeverity,
  createHostedSlowRequestSeverity,
  getImprovementRuleThresholds,
  isLowValueRequestFailure404
} from "./improvement-rules.js";
import { generateRecordedHostedImprovementBundle } from "./improvement-bundle-generation.js";
import { type ImprovementBundleWorkerDependencies } from "./improvement-bundle-shared.js";

export function isWarningLogEvent(
  event: EventEnvelope
): event is Extract<EventEnvelope, { event_type: "log_event" }> {
  return event.event_type === "log_event" && event.payload.level === "warning";
}

export function isRequestEvent(
  event: EventEnvelope
): event is Extract<EventEnvelope, { event_type: "request_event" }> {
  return event.event_type === "request_event";
}

export async function maybeGenerateHostedImprovementBundle(input: {
  project_id: string;
  event: EventEnvelope;
  normalized: NormalizedEvent;
  event_class: EventClass;
  dependencies: ImprovementBundleWorkerDependencies;
}): Promise<void> {
  if (input.dependencies.improvementOpportunityStore === undefined) {
    return;
  }

  const settings =
    await input.dependencies.improvementOpportunityStore.getImprovementExecutionSettings(
      input.project_id
    );
  if (settings === null) {
    return;
  }

  if (
    !getTierCapabilities(settings.plan).cloud_improvement_bundles ||
    !settings.automated_improvement_bundles_enabled
  ) {
    return;
  }

  const thresholds = getImprovementRuleThresholds(settings.improvement_bundle_sensitivity);
  let recorded: {
    opportunity_id: string;
    occurrence_count: number;
    bundle_generation_number: number;
    should_generate_bundle: boolean;
  } | null = null;

  if (isWarningLogEvent(input.event)) {
    recorded = await input.dependencies.improvementOpportunityStore.recordWarningHotspot({
      project_id: input.project_id,
      service_name: input.event.service.name,
      environment: input.event.service.environment,
      normalized_message: input.normalized.normalized_message,
      source_event_id: input.event.event_id,
      occurred_at: input.event.occurred_at,
      severity: createHostedImprovementSeverity(1),
      confidence: createHostedImprovementConfidence(1, thresholds.occurrence_threshold),
      threshold: thresholds.occurrence_threshold
    });
  } else if (isRequestEvent(input.event)) {
    if (
      input.event.payload.duration_ms >= thresholds.slow_request_duration_threshold_ms &&
      input.normalized.route_template !== null &&
      input.normalized.http_method !== null &&
      input.normalized.http_status !== null
    ) {
      recorded = await input.dependencies.improvementOpportunityStore.recordRequestPattern({
        project_id: input.project_id,
        kind: "slow_request",
        service_name: input.event.service.name,
        environment: input.event.service.environment,
        route_template: input.normalized.route_template,
        http_method: input.normalized.http_method,
        response_status: input.normalized.http_status,
        duration_ms: input.event.payload.duration_ms,
        source_event_id: input.event.event_id,
        occurred_at: input.event.occurred_at,
        severity: createHostedSlowRequestSeverity(
          input.event.payload.duration_ms,
          thresholds.slow_request_duration_threshold_ms,
          1
        ),
        confidence: createHostedImprovementConfidence(1, thresholds.occurrence_threshold),
        threshold: thresholds.occurrence_threshold,
        slow_request_duration_threshold_ms: thresholds.slow_request_duration_threshold_ms
      });
    } else if (
      input.event_class === "context_signal" &&
      input.normalized.route_template !== null &&
      input.normalized.http_method !== null &&
      input.normalized.http_status !== null &&
      input.normalized.http_status >= 400
    ) {
      if (
        !isLowValueRequestFailure404({
          httpMethod: input.normalized.http_method,
          routeTemplate: input.normalized.route_template,
          responseStatus: input.normalized.http_status
        })
      ) {
        recorded = await input.dependencies.improvementOpportunityStore.recordRequestPattern({
          project_id: input.project_id,
          kind: "request_failure_pattern",
          service_name: input.event.service.name,
          environment: input.event.service.environment,
          route_template: input.normalized.route_template,
          http_method: input.normalized.http_method,
          response_status: input.normalized.http_status,
          duration_ms: input.event.payload.duration_ms,
          source_event_id: input.event.event_id,
          occurred_at: input.event.occurred_at,
          severity: createHostedRequestFailureSeverity(input.normalized.http_status, 1),
          confidence: createHostedImprovementConfidence(1, thresholds.occurrence_threshold),
          threshold: thresholds.occurrence_threshold
        });
      }
    }
  }

  if (recorded === null || !recorded.should_generate_bundle) {
    return;
  }

  const sourceEventType =
    isWarningLogEvent(input.event) || isRequestEvent(input.event)
      ? input.event.event_type
      : undefined;
  if (input.dependencies.scheduleBuild) {
    await input.dependencies.scheduleBuild({
      project_id: input.project_id,
      opportunity_id: recorded.opportunity_id,
      event_id: input.event.event_id,
      ...(sourceEventType === undefined ? {} : { event_type: sourceEventType }),
      occurred_at: input.event.occurred_at,
      occurrence_count: recorded.occurrence_count,
      trigger: "occurrence_threshold"
    });
    return;
  }
  await generateRecordedHostedImprovementBundle({
    project_id: input.project_id,
    event_id: input.event.event_id,
    ...(sourceEventType === undefined ? {} : { event_type: sourceEventType }),
    occurred_at: input.event.occurred_at,
    recorded,
    thresholds,
    dependencies: input.dependencies
  });
}

export async function maybeGenerateHostedIncidentImprovementBundle(input: {
  project_id: string;
  incident_id: string;
  event_id: string;
  event_type: EventEnvelope["event_type"];
  service_name: string;
  environment: string;
  incident_title: string;
  incident_severity: "low" | "medium" | "high" | "critical";
  incident_occurrence_count: number;
  occurred_at: string;
  regressed_now: boolean;
  regression_deploy?: {
    deployment_id: string;
    commit_sha: string | null;
    version: string | null;
    branch: string | null;
    deployed_at: string;
    minutes_since_deploy: number;
  } | null;
  dependencies: ImprovementBundleWorkerDependencies;
}): Promise<void> {
  const store = input.dependencies.improvementOpportunityStore;
  if (store?.recordIncidentPattern === undefined) {
    return;
  }

  const settings = await store.getImprovementExecutionSettings(input.project_id);
  if (settings === null) {
    return;
  }

  if (
    !getTierCapabilities(settings.plan).cloud_improvement_bundles ||
    !settings.automated_improvement_bundles_enabled
  ) {
    return;
  }

  const thresholds = getImprovementRuleThresholds(settings.improvement_bundle_sensitivity);
  const regressionDeploy = input.regression_deploy ?? null;
  const isPostDeployRegression = input.regressed_now && regressionDeploy !== null;
  const kind = isPostDeployRegression ? "post_deploy_regression" : "recurring_incident";
  const threshold = isPostDeployRegression ? 1 : thresholds.occurrence_threshold;
  await store.recordIncidentPattern({
    project_id: input.project_id,
    kind,
    service_name: input.service_name,
    environment: input.environment,
    incident_id: input.incident_id,
    incident_title: input.incident_title,
    incident_occurrence_count: input.incident_occurrence_count,
    incident_severity: input.incident_severity,
    source_event_id: input.event_id,
    source_event_type: input.event_type,
    occurred_at: input.occurred_at,
    confidence: isPostDeployRegression
      ? 0.85
      : createHostedImprovementConfidence(
          input.incident_occurrence_count,
          thresholds.occurrence_threshold
        ),
    threshold,
    regression_deploy: regressionDeploy
  });

  // Incident-derived opportunities are prioritization metadata for agents. The
  // authoritative debugging context remains the related incident bundle, so V1
  // intentionally does not generate duplicate improvement bundle artifacts here.
}
