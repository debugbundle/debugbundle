import type { IncidentLogRecord } from "./types.js";

import type { IncidentReason } from "./incident-reason.js";

export interface IncidentContextArtifactRecord extends Record<string, unknown> {
  status: "ready" | "pending" | "failed";
  body?: unknown;
  reason?: string | null;
}

export interface IncidentContextPrimarySignalRecord extends Record<string, unknown> {
  kind: IncidentReason["kind"] | null;
  event_type: string | null;
  event_class: string | null;
  description: string;
  severity: string;
  service_name: string | null;
  environment: string;
  error_type: string | null;
  error_message: string | null;
  request_method: string | null;
  request_path: string | null;
  route_template: string | null;
  response_status: number | null;
  first_application_frame: {
    file: string | null;
    line: number | null;
    function: string | null;
  } | null;
}

export interface IncidentContextIncidentRecord extends Record<string, unknown> {
  incident_id: string;
  title: string;
  severity: string;
  status: string;
  spike_detected_at?: string | null;
  service_name: string | null;
  environment: string;
  fingerprint: string;
  fingerprint_version: string;
  matched_fields: string[];
  incident_reason?: IncidentReason;
  latest_deployment_id?: string | null;
}

export interface IncidentContextLogsRecord extends Record<string, unknown> {
  source: "retrieval" | "bundle_context" | "none";
  items: unknown[];
  next_cursor: string | null;
}

export interface IncidentContextDeployRecord extends Record<string, unknown> {
  latest_deployment_id: string | null;
  commit_sha: string | null;
  deploy_version: string | null;
  branch: string | null;
  deployed_at: string | null;
  regression_window: boolean | null;
}

export interface IncidentContextGroupingRecord extends Record<string, unknown> {
  fingerprint: string;
  fingerprint_version: string;
  matched_fields: string[];
}

export interface IncidentContextVisibilityRecord extends Record<string, unknown> {
  grouping: string;
  bundle_regeneration: string;
  spike_detection: string;
  notification_cooldown: string;
}

export interface IncidentContextRedactionRecord extends Record<string, unknown> {
  redacted: boolean;
  fields: string[];
  notes: string | null;
}

export interface IncidentContextRecord extends Record<string, unknown> {
  incident: IncidentContextIncidentRecord;
  incident_reason: IncidentReason | null;
  primary_signal: IncidentContextPrimarySignalRecord;
  bundle: IncidentContextArtifactRecord;
  reproduction: IncidentContextArtifactRecord;
  logs: IncidentContextLogsRecord;
  deploy: IncidentContextDeployRecord;
  grouping: IncidentContextGroupingRecord;
  visibility: IncidentContextVisibilityRecord;
  redaction: IncidentContextRedactionRecord | null;
  suggested_next_checks: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function buildPrimarySignal(
  incident: IncidentContextIncidentRecord,
  incidentReason: IncidentReason | null,
  bundleBody: unknown
): IncidentContextPrimarySignalRecord {
  const bundle = isRecord(bundleBody) ? bundleBody : {};
  const summary = isRecord(bundle["summary"]) ? bundle["summary"] : {};
  const signal = isRecord(bundle["signal"]) ? bundle["signal"] : {};
  const context = isRecord(bundle["context"]) ? bundle["context"] : {};
  const errorContext = isRecord(context["error"]) ? context["error"] : {};
  const requestContext = isRecord(context["request"]) ? context["request"] : {};
  const responseContext = isRecord(context["response"]) ? context["response"] : {};
  const firstApplicationFrame = isRecord(summary["first_application_frame"]) ? summary["first_application_frame"] : null;

  return {
    kind: incidentReason?.kind ?? null,
    event_type: incidentReason?.event_type ?? readString(summary["primary_signal"]),
    event_class: incidentReason?.event_class ?? null,
    description: incidentReason?.description ?? `Primary signal for incident ${incident.incident_id}`,
    severity: readString(signal["severity"]) ?? incident.severity,
    service_name: incident.service_name,
    environment: incident.environment,
    error_type: readString(summary["error_type"]) ?? readString(errorContext["name"]),
    error_message: readString(summary["error_message"]) ?? readString(errorContext["message"]),
    request_method: readString(requestContext["method"]),
    request_path: readString(requestContext["path"]),
    route_template: readString(requestContext["route_template"]),
    response_status: readNumber(responseContext["status_code"]),
    first_application_frame:
      firstApplicationFrame === null
        ? null
        : {
            file: readString(firstApplicationFrame["file"]),
            line: readNumber(firstApplicationFrame["line"]),
            function: readString(firstApplicationFrame["function"])
          }
  };
}

function buildLogsRecord(
  bundleBody: unknown,
  logsInput?: { logs: IncidentLogRecord[]; next_cursor: string | null } | null
): IncidentContextLogsRecord {
  if (logsInput !== undefined && logsInput !== null && logsInput.logs.length > 0) {
    return {
      source: "retrieval",
      items: logsInput.logs,
      next_cursor: logsInput.next_cursor
    };
  }

  const bundle = isRecord(bundleBody) ? bundleBody : {};
  const context = isRecord(bundle["context"]) ? bundle["context"] : {};
  const logsContext = isRecord(context["logs"]) ? context["logs"] : {};
  const items = Array.isArray(logsContext["items"]) ? logsContext["items"] : [];
  if (items.length > 0) {
    return {
      source: "bundle_context",
      items,
      next_cursor: null
    };
  }

  return {
    source: "none",
    items: [],
    next_cursor: logsInput?.next_cursor ?? null
  };
}

function buildDeployRecord(incident: IncidentContextIncidentRecord, bundleBody: unknown): IncidentContextDeployRecord {
  const bundle = isRecord(bundleBody) ? bundleBody : {};
  const context = isRecord(bundle["context"]) ? bundle["context"] : {};
  const deployContext = isRecord(context["deploy"]) ? context["deploy"] : {};

  return {
    latest_deployment_id: incident.latest_deployment_id ?? null,
    commit_sha: readString(deployContext["commit_sha"]),
    deploy_version: readString(deployContext["deploy_version"]),
    branch: readString(deployContext["branch"]),
    deployed_at: readString(deployContext["deployed_at"]),
    regression_window: readBoolean(deployContext["regression_window"])
  };
}

function buildRedactionRecord(bundleBody: unknown): IncidentContextRedactionRecord | null {
  const bundle = isRecord(bundleBody) ? bundleBody : {};
  const redaction = isRecord(bundle["redaction"]) ? bundle["redaction"] : null;
  if (redaction === null) {
    return null;
  }

  return {
    redacted: readBoolean(redaction["redacted"]) ?? false,
    fields: readStringArray(redaction["fields"]),
    notes: readString(redaction["notes"])
  };
}

function buildVisibilityRecord(input: {
  incident: IncidentContextIncidentRecord;
  bundle: IncidentContextArtifactRecord;
  primarySignal: IncidentContextPrimarySignalRecord;
}): IncidentContextVisibilityRecord {
  const routeTarget = input.primarySignal.route_template ?? input.primarySignal.request_path;
  const matchedFields = input.incident.matched_fields.length === 0 ? "none" : input.incident.matched_fields.join(", ");
  const grouping =
    input.primarySignal.kind === "request_failure_5xx" && input.primarySignal.request_method !== null && routeTarget !== null
      ? `Repeated 5xx request failures with the same normalized route template, request method, response status, service, and environment reuse this incident fingerprint. This incident currently groups ${input.primarySignal.request_method} ${routeTarget} with matched fields ${matchedFields}.`
      : `This incident groups repeated failures by fingerprint version ${input.incident.fingerprint_version} inside the service and environment boundary, with matched fields ${matchedFields}.`;
  const spikeLead =
    input.incident.spike_detected_at === undefined || input.incident.spike_detected_at === null
      ? "This incident is not currently marked as spiking."
      : `This incident was marked as spiking at ${input.incident.spike_detected_at}.`;

  return {
    grouping,
    bundle_regeneration: `Bundle status is ${input.bundle.status}. New incidents create a bundle immediately, while regeneration currently prioritizes regression reopen, then deploy metadata, reproduction-confidence changes, and finally new context updates.`,
    spike_detection: `${spikeLead} Spike detection is evaluated after grouping and only marks an existing incident when short-term frequency has sufficient baseline and exceeds the spike threshold.`,
    notification_cooldown: "Webhook and GitHub lifecycle notifications use per-rule cooldown windows to suppress repeated bundle.reopened or incident.spike_detected deliveries for the same incident/event fingerprint."
  };
}

function buildSuggestedNextChecks(input: {
  incident: IncidentContextIncidentRecord;
  bundle: IncidentContextArtifactRecord;
  reproduction: IncidentContextArtifactRecord;
  logs: IncidentContextLogsRecord;
  primarySignal: IncidentContextPrimarySignalRecord;
  deploy: IncidentContextDeployRecord;
}): string[] {
  const suggestions: string[] = [];

  if (input.bundle.status === "pending") {
    suggestions.push("Wait for bundle generation to finish, then rerun the incident context command.");
  } else if (input.bundle.status === "failed") {
    suggestions.push("Inspect bundle generation status or retry bundle retrieval to recover missing context.");
  }

  const routeTarget = input.primarySignal.route_template ?? input.primarySignal.request_path;
  if (
    input.primarySignal.request_method !== null &&
    input.primarySignal.response_status !== null &&
    input.primarySignal.response_status >= 500
  ) {
    suggestions.push(
      `Inspect the ${input.primarySignal.request_method} ${routeTarget ?? "request"} handler behind this 5xx path.`
    );
  }

  const firstApplicationFrame = input.primarySignal.first_application_frame;
  if (firstApplicationFrame !== null && firstApplicationFrame.file !== null) {
    const lineSuffix = firstApplicationFrame.line === null ? "" : `:${firstApplicationFrame.line}`;
    suggestions.push(
      `Start with ${firstApplicationFrame.file}${lineSuffix} from the first application frame.`
    );
  }

  if (input.deploy.regression_window === true || input.incident.status === "regressed") {
    suggestions.push("Compare this incident against the most recent deploy and recent regressions.");
  }

  if (input.reproduction.status === "pending") {
    suggestions.push("Recheck reproduction guidance after the reproduction artifact is ready.");
  }

  if (input.logs.source === "none") {
    suggestions.push("Capture or fetch related logs if the current incident context is too thin.");
  }

  return [...new Set(suggestions)].slice(0, 4);
}

export function buildIncidentContextRecord(input: {
  incident: IncidentContextIncidentRecord;
  bundle: IncidentContextArtifactRecord;
  reproduction: IncidentContextArtifactRecord;
  logs?: { logs: IncidentLogRecord[]; next_cursor: string | null } | null;
}): IncidentContextRecord {
  const bundleBody = input.bundle.status === "ready" ? input.bundle.body : undefined;
  const incidentReason = input.incident.incident_reason ?? null;
  const primarySignal = buildPrimarySignal(input.incident, incidentReason, bundleBody);
  const logs = buildLogsRecord(bundleBody, input.logs);
  const deploy = buildDeployRecord(input.incident, bundleBody);
  const visibility = buildVisibilityRecord({
    incident: input.incident,
    bundle: input.bundle,
    primarySignal
  });
  const redaction = buildRedactionRecord(bundleBody);

  return {
    incident: input.incident,
    incident_reason: incidentReason,
    primary_signal: primarySignal,
    bundle: input.bundle,
    reproduction: input.reproduction,
    logs,
    deploy,
    grouping: {
      fingerprint: input.incident.fingerprint,
      fingerprint_version: input.incident.fingerprint_version,
      matched_fields: input.incident.matched_fields
    },
    visibility,
    redaction,
    suggested_next_checks: buildSuggestedNextChecks({
      incident: input.incident,
      bundle: input.bundle,
      reproduction: input.reproduction,
      logs,
      primarySignal,
      deploy
    })
  };
}
