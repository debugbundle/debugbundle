import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import {
  escapeHtml,
  renderEmailButton,
  renderEmailKeyValueList,
  renderEmailLayout,
  renderEmailOrderedList,
  renderEmailPanel,
  renderEmailParagraph,
  renderEmailSubheading,
  renderEmailTextLink
} from "./email-layout.js";

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
export {
  renderAllowanceLimitReachedEmail,
  renderAllowanceWarning80Email,
  renderRetentionRotationNoticeEmail,
  renderWebhookAutoDisabledEmail
} from "./operational-emails.js";
export type {
  AllowanceThresholdEmailInput,
  OperationalEmailRendered,
  RetentionRotationNoticeEmailInput,
  WebhookAutoDisabledEmailInput
} from "./operational-emails.js";

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

export interface AlertDigestEmailEntryInput extends AlertEmailInput {
  summary: string | null;
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
    html: renderEmailLayout({
      eyebrow: "Sign-in",
      title: "Your DebugBundle sign-in code",
      intro: "Use this code to continue with DebugBundle.",
      bodyHtml: [
        renderEmailPanel(
          [
            '<p style="margin:0;color:#78716c;font-size:12px;line-height:16px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;text-align:center;">Verification code</p>',
            `<p style="margin:12px 0 0;color:#1c1917;font-size:32px;line-height:36px;font-weight:700;letter-spacing:0.18em;text-align:center;">${escapeHtml(input.code)}</p>`
          ].join("")
        ),
        renderEmailParagraph(`This code expires in ${input.expiresInMinutes} minutes.`),
        ...(input.appUrl === undefined
          ? []
          : [
              renderEmailButton({
                label: "Return to DebugBundle",
                url: input.appUrl
              })
            ])
      ].join("")
    })
  };
}

export function renderProjectInviteEmail(input: { acceptUrl: string }): { subject: string; text: string; html: string } {
  return {
    subject: "A DebugBundle project was shared with you",
    text: [
      "A DebugBundle project was shared with you.",
      "",
      input.acceptUrl
    ].join("\n"),
    html: renderEmailLayout({
      eyebrow: "Project invite",
      title: "A DebugBundle project was shared with you",
      intro: "Open the invite link to accept access to the shared project.",
      bodyHtml: [
        renderEmailButton({
          label: "Open invite",
          url: input.acceptUrl
        }),
        renderEmailParagraph(renderEmailTextLink({ label: input.acceptUrl, url: input.acceptUrl }))
      ].join("")
    })
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
  const html = renderEmailLayout({
    eyebrow: "Weekly report",
    title: "DebugBundle weekly report",
    intro: `Project ${escapeHtml(input.projectId)} from ${escapeHtml(input.windowStart)} to ${escapeHtml(input.windowEnd)}.`,
    bodyHtml: [
      renderEmailKeyValueList([
        { label: "Project", valueHtml: escapeHtml(input.projectId) },
        { label: "Window", valueHtml: `${escapeHtml(input.windowStart)} to ${escapeHtml(input.windowEnd)}` },
        { label: "Failure bundles", valueHtml: input.bundleCounts.failure.toString() },
        { label: "Improvement bundles", valueHtml: input.bundleCounts.improvement.toString() },
        { label: "New incidents", valueHtml: input.newIncidents.toString() },
        { label: "Regressions", valueHtml: input.regressions.toString() }
      ]),
      renderEmailSubheading("Top spiking incidents"),
      input.topSpikingIncidents.length === 0
        ? renderEmailParagraph("None")
        : renderEmailOrderedList(
            input.topSpikingIncidents.map(
              (incident) =>
                `<strong>${escapeHtml(incident.title)}</strong> (${incident.occurrence_count} occurrences, spike at ${escapeHtml(incident.spike_detected_at)})`
            )
          )
    ].join("")
  });

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
  const html = renderEmailLayout({
    eyebrow: "Alert",
    title: formatAlertHeadline(input.conditionType),
    intro: formatAlertIntro(input.conditionType),
    bodyHtml: [
      renderEmailKeyValueList([
        { label: "Alert", valueHtml: escapeHtml(conditionLabel) },
        { label: "Service", valueHtml: escapeHtml(input.serviceName) },
        { label: "Environment", valueHtml: escapeHtml(input.environment) },
        { label: "Severity", valueHtml: escapeHtml(severityLabel) },
        { label: "Incident ID", valueHtml: escapeHtml(input.incidentId) },
        { label: "Detected at", valueHtml: escapeHtml(input.occurredAt) }
      ]),
      ...(input.incidentUrl === undefined || input.incidentUrl === null
        ? []
        : [
            renderEmailButton({
              label: "Open incident in DebugBundle",
              url: input.incidentUrl
            })
          ]),
      ...(input.bundleUrl === undefined || input.bundleUrl === null
        ? [renderEmailParagraph("Use the incident ID above to inspect the bundle in DebugBundle.")]
        : [renderEmailParagraph(renderEmailTextLink({ label: "View bundle JSON", url: input.bundleUrl }))])
    ].join("")
  });

  return { subject, text, html };
}

export function renderAlertDigestEmail(input: {
  alerts: AlertDigestEmailEntryInput[];
}): { subject: string; text: string; html: string } {
  const groupedAlerts = new Map<
    string,
    AlertDigestEmailEntryInput & {
      conditionLabels: string[];
    }
  >();

  for (const alert of input.alerts) {
    const existing = groupedAlerts.get(alert.incidentId);
    const conditionLabel = formatAlertConditionLabel(alert.conditionType);

    if (existing === undefined) {
      groupedAlerts.set(alert.incidentId, {
        ...alert,
        conditionLabels: [conditionLabel]
      });
      continue;
    }

    if (!existing.conditionLabels.includes(conditionLabel)) {
      existing.conditionLabels.push(conditionLabel);
    }
  }

  const alerts = Array.from(groupedAlerts.values());
  const incidentCount = alerts.length;
  const subject =
    incidentCount === 1
      ? "[DebugBundle Alerts] 1 incident matched your alerts"
      : `[DebugBundle Alerts] ${incidentCount} incidents matched your alerts`;

  const text = [
    incidentCount === 1
      ? "DebugBundle batched 1 incident into this alert digest."
      : `DebugBundle batched ${incidentCount} incidents into this alert digest.`,
    "",
    ...alerts.flatMap((alert, index) => [
      `${index + 1}. ${alert.summary ?? "Alert triggered"}`,
      `   Incident ID: ${alert.incidentId}`,
      `   Alerts: ${alert.conditionLabels.join(", ")}`,
      `   Service: ${alert.serviceName}`,
      `   Environment: ${alert.environment}`,
      `   Severity: ${titleCase(alert.severity)}`,
      `   Detected at: ${alert.occurredAt}`,
      ...(alert.incidentUrl === undefined || alert.incidentUrl === null ? [] : [`   Open incident: ${alert.incidentUrl}`]),
      ...(alert.bundleUrl === undefined || alert.bundleUrl === null ? [] : [`   View bundle: ${alert.bundleUrl}`]),
      ""
    ])
  ].join("\n").trimEnd();

  const html = renderEmailLayout({
    eyebrow: "Alert digest",
    title: "DebugBundle alert digest",
    intro:
      incidentCount === 1
        ? "DebugBundle batched 1 incident into this alert digest."
        : `DebugBundle batched ${incidentCount} incidents into this alert digest.`,
    bodyHtml: alerts
      .map((alert, index) =>
        renderEmailPanel(
          [
            `<p style="margin:0 0 14px;color:#1c1917;font-size:16px;line-height:24px;font-weight:600;">${index + 1}. ${escapeHtml(alert.summary ?? "Alert triggered")}</p>`,
            renderEmailKeyValueList([
              { label: "Incident ID", valueHtml: escapeHtml(alert.incidentId) },
              { label: "Alerts", valueHtml: escapeHtml(alert.conditionLabels.join(", ")) },
              { label: "Service", valueHtml: escapeHtml(alert.serviceName) },
              { label: "Environment", valueHtml: escapeHtml(alert.environment) },
              { label: "Severity", valueHtml: escapeHtml(titleCase(alert.severity)) },
              { label: "Detected at", valueHtml: escapeHtml(alert.occurredAt) }
            ]),
            ...(alert.incidentUrl === undefined || alert.incidentUrl === null
              ? []
              : [
                  renderEmailButton({
                    label: "Open incident in DebugBundle",
                    url: alert.incidentUrl
                  })
                ]),
            ...(alert.bundleUrl === undefined || alert.bundleUrl === null
              ? []
              : [renderEmailParagraph(renderEmailTextLink({ label: "View bundle JSON", url: alert.bundleUrl }))])
          ].join("")
        )
      )
      .join("")
  });

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
