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

function buildAlertNotificationInput(
  input: Pick<CreateAlertTransportInput, "appBaseUrl" | "emailAssetBaseUrl" | "apiBaseUrl">,
  event: {
    incident_id?: string | null;
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
    ...(brandMarkUrl === undefined ? {} : { brandMarkUrl })
  };
}

function buildAlertDigestEntryInput(
  input: Pick<CreateAlertTransportInput, "appBaseUrl" | "apiBaseUrl">,
  item: {
    incident_id: string;
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
    summary: typeof item.payload["summary"] === "string" ? item.payload["summary"] : null
  };
}

export function createAlertTransport(input: CreateAlertTransportInput): AlertDeliveryTransport {
  async function deliverViaWebhook(
    targetUrl: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

    try {
      const response = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

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

      const message = error instanceof Error ? error.message : String(error);
      throw new AlertDeliveryError(`alert_transport_error:${message}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    async deliver(event): Promise<void> {
      const projectName = await input.resolveProjectName?.(event.project_id);

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
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new AlertDeliveryError(`alert_email_error:${message}`);
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
          typeof event.payload["summary"] === "string"
            ? event.payload["summary"]
            : "Alert triggered";
        const eventType =
          typeof event.payload["event_type"] === "string" ? event.payload["event_type"] : "alert";
        const discordPayload = {
          content:
            projectName === undefined || projectName === null
              ? `**[DebugBundle]** ${eventType}: ${summary}`
              : `**[DebugBundle]** ${eventType}: ${summary}\nProject: ${projectName}`,
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

        await deliverViaWebhook(targetUrlValue, {
          ...event.payload,
          ...(typeof event.payload["project_name"] === "string" ||
          projectName === undefined ||
          projectName === null
            ? {}
            : { project_name: projectName })
        });
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

      const projectName = await input.resolveProjectName?.(event.project_id);

      const rendered = renderAlertDigestEmail({
        brandMarkUrl: buildEmailBrandMarkUrl(input.emailAssetBaseUrl ?? input.appBaseUrl),
        alerts: event.items.map((item) =>
          buildAlertDigestEntryInput(input, {
            ...item,
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
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new AlertDeliveryError(`alert_email_error:${message}`);
      }
    }
  };
}
