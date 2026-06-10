import {
  API_BASE,
  buildBrowserSessionHeaders,
  readJson,
  resetBrowserSessionClientState
} from "./api-client.js";
import type {
  AlertChannel,
  AlertConditionType,
  AlertRecord,
  CreatedMemberToken,
  CreatedProjectToken,
  CreatedWebhookRecord,
  DeletedAccountRecord,
  DeletedProjectRecord,
  IncidentRecord,
  ImprovementRecord,
  MemberTokenRecord,
  ProbeActivationRecord,
  CreatedProbeActivation,
  ProjectCapturePolicyResponse,
  ProjectCapturePolicyUpdate,
  ProjectImprovementSettingsResponse,
  ProjectImprovementSettingsUpdate,
  ProjectRecord,
  ProjectTokenRecord,
  SentSystemEmailPreviewRecord,
  ServiceRecord,
  WeeklyReportChannelRecord,
  WebhookDeliveryRecord,
  WebhookEventType,
  WebhookRecord
} from "./api-types.js";

export * from "./api-types.js";
export {
  buildApiUrl,
  buildBrowserSessionHeaders,
  InvalidSessionError,
  isInvalidSessionError,
  resetBrowserSessionClientState,
  resolveApiBaseUrl,
  resolveApiResourceUrl,
  subscribeToBrowserSessionInvalidation
} from "./api-client.js";
export {
  exportAccountData,
  getSession,
  importAccountAvatarFromGravatar,
  logout,
  requestEmailCode,
  verifyEmailCode
} from "./api-auth.js";
export {
  cancelBillingCapacityReduction,
  confirmBillingCheckout,
  getBillingSummary,
  increaseBillingCapacity,
  openBillingPortal,
  scheduleBillingCapacityReduction,
  startBillingCheckout,
  startBillingTrial
} from "./api-billing.js";
export {
  createProjectGitHubRule,
  deleteProjectGitHubRule,
  getGitHubInstallation,
  getGitHubInstallUrl,
  getProjectGitHubRepo,
  listGitHubRepositories,
  listProjectGitHubDeliveries,
  listProjectGitHubRules,
  removeProjectGitHubRepo,
  retryProjectGitHubDelivery,
  setProjectGitHubRepo,
  updateProjectGitHubRule
} from "./api-github.js";

function normalizeProjectRecord(
  project: Omit<ProjectRecord, "metrics"> & { metrics?: Partial<ProjectRecord["metrics"]> }
): ProjectRecord {
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

function getBrowserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export async function requestAccountDeletionOtp(payload: {
  confirmation_text: string;
}): Promise<void> {
  await readJson<{ success: true }>(
    await fetch(`${API_BASE}/v1/account/delete/request-otp`, {
      method: "POST",
      credentials: "include",
      headers: buildBrowserSessionHeaders(true),
      body: JSON.stringify(payload)
    })
  );
}

export async function deleteAccount(payload: {
  confirmation_text: string;
  otp: string;
}): Promise<DeletedAccountRecord> {
  const body = await readJson<{ account: DeletedAccountRecord }>(
    await fetch(`${API_BASE}/v1/account`, {
      method: "DELETE",
      credentials: "include",
      headers: buildBrowserSessionHeaders(true),
      body: JSON.stringify(payload)
    })
  );

  resetBrowserSessionClientState();
  return body.account;
}

export async function sendSystemEmailPreview(previewId: string): Promise<SentSystemEmailPreviewRecord> {
  const body = await readJson<SentSystemEmailPreviewRecord>(
    await fetch(`${API_BASE}/v1/internal/system-email-previews/send`, {
      method: "POST",
      credentials: "include",
      headers: buildBrowserSessionHeaders(true),
      body: JSON.stringify({ id: previewId })
    })
  );

  return body;
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
  const body = await readJson<{
    projects: Array<
      Omit<ProjectRecord, "metrics"> & { metrics?: Partial<ProjectRecord["metrics"]> }
    >;
  }>(
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

export async function listImprovements(
  input: {
    limit?: number;
    cursor?: string;
    projectId?: string;
    environment?: string;
    service?: string;
    status?: ImprovementRecord["status"];
    severity?: ImprovementRecord["severity"];
    kind?: ImprovementRecord["kind"];
  } = {}
): Promise<{ improvements: ImprovementRecord[]; nextCursor: string | null }> {
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

export async function createProject(payload: {
  name: string;
  slug: string;
  environment_default: string;
  weekly_report_timezone?: string;
}): Promise<ProjectRecord> {
  const body = await readJson<{
    project: Omit<ProjectRecord, "metrics"> & { metrics?: Partial<ProjectRecord["metrics"]> };
  }>(
    await fetch(`${API_BASE}/v1/projects`, {
      method: "POST",
      credentials: "include",
      headers: buildBrowserSessionHeaders(true),
      body: JSON.stringify({
        ...payload,
        weekly_report_timezone: payload.weekly_report_timezone ?? getBrowserTimeZone()
      })
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
  const body = await readJson<{
    project: Omit<ProjectRecord, "metrics"> & { metrics?: Partial<ProjectRecord["metrics"]> };
  }>(
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

export async function getProjectCapturePolicy(
  projectId: string
): Promise<ProjectCapturePolicyResponse> {
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

export async function getProjectImprovementSettings(
  projectId: string
): Promise<ProjectImprovementSettingsResponse> {
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

export async function listProjectWeeklyReportChannels(
  projectId: string,
  limit = 20
): Promise<WeeklyReportChannelRecord[]> {
  const searchParams = new URLSearchParams({
    project_id: projectId,
    limit: String(limit)
  });

  const body = await readJson<{ channels: WeeklyReportChannelRecord[] }>(
    await fetch(`${API_BASE}/v1/weekly-report-channels?${searchParams.toString()}`, {
      credentials: "include"
    })
  );

  return body.channels;
}

export async function createProjectWeeklyReportChannel(payload: {
  project_id: string;
  channel: "email" | "slack";
  config: { to: string[] } | { slack_destination_id: string };
  schedule: WeeklyReportChannelRecord["schedule"];
  is_enabled?: boolean;
}): Promise<WeeklyReportChannelRecord> {
  const body = await readJson<{ channel: WeeklyReportChannelRecord }>(
    await fetch(`${API_BASE}/v1/weekly-report-channels`, {
      method: "POST",
      credentials: "include",
      headers: buildBrowserSessionHeaders(true),
      body: JSON.stringify({
        project_id: payload.project_id,
        channel: payload.channel,
        config: payload.config,
        schedule: payload.schedule,
        is_enabled: payload.is_enabled ?? true
      })
    })
  );

  return body.channel;
}

export async function updateProjectWeeklyReportChannel(
  channelId: string,
  payload: {
    config?: { to: string[] } | { slack_destination_id: string };
    schedule?: WeeklyReportChannelRecord["schedule"];
    is_enabled?: boolean;
  }
): Promise<WeeklyReportChannelRecord> {
  const body = await readJson<{ channel: WeeklyReportChannelRecord }>(
    await fetch(`${API_BASE}/v1/weekly-report-channels/${channelId}`, {
      method: "PATCH",
      credentials: "include",
      headers: buildBrowserSessionHeaders(true),
      body: JSON.stringify(payload)
    })
  );

  return body.channel;
}

export async function deleteProjectWeeklyReportChannel(channelId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/v1/weekly-report-channels/${channelId}`, {
    method: "DELETE",
    credentials: "include",
    headers: buildBrowserSessionHeaders(true)
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `request_failed_${response.status}`);
  }
}

export async function createProjectAlert(payload: {
  project_id: string;
  service_id?: string;
  channel: AlertChannel;
  condition_type: AlertConditionType;
  severity_min?: "low" | "medium" | "high" | "critical";
  cooldown_seconds?: number;
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
        cooldown_seconds: payload.cooldown_seconds ?? 0,
        config: payload.config,
        is_enabled: payload.is_enabled ?? true
      })
    })
  );

  return body.alert;
}

export async function updateProjectAlert(
  alertId: string,
  projectId: string,
  payload: {
    service_id?: string | null;
    channel?: AlertChannel;
    condition_type?: AlertConditionType;
    severity_min?: "low" | "medium" | "high" | "critical" | null;
    cooldown_seconds?: number;
    config?: Record<string, unknown> | null;
    is_enabled?: boolean;
  }
): Promise<AlertRecord> {
  const body = await readJson<{ alert: AlertRecord }>(
    await fetch(`${API_BASE}/v1/alerts/${alertId}?project_id=${encodeURIComponent(projectId)}`, {
      method: "PATCH",
      credentials: "include",
      headers: buildBrowserSessionHeaders(true),
      body: JSON.stringify(payload)
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
  eventType: Extract<
    WebhookEventType,
    "verification.passed" | "verification.failed"
  > = "verification.passed"
): Promise<WebhookDeliveryRecord> {
  const body = await readJson<{ delivery: WebhookDeliveryRecord }>(
    await fetch(
      `${API_BASE}/v1/webhooks/${webhookId}/test?project_id=${encodeURIComponent(projectId)}`,
      {
        method: "POST",
        credentials: "include",
        headers: buildBrowserSessionHeaders(true),
        body: JSON.stringify({ event_type: eventType })
      }
    )
  );

  return body.delivery;
}

export async function createProjectToken(
  projectId: string,
  payload: { label: string; allowed_origins?: string[] }
): Promise<CreatedProjectToken> {
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

export async function listProjectProbeActivations(
  projectId: string
): Promise<ProbeActivationRecord[]> {
  const body = await readJson<{ activations: ProbeActivationRecord[] }>(
    await fetch(`${API_BASE}/v1/projects/${projectId}/probes`, {
      credentials: "include"
    })
  );

  return body.activations;
}

export async function createProjectProbeActivation(
  projectId: string,
  payload: {
    label_pattern: string;
    service: string;
    environment: string;
    ttl_seconds: number;
    trigger_ttl_seconds: number;
  }
): Promise<CreatedProbeActivation> {
  return readJson<CreatedProbeActivation>(
    await fetch(`${API_BASE}/v1/projects/${projectId}/probes/activate`, {
      method: "POST",
      credentials: "include",
      headers: buildBrowserSessionHeaders(true),
      body: JSON.stringify(payload)
    })
  );
}

export async function deactivateProjectProbeActivation(
  projectId: string,
  activationId: string
): Promise<ProbeActivationRecord> {
  const body = await readJson<{ deactivated: ProbeActivationRecord }>(
    await fetch(`${API_BASE}/v1/projects/${projectId}/probes/deactivate`, {
      method: "POST",
      credentials: "include",
      headers: buildBrowserSessionHeaders(true),
      body: JSON.stringify({ activation_id: activationId })
    })
  );

  return body.deactivated;
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
  const response = await fetch(
    `${API_BASE}/v1/alerts/${alertId}?project_id=${encodeURIComponent(projectId)}`,
    {
      method: "DELETE",
      credentials: "include",
      headers: buildBrowserSessionHeaders()
    }
  );

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

export async function bulkResolveIncidents(incidentIds: string[]): Promise<IncidentRecord[]> {
  const body = await readJson<{ incidents: IncidentRecord[] }>(
    await fetch(`${API_BASE}/v1/incidents/resolve`, {
      method: "POST",
      credentials: "include",
      headers: buildBrowserSessionHeaders(true),
      body: JSON.stringify({ incident_ids: incidentIds })
    })
  );

  return body.incidents;
}

export async function reopenIncident(incidentId: string): Promise<IncidentRecord> {
  const body = await readJson<{ incident: IncidentRecord }>(
    await fetch(`${API_BASE}/v1/incidents/${incidentId}/reopen`, {
      method: "POST",
      credentials: "include",
      headers: buildBrowserSessionHeaders()
    })
  );

  return body.incident;
}

export async function bulkReopenIncidents(incidentIds: string[]): Promise<IncidentRecord[]> {
  const body = await readJson<{ incidents: IncidentRecord[] }>(
    await fetch(`${API_BASE}/v1/incidents/reopen`, {
      method: "POST",
      credentials: "include",
      headers: buildBrowserSessionHeaders(true),
      body: JSON.stringify({ incident_ids: incidentIds })
    })
  );

  return body.incidents;
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

export async function snoozeImprovement(
  improvementId: string,
  snoozedUntil: string
): Promise<ImprovementRecord> {
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

export async function getIncidentBundle(
  incidentId: string
): Promise<{ status: "ready"; bundle: BundleRecord } | { status: "pending" | "failed" }> {
  const response = await fetch(`${API_BASE}/v1/incidents/${incidentId}/bundle`, {
    credentials: "include"
  });

  if (!response.ok) {
    throw new Error(`request_failed_${response.status}`);
  }

  const body = (await response.json()) as unknown;

  if (isArtifactPendingOrFailedResponse(body)) {
    return { status: body.status };
  }

  return { status: "ready", bundle: body as BundleRecord };
}

export type ArtifactPendingOrFailedResponse =
  | { status: "pending" }
  | { status: "failed"; reason?: string; related_incident_ids?: string[] };

export async function getImprovementBundle(
  projectId: string,
  improvementId: string
): Promise<{ status: "ready"; bundle: BundleRecord } | ArtifactPendingOrFailedResponse> {
  const response = await fetch(
    `${API_BASE}/v1/projects/${projectId}/improvements/${improvementId}/bundle`,
    {
      credentials: "include"
    }
  );

  if (!response.ok) {
    throw new Error(`request_failed_${response.status}`);
  }

  const body = (await response.json()) as unknown;

  if (isArtifactPendingOrFailedResponse(body)) {
    return body;
  }

  return { status: "ready", bundle: body as BundleRecord };
}

export async function getIncidentReproduction(
  incidentId: string
): Promise<
  { status: "ready"; reproduction: Record<string, unknown> } | { status: "pending" | "failed" }
> {
  const response = await fetch(`${API_BASE}/v1/incidents/${incidentId}/reproduction`, {
    credentials: "include"
  });

  if (!response.ok) {
    throw new Error(`request_failed_${response.status}`);
  }

  const body = (await response.json()) as unknown;

  if (isArtifactPendingOrFailedResponse(body)) {
    return { status: body.status };
  }

  return { status: "ready", reproduction: body as Record<string, unknown> };
}

function isArtifactPendingOrFailedResponse(
  value: unknown
): value is ArtifactPendingOrFailedResponse {
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
