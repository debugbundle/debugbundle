import {
  renderDailyIncidentDigestEmail,
  buildEmailBrandMarkUrl,
  type EmailTransport
} from "../../../packages/email/src/index.js";
import { sanitizeTelemetry } from "../../../packages/redaction/src/index.js";
import type { DailyNotificationDelivery } from "../../../packages/storage/src/notification-delivery-service.js";

export function createDailyNotificationTransport(input: {
  emailTransport: EmailTransport | null;
  appBaseUrl?: string | null;
  emailAssetBaseUrl?: string | null;
}): (delivery: DailyNotificationDelivery) => Promise<void> {
  return async (delivery) => {
    if (input.emailTransport === null) throw new Error("notification_email_unavailable");
    const safe = sanitizeTelemetry(delivery.items);
    if (!safe.ok || !Array.isArray(safe.value)) throw new Error("notification_email_unsafe");
    const items = safe.value as DailyNotificationDelivery["items"];
    const rendered = renderDailyIncidentDigestEmail({
      brandMarkUrl: buildEmailBrandMarkUrl(input.emailAssetBaseUrl ?? input.appBaseUrl),
      totalIncidentCount: delivery.total_incident_count,
      ...(input.appBaseUrl ? { allIncidentsUrl: `${input.appBaseUrl}/incidents` } : {}),
      alerts: items.map((item) => ({
        incidentId: item.incident_id,
        projectName: item.project_name,
        conditionType: item.condition_type,
        summary: item.summary,
        serviceName: item.service_name,
        environment: item.environment,
        occurredAt: item.occurred_at,
        severity:
          item.severity === "critical" || item.severity === "medium" || item.severity === "low"
            ? item.severity
            : "high",
        ...(input.appBaseUrl
          ? { incidentUrl: `${input.appBaseUrl}/incidents/${encodeURIComponent(item.incident_id)}` }
          : {})
      }))
    });
    await input.emailTransport.send({
      to: [delivery.recipient],
      ...rendered
    });
  };
}
