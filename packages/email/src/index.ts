import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

export {
  renderPurchaseConfirmationEmail,
  renderRenewalSuccessEmail,
  renderPaymentFailureEmail,
  renderPaymentFailureReminderEmail,
  renderEntitlementDowngradeWarningEmail,
  renderEntitlementDowngradeConfirmationEmail,
  renderPlanChangeConfirmationEmail,
  renderCapacityQuantityChangeEmail
} from "./billing-emails.js";
export type {
  BillingEmailRendered,
  PurchaseConfirmationInput,
  RenewalSuccessInput,
  PaymentFailureInput,
  PaymentFailureReminderInput,
  EntitlementDowngradeWarningInput,
  EntitlementDowngradeConfirmationInput,
  PlanChangeConfirmationInput,
  CapacityQuantityChangeInput
} from "./billing-emails.js";

export class EmailDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailDeliveryError";
  }
}

export interface EmailMessage {
  to: string[];
  subject: string;
  text: string;
  html: string;
}

export interface EmailTransport {
  send(message: EmailMessage): Promise<void>;
}

export interface WeeklyReportEmailInput {
  projectId: string;
  windowStart: string;
  windowEnd: string;
  bundleCounts: {
    failure: number;
    improvement: number;
  };
  newIncidents: number;
  regressions: number;
  topSpikingIncidents: Array<{
    incident_id: string;
    title: string;
    occurrence_count: number;
    spike_detected_at: string;
  }>;
}

export interface AlertEmailInput {
  conditionType: string;
  incidentId: string;
  occurredAt: string;
  serviceName: string;
  environment: string;
  severity: "low" | "medium" | "high" | "critical";
  incidentUrl?: string | null;
  bundleUrl?: string | null;
}

function escapeSlackMrkdwn(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function formatTopSpikesText(input: WeeklyReportEmailInput["topSpikingIncidents"]): string {
  if (input.length === 0) {
    return "None";
  }

  return input
    .map(
      (incident, index) =>
        `${index + 1}. ${incident.title} (${incident.occurrence_count} occurrences, spike at ${incident.spike_detected_at})`
    )
    .join("\n");
}

function formatTopSpikesHtml(input: WeeklyReportEmailInput["topSpikingIncidents"]): string {
  if (input.length === 0) {
    return "<p>None</p>";
  }

  const items = input
    .map(
      (incident) =>
        `<li><strong>${escapeHtml(incident.title)}</strong> (${incident.occurrence_count} occurrences, spike at ${escapeHtml(incident.spike_detected_at)})</li>`
    )
    .join("");

  return `<ol>${items}</ol>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function titleCase(value: string): string {
  if (value.length === 0) {
    return value;
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatAlertConditionLabel(conditionType: string): string {
  switch (conditionType) {
    case "new_incident":
      return "New incident";
    case "incident_regressed":
      return "Incident regressed";
    case "regression_after_deploy":
      return "Regression after deploy";
    case "error_spike":
      return "Error spike";
    case "severity_threshold":
      return "Severity threshold reached";
    default:
      return "Alert triggered";
  }
}

function formatAlertSubject(conditionType: string): string {
  switch (conditionType) {
    case "new_incident":
      return "[DebugBundle Alert] A new incident was detected";
    case "incident_regressed":
      return "[DebugBundle Alert] A resolved incident regressed";
    case "regression_after_deploy":
      return "[DebugBundle Alert] A regression was detected after deploy";
    case "error_spike":
      return "[DebugBundle Alert] An incident spike was detected";
    case "severity_threshold":
      return "[DebugBundle Alert] An incident crossed the severity threshold";
    default:
      return "[DebugBundle Alert] An alert was triggered";
  }
}

function formatAlertIntro(conditionType: string): string {
  switch (conditionType) {
    case "new_incident":
      return "DebugBundle detected a new incident that matched your alert rule.";
    case "incident_regressed":
      return "DebugBundle detected a regression for an incident that had previously been resolved.";
    case "regression_after_deploy":
      return "DebugBundle detected a regression after a recent deploy.";
    case "error_spike":
      return "DebugBundle detected an incident spike that matched your alert rule.";
    case "severity_threshold":
      return "DebugBundle detected an incident that crossed your configured severity threshold.";
    default:
      return "DebugBundle triggered an alert that matched your configured rule.";
  }
}

function formatAlertHeadline(conditionType: string): string {
  return formatAlertSubject(conditionType).replace("[DebugBundle Alert] ", "");
}

export function formatProductFromEmail(fromEmail: string, displayName = "DebugBundle"): string {
  const normalizedEmail = fromEmail.trim();
  const normalizedDisplayName = displayName.trim();

  if (normalizedDisplayName.length === 0 || normalizedEmail.includes("<")) {
    return normalizedEmail;
  }

  return `${normalizedDisplayName} <${normalizedEmail}>`;
}

export function renderEmailAuthCodeEmail(input: {
  code: string;
  appUrl?: string;
  expiresInMinutes: number;
}): { subject: string; text: string; html: string } {
  return {
    subject: "Your DebugBundle sign-in code",
    text: [
      "Use this code to continue with DebugBundle:",
      "",
      input.code,
      "",
      `This code expires in ${input.expiresInMinutes} minutes.`,
      "",
      ...(input.appUrl === undefined ? [] : [`Return to ${input.appUrl} to enter the code.`])
    ].join("\n"),
    html: [
      "<h1>Your DebugBundle sign-in code</h1>",
      "<p>Use this code to continue with DebugBundle.</p>",
      `<p style=\"font-size:32px;font-weight:700;letter-spacing:0.18em;\">${escapeHtml(input.code)}</p>`,
      `<p>This code expires in ${input.expiresInMinutes} minutes.</p>`,
      ...(input.appUrl === undefined ? [] : [`<p>Return to <a href=\"${escapeHtml(input.appUrl)}\">${escapeHtml(input.appUrl)}</a> to enter the code.</p>`])
    ].join("")
  };
}

export function renderOrganizationInviteEmail(input: { acceptUrl: string }): { subject: string; text: string; html: string } {
  return {
    subject: "You've been invited to DebugBundle",
    text: [
      "You've been invited to join a DebugBundle organization.",
      "",
      input.acceptUrl
    ].join("\n"),
    html: [
      "<h1>You're invited to DebugBundle</h1>",
      "<p>You've been invited to join a DebugBundle organization.</p>",
      `<p><a href=\"${escapeHtml(input.acceptUrl)}\">${escapeHtml(input.acceptUrl)}</a></p>`
    ].join("")
  };
}

export function renderWeeklyReportEmail(input: WeeklyReportEmailInput): { subject: string; text: string; html: string } {
  const subject = `DebugBundle weekly report for ${input.projectId}`;
  const text = [
    `Project: ${input.projectId}`,
    `Window: ${input.windowStart} to ${input.windowEnd}`,
    "",
    `Failure bundles: ${input.bundleCounts.failure}`,
    `Improvement bundles: ${input.bundleCounts.improvement}`,
    `New incidents: ${input.newIncidents}`,
    `Regressions: ${input.regressions}`,
    "",
    "Top spiking incidents:",
    formatTopSpikesText(input.topSpikingIncidents)
  ].join("\n");
  const html = [
    `<h1>DebugBundle weekly report</h1>`,
    `<p><strong>Project:</strong> ${escapeHtml(input.projectId)}</p>`,
    `<p><strong>Window:</strong> ${escapeHtml(input.windowStart)} to ${escapeHtml(input.windowEnd)}</p>`,
    `<ul>`,
    `<li><strong>Failure bundles:</strong> ${input.bundleCounts.failure}</li>`,
    `<li><strong>Improvement bundles:</strong> ${input.bundleCounts.improvement}</li>`,
    `<li><strong>New incidents:</strong> ${input.newIncidents}</li>`,
    `<li><strong>Regressions:</strong> ${input.regressions}</li>`,
    `</ul>`,
    `<h2>Top spiking incidents</h2>`,
    formatTopSpikesHtml(input.topSpikingIncidents)
  ].join("");

  return { subject, text, html };
}

export function renderAlertSlackMessage(input: AlertEmailInput): { text: string; blocks: Array<Record<string, unknown>> } {
  const headline = formatAlertHeadline(input.conditionType);
  const intro = formatAlertIntro(input.conditionType);
  const conditionLabel = formatAlertConditionLabel(input.conditionType);
  const severityLabel = titleCase(input.severity);
  const linkParts = [
    ...(input.incidentUrl === undefined || input.incidentUrl === null
      ? []
      : [`<${input.incidentUrl}|Open incident>`]),
    ...(input.bundleUrl === undefined || input.bundleUrl === null
      ? []
      : [`<${input.bundleUrl}|View bundle JSON>`])
  ];

  const text = [
    `[DebugBundle Alert] ${headline}`,
    `Alert: ${conditionLabel}`,
    `Service: ${input.serviceName}`,
    `Environment: ${input.environment}`,
    `Severity: ${severityLabel}`,
    `Incident ID: ${input.incidentId}`,
    `Detected at: ${input.occurredAt}`,
    ...(input.incidentUrl === undefined || input.incidentUrl === null ? [] : [`Open incident: ${input.incidentUrl}`]),
    ...(input.bundleUrl === undefined || input.bundleUrl === null ? [] : [`View bundle: ${input.bundleUrl}`])
  ].join("\n");

  const blocks: Array<Record<string, unknown>> = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*:rotating_light: ${escapeSlackMrkdwn(headline)}*\n${escapeSlackMrkdwn(intro)}`
      }
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Alert*\n${escapeSlackMrkdwn(conditionLabel)}`
        },
        {
          type: "mrkdwn",
          text: `*Severity*\n${escapeSlackMrkdwn(severityLabel)}`
        },
        {
          type: "mrkdwn",
          text: `*Service*\n${escapeSlackMrkdwn(input.serviceName)}`
        },
        {
          type: "mrkdwn",
          text: `*Environment*\n${escapeSlackMrkdwn(input.environment)}`
        },
        {
          type: "mrkdwn",
          text: `*Incident ID*\n${escapeSlackMrkdwn(input.incidentId)}`
        },
        {
          type: "mrkdwn",
          text: `*Detected at*\n${escapeSlackMrkdwn(input.occurredAt)}`
        }
      ]
    },
    ...(linkParts.length === 0
      ? []
      : [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: linkParts.join(" • ")
            }
          }
        ])
  ];

  return {
    text,
    blocks
  };
}

export function renderAlertEmail(input: AlertEmailInput): { subject: string; text: string; html: string } {
  const subject = formatAlertSubject(input.conditionType);
  const conditionLabel = formatAlertConditionLabel(input.conditionType);
  const severityLabel = titleCase(input.severity);
  const text = [
    formatAlertIntro(input.conditionType),
    "",
    `Alert: ${conditionLabel}`,
    `Service: ${input.serviceName}`,
    `Environment: ${input.environment}`,
    `Severity: ${severityLabel}`,
    `Incident ID: ${input.incidentId}`,
    `Detected at: ${input.occurredAt}`,
    ...(input.incidentUrl === undefined || input.incidentUrl === null ? [] : ["", `Open incident: ${input.incidentUrl}`]),
    ...(input.bundleUrl === undefined || input.bundleUrl === null ? [``, "Use the incident ID above to inspect the bundle in DebugBundle."] : ["", `View bundle: ${input.bundleUrl}`])
  ].join("\n");
  const html = [
    "<h1>DebugBundle alert</h1>",
    `<p>${escapeHtml(formatAlertIntro(input.conditionType))}</p>`,
    "<ul>",
    `<li><strong>Alert:</strong> ${escapeHtml(conditionLabel)}</li>`,
    `<li><strong>Service:</strong> ${escapeHtml(input.serviceName)}</li>`,
    `<li><strong>Environment:</strong> ${escapeHtml(input.environment)}</li>`,
    `<li><strong>Severity:</strong> ${escapeHtml(severityLabel)}</li>`,
    `<li><strong>Incident ID:</strong> ${escapeHtml(input.incidentId)}</li>`,
    `<li><strong>Detected at:</strong> ${escapeHtml(input.occurredAt)}</li>`,
    "</ul>",
    ...(input.incidentUrl === undefined || input.incidentUrl === null
      ? []
      : [`<p><a href="${escapeHtml(input.incidentUrl)}">Open incident in DebugBundle</a></p>`]),
    ...(input.bundleUrl === undefined || input.bundleUrl === null
      ? []
      : [`<p><a href="${escapeHtml(input.bundleUrl)}">View bundle JSON</a></p>`])
  ].join("");

  return { subject, text, html };
}

export function createSesEmailTransport(input: {
  region: string;
  fromEmail: string;
  timeoutMs: number;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  endpoint?: string;
}): EmailTransport {
  const client = new SESv2Client({
    region: input.region,
    ...(input.endpoint === undefined ? {} : { endpoint: input.endpoint }),
    ...(input.accessKeyId === undefined || input.secretAccessKey === undefined
      ? {}
      : {
          credentials: {
            accessKeyId: input.accessKeyId,
            secretAccessKey: input.secretAccessKey,
            ...(input.sessionToken === undefined ? {} : { sessionToken: input.sessionToken })
          }
        })
  });

  return {
    async send(message: EmailMessage): Promise<void> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

      try {
        await client.send(
          new SendEmailCommand({
            FromEmailAddress: input.fromEmail,
            Destination: {
              ToAddresses: message.to
            },
            Content: {
              Simple: {
                Subject: {
                  Data: message.subject,
                  Charset: "UTF-8"
                },
                Body: {
                  Text: {
                    Data: message.text,
                    Charset: "UTF-8"
                  },
                  Html: {
                    Data: message.html,
                    Charset: "UTF-8"
                  }
                }
              }
            }
          }),
          {
            abortSignal: controller.signal
          }
        );
      } catch (error) {
        if (error instanceof EmailDeliveryError) {
          throw error;
        }

        if (error instanceof Error && error.name === "AbortError") {
          throw new EmailDeliveryError("email_timeout");
        }

        const httpStatus =
          typeof error === "object" && error !== null && "$metadata" in error
            ? ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode ?? null)
            : null;
        if (typeof httpStatus === "number") {
          throw new EmailDeliveryError(`email_http_error_${httpStatus}`);
        }

        const messageText = error instanceof Error ? error.message : String(error);
        throw new EmailDeliveryError(`email_transport_error:${messageText}`);
      } finally {
        clearTimeout(timeout);
      }
    }
  };
}
