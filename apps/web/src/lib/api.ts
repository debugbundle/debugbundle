export interface SessionRecord {
  session_id: string;
  user_id: string;
  email: string;
  email_verified_at: string | null;
  organization_id: string;
  organization_plan: "free" | "solo" | "team";
  role: "owner" | "member";
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  avatar_url: string | null;
  auth_methods: {
    email: boolean;
    github: boolean;
  };
  csrf_token: string;
}

export interface ImportedAccountAvatarRecord {
  source: "github" | "gravatar";
  avatar_url: string;
  updated_at: string;
}

export interface DeletedAccountRecord {
  deleted_at: string;
  organization_id: string;
  user_deleted: boolean;
}

export interface MemberTokenRecord {
  token_id: string;
  user_id: string;
  organization_id: string;
  label: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  expires_at: string | null;
}

export interface CreatedMemberToken extends MemberTokenRecord {
  plaintext?: string;
}

export interface ProjectRecord {
  project_id: string;
  organization_id: string;
  owner_user_id?: string;
  owner_email?: string;
  relationship?: "owned" | "shared";
  sharing_state?: "private" | "shared_by_you" | "shared_with_you";
  effective_role?: "owner" | "admin" | "member";
  name: string;
  slug: string;
  environment_default: string;
  organization_plan: "free" | "solo" | "team";
  metrics: {
    monthly_bundle_requests: number;
    monthly_raw_ingested_events: number;
    retained_bundles: number;
    monthly_alert_deliveries: number;
  };
  created_at: string;
  updated_at: string;
}

export interface DeletedProjectRecord {
  project_id: string;
  organization_id: string;
  owner_user_id?: string;
  owner_email?: string;
  relationship?: "owned" | "shared";
  sharing_state?: "private" | "shared_by_you" | "shared_with_you";
  effective_role?: "owner" | "admin" | "member";
  name: string;
  slug: string;
  environment_default: string;
  organization_plan: "free" | "solo" | "team";
  created_at: string;
  updated_at: string;
}

export interface ProjectTokenRecord {
  token_id: string;
  project_id: string;
  label: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  expires_at: string | null;
}

export interface CreatedProjectToken extends ProjectTokenRecord {
  plaintext?: string;
}

export type CapturePreset = "minimal" | "balanced" | "investigative";

export type CaptureLogs = "off" | "error" | "warning" | "info";

export type CaptureRequestEvents = "off" | "failures_only" | "filtered" | "all";

export type CaptureBreadcrumbs = "local_only" | "exception_only" | "standalone";

export type CaptureProbeEvents = "buffer_only" | "standalone_when_activated";

export interface ProjectCapturePolicy {
  preset: CapturePreset;
  capture_logs: CaptureLogs;
  capture_request_events: CaptureRequestEvents;
  capture_breadcrumbs: CaptureBreadcrumbs;
  capture_probe_events: CaptureProbeEvents;
  immediate_client_error_statuses: number[];
}

export interface ProjectCapturePolicyOverrides {
  capture_logs: CaptureLogs | null;
  capture_request_events: CaptureRequestEvents | null;
  capture_breadcrumbs: CaptureBreadcrumbs | null;
  capture_probe_events: CaptureProbeEvents | null;
  immediate_client_error_statuses: number[] | null;
}

export interface ProjectCapturePolicyResponse {
  access_mode: "manage" | "preview";
  policy: ProjectCapturePolicy;
  overrides: ProjectCapturePolicyOverrides;
}

export interface ProjectCapturePolicyUpdate {
  preset?: CapturePreset;
  capture_logs?: CaptureLogs | null;
  capture_request_events?: CaptureRequestEvents | null;
  capture_breadcrumbs?: CaptureBreadcrumbs | null;
  capture_probe_events?: CaptureProbeEvents | null;
  immediate_client_error_statuses?: number[] | null;
}

export type ImprovementBundleSensitivity = "high_confidence" | "balanced" | "verbose";

export interface ProjectImprovementSettings {
  automated_improvement_bundles_enabled: boolean;
  improvement_bundle_sensitivity: ImprovementBundleSensitivity;
}

export interface ProjectImprovementSettingsResponse {
  access_mode: "manage" | "preview";
  cloud_automation_available: boolean;
  settings: ProjectImprovementSettings;
}

export interface ProjectImprovementSettingsUpdate {
  automated_improvement_bundles_enabled?: boolean;
  improvement_bundle_sensitivity?: ImprovementBundleSensitivity;
}

export interface IncidentRecord {
  incident_id: string;
  project_id: string;
  project_name: string;
  service_id: string;
  service_name: string | null;
  latest_deployment_id: string | null;
  environment: string;
  fingerprint: string;
  fingerprint_version: string;
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  status: "open" | "resolved" | "regressed";
  first_seen_at: string;
  last_seen_at: string;
  occurrence_count: number;
  spike_detected_at: string | null;
  resolved_at?: string | null;
  regressed_at: string | null;
  matched_fields: string[];
}

export interface ImprovementRecord {
  improvement_id: string;
  project_id: string;
  project_name: string;
  project_slug: string;
  service_id: string | null;
  service_name: string;
  service_runtime: string | null;
  service_framework: string | null;
  environment: string;
  kind: "warning_hotspot" | "slow_request" | "request_failure_pattern" | "recurring_incident" | "post_deploy_regression";
  status: "open" | "resolved" | "snoozed";
  severity: "low" | "medium" | "high" | "critical";
  confidence: number;
  fingerprint: string;
  title: string;
  summary: string;
  occurrence_count: number;
  evidence: Record<string, unknown>;
  first_detected_at: string;
  last_detected_at: string;
  resolved_at: string | null;
  snoozed_until: string | null;
  bundle_generation_number: number;
  bundle_created_at: string | null;
  bundle_updated_at: string | null;
  bundle_failure_reason: string | null;
}

export interface ServiceRecord {
  service_id: string;
  project_id: string;
  name: string;
  runtime: string | null;
  framework: string | null;
  environment: string;
}

export interface BillingUsageMetric {
  used: number;
  limit: number;
}

export interface BillingSummaryRecord {
  plan: "free" | "solo" | "team";
  stripe_customer_id: string | null;
  active_projects: number;
  capacity_units: {
    total: number;
    included: number;
    additional_purchased: number;
    pending_reduction: {
      additional_purchased: number;
      total: number;
      effective_at: string;
    } | null;
  };
  usage_window: {
    starts_at: string;
    ends_at: string;
  };
  allowances: {
    monthly_bundle_requests: BillingUsageMetric;
    monthly_raw_ingested_events: BillingUsageMetric;
    retained_bundle_cap: BillingUsageMetric;
    monthly_remote_activations: BillingUsageMetric;
    monthly_alert_deliveries: BillingUsageMetric;
    monthly_webhook_deliveries: BillingUsageMetric;
  };
}

export type AlertChannel = "email" | "slack" | "discord" | "webhook";

export type AlertConditionType =
  | "new_incident"
  | "incident_regressed"
  | "error_spike"
  | "severity_threshold"
  | "regression_after_deploy";

export interface AlertRecord {
  alert_id: string;
  project_id: string;
  created_by_user_id: string;
  service_id: string | null;
  channel: AlertChannel;
  condition_type: AlertConditionType;
  severity_min: "low" | "medium" | "high" | "critical" | null;
  config: Record<string, unknown>;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export type WebhookEventType =
  | "bundle.created"
  | "bundle.updated"
  | "bundle.reopened"
  | "bundle.resolved"
  | "verification.passed"
  | "verification.failed"
  | "improvement_bundle.created"
  | "incident.spike_detected";

export interface WebhookRecord {
  webhook_id: string;
  project_id: string;
  created_by_user_id: string;
  url: string;
  events: WebhookEventType[];
  filters: {
    environment?: string[];
    service?: string[];
    severity_min?: "low" | "medium" | "high" | "critical";
    bundle_type?: Array<"failure" | "improvement">;
    verification?: boolean;
  };
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreatedWebhookRecord extends WebhookRecord {
  signing_secret?: string;
}

export interface WebhookDeliveryRecord {
  delivery_id: string;
  event_type: WebhookEventType;
  status: "pending" | "retrying" | "delivered" | "failed" | "disabled";
  attempt_count: number;
  next_attempt_at: string | null;
  last_response_code: number | null;
  last_attempted_at: string | null;
  last_error: string | null;
}

export interface GitHubInstallationRecord {
  id: string;
  installation_id: number;
  account_login: string;
  account_type: "Organization" | "User";
  status: "active" | "suspended" | "removed";
  created_at: string;
  updated_at: string;
}

interface GitHubInstallUrlResponse {
  install_url: string;
}

export interface GitHubRepositoryRecord {
  id: number;
  owner: string;
  name: string;
  full_name: string;
  default_branch: string;
  private: boolean;
}

export interface ProjectGitHubRepoRecord {
  id: string;
  project_id: string;
  installation_id: string;
  repo_owner: string;
  repo_name: string;
  default_branch: string;
  created_at: string;
  updated_at: string;
}

export interface GitHubDispatchRuleRecord {
  rule_id: string;
  project_id: string;
  created_by_user_id: string;
  name: string;
  enabled: boolean;
  event_types: string[];
  environments: string[];
  services: string[];
  severity_min: "low" | "medium" | "high" | "critical" | null;
  bundle_type: "failure" | "improvement" | null;
  incident_status: "new_only" | "reopened_only" | "new_or_reopened";
  cooldown_seconds: number;
  created_at: string;
  updated_at: string;
}

export interface GitHubDispatchDeliveryRecord {
  delivery_id: string;
  rule_id: string;
  rule_name: string;
  incident_id: string;
  incident_title: string;
  status: "pending" | "retrying" | "delivered" | "failed" | "skipped";
  attempt_count: number;
  last_attempt_at: string | null;
  last_error: string | null;
  github_status_code: number | null;
  created_at: string;
}

interface WebApiEnv {
  VITE_API_URL?: string;
}

function normalizeApiBaseUrl(value: string | undefined): string {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed.length === 0) {
    return "";
  }

  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

export function resolveApiBaseUrl(env: WebApiEnv = import.meta.env): string {
  return normalizeApiBaseUrl(env.VITE_API_URL);
}

export function buildApiUrl(path: string, env: WebApiEnv = import.meta.env): string {
  return `${resolveApiBaseUrl(env)}${path}`;
}

export function resolveApiResourceUrl(value: string | null, env: WebApiEnv = import.meta.env): string | null {
  if (value === null) {
    return null;
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  return buildApiUrl(value.startsWith("/") ? value : `/${value}`, env);
}

const API_BASE = resolveApiBaseUrl();
let browserSessionCsrfToken: string | null = null;
let browserSessionInvalidated = false;
const browserSessionInvalidationListeners = new Set<() => void>();

export class InvalidSessionError extends Error {
  constructor() {
    super("invalid_session");
    this.name = "InvalidSessionError";
  }
}

export function isInvalidSessionError(error: unknown): error is InvalidSessionError {
  return error instanceof InvalidSessionError || (error instanceof Error && error.message === "invalid_session");
}

function clearBrowserSessionState(): void {
  browserSessionCsrfToken = null;
}

function invalidateBrowserSession(): void {
  clearBrowserSessionState();

  if (browserSessionInvalidated) {
    return;
  }

  browserSessionInvalidated = true;

  for (const listener of browserSessionInvalidationListeners) {
    listener();
  }
}

export function subscribeToBrowserSessionInvalidation(listener: () => void): () => void {
  browserSessionInvalidationListeners.add(listener);

  return () => {
    browserSessionInvalidationListeners.delete(listener);
  };
}

export function resetBrowserSessionClientState(): void {
  clearBrowserSessionState();
  browserSessionInvalidated = false;
  browserSessionInvalidationListeners.clear();
}

function parseAttachmentFilename(contentDisposition: string | null): string | null {
  if (contentDisposition === null) {
    return null;
  }

  const utfMatch = /filename\*=UTF-8''([^;]+)/i.exec(contentDisposition);
  if (utfMatch?.[1] !== undefined) {
    return decodeURIComponent(utfMatch[1]);
  }

  const asciiMatch = /filename="?([^";]+)"?/i.exec(contentDisposition);
  return asciiMatch?.[1] ?? null;
}

function normalizeProjectRecord(project: Omit<ProjectRecord, "metrics"> & { metrics?: Partial<ProjectRecord["metrics"]> }): ProjectRecord {
  return {
    ...project,
    metrics: {
      monthly_bundle_requests: project.metrics?.monthly_bundle_requests ?? 0,
      monthly_raw_ingested_events: project.metrics?.monthly_raw_ingested_events ?? 0,
      retained_bundles: project.metrics?.retained_bundles ?? 0,
      monthly_alert_deliveries: project.metrics?.monthly_alert_deliveries ?? 0
    }
  };
}

function normalizeBillingUsageMetric(metric?: Partial<BillingUsageMetric>): BillingUsageMetric {
  return {
    used: metric?.used ?? 0,
    limit: metric?.limit ?? 0
  };
}

function normalizeBillingSummary(
  billing: Omit<BillingSummaryRecord, "allowances"> & { allowances?: Partial<BillingSummaryRecord["allowances"]> }
): BillingSummaryRecord {
  return {
    ...billing,
    allowances: {
      monthly_bundle_requests: normalizeBillingUsageMetric(billing.allowances?.monthly_bundle_requests),
      monthly_raw_ingested_events: normalizeBillingUsageMetric(billing.allowances?.monthly_raw_ingested_events),
      retained_bundle_cap: normalizeBillingUsageMetric(billing.allowances?.retained_bundle_cap),
      monthly_remote_activations: normalizeBillingUsageMetric(billing.allowances?.monthly_remote_activations),
      monthly_alert_deliveries: normalizeBillingUsageMetric(billing.allowances?.monthly_alert_deliveries),
      monthly_webhook_deliveries: normalizeBillingUsageMetric(billing.allowances?.monthly_webhook_deliveries)
    }
  };
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;

    if (response.status === 401 && body?.error === "invalid_session") {
      invalidateBrowserSession();
      throw new InvalidSessionError();
    }

    throw new Error(body?.error ?? `request_failed_${response.status}`);
  }

  return (await response.json()) as T;
}

function rememberSession<T extends SessionRecord | null>(session: T): T {
  if (session !== null) {
    browserSessionInvalidated = false;
  }

  browserSessionCsrfToken = session?.csrf_token ?? null;
  return session;
}

export function buildBrowserSessionHeaders(includeJsonContentType = false): Record<string, string> {
  const headers: Record<string, string> = {};

  if (includeJsonContentType) {
    headers["Content-Type"] = "application/json";
  }

  if (browserSessionCsrfToken !== null) {
    headers["X-CSRF-Token"] = browserSessionCsrfToken;
  }

  return headers;
}

export async function getSession(): Promise<SessionRecord | null> {
  const response = await fetch(`${API_BASE}/v1/auth/session`, {
    credentials: "include"
  });

  if (response.status === 401) {
    clearBrowserSessionState();
    return null;
  }

  const body = await readJson<{ session: SessionRecord | null }>(response);
  return rememberSession(body.session);
}

export async function requestEmailCode(payload: { email: string; accepted_terms: true }): Promise<void> {
  await readJson(
    await fetch(`${API_BASE}/v1/auth/request-code`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    })
  );
}

export async function verifyEmailCode(payload: { email: string; code: string }): Promise<SessionRecord> {
  const body = await readJson<{ session: SessionRecord }>(
    await fetch(`${API_BASE}/v1/auth/verify-code`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    })
  );

  return rememberSession(body.session);
}

export async function logout(): Promise<void> {
  const response = await fetch(`${API_BASE}/v1/auth/logout`, {
    method: "POST",
    credentials: "include",
    headers: buildBrowserSessionHeaders()
  });

  if (response.status !== 401) {
    await readJson(response);
  }

  clearBrowserSessionState();
  browserSessionInvalidated = false;
}

export async function exportAccountData(): Promise<{ blob: Blob; filename: string }> {
  const response = await fetch(`${API_BASE}/v1/account/export`, {
    credentials: "include"
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `request_failed_${response.status}`);
  }

  return {
    blob: await response.blob(),
    filename: parseAttachmentFilename(response.headers.get("Content-Disposition")) ?? "debugbundle-account-export.json"
  };
}

export async function importAccountAvatarFromGravatar(): Promise<ImportedAccountAvatarRecord> {
  const body = await readJson<{ avatar: ImportedAccountAvatarRecord }>(
    await fetch(`${API_BASE}/v1/account/avatar/import-gravatar`, {
      method: "POST",
      credentials: "include",
      headers: buildBrowserSessionHeaders()
    })
  );

  return body.avatar;
}

export async function deleteAccount(payload: { email: string }): Promise<DeletedAccountRecord> {
  const body = await readJson<{ account: DeletedAccountRecord }>(
    await fetch(`${API_BASE}/v1/account`, {
      method: "DELETE",
      credentials: "include",
      headers: buildBrowserSessionHeaders(true),
      body: JSON.stringify(payload)
    })
  );

  clearBrowserSessionState();
  browserSessionInvalidated = false;
  return body.account;
}

export async function listMemberTokens(): Promise<MemberTokenRecord[]> {
  const body = await readJson<{ tokens: MemberTokenRecord[] }>(
    await fetch(`${API_BASE}/v1/member/tokens`, {
      credentials: "include"
    })
  );

  return body.tokens;
}

export async function listProjects(): Promise<ProjectRecord[]> {
  const body = await readJson<{ projects: Array<Omit<ProjectRecord, "metrics"> & { metrics?: Partial<ProjectRecord["metrics"]> }> }>(
    await fetch(`${API_BASE}/v1/projects`, {
      credentials: "include"
    })
  );

  return body.projects.map(normalizeProjectRecord);
}

export async function listIncidents(
  inputOrLimit:
    | number
    | {
        limit?: number;
        cursor?: string;
        projectId?: string;
        environment?: string;
        service?: string;
        status?: IncidentRecord["status"];
        severity?: IncidentRecord["severity"];
      } = 20,
  cursor?: string
): Promise<{ incidents: IncidentRecord[]; nextCursor: string | null }> {
  const input =
    typeof inputOrLimit === "number"
      ? {
          limit: inputOrLimit,
          ...(cursor === undefined ? {} : { cursor })
        }
      : inputOrLimit;

  const searchParams = new URLSearchParams({
    limit: String(input.limit ?? 20)
  });

  if (input.cursor !== undefined) {
    searchParams.set("cursor", input.cursor);
  }
  if (input.projectId !== undefined) {
    searchParams.set("project_id", input.projectId);
  }
  if (input.environment !== undefined) {
    searchParams.set("environment", input.environment);
  }
  if (input.service !== undefined) {
    searchParams.set("service", input.service);
  }
  if (input.status !== undefined) {
    searchParams.set("status", input.status);
  }
  if (input.severity !== undefined) {
    searchParams.set("severity", input.severity);
  }

  const body = await readJson<{ incidents: IncidentRecord[]; next_cursor: string | null }>(
    await fetch(`${API_BASE}/v1/incidents?${searchParams.toString()}`, {
      credentials: "include"
    })
  );

  return {
    incidents: body.incidents,
    nextCursor: body.next_cursor
  };
}

export async function listImprovements(input: {
  limit?: number;
  cursor?: string;
  projectId?: string;
  environment?: string;
  service?: string;
  status?: ImprovementRecord["status"];
  severity?: ImprovementRecord["severity"];
  kind?: ImprovementRecord["kind"];
} = {}): Promise<{ improvements: ImprovementRecord[]; nextCursor: string | null }> {
  const searchParams = new URLSearchParams({
    limit: String(input.limit ?? 20)
  });

  if (input.cursor !== undefined) {
    searchParams.set("cursor", input.cursor);
  }
  if (input.projectId !== undefined) {
    searchParams.set("project_id", input.projectId);
  }
  if (input.environment !== undefined) {
    searchParams.set("environment", input.environment);
  }
  if (input.service !== undefined) {
    searchParams.set("service", input.service);
  }
  if (input.status !== undefined) {
    searchParams.set("status", input.status);
  }
  if (input.severity !== undefined) {
    searchParams.set("severity", input.severity);
  }
  if (input.kind !== undefined) {
    searchParams.set("kind", input.kind);
  }

  const body = await readJson<{ improvements: ImprovementRecord[]; next_cursor: string | null }>(
    await fetch(`${API_BASE}/v1/improvements?${searchParams.toString()}`, {
      credentials: "include"
    })
  );

  return {
    improvements: body.improvements,
    nextCursor: body.next_cursor
  };
}

export async function listServices(projectId: string, limit = 100): Promise<ServiceRecord[]> {
  const searchParams = new URLSearchParams({
    project_id: projectId,
    limit: String(limit)
  });

  const body = await readJson<{ services: ServiceRecord[] }>(
    await fetch(`${API_BASE}/v1/services?${searchParams.toString()}`, {
      credentials: "include"
    })
  );

  return body.services;
}

export async function getBillingSummary(): Promise<BillingSummaryRecord> {
  const body = await readJson<{
    billing: Omit<BillingSummaryRecord, "allowances"> & { allowances?: Partial<BillingSummaryRecord["allowances"]> };
  }>(
    await fetch(`${API_BASE}/v1/billing`, {
      credentials: "include"
    })
  );

  return normalizeBillingSummary(body.billing);
}

export async function startBillingCheckout(targetPlan: "solo" | "team"): Promise<string> {
  const body = await readJson<{ url: string }>(
    await fetch(`${API_BASE}/v1/billing/checkout`, {
      method: "POST",
      credentials: "include",
      headers: buildBrowserSessionHeaders(true),
      body: JSON.stringify({ target_plan: targetPlan })
    })
  );

  return body.url;
}

export async function confirmBillingCheckout(sessionId: string): Promise<BillingSummaryRecord> {
  const body = await readJson<{
    billing: Omit<BillingSummaryRecord, "allowances"> & { allowances?: Partial<BillingSummaryRecord["allowances"]> };
  }>(
    await fetch(`${API_BASE}/v1/billing/checkout/confirm`, {
      method: "POST",
      credentials: "include",
      headers: buildBrowserSessionHeaders(true),
      body: JSON.stringify({ session_id: sessionId })
    })
  );

  return normalizeBillingSummary(body.billing);
}

export async function openBillingPortal(): Promise<string> {
  const body = await readJson<{ url: string }>(
    await fetch(`${API_BASE}/v1/billing/portal`, {
      method: "POST",
      credentials: "include",
      headers: buildBrowserSessionHeaders()
    })
  );

  return body.url;
}

export async function increaseBillingCapacity(targetAdditionalCapacityUnits: number): Promise<BillingSummaryRecord> {
  const body = await readJson<{
    billing: Omit<BillingSummaryRecord, "allowances"> & { allowances?: Partial<BillingSummaryRecord["allowances"]> };
  }>(
    await fetch(`${API_BASE}/v1/billing/capacity/increase`, {
      method: "POST",
      credentials: "include",
      headers: buildBrowserSessionHeaders(true),
      body: JSON.stringify({ target_additional_capacity_units: targetAdditionalCapacityUnits })
    })
  );

  return normalizeBillingSummary(body.billing);
}

export async function scheduleBillingCapacityReduction(targetAdditionalCapacityUnits: number): Promise<BillingSummaryRecord> {
  const body = await readJson<{
    billing: Omit<BillingSummaryRecord, "allowances"> & { allowances?: Partial<BillingSummaryRecord["allowances"]> };
  }>(
    await fetch(`${API_BASE}/v1/billing/capacity/scheduled-reduction`, {
      method: "POST",
      credentials: "include",
      headers: buildBrowserSessionHeaders(true),
      body: JSON.stringify({ target_additional_capacity_units: targetAdditionalCapacityUnits })
    })
  );

  return normalizeBillingSummary(body.billing);
}

export async function cancelBillingCapacityReduction(): Promise<BillingSummaryRecord> {
  const body = await readJson<{
    billing: Omit<BillingSummaryRecord, "allowances"> & { allowances?: Partial<BillingSummaryRecord["allowances"]> };
  }>(
    await fetch(`${API_BASE}/v1/billing/capacity/scheduled-reduction`, {
      method: "DELETE",
      credentials: "include",
      headers: buildBrowserSessionHeaders()
    })
  );

  return normalizeBillingSummary(body.billing);
}

export async function createProject(payload: {
  name: string;
  slug: string;
  environment_default: string;
}): Promise<ProjectRecord> {
  const body = await readJson<{ project: Omit<ProjectRecord, "metrics"> & { metrics?: Partial<ProjectRecord["metrics"]> } }>(
    await fetch(`${API_BASE}/v1/projects`, {
      method: "POST",
      credentials: "include",
      headers: buildBrowserSessionHeaders(true),
      body: JSON.stringify(payload)
    })
  );

  return normalizeProjectRecord(body.project);
}

export async function updateProject(
  projectId: string,
  payload: {
    name?: string;
    slug?: string;
    environment_default?: string;
  }
): Promise<ProjectRecord> {
  const body = await readJson<{ project: Omit<ProjectRecord, "metrics"> & { metrics?: Partial<ProjectRecord["metrics"]> } }>(
    await fetch(`${API_BASE}/v1/projects/${projectId}`, {
      method: "PATCH",
      credentials: "include",
      headers: buildBrowserSessionHeaders(true),
      body: JSON.stringify(payload)
    })
  );

  return normalizeProjectRecord(body.project);
}

export async function deleteProject(projectId: string): Promise<DeletedProjectRecord> {
  const body = await readJson<{ project: DeletedProjectRecord }>(
    await fetch(`${API_BASE}/v1/projects/${projectId}`, {
      method: "DELETE",
      credentials: "include",
      headers: buildBrowserSessionHeaders()
    })
  );

  return body.project;
}

export async function getProjectCapturePolicy(projectId: string): Promise<ProjectCapturePolicyResponse> {
  return readJson<ProjectCapturePolicyResponse>(
    await fetch(`${API_BASE}/v1/projects/${projectId}/capture-policy`, {
      credentials: "include"
    })
  );
}

export async function updateProjectCapturePolicy(
  projectId: string,
  payload: ProjectCapturePolicyUpdate
): Promise<ProjectCapturePolicyResponse> {
  return readJson<ProjectCapturePolicyResponse>(
    await fetch(`${API_BASE}/v1/projects/${projectId}/capture-policy`, {
      method: "PATCH",
      credentials: "include",
      headers: buildBrowserSessionHeaders(true),
      body: JSON.stringify(payload)
    })
  );
}

export async function getProjectImprovementSettings(projectId: string): Promise<ProjectImprovementSettingsResponse> {
  return readJson<ProjectImprovementSettingsResponse>(
    await fetch(`${API_BASE}/v1/projects/${projectId}/improvement-settings`, {
      credentials: "include"
    })
  );
}

export async function updateProjectImprovementSettings(
  projectId: string,
  payload: ProjectImprovementSettingsUpdate
): Promise<ProjectImprovementSettingsResponse> {
  return readJson<ProjectImprovementSettingsResponse>(
    await fetch(`${API_BASE}/v1/projects/${projectId}/improvement-settings`, {
      method: "PATCH",
      credentials: "include",
      headers: buildBrowserSessionHeaders(true),
      body: JSON.stringify(payload)
    })
  );
}

export async function listProjectTokens(projectId: string): Promise<ProjectTokenRecord[]> {
  const body = await readJson<{ tokens: ProjectTokenRecord[] }>(
    await fetch(`${API_BASE}/v1/projects/${projectId}/tokens`, {
      credentials: "include"
    })
  );

  return body.tokens;
}

export async function listProjectAlerts(projectId: string, limit = 20): Promise<AlertRecord[]> {
  const searchParams = new URLSearchParams({
    project_id: projectId,
    limit: String(limit)
  });

  const body = await readJson<{ alerts: AlertRecord[] }>(
    await fetch(`${API_BASE}/v1/alerts?${searchParams.toString()}`, {
      credentials: "include"
    })
  );

  return body.alerts;
}

export async function createProjectAlert(payload: {
  project_id: string;
  service_id?: string;
  channel: AlertChannel;
  condition_type: AlertConditionType;
  severity_min?: "low" | "medium" | "high" | "critical";
  config: Record<string, unknown>;
  is_enabled?: boolean;
}): Promise<AlertRecord> {
  const body = await readJson<{ alert: AlertRecord }>(
    await fetch(`${API_BASE}/v1/alerts`, {
      method: "POST",
      credentials: "include",
      headers: buildBrowserSessionHeaders(true),
      body: JSON.stringify({
        project_id: payload.project_id,
        service_id: payload.service_id,
        channel: payload.channel,
        condition_type: payload.condition_type,
        severity_min: payload.severity_min,
        config: payload.config,
        is_enabled: payload.is_enabled ?? true
      })
    })
  );

  return body.alert;
}

export async function listProjectWebhooks(projectId: string, limit = 20): Promise<WebhookRecord[]> {
  const searchParams = new URLSearchParams({
    project_id: projectId,
    limit: String(limit)
  });

  const body = await readJson<{ webhooks: WebhookRecord[] }>(
    await fetch(`${API_BASE}/v1/webhooks?${searchParams.toString()}`, {
      credentials: "include"
    })
  );

  return body.webhooks;
}

export async function getGitHubInstallation(projectId?: string): Promise<GitHubInstallationRecord | null> {
  const searchParams = new URLSearchParams();
  if (projectId !== undefined) {
    searchParams.set("project_id", projectId);
  }

  const body = await readJson<{ installation: GitHubInstallationRecord | null }>(
    await fetch(`${API_BASE}/v1/github/installation${searchParams.size === 0 ? "" : `?${searchParams.toString()}`}`, {
      credentials: "include"
    })
  );

  return body.installation;
}

export async function getGitHubInstallUrl(returnTo?: string, projectId?: string): Promise<string> {
  const searchParams = new URLSearchParams();
  if (returnTo !== undefined) {
    searchParams.set("return_to", returnTo);
  }
  if (projectId !== undefined) {
    searchParams.set("project_id", projectId);
  }

  const body = await readJson<GitHubInstallUrlResponse>(
    await fetch(
      `${API_BASE}/v1/github/app/install-url${searchParams.size === 0 ? "" : `?${searchParams.toString()}`}`,
      {
        credentials: "include"
      }
    )
  );

  return body.install_url;
}

export async function listGitHubRepositories(projectId?: string): Promise<GitHubRepositoryRecord[]> {
  const searchParams = new URLSearchParams();
  if (projectId !== undefined) {
    searchParams.set("project_id", projectId);
  }

  const body = await readJson<{ repositories: GitHubRepositoryRecord[] }>(
    await fetch(`${API_BASE}/v1/github/repositories${searchParams.size === 0 ? "" : `?${searchParams.toString()}`}`, {
      credentials: "include"
    })
  );

  return body.repositories;
}

export async function getProjectGitHubRepo(projectId: string): Promise<ProjectGitHubRepoRecord | null> {
  const body = await readJson<{ repo: ProjectGitHubRepoRecord | null }>(
    await fetch(`${API_BASE}/v1/projects/${projectId}/github/repo`, {
      credentials: "include"
    })
  );

  return body.repo;
}

export async function listProjectGitHubRules(projectId: string): Promise<GitHubDispatchRuleRecord[]> {
  const body = await readJson<{ rules: GitHubDispatchRuleRecord[] }>(
    await fetch(`${API_BASE}/v1/projects/${projectId}/github/rules`, {
      credentials: "include"
    })
  );

  return body.rules;
}

export async function createProjectGitHubRule(
  projectId: string,
  payload: {
    name: string;
    event_types: string[];
    environments: string[];
    services: string[];
    severity_min: "low" | "medium" | "high" | "critical" | null;
    bundle_type: "failure" | "improvement" | null;
    incident_status: "new_only" | "reopened_only" | "new_or_reopened";
    cooldown_seconds: number;
    enabled?: boolean;
  }
): Promise<GitHubDispatchRuleRecord> {
  const body = await readJson<{ rule: GitHubDispatchRuleRecord }>(
    await fetch(`${API_BASE}/v1/projects/${projectId}/github/rules`, {
      method: "POST",
      credentials: "include",
      headers: buildBrowserSessionHeaders(true),
      body: JSON.stringify({
        ...payload,
        enabled: payload.enabled ?? true
      })
    })
  );

  return body.rule;
}

export async function updateProjectGitHubRule(
  projectId: string,
  ruleId: string,
  payload: {
    name?: string;
    event_types?: string[];
    environments?: string[];
    services?: string[];
    severity_min?: "low" | "medium" | "high" | "critical" | null;
    bundle_type?: "failure" | "improvement" | null;
    incident_status?: "new_only" | "reopened_only" | "new_or_reopened";
    cooldown_seconds?: number;
    enabled?: boolean;
  }
): Promise<GitHubDispatchRuleRecord> {
  const body = await readJson<{ rule: GitHubDispatchRuleRecord }>(
    await fetch(`${API_BASE}/v1/projects/${projectId}/github/rules/${ruleId}`, {
      method: "PATCH",
      credentials: "include",
      headers: buildBrowserSessionHeaders(true),
      body: JSON.stringify(payload)
    })
  );

  return body.rule;
}

export async function deleteProjectGitHubRule(projectId: string, ruleId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/v1/projects/${projectId}/github/rules/${ruleId}`, {
    method: "DELETE",
    credentials: "include",
    headers: buildBrowserSessionHeaders()
  });

  if (!response.ok) {
    await readJson(response);
  }
}

export async function listProjectGitHubDeliveries(projectId: string, limit = 20): Promise<GitHubDispatchDeliveryRecord[]> {
  const searchParams = new URLSearchParams({
    limit: String(limit)
  });

  const body = await readJson<{ deliveries: GitHubDispatchDeliveryRecord[] }>(
    await fetch(`${API_BASE}/v1/projects/${projectId}/github/deliveries?${searchParams.toString()}`, {
      credentials: "include"
    })
  );

  return body.deliveries;
}

export async function retryProjectGitHubDelivery(
  projectId: string,
  deliveryId: string
): Promise<GitHubDispatchDeliveryRecord> {
  const body = await readJson<{ delivery: GitHubDispatchDeliveryRecord }>(
    await fetch(`${API_BASE}/v1/projects/${projectId}/github/deliveries/${deliveryId}/retry`, {
      method: "POST",
      credentials: "include",
      headers: buildBrowserSessionHeaders(true),
      body: JSON.stringify({})
    })
  );

  return body.delivery;
}

export async function setProjectGitHubRepo(
  projectId: string,
  payload: { owner: string; repo: string }
): Promise<ProjectGitHubRepoRecord> {
  const body = await readJson<{ repo: ProjectGitHubRepoRecord }>(
    await fetch(`${API_BASE}/v1/projects/${projectId}/github/repo`, {
      method: "PUT",
      credentials: "include",
      headers: buildBrowserSessionHeaders(true),
      body: JSON.stringify(payload)
    })
  );

  return body.repo;
}

export async function removeProjectGitHubRepo(projectId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/v1/projects/${projectId}/github/repo`, {
    method: "DELETE",
    credentials: "include",
    headers: buildBrowserSessionHeaders()
  });

  if (!response.ok) {
    await readJson(response);
  }
}

export async function createProjectWebhook(payload: {
  project_id: string;
  url: string;
  events: WebhookEventType[];
  filters?: WebhookRecord["filters"];
  is_enabled?: boolean;
}): Promise<CreatedWebhookRecord> {
  const body = await readJson<{ webhook: CreatedWebhookRecord }>(
    await fetch(`${API_BASE}/v1/webhooks`, {
      method: "POST",
      credentials: "include",
      headers: buildBrowserSessionHeaders(true),
      body: JSON.stringify({
        project_id: payload.project_id,
        url: payload.url,
        events: payload.events,
        filters: payload.filters ?? {},
        is_enabled: payload.is_enabled ?? true
      })
    })
  );

  return body.webhook;
}

export async function listProjectWebhookDeliveries(
  webhookId: string,
  projectId: string,
  limit = 5
): Promise<WebhookDeliveryRecord[]> {
  const searchParams = new URLSearchParams({
    project_id: projectId,
    limit: String(limit)
  });

  const body = await readJson<{ deliveries: WebhookDeliveryRecord[] }>(
    await fetch(`${API_BASE}/v1/webhooks/${webhookId}/deliveries?${searchParams.toString()}`, {
      credentials: "include"
    })
  );

  return body.deliveries;
}

export async function testProjectWebhook(
  webhookId: string,
  projectId: string,
  eventType: Extract<WebhookEventType, "verification.passed" | "verification.failed"> = "verification.passed"
): Promise<WebhookDeliveryRecord> {
  const body = await readJson<{ delivery: WebhookDeliveryRecord }>(
    await fetch(`${API_BASE}/v1/webhooks/${webhookId}/test?project_id=${encodeURIComponent(projectId)}`, {
      method: "POST",
      credentials: "include",
      headers: buildBrowserSessionHeaders(true),
      body: JSON.stringify({ event_type: eventType })
    })
  );

  return body.delivery;
}

export async function createProjectToken(projectId: string, payload: { label: string }): Promise<CreatedProjectToken> {
  const body = await readJson<{ token: CreatedProjectToken }>(
    await fetch(`${API_BASE}/v1/projects/${projectId}/tokens`, {
      method: "POST",
      credentials: "include",
      headers: buildBrowserSessionHeaders(true),
      body: JSON.stringify(payload)
    })
  );

  return body.token;
}

export async function revokeProjectToken(projectId: string, tokenId: string): Promise<void> {
  await readJson(
    await fetch(`${API_BASE}/v1/projects/${projectId}/tokens/${tokenId}/revoke`, {
      method: "POST",
      credentials: "include",
      headers: buildBrowserSessionHeaders()
    })
  );
}

export async function createMemberToken(payload: { label: string }): Promise<CreatedMemberToken> {
  const body = await readJson<{ token: CreatedMemberToken }>(
    await fetch(`${API_BASE}/v1/member/tokens`, {
      method: "POST",
      credentials: "include",
      headers: buildBrowserSessionHeaders(true),
      body: JSON.stringify(payload)
    })
  );

  return body.token;
}

export async function revokeMemberToken(tokenId: string): Promise<void> {
  await readJson(
    await fetch(`${API_BASE}/v1/member/tokens/${tokenId}/revoke`, {
      method: "POST",
      credentials: "include",
      headers: buildBrowserSessionHeaders()
    })
  );
}

export async function deleteAlert(alertId: string, projectId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/v1/alerts/${alertId}?project_id=${encodeURIComponent(projectId)}`, {
    method: "DELETE",
    credentials: "include",
    headers: buildBrowserSessionHeaders()
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `request_failed_${response.status}`);
  }
}

export async function getIncident(incidentId: string): Promise<IncidentRecord> {
  const body = await readJson<{ incident: IncidentRecord }>(
    await fetch(`${API_BASE}/v1/incidents/${incidentId}`, {
      credentials: "include"
    })
  );

  return body.incident;
}

export async function getImprovement(improvementId: string): Promise<ImprovementRecord> {
  const body = await readJson<{ improvement: ImprovementRecord }>(
    await fetch(`${API_BASE}/v1/improvements/${improvementId}`, {
      credentials: "include"
    })
  );

  return body.improvement;
}

export async function resolveIncident(incidentId: string): Promise<IncidentRecord> {
  const body = await readJson<{ incident: IncidentRecord }>(
    await fetch(`${API_BASE}/v1/incidents/${incidentId}/resolve`, {
      method: "POST",
      credentials: "include",
      headers: buildBrowserSessionHeaders()
    })
  );

  return body.incident;
}

export async function resolveImprovement(improvementId: string): Promise<ImprovementRecord> {
  const body = await readJson<{ improvement: ImprovementRecord }>(
    await fetch(`${API_BASE}/v1/improvements/${improvementId}/resolve`, {
      method: "POST",
      credentials: "include",
      headers: buildBrowserSessionHeaders()
    })
  );

  return body.improvement;
}

export async function reopenImprovement(improvementId: string): Promise<ImprovementRecord> {
  const body = await readJson<{ improvement: ImprovementRecord }>(
    await fetch(`${API_BASE}/v1/improvements/${improvementId}/reopen`, {
      method: "POST",
      credentials: "include",
      headers: buildBrowserSessionHeaders()
    })
  );

  return body.improvement;
}

export async function snoozeImprovement(improvementId: string, snoozedUntil: string): Promise<ImprovementRecord> {
  const body = await readJson<{ improvement: ImprovementRecord }>(
    await fetch(`${API_BASE}/v1/improvements/${improvementId}/snooze`, {
      method: "POST",
      credentials: "include",
      headers: {
        ...buildBrowserSessionHeaders(),
        "content-type": "application/json"
      },
      body: JSON.stringify({ snoozed_until: snoozedUntil })
    })
  );

  return body.improvement;
}

export interface BundleRecord {
  bundle_id: string;
  incident_id: string;
  project_id: string;
  version: string;
  summary: { title: string; severity: string; environment: string };
  [key: string]: unknown;
}

export async function getIncidentBundle(incidentId: string): Promise<{ status: "ready"; bundle: BundleRecord } | { status: "pending" | "failed" }> {
  const response = await fetch(`${API_BASE}/v1/incidents/${incidentId}/bundle`, {
    credentials: "include"
  });

  if (!response.ok) {
    throw new Error(`request_failed_${response.status}`);
  }

  const body = await response.json() as unknown;

  if (isArtifactPendingOrFailedResponse(body)) {
    return { status: body.status };
  }

  return { status: "ready", bundle: body as BundleRecord };
}

export async function getImprovementBundle(
  projectId: string,
  improvementId: string
): Promise<{ status: "ready"; bundle: BundleRecord } | { status: "pending" | "failed" }> {
  const response = await fetch(`${API_BASE}/v1/projects/${projectId}/improvements/${improvementId}/bundle`, {
    credentials: "include"
  });

  if (!response.ok) {
    throw new Error(`request_failed_${response.status}`);
  }

  const body = await response.json() as unknown;

  if (isArtifactPendingOrFailedResponse(body)) {
    return { status: body.status };
  }

  return { status: "ready", bundle: body as BundleRecord };
}

export async function getIncidentReproduction(incidentId: string): Promise<{ status: "ready"; reproduction: Record<string, unknown> } | { status: "pending" | "failed" }> {
  const response = await fetch(`${API_BASE}/v1/incidents/${incidentId}/reproduction`, {
    credentials: "include"
  });

  if (!response.ok) {
    throw new Error(`request_failed_${response.status}`);
  }

  const body = await response.json() as unknown;

  if (isArtifactPendingOrFailedResponse(body)) {
    return { status: body.status };
  }

  return { status: "ready", reproduction: body as Record<string, unknown> };
}

function isArtifactPendingOrFailedResponse(value: unknown): value is { status: "pending" | "failed" } {
  if (typeof value !== "object" || value === null || !("status" in value)) {
    return false;
  }

  const status = (value as { status?: unknown }).status;
  return status === "pending" || status === "failed";
}

export async function listProjectIncidents(
  projectId: string,
  limit = 50,
  cursor?: string,
  status?: IncidentRecord["status"]
): Promise<{ incidents: IncidentRecord[]; nextCursor: string | null }> {
  const searchParams = new URLSearchParams({
    project_id: projectId,
    limit: String(limit)
  });

  if (cursor !== undefined) {
    searchParams.set("cursor", cursor);
  }
  if (status !== undefined) {
    searchParams.set("status", status);
  }

  const body = await readJson<{ incidents: IncidentRecord[]; next_cursor: string | null }>(
    await fetch(`${API_BASE}/v1/incidents?${searchParams.toString()}`, {
      credentials: "include"
    })
  );

  return {
    incidents: body.incidents,
    nextCursor: body.next_cursor
  };
}

export async function listProjectImprovements(
  projectId: string,
  limit = 50,
  cursor?: string,
  status?: ImprovementRecord["status"]
): Promise<{ improvements: ImprovementRecord[]; nextCursor: string | null }> {
  const body = await listImprovements({
    projectId,
    limit,
    ...(cursor === undefined ? {} : { cursor }),
    ...(status === undefined ? {} : { status })
  });

  return {
    improvements: body.improvements,
    nextCursor: body.nextCursor
  };
}
