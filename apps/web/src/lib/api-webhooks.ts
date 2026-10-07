import { RetryWebhookDeliveryResponseSchema } from "../../../../packages/webhook-client/src/index.js";
import { API_BASE, buildBrowserSessionHeaders, readJson } from "./api-client.js";
import type {
  CreatedWebhookRecord,
  WebhookDeliveryRecord,
  WebhookEventType,
  WebhookRecord
} from "./api-types.js";

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
  eventType: WebhookEventType = "verification.passed"
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
export async function updateProjectWebhook(
  webhookId: string,
  projectId: string,
  payload: {
    url?: string;
    events?: WebhookEventType[];
    filters?: WebhookRecord["filters"];
    is_enabled?: boolean;
  }
): Promise<WebhookRecord> {
  const body = await readJson<{ webhook: WebhookRecord }>(
    await fetch(
      `${API_BASE}/v1/webhooks/${webhookId}?project_id=${encodeURIComponent(projectId)}`,
      {
        method: "PATCH",
        credentials: "include",
        headers: buildBrowserSessionHeaders(true),
        body: JSON.stringify(payload)
      }
    )
  );
  return body.webhook;
}
export async function deleteProjectWebhook(webhookId: string, projectId: string): Promise<void> {
  const response = await fetch(
    `${API_BASE}/v1/webhooks/${webhookId}?project_id=${encodeURIComponent(projectId)}`,
    { method: "DELETE", credentials: "include", headers: buildBrowserSessionHeaders() }
  );
  if (!response.ok) await readJson(response);
}
export async function retryProjectWebhookDelivery(
  webhookId: string,
  deliveryId: string,
  projectId: string
): Promise<{ delivery_id: string; event_type: WebhookEventType }> {
  return RetryWebhookDeliveryResponseSchema.parse(
    await readJson(
      await fetch(
        `${API_BASE}/v1/webhooks/${webhookId}/deliveries/${deliveryId}/retry?project_id=${encodeURIComponent(projectId)}`,
        {
          method: "POST",
          credentials: "include",
          headers: buildBrowserSessionHeaders(true),
          body: "{}"
        }
      )
    )
  );
}
