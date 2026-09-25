import { createHmac } from "node:crypto";

import {
  buildEmailBrandMarkUrl,
  renderAlertDigestEmail,
  renderAlertEmail,
  renderAlertSlackMessage,
  type AlertEmailInput,
  type EmailTransport
} from "../../../packages/email/src/index.js";
import {
  decryptIntegrationSecret,
  type SlackDestinationStore
} from "../../../packages/storage/src/index.js";
import { sanitizeTelemetry } from "../../../packages/redaction/src/index.js";
import {
  assertAlertOutboundTarget,
  fetchGuardedOutbound
} from "../../../packages/storage/src/alert-outbound-guard.js";
import {
  AlertDeliveryError,
  type AlertDeliveryTransport,
  type AlertEmailDigestTransport
} from "./processor.js";

interface CreateAlertTransportInput {
  timeoutMs: number;
  emailTransport: EmailTransport | null;
  slackDestinationStore?: Pick<SlackDestinationStore, "getSlackDestinationSecretForDelivery">;
  integrationSecretEncryptionKey?: string;
  appBaseUrl?: string | null;
  emailAssetBaseUrl?: string | null;
  apiBaseUrl?: string | null;
  resolveProjectName?: (projectId: string) => Promise<string | null>;
}

function safeAlertPayload(payload: unknown): Record<string, unknown> {
  const result = sanitizeTelemetry(payload);
  if (!result.ok || result.value === null || Array.isArray(result.value) || typeof result.value !== "object") {
    throw new AlertDeliveryError("alert_payload_unsafe");
  }
  return result.value;
}

function safeAlertText(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const result = sanitizeTelemetry(value);
  if (!result.ok || typeof result.value !== "string") throw new AlertDeliveryError("alert_payload_unsafe");
  return result.value;
}

function directGroupUrl(
  apiBaseUrl: string | null | undefined,
  event: { delivery_id?: string; project_id?: string }
): string | undefined {
  if (apiBaseUrl === undefined || apiBaseUrl === null ||
    event.delivery_id === undefined || event.project_id === undefined) return undefined;
  return `${apiBaseUrl}/v1/alert-groups/direct/${encodeURIComponent(event.delivery_id)}?project_id=${encodeURIComponent(event.project_id)}`;
}

function buildAlertNotificationInput(
  input: Pick<CreateAlertTransportInput, "appBaseUrl" | "emailAssetBaseUrl" | "apiBaseUrl">,
  event: {
    incident_id?: string | null;
    delivery_id?: string;
    project_id?: string;
    payload: Record<string, unknown>;
    project_name?: string | null;
  }
): AlertEmailInput {
  const incidentId =
    typeof event.payload["incident_id"] === "string"
      ? event.payload["incident_id"]
      : typeof event.incident_id === "string"
        ? event.incident_id
        : "unknown";
  const brandMarkUrl = buildEmailBrandMarkUrl(input.emailAssetBaseUrl ?? input.appBaseUrl);
  const groupUrl = directGroupUrl(input.apiBaseUrl, event);

  return {
    conditionType:
      typeof event.payload["condition_type"] === "string"
        ? event.payload["condition_type"]
        : "alert",
    incidentId,
    ...(typeof event.payload["project_name"] === "string"
      ? { projectName: event.payload["project_name"] }
      : event.project_name === undefined || event.project_name === null
        ? {}
        : { projectName: event.project_name }),
    occurredAt:
      typeof event.payload["occurred_at"] === "string" ? event.payload["occurred_at"] : "unknown",
    serviceName:
      typeof event.payload["service_name"] === "string" ? event.payload["service_name"] : "unknown",
    environment:
      typeof event.payload["environment"] === "string" ? event.payload["environment"] : "unknown",
    severity:
      event.payload["severity"] === "low" ||
      event.payload["severity"] === "medium" ||
      event.payload["severity"] === "high" ||
      event.payload["severity"] === "critical"
        ? event.payload["severity"]
        : "high",
    ...(input.appBaseUrl === undefined || input.appBaseUrl === null
      ? {}
      : { incidentUrl: `${input.appBaseUrl}/incidents/${incidentId}` }),
    ...(input.apiBaseUrl === undefined || input.apiBaseUrl === null
      ? {}
      : { bundleUrl: `${input.apiBaseUrl}/v1/incidents/${incidentId}/bundle` }),
    ...(groupUrl === undefined ? {} : { groupUrl }),
    ...(brandMarkUrl === undefined ? {} : { brandMarkUrl })
  };
}

function buildAlertDigestEntryInput(
  input: Pick<CreateAlertTransportInput, "appBaseUrl" | "apiBaseUrl">,
  item: {
    incident_id: string;
    condition_types?: string[];
    payload: Record<string, unknown>;
    project_name?: string | null;
  }
): AlertEmailInput & { summary: string | null } {
  return {
    ...buildAlertNotificationInput(input, {
      incident_id: item.incident_id,
      payload: item.payload,
      ...(item.project_name === undefined ? {} : { project_name: item.project_name })
    }),
    ...(item.condition_types === undefined ? {} : { conditionTypes: item.condition_types }),
    summary: typeof item.payload["summary"] === "string" ? item.payload["summary"] : null
  };
}

export function createAlertTransport(input: CreateAlertTransportInput): AlertDeliveryTransport {
  async function deliverViaWebhook(
    targetUrl: string,
    payload: Record<string, unknown>,
    signingSecret?: string | null
  ): Promise<void> {
    try {
      assertAlertOutboundTarget(targetUrl);
    } catch {
      throw new AlertDeliveryError("alert_target_blocked");
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), input.timeoutMs);
    const serializedPayload = JSON.stringify(safeAlertPayload(payload));

    try {
      const response = await fetchGuardedOutbound(targetUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(signingSecret === undefined || signingSecret === null ? {} : {
            "x-debugbundle-signature": `sha256=${createHmac("sha256", signingSecret).update(serializedPayload).digest("hex")}`
          })
        },
        body: serializedPayload,
        signal: controller.signal
      });

      if (response.status >= 300 && response.status < 400) {
        throw new AlertDeliveryError("alert_redirect_blocked");
      }

      if (!response.ok) {
        throw new AlertDeliveryError(`alert_http_error_${response.status}`);
      }
    } catch (error) {
      if (error instanceof AlertDeliveryError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new AlertDeliveryError("alert_timeout");
      }

      throw new AlertDeliveryError("alert_transport_error");
    } finally {
      // Only status is consumed; release any unread response body/connection.
      controller.abort();
      clearTimeout(timeout);
    }
  }

  return {
    async deliver(event): Promise<void> {
      const projectName = safeAlertText(await input.resolveProjectName?.(event.project_id));
      const safePayload = safeAlertPayload(event.payload);

      if (event.channel === "email") {
        if (input.emailTransport === null) {
          throw new AlertDeliveryError("alert_email_not_configured");
        }

        const toField = event.config["to"];
        const recipient = typeof toField === "string" ? toField.trim().toLowerCase() : "";

        if (recipient.length === 0) {
          throw new AlertDeliveryError("alert_email_recipients_missing");
        }
        const rendered = renderAlertEmail(
          buildAlertNotificationInput(input, {
            ...event,
            payload: safePayload,
            project_name: projectName ?? null
          })
        );

        try {
          await input.emailTransport.send({
            to: [recipient],
            subject: rendered.subject,
            text: rendered.text,
            html: rendered.html
          });
        } catch {
          throw new AlertDeliveryError("alert_email_error");
        }
        return;
      }

      if (event.channel === "slack") {
        let webhookUrl = event.config["webhook_url"] ?? event.config["url"];
        const slackDestinationId = event.config["slack_destination_id"];
        if (typeof slackDestinationId === "string" && slackDestinationId.length > 0) {
          if (input.slackDestinationStore === undefined) {
            throw new AlertDeliveryError("alert_slack_destination_store_missing");
          }
          if (
            input.integrationSecretEncryptionKey === undefined ||
            input.integrationSecretEncryptionKey.trim().length === 0
          ) {
            throw new AlertDeliveryError("alert_slack_encryption_key_missing");
          }

          const destination =
            await input.slackDestinationStore.getSlackDestinationSecretForDelivery({
              slack_destination_id: slackDestinationId
            });
          if (destination === null) {
            throw new AlertDeliveryError("alert_slack_destination_not_found");
          }

          try {
            webhookUrl = decryptIntegrationSecret(
              destination.webhook_url_ciphertext,
              input.integrationSecretEncryptionKey
            );
          } catch {
            throw new AlertDeliveryError("alert_slack_webhook_secret_invalid");
          }
        }
        if (typeof webhookUrl !== "string" || webhookUrl.length === 0) {
          throw new AlertDeliveryError("alert_slack_webhook_url_missing");
        }

        const slackPayload = renderAlertSlackMessage(
          buildAlertNotificationInput(input, {
            ...event,
            payload: safePayload,
            project_name: projectName ?? null
          })
        );

        await deliverViaWebhook(webhookUrl, slackPayload);
        return;
      }

      if (event.channel === "discord") {
        const webhookUrl = event.config["webhook_url"] ?? event.config["url"];
        if (typeof webhookUrl !== "string" || webhookUrl.length === 0) {
          throw new AlertDeliveryError("alert_discord_webhook_url_missing");
        }

        const summary =
          typeof safePayload["summary"] === "string"
            ? safePayload["summary"]
            : "Alert triggered";
        const eventType =
          typeof safePayload["event_type"] === "string" ? safePayload["event_type"] : "alert";
        const groupUrl = buildAlertNotificationInput(input, { ...event, payload: safePayload }).groupUrl;
        const content = projectName === undefined || projectName === null
          ? `**[DebugBundle]** ${eventType}: ${summary}`
          : `**[DebugBundle]** ${eventType}: ${summary}\nProject: ${projectName}`;
        const discordPayload = {
          content: `${content}${groupUrl === undefined ? "" : `\nGroup: ${groupUrl}`}`,
          embeds: [
            {
              title: eventType,
              description: summary,
              ...(projectName === undefined || projectName === null
                ? {}
                : {
                    fields: [
                      {
                        name: "Project",
                        value: projectName,
                        inline: true
                      }
                    ]
                  }),
              color: 0xff4444
            }
          ]
        };

        await deliverViaWebhook(webhookUrl, discordPayload);
        return;
      }

      if (event.channel === "webhook") {
        const targetUrlValue = event.config["target_url"] ?? event.config["url"];
        if (typeof targetUrlValue !== "string" || targetUrlValue.length === 0) {
          throw new AlertDeliveryError("alert_target_url_missing");
        }
        if (typeof event.signing_secret !== "string" || event.signing_secret.length === 0) {
          throw new AlertDeliveryError("alert_signing_secret_missing");
        }
        const groupUrl = directGroupUrl(input.apiBaseUrl, event);

        await deliverViaWebhook(targetUrlValue, {
          ...safePayload,
          ...(typeof safePayload["project_name"] === "string" ||
          projectName === undefined ||
          projectName === null
            ? {}
            : { project_name: projectName }),
          ...(event.webhook_payload_version !== 1 ||
            event.delivery_id === undefined || event.project_id === undefined
            ? {}
            : {
                alert_group_id: event.delivery_id,
                ...(groupUrl === undefined ? {} : { alert_group_url: groupUrl })
              })
        }, event.signing_secret);
        return;
      }

      throw new AlertDeliveryError(`alert_channel_not_supported:${event.channel as string}`);
    }
  };
}

export function createAlertEmailDigestTransport(
  input: Pick<
    CreateAlertTransportInput,
    "emailTransport" | "appBaseUrl" | "emailAssetBaseUrl" | "apiBaseUrl" | "resolveProjectName"
  >
): AlertEmailDigestTransport {
  return {
    async deliver(event): Promise<void> {
      if (input.emailTransport === null) {
        throw new AlertDeliveryError("alert_email_not_configured");
      }

      const projectName = safeAlertText(await input.resolveProjectName?.(event.project_id));

      const rendered = renderAlertDigestEmail({
        brandMarkUrl: buildEmailBrandMarkUrl(input.emailAssetBaseUrl ?? input.appBaseUrl),
        ...(event.total_incident_count === undefined ? {} : { totalIncidentCount: event.total_incident_count }),
        ...(input.appBaseUrl === undefined || input.appBaseUrl === null ? {} : {
          allIncidentsUrl: `${input.appBaseUrl}/projects/${event.project_id}/incidents`
        }),
        alerts: event.items.slice(0, 25).map((item) =>
          buildAlertDigestEntryInput(input, {
            ...item,
            payload: safeAlertPayload(item.payload),
            project_name: projectName ?? null
          })
        )
      });

      try {
        await input.emailTransport.send({
          to: [event.recipient],
          subject: rendered.subject,
          text: rendered.text,
          html: rendered.html
        });
      } catch {
        throw new AlertDeliveryError("alert_email_error");
      }
    }
  };
}
