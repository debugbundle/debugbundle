import { API_BASE, buildBrowserSessionHeaders, readJson } from "./api-client.js";
import { normalizeImprovementRecord, normalizeIncidentRecord } from "./api-record-normalizers.js";
import type {
  IncidentRecord,
  IncidentStatusFilter,
  ImprovementRecord
} from "./api-types.js";

export async function getIncident(incidentId: string): Promise<IncidentRecord> {
  const body = await readJson<{ incident: IncidentRecord }>(
    await fetch(`${API_BASE}/v1/incidents/${incidentId}`, {
      credentials: "include"
    })
  );
  return normalizeIncidentRecord(body.incident);
}

export async function getImprovement(improvementId: string): Promise<ImprovementRecord> {
  const body = await readJson<{ improvement: ImprovementRecord }>(
    await fetch(`${API_BASE}/v1/improvements/${improvementId}`, {
      credentials: "include"
    })
  );
  return normalizeImprovementRecord(body.improvement);
}

export async function resolveIncident(incidentId: string): Promise<IncidentRecord> {
  return mutateIncident(`/v1/incidents/${incidentId}/resolve`);
}

export async function reopenIncident(incidentId: string): Promise<IncidentRecord> {
  return mutateIncident(`/v1/incidents/${incidentId}/reopen`);
}

async function mutateIncident(path: string): Promise<IncidentRecord> {
  const body = await readJson<{ incident: IncidentRecord }>(
    await fetch(`${API_BASE}${path}`, {
      method: "POST",
      credentials: "include",
      headers: buildBrowserSessionHeaders()
    })
  );
  return normalizeIncidentRecord(body.incident);
}

export async function bulkResolveIncidents(incidentIds: string[]): Promise<IncidentRecord[]> {
  return mutateIncidents("/v1/incidents/resolve", incidentIds);
}

export async function bulkReopenIncidents(incidentIds: string[]): Promise<IncidentRecord[]> {
  return mutateIncidents("/v1/incidents/reopen", incidentIds);
}

async function mutateIncidents(path: string, incidentIds: string[]): Promise<IncidentRecord[]> {
  const body = await readJson<{ incidents: IncidentRecord[] }>(
    await fetch(`${API_BASE}${path}`, {
      method: "POST",
      credentials: "include",
      headers: buildBrowserSessionHeaders(true),
      body: JSON.stringify({ incident_ids: incidentIds })
    })
  );
  return body.incidents.map(normalizeIncidentRecord);
}

export async function resolveImprovement(improvementId: string): Promise<ImprovementRecord> {
  return mutateImprovement(improvementId, "resolve");
}

export async function reopenImprovement(improvementId: string): Promise<ImprovementRecord> {
  return mutateImprovement(improvementId, "reopen");
}

async function mutateImprovement(
  improvementId: string,
  action: "resolve" | "reopen"
): Promise<ImprovementRecord> {
  const body = await readJson<{ improvement: ImprovementRecord }>(
    await fetch(`${API_BASE}/v1/improvements/${improvementId}/${action}`, {
      method: "POST",
      credentials: "include",
      headers: buildBrowserSessionHeaders()
    })
  );
  return normalizeImprovementRecord(body.improvement);
}

export async function snoozeImprovement(
  improvementId: string,
  snoozedUntil: string
): Promise<ImprovementRecord> {
  const body = await readJson<{ improvement: ImprovementRecord }>(
    await fetch(`${API_BASE}/v1/improvements/${improvementId}/snooze`, {
      method: "POST",
      credentials: "include",
      headers: { ...buildBrowserSessionHeaders(), "content-type": "application/json" },
      body: JSON.stringify({ snoozed_until: snoozedUntil })
    })
  );
  return normalizeImprovementRecord(body.improvement);
}

export interface BundleRecord {
  bundle_id: string;
  incident_id: string;
  project_id: string;
  version: string;
  summary: { title: string; severity: string; environment: string };
  [key: string]: unknown;
}

export type ArtifactPendingOrFailedResponse =
  | { status: "pending" }
  | { status: "failed"; reason?: string; related_incident_ids?: string[] };

export async function getIncidentBundle(
  incidentId: string
): Promise<{ status: "ready"; bundle: BundleRecord } | { status: "pending" | "failed" }> {
  const body = await readArtifact(`/v1/incidents/${incidentId}/bundle`);
  return isArtifactPendingOrFailedResponse(body)
    ? { status: body.status }
    : { status: "ready", bundle: body as BundleRecord };
}

export async function getImprovementBundle(
  projectId: string,
  improvementId: string
): Promise<{ status: "ready"; bundle: BundleRecord } | ArtifactPendingOrFailedResponse> {
  const body = await readArtifact(
    `/v1/projects/${projectId}/improvements/${improvementId}/bundle`
  );
  return isArtifactPendingOrFailedResponse(body)
    ? body
    : { status: "ready", bundle: body as BundleRecord };
}

export async function getIncidentReproduction(
  incidentId: string
): Promise<
  { status: "ready"; reproduction: Record<string, unknown> } | { status: "pending" | "failed" }
> {
  const body = await readArtifact(`/v1/incidents/${incidentId}/reproduction`);
  return isArtifactPendingOrFailedResponse(body)
    ? { status: body.status }
    : { status: "ready", reproduction: body as Record<string, unknown> };
}

async function readArtifact(path: string): Promise<unknown> {
  const response = await fetch(`${API_BASE}${path}`, { credentials: "include" });
  if (!response.ok) throw new Error(`request_failed_${response.status}`);
  return (await response.json()) as unknown;
}

function isArtifactPendingOrFailedResponse(
  value: unknown
): value is ArtifactPendingOrFailedResponse {
  if (typeof value !== "object" || value === null || !("status" in value)) return false;
  const status = (value as { status?: unknown }).status;
  return status === "pending" || status === "failed";
}

export async function listProjectIncidents(
  projectId: string,
  limit = 50,
  cursor?: string,
  status?: IncidentStatusFilter
): Promise<{ incidents: IncidentRecord[]; nextCursor: string | null }> {
  const searchParams = new URLSearchParams({ project_id: projectId, limit: String(limit) });
  if (cursor !== undefined) searchParams.set("cursor", cursor);
  if (status !== undefined) searchParams.set("status", status);
  const body = await readJson<{ incidents: IncidentRecord[]; next_cursor: string | null }>(
    await fetch(`${API_BASE}/v1/incidents?${searchParams.toString()}`, {
      credentials: "include"
    })
  );
  return { incidents: body.incidents, nextCursor: body.next_cursor };
}

export async function listProjectImprovements(
  projectId: string,
  limit = 50,
  cursor?: string,
  status?: ImprovementRecord["status"]
): Promise<{ improvements: ImprovementRecord[]; nextCursor: string | null }> {
  const searchParams = new URLSearchParams({ project_id: projectId, limit: String(limit) });
  if (cursor !== undefined) searchParams.set("cursor", cursor);
  if (status !== undefined) searchParams.set("status", status);
  const body = await readJson<{ improvements: ImprovementRecord[]; next_cursor: string | null }>(
    await fetch(`${API_BASE}/v1/improvements?${searchParams.toString()}`, {
      credentials: "include"
    })
  );
  return {
    improvements: body.improvements.map(normalizeImprovementRecord),
    nextCursor: body.next_cursor
  };
}
