import { gunzipSync } from "node:zlib";

import { sanitizeHealthCheckUrl } from "../../../packages/mcp-core/src/index.js";

const MAX_ARTIFACT_BYTES = 524_288;

export type ArtifactKind = "bundle" | "reproduction" | "improvement_bundle";

export interface ReadArtifactResult {
  status: "ready" | "missing" | "failed" | "oversized";
  body: Record<string, unknown> | null;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function booleanOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function nestedRecord(parent: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = parent[key];
  return isRecord(value) ? value : {};
}

export function buildDashboardUrl(baseUrl: string, path: string): string {
  const base = new URL(baseUrl);
  if (base.protocol !== "https:") {
    throw new Error("openai_mcp_dashboard_origin_invalid");
  }
  return new URL(path, `${base.origin}/`).toString();
}

export function mapProject(
  record: Record<string, unknown>,
  baseUrl: string
): Record<string, unknown> {
  const projectId = stringValue(record["project_id"]);
  return {
    project_id: projectId,
    name: stringValue(record["name"]),
    color: record["color_tag"] ?? null,
    dashboard_url: buildDashboardUrl(baseUrl, `/projects/${encodeURIComponent(projectId)}`)
  };
}

export function mapService(record: Record<string, unknown>): Record<string, unknown> {
  return {
    service_id: stringValue(record["service_id"]),
    project_id: stringValue(record["project_id"]),
    name: stringValue(record["name"]),
    runtime: stringOrNull(record["runtime"]),
    framework: stringOrNull(record["framework"]),
    environment: stringValue(record["environment"])
  };
}

export function mapIncident(
  record: Record<string, unknown>,
  baseUrl: string
): Record<string, unknown> {
  const projectId = stringValue(record["project_id"]);
  const incidentId = stringValue(record["incident_id"]);
  return {
    incident_id: incidentId,
    project_id: projectId,
    service_name: stringOrNull(record["service_name"]),
    environment: stringValue(record["environment"]),
    title: stringValue(record["title"]),
    severity: record["severity"],
    status: record["status"],
    first_seen_at: stringValue(record["first_seen_at"]),
    last_seen_at: stringValue(record["last_seen_at"]),
    occurrence_count: Number(record["occurrence_count"] ?? 0),
    regressed_at: stringOrNull(record["regressed_at"]),
    dashboard_url: buildDashboardUrl(
      baseUrl,
      `/projects/${encodeURIComponent(projectId)}/incidents/${encodeURIComponent(incidentId)}`
    )
  };
}

export function mapImprovement(
  record: Record<string, unknown>,
  baseUrl: string
): Record<string, unknown> {
  const projectId = stringValue(record["project_id"]);
  const improvementId = stringValue(record["improvement_id"]);
  return {
    improvement_id: improvementId,
    project_id: projectId,
    service_name: stringValue(record["service_name"]),
    environment: stringValue(record["environment"]),
    kind: record["kind"],
    status: record["status"],
    severity: record["severity"],
    confidence: Number(record["confidence"] ?? 0),
    title: stringValue(record["title"]),
    summary: stringValue(record["summary"]),
    occurrence_count: Number(record["occurrence_count"] ?? 0),
    related_incident_ids: stringArray(record["related_incident_ids"]),
    first_detected_at: stringValue(record["first_detected_at"]),
    last_detected_at: stringValue(record["last_detected_at"]),
    dashboard_url: buildDashboardUrl(
      baseUrl,
      `/projects/${encodeURIComponent(projectId)}/improvements/${encodeURIComponent(improvementId)}`
    )
  };
}

export function mapHealthCheck(
  record: Record<string, unknown>,
  baseUrl: string
): Record<string, unknown> {
  const projectId = stringValue(record["project_id"]);
  return {
    check_id: stringValue(record["check_id"]),
    project_id: projectId,
    name: stringValue(record["name"]),
    display_url: sanitizeHealthCheckUrl(stringValue(record["url"])),
    method: record["method"],
    expected_status_min: Number(record["expected_status_min"] ?? 0),
    expected_status_max: Number(record["expected_status_max"] ?? 0),
    timeout_ms: Number(record["timeout_ms"] ?? 0),
    interval_seconds: Number(record["interval_seconds"] ?? 0),
    environment: stringValue(record["environment"]),
    service_name: stringOrNull(record["service_name"]),
    enabled: record["enabled"] === true,
    status: record["status"],
    last_checked_at: stringOrNull(record["last_checked_at"]),
    last_result_status: record["last_result_status"] ?? null,
    last_result_http_status: numberOrNull(record["last_result_http_status"]),
    last_result_duration_ms: numberOrNull(record["last_result_duration_ms"]),
    dashboard_url: buildDashboardUrl(baseUrl, `/projects/${encodeURIComponent(projectId)}/health`)
  };
}

export function mapHealthResult(record: Record<string, unknown>): Record<string, unknown> {
  return {
    result_id: stringValue(record["result_id"]),
    check_id: stringValue(record["check_id"]),
    started_at: stringValue(record["started_at"]),
    completed_at: stringValue(record["completed_at"]),
    duration_ms: Number(record["duration_ms"] ?? 0),
    status: record["status"],
    http_status: numberOrNull(record["http_status"]),
    error_kind: stringOrNull(record["error_kind"]),
    redirect_count: Number(record["redirect_count"] ?? 0),
    checked_host: stringValue(record["checked_url_host"]).toLowerCase(),
    final_display_url: sanitizeHealthCheckUrl(stringValue(record["final_url"]))
  };
}

export function mapHealthRollup(record: Record<string, unknown>): Record<string, unknown> {
  return {
    check_id: stringValue(record["check_id"]),
    day: stringValue(record["day"]),
    state: record["state"],
    total_checks: Number(record["total_checks"] ?? 0),
    successful_checks: Number(record["successful_checks"] ?? 0),
    failed_checks: Number(record["failed_checks"] ?? 0),
    degraded_checks: Number(record["degraded_checks"] ?? 0),
    avg_duration_ms: numberOrNull(record["avg_duration_ms"]),
    first_checked_at: stringOrNull(record["first_checked_at"]),
    last_checked_at: stringOrNull(record["last_checked_at"]),
    downtime_seconds: Number(record["downtime_seconds"] ?? 0),
    incident_ids: stringArray(record["incident_ids"])
  };
}

export function mapPrimarySignal(bundle: Record<string, unknown>): Record<string, unknown> {
  const summary = nestedRecord(bundle, "summary");
  const context = nestedRecord(bundle, "context");
  const request = nestedRecord(context, "request");
  const response = nestedRecord(context, "response");
  const error = nestedRecord(context, "error");
  const frame = isRecord(summary["first_application_frame"])
    ? summary["first_application_frame"]
    : null;
  return {
    description: stringValue(
      summary["description"],
      "No bounded primary-signal summary is available."
    ),
    error_type: stringOrNull(summary["error_type"]) ?? stringOrNull(error["name"]),
    error_message: stringOrNull(summary["error_message"]) ?? stringOrNull(error["message"]),
    request_method: stringOrNull(request["method"]),
    request_path: stringOrNull(request["path"]),
    route_template: stringOrNull(request["route_template"]),
    response_status: numberOrNull(response["status_code"]),
    first_application_frame:
      frame === null
        ? null
        : {
            file: stringOrNull(frame["file"]),
            line: numberOrNull(frame["line"]),
            function: stringOrNull(frame["function"])
          }
  };
}

export function mapDeploy(bundle: Record<string, unknown>): Record<string, unknown> {
  const deploy = nestedRecord(nestedRecord(bundle, "context"), "deploy");
  return {
    commit_sha: stringOrNull(deploy["commit_sha"]),
    deploy_version: stringOrNull(deploy["deploy_version"]),
    branch: stringOrNull(deploy["branch"]),
    deployed_at: stringOrNull(deploy["deployed_at"]),
    regression_window: booleanOrNull(deploy["regression_window"])
  };
}

export function mapRedaction(bundle: Record<string, unknown>): Record<string, unknown> | null {
  const value = bundle["redaction"];
  if (!isRecord(value)) {
    return null;
  }
  return {
    redacted: value["redacted"] === true,
    fields: stringArray(value["fields"]),
    notes: stringOrNull(value["notes"])
  };
}

export function mapReproduction(body: Record<string, unknown>): Record<string, unknown> {
  const artifacts = nestedRecord(body, "artifacts");
  return {
    possible: body["possible"] === true,
    confidence: Number(body["confidence"] ?? 0),
    reason: stringValue(body["reason"], "No bounded reproduction guidance is available."),
    curl: stringOrNull(body["curl"]) ?? stringOrNull(artifacts["curl"]),
    httpie: stringOrNull(body["httpie"]) ?? stringOrNull(artifacts["httpie"]),
    steps:
      stringArray(body["steps"]).length > 0
        ? stringArray(body["steps"])
        : stringArray(artifacts["steps"])
  };
}

export function parseCompressedArtifact(compressed: Buffer): ReadArtifactResult {
  if (compressed.byteLength > MAX_ARTIFACT_BYTES) {
    return { status: "oversized", body: null };
  }
  try {
    const json: unknown = JSON.parse(
      gunzipSync(compressed, { maxOutputLength: MAX_ARTIFACT_BYTES + 1 }).toString("utf8")
    );
    return isRecord(json) ? { status: "ready", body: json } : { status: "failed", body: null };
  } catch (error) {
    const code = isRecord(error) ? error["code"] : undefined;
    return code === "ERR_BUFFER_TOO_LARGE"
      ? { status: "oversized", body: null }
      : { status: "failed", body: null };
  }
}

export function artifactManifest(
  kind: ArtifactKind,
  artifact: Record<string, unknown> | null,
  omittedFields: string[]
): Record<string, unknown> {
  return {
    artifact_type: kind,
    redacted: true,
    truncated: false,
    size_bytes: artifact === null ? 0 : Buffer.byteLength(JSON.stringify(artifact), "utf8"),
    omitted_fields: omittedFields
  };
}
