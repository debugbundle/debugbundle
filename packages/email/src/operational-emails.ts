function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

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
    html: [
      "<h1>Webhook auto-disabled</h1>",
      `<p>DebugBundle automatically disabled a webhook in <strong>${escapeHtml(input.organizationName)}</strong> after repeated delivery failures.</p>`,
      "<ul>",
      `<li><strong>Project:</strong> ${escapeHtml(input.projectName)}</li>`,
      `<li><strong>Webhook ID:</strong> ${escapeHtml(input.webhookId)}</li>`,
      `<li><strong>Target URL:</strong> ${escapeHtml(input.targetUrl)}</li>`,
      "</ul>",
      "<p>The webhook reached <strong>50 consecutive final delivery failures</strong>, so DebugBundle stopped sending to it.</p>",
      "<p>Check the destination endpoint, then re-enable the webhook once it is healthy again.</p>",
      ...(input.webhooksUrl === undefined
        ? []
        : [`<p><a href="${escapeHtml(input.webhooksUrl)}">Manage project webhooks</a></p>`])
    ].join("")
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
    html: [
      `<h1>${escapeHtml(input.meterLabel)} allowance at 80%</h1>`,
      `<p>DebugBundle reached 80% of the <strong>${escapeHtml(input.meterLabel.toLowerCase())}</strong> allowance for <strong>${escapeHtml(input.organizationName)}</strong>.</p>`,
      "<ul>",
      `<li><strong>Project:</strong> ${escapeHtml(input.projectName)}</li>`,
      `<li><strong>Allowance:</strong> ${escapeHtml(input.meterLabel)}</li>`,
      `<li><strong>Usage:</strong> ${input.used} of ${input.limit}</li>`,
      ...(input.usageWindowEndsAt === undefined || input.usageWindowEndsAt === null
        ? []
        : [`<li><strong>Usage window ends:</strong> ${escapeHtml(input.usageWindowEndsAt)}</li>`]),
      "</ul>",
      `<p>If this allowance reaches 100%, ${escapeHtml(input.currentBehavior)}.</p>`,
      "<p>You can wait for the usage window to reset or expand allowance capacity from billing.</p>",
      ...(input.billingUrl === undefined
        ? []
        : [`<p><a href="${escapeHtml(input.billingUrl)}">Review billing and allowance usage</a></p>`])
    ].join("")
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
    html: [
      `<h1>${escapeHtml(input.meterLabel)} allowance limit reached</h1>`,
      `<p>DebugBundle reached the <strong>${escapeHtml(input.meterLabel.toLowerCase())}</strong> allowance limit for <strong>${escapeHtml(input.organizationName)}</strong>.</p>`,
      "<ul>",
      `<li><strong>Project:</strong> ${escapeHtml(input.projectName)}</li>`,
      `<li><strong>Allowance:</strong> ${escapeHtml(input.meterLabel)}</li>`,
      `<li><strong>Usage:</strong> ${input.used} of ${input.limit}</li>`,
      ...(input.usageWindowEndsAt === undefined || input.usageWindowEndsAt === null
        ? []
        : [`<li><strong>Usage window ends:</strong> ${escapeHtml(input.usageWindowEndsAt)}</li>`]),
      "</ul>",
      `<p><strong>Current behavior:</strong> ${escapeHtml(input.currentBehavior)}.</p>`,
      "<p>You can wait for the usage window to reset or expand allowance capacity from billing.</p>",
      ...(input.billingUrl === undefined
        ? []
        : [`<p><a href="${escapeHtml(input.billingUrl)}">Review billing and allowance usage</a></p>`])
    ].join("")
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
    html: [
      "<h1>Retained bundles rotated out</h1>",
      `<p>DebugBundle rotated out the oldest retained bundles in <strong>${escapeHtml(input.organizationName)}</strong> after the retained bundle cap was reached.</p>`,
      "<ul>",
      `<li><strong>Project:</strong> ${escapeHtml(input.projectName)}</li>`,
      `<li><strong>Rotated bundle owners:</strong> ${input.rotatedOwnerCount}</li>`,
      `<li><strong>Retention cap:</strong> ${input.retainedBundleLimit}</li>`,
      "</ul>",
      "<p>This is expected retention policy behavior, not data corruption.</p>",
      "<p>New bundles continue to be generated, and the oldest retained bundles are removed first to stay within the configured cap.</p>",
      "<p>You can expand allowance capacity from billing to raise the retained bundle cap.</p>",
      ...(input.billingUrl === undefined
        ? []
        : [`<p><a href="${escapeHtml(input.billingUrl)}">Review billing and allowance usage</a></p>`])
    ].join("")
  };
}
