import { API_BASE, buildBrowserSessionHeaders, readJson } from "./api-client.js";
import type {
  AlertChannel,
  AlertConditionType,
  AlertSeverityLifecycleScope,
  AlertRecord
} from "./api-types.js";

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
  severity_lifecycle_scope?: AlertSeverityLifecycleScope;
  cooldown_seconds?: number;
  config: Record<string, unknown>;
  is_enabled?: boolean;
  signing?: "hmac_sha256_v1";
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
        severity_lifecycle_scope: payload.severity_lifecycle_scope,
        cooldown_seconds: payload.cooldown_seconds ?? 0,
        config: payload.config,
        is_enabled: payload.is_enabled ?? true,
        signing: payload.signing
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
    severity_lifecycle_scope?: AlertSeverityLifecycleScope | null;
    cooldown_seconds?: number;
    config?: Record<string, unknown> | null;
    is_enabled?: boolean;
    rotate_signing_secret?: true;
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
