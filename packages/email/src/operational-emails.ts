import {
  escapeHtml,
  renderEmailButton,
  renderEmailKeyValueList,
  renderEmailLayout,
  renderEmailParagraph,
  renderEmailTextLink
} from "./email-layout.js";

export interface OperationalEmailRendered {
  subject: string;
  text: string;
  html: string;
}

export interface WebhookAutoDisabledEmailInput {
  organizationName: string;
  projectName: string;
  webhookId: string;
  targetUrl: string;
  webhooksUrl?: string;
}

export interface AllowanceThresholdEmailInput {
  organizationName: string;
  projectName: string;
  meterLabel: string;
  used: number;
  limit: number;
  currentBehavior: string;
  usageWindowEndsAt?: string | null;
  billingUrl?: string;
}

export interface RetentionRotationNoticeEmailInput {
  organizationName: string;
  projectName: string;
  rotatedOwnerCount: number;
  retainedBundleLimit: number;
  billingUrl?: string;
}

export function renderWebhookAutoDisabledEmail(input: WebhookAutoDisabledEmailInput): OperationalEmailRendered {
  return {
    subject: "DebugBundle: webhook auto-disabled after repeated failures",
    text: [
      `DebugBundle automatically disabled a webhook in "${input.organizationName}" after repeated delivery failures.`,
      "",
      `Project: ${input.projectName}`,
      `Webhook ID: ${input.webhookId}`,
      `Target URL: ${input.targetUrl}`,
      "",
      "The webhook reached 50 consecutive final delivery failures, so DebugBundle stopped sending to it.",
      "Check the destination endpoint, then re-enable the webhook once it is healthy again.",
      ...(input.webhooksUrl === undefined ? [] : ["", `Manage project webhooks: ${input.webhooksUrl}`])
    ].join("\n"),
    html: renderEmailLayout({
      eyebrow: "Operational",
      title: "Webhook auto-disabled",
      intro: `DebugBundle automatically disabled a webhook in "${escapeHtml(input.organizationName)}" after repeated delivery failures.`,
      bodyHtml: [
        renderEmailKeyValueList([
          { label: "Project", valueHtml: escapeHtml(input.projectName) },
          { label: "Webhook ID", valueHtml: escapeHtml(input.webhookId) },
          { label: "Target URL", valueHtml: renderEmailTextLink({ label: input.targetUrl, url: input.targetUrl }) }
        ]),
        renderEmailParagraph(
          "The webhook reached <strong>50 consecutive final delivery failures</strong>, so DebugBundle stopped sending to it."
        ),
        renderEmailParagraph("Check the destination endpoint, then re-enable the webhook once it is healthy again."),
        ...(input.webhooksUrl === undefined
          ? []
          : [
              renderEmailButton({
                label: "Manage project webhooks",
                url: input.webhooksUrl
              })
            ])
      ].join("")
    })
  };
}

export function renderAllowanceWarning80Email(input: AllowanceThresholdEmailInput): OperationalEmailRendered {
  return {
    subject: `DebugBundle: 80% of ${input.meterLabel.toLowerCase()} allowance used`,
    text: [
      `DebugBundle reached 80% of the ${input.meterLabel.toLowerCase()} allowance for "${input.organizationName}".`,
      "",
      `Project: ${input.projectName}`,
      `Allowance: ${input.meterLabel}`,
      `Usage: ${input.used} of ${input.limit}`,
      ...(input.usageWindowEndsAt === undefined || input.usageWindowEndsAt === null
        ? []
        : [`Usage window ends: ${input.usageWindowEndsAt}`]),
      "",
      `If this allowance reaches 100%, ${input.currentBehavior}.`,
      "You can wait for the usage window to reset or expand allowance capacity from billing.",
      ...(input.billingUrl === undefined ? [] : ["", `Review billing and allowance usage: ${input.billingUrl}`])
    ].join("\n"),
    html: renderEmailLayout({
      eyebrow: "Operational",
      title: `${input.meterLabel} allowance at 80%`,
      intro: `DebugBundle reached 80% of the ${escapeHtml(input.meterLabel.toLowerCase())} allowance for "${escapeHtml(input.organizationName)}".`,
      bodyHtml: [
        renderEmailKeyValueList([
          { label: "Project", valueHtml: escapeHtml(input.projectName) },
          { label: "Allowance", valueHtml: escapeHtml(input.meterLabel) },
          { label: "Usage", valueHtml: `${input.used} of ${input.limit}` },
          ...(input.usageWindowEndsAt === undefined || input.usageWindowEndsAt === null
            ? []
            : [{ label: "Usage window ends", valueHtml: escapeHtml(input.usageWindowEndsAt) }])
        ]),
        renderEmailParagraph(`If this allowance reaches 100%, ${escapeHtml(input.currentBehavior)}.`),
        renderEmailParagraph("You can wait for the usage window to reset or expand allowance capacity from billing."),
        ...(input.billingUrl === undefined
          ? []
          : [
              renderEmailButton({
                label: "Review billing and allowance usage",
                url: input.billingUrl
              })
            ])
      ].join("")
    })
  };
}

export function renderAllowanceLimitReachedEmail(input: AllowanceThresholdEmailInput): OperationalEmailRendered {
  return {
    subject: `DebugBundle: ${input.meterLabel} allowance limit reached`,
    text: [
      `DebugBundle reached the ${input.meterLabel.toLowerCase()} allowance limit for "${input.organizationName}".`,
      "",
      `Project: ${input.projectName}`,
      `Allowance: ${input.meterLabel}`,
      `Usage: ${input.used} of ${input.limit}`,
      ...(input.usageWindowEndsAt === undefined || input.usageWindowEndsAt === null
        ? []
        : [`Usage window ends: ${input.usageWindowEndsAt}`]),
      "",
      `Current behavior: ${input.currentBehavior}.`,
      "You can wait for the usage window to reset or expand allowance capacity from billing.",
      ...(input.billingUrl === undefined ? [] : ["", `Review billing and allowance usage: ${input.billingUrl}`])
    ].join("\n"),
    html: renderEmailLayout({
      eyebrow: "Operational",
      title: `${input.meterLabel} allowance limit reached`,
      intro: `DebugBundle reached the ${escapeHtml(input.meterLabel.toLowerCase())} allowance limit for "${escapeHtml(input.organizationName)}".`,
      bodyHtml: [
        renderEmailKeyValueList([
          { label: "Project", valueHtml: escapeHtml(input.projectName) },
          { label: "Allowance", valueHtml: escapeHtml(input.meterLabel) },
          { label: "Usage", valueHtml: `${input.used} of ${input.limit}` },
          ...(input.usageWindowEndsAt === undefined || input.usageWindowEndsAt === null
            ? []
            : [{ label: "Usage window ends", valueHtml: escapeHtml(input.usageWindowEndsAt) }])
        ]),
        renderEmailParagraph(`<strong>Current behavior:</strong> ${escapeHtml(input.currentBehavior)}.`),
        renderEmailParagraph("You can wait for the usage window to reset or expand allowance capacity from billing."),
        ...(input.billingUrl === undefined
          ? []
          : [
              renderEmailButton({
                label: "Review billing and allowance usage",
                url: input.billingUrl
              })
            ])
      ].join("")
    })
  };
}

export function renderRetentionRotationNoticeEmail(
  input: RetentionRotationNoticeEmailInput
): OperationalEmailRendered {
  return {
    subject: "DebugBundle: retained bundles rotated out at the storage cap",
    text: [
      `DebugBundle rotated out the oldest retained bundles in "${input.organizationName}" after the retained bundle cap was reached.`,
      "",
      `Project: ${input.projectName}`,
      `Rotated bundle owners: ${input.rotatedOwnerCount}`,
      `Retention cap: ${input.retainedBundleLimit}`,
      "",
      "This is expected retention policy behavior, not data corruption.",
      "New bundles continue to be generated, and the oldest retained bundles are removed first to stay within the configured cap.",
      "You can expand allowance capacity from billing to raise the retained bundle cap.",
      ...(input.billingUrl === undefined ? [] : ["", `Review billing and allowance usage: ${input.billingUrl}`])
    ].join("\n"),
    html: renderEmailLayout({
      eyebrow: "Operational",
      title: "Retained bundles rotated out",
      intro: `DebugBundle rotated out the oldest retained bundles in "${escapeHtml(input.organizationName)}" after the retained bundle cap was reached.`,
      bodyHtml: [
        renderEmailKeyValueList([
          { label: "Project", valueHtml: escapeHtml(input.projectName) },
          { label: "Rotated bundle owners", valueHtml: input.rotatedOwnerCount.toString() },
          { label: "Retention cap", valueHtml: input.retainedBundleLimit.toString() }
        ]),
        renderEmailParagraph("This is expected retention policy behavior, not data corruption."),
        renderEmailParagraph(
          "New bundles continue to be generated, and the oldest retained bundles are removed first to stay within the configured cap."
        ),
        renderEmailParagraph("You can expand allowance capacity from billing to raise the retained bundle cap."),
        ...(input.billingUrl === undefined
          ? []
          : [
              renderEmailButton({
                label: "Review billing and allowance usage",
                url: input.billingUrl
              })
            ])
      ].join("")
    })
  };
}
