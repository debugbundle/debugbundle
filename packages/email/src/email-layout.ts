import { DEBUGBUNDLE_EMAIL_MARK_SVG } from "./assets/debugbundle-email-mark.js";

const EMAIL_BACKGROUND = "#f5f5f4";
const EMAIL_CARD_BACKGROUND = "#ffffff";
const EMAIL_PANEL_BACKGROUND = "#fafaf9";
const EMAIL_BORDER = "#e7e5e4";
const EMAIL_TEXT = "#1c1917";
const EMAIL_TEXT_MUTED = "#57534e";
const EMAIL_TEXT_QUIET = "#78716c";
const EMAIL_ACTION_BACKGROUND = "#111111";
const EMAIL_ACTION_TEXT = "#ffffff";
const EMAIL_BRAND_MARK_PATH = "/email/debugbundle-mark.png";

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function formatEmailDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  const datePart = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(parsed);
  const hasTime =
    parsed.getUTCHours() !== 0 ||
    parsed.getUTCMinutes() !== 0 ||
    parsed.getUTCSeconds() !== 0 ||
    parsed.getUTCMilliseconds() !== 0;

  if (!hasTime) {
    return datePart;
  }

  const timePart = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    hour: "numeric",
    minute: "2-digit"
  }).format(parsed);

  return `${datePart}, ${timePart} UTC`;
}

export function renderEmailParagraph(content: string): string {
  return `<p style="margin:0 0 16px;color:${EMAIL_TEXT_MUTED};font-size:16px;line-height:24px;word-break:break-word;overflow-wrap:anywhere;">${content}</p>`;
}

export function renderEmailSubheading(text: string): string {
  return `<h2 style="margin:0 0 14px;color:${EMAIL_TEXT};font-size:17px;line-height:24px;font-weight:600;">${escapeHtml(text)}</h2>`;
}

export function renderEmailPanel(contentHtml: string): string {
  return `<div class="db-email-panel" style="margin:0 0 20px;padding:14px;border:1px solid ${EMAIL_BORDER};border-radius:12px;background-color:${EMAIL_PANEL_BACKGROUND};">${contentHtml}</div>`;
}

export function renderEmailButton(input: { label: string; url: string }): string {
  return [
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;border-collapse:separate;">',
    "<tr>",
    `<td style="border-radius:10px;background-color:${EMAIL_ACTION_BACKGROUND};">`,
    `<a href="${escapeHtml(input.url)}" style="display:inline-block;padding:12px 18px;color:${EMAIL_ACTION_TEXT};font-size:15px;line-height:20px;font-weight:600;text-decoration:none;">${escapeHtml(input.label)}</a>`,
    "</td>",
    "</tr>",
    "</table>"
  ].join("");
}

export function renderEmailTextLink(input: { label: string; url: string }): string {
  return `<a href="${escapeHtml(input.url)}" style="color:${EMAIL_TEXT};text-decoration:underline;word-break:break-word;overflow-wrap:anywhere;">${escapeHtml(input.label)}</a>`;
}

export function buildEmailBrandMarkUrl(baseUrl: string | null | undefined): string | undefined {
  if (baseUrl === undefined || baseUrl === null || baseUrl.trim().length === 0) {
    return undefined;
  }

  try {
    return new URL(EMAIL_BRAND_MARK_PATH, baseUrl).toString();
  } catch {
    return undefined;
  }
}

export function renderEmailBulletList(items: string[]): string {
  return [
    `<ul style="margin:0 0 20px;padding:0 0 0 20px;color:${EMAIL_TEXT_MUTED};font-size:16px;line-height:24px;">`,
    ...items.map((item) => `<li style="margin:0 0 10px;">${item}</li>`),
    "</ul>"
  ].join("");
}

export function renderEmailOrderedList(items: string[]): string {
  return [
    `<ol style="margin:0 0 20px;padding:0 0 0 22px;color:${EMAIL_TEXT_MUTED};font-size:16px;line-height:24px;">`,
    ...items.map((item) => `<li style="margin:0 0 14px;">${item}</li>`),
    "</ol>"
  ].join("");
}

export function renderEmailKeyValueList(
  items: Array<{ label: string; valueHtml: string }>,
  options: { framed?: boolean } = {}
): string {
  const contentHtml = [
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">',
    ...items.map((item, index) =>
      [
        `<tr class="db-email-kv-row"${index > 0 ? ` style="border-top:1px solid ${EMAIL_BORDER};"` : ""}>`,
        `<td class="db-email-kv-label db-email-kv-label-${index === 0 ? "first" : "rest"}" style="display:table-cell;width:34%;padding:${index === 0 ? "0 12px 0 0" : "12px 12px 0 0"};vertical-align:top;color:${EMAIL_TEXT_QUIET};font-size:13px;line-height:18px;font-weight:600;letter-spacing:0.02em;text-transform:uppercase;text-align:left;">${escapeHtml(item.label)}</td>`,
        `<td class="db-email-kv-value db-email-kv-value-${index === 0 ? "first" : "rest"}${index === items.length - 1 ? " db-email-kv-value-last" : ""}" style="display:table-cell;width:66%;padding:${index === 0 ? "0" : "12px 0 0 0"};vertical-align:top;color:${EMAIL_TEXT};font-size:15px;line-height:22px;text-align:right;"><div class="db-email-kv-value-wrap" style="word-break:break-word;overflow-wrap:anywhere;">${item.valueHtml}</div></td>`,
        "</tr>"
      ].join("")
    ),
    "</table>"
  ].join("");

  return options.framed === false ? contentHtml : renderEmailPanel(contentHtml);
}

function renderEmailPreheader(preheader: string | undefined): string {
  if (preheader === undefined || preheader.trim().length === 0) {
    return "";
  }

  const spacer = "&zwnj;&nbsp;".repeat(32);
  return `<div class="db-email-preheader" style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;max-height:0;max-width:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader.trim())}${spacer}</div>`;
}

function renderEmailMark(brandMarkUrl: string | undefined): string {
  if (brandMarkUrl !== undefined) {
    return `<img src="${escapeHtml(brandMarkUrl)}" alt="" width="28" height="28" style="display:block;width:28px;height:28px;border:0;outline:none;text-decoration:none;" />`;
  }

  return DEBUGBUNDLE_EMAIL_MARK_SVG;
}

export function renderEmailLayout(input: {
  title: string;
  bodyHtml: string;
  eyebrow?: string;
  intro?: string;
  preheader?: string;
  footerHtml?: string;
  brandMarkUrl?: string | undefined;
}): string {
  const introHtml = input.intro === undefined ? "" : renderEmailParagraph(input.intro);
  const footerHtml =
    input.footerHtml ??
    `<p style="margin:0;color:${EMAIL_TEXT_QUIET};font-size:13px;line-height:20px;">This is an automated email from DebugBundle.</p>`;

  return [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    "<style>",
    "@media only screen and (max-width: 480px) {",
    "  .db-email-shell { padding-top:20px !important; padding-right:12px !important; padding-bottom:20px !important; padding-left:12px !important; }",
    "  .db-email-title { font-size:24px !important; line-height:30px !important; }",
    "  .db-email-kv-label, .db-email-kv-value { display:block !important; width:100% !important; text-align:left !important; }",
    "  .db-email-kv-label-first { padding:0 0 8px 0 !important; }",
    "  .db-email-kv-label-rest { padding:14px 0 8px 0 !important; }",
    "  .db-email-kv-value-first, .db-email-kv-value-rest { padding:0 0 16px 0 !important; }",
    "  .db-email-kv-value-last { padding-bottom:0 !important; }",
    "}",
    "</style>",
    "</head>",
    `<body bgcolor="${EMAIL_BACKGROUND}" style="margin:0;padding:0;background-color:${EMAIL_BACKGROUND};font-family:Arial,Helvetica,sans-serif;">`,
    renderEmailPreheader(input.preheader),
    `<div class="db-email-root" style="margin:0;padding:0;background-color:${EMAIL_BACKGROUND};font-family:Arial,Helvetica,sans-serif;">`,
    `<table class="db-email-frame" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${EMAIL_BACKGROUND}" style="width:100%;border-collapse:collapse;background-color:${EMAIL_BACKGROUND};">`,
    "<tr>",
    '<td align="center" class="db-email-shell" style="padding-top:32px;padding-right:16px;padding-bottom:32px;padding-left:16px;">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px;border-collapse:separate;mso-table-lspace:0pt;mso-table-rspace:0pt;">',
    "<tr>",
    '<td style="padding:0 0 14px 0;">',
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">',
    "<tr>",
    `<td style="width:28px;height:28px;vertical-align:middle;">${renderEmailMark(input.brandMarkUrl)}</td>`,
    `<td style="padding-left:12px;vertical-align:middle;color:${EMAIL_TEXT};font-size:18px;line-height:24px;font-weight:650;">DebugBundle</td>`,
    "</tr>",
    "</table>",
    "</td>",
    "</tr>",
    "<tr>",
    '<td style="padding:0;">',
    `<table class="db-email-card-shell" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${EMAIL_CARD_BACKGROUND}" style="width:100%;border-collapse:separate;background-color:${EMAIL_CARD_BACKGROUND};border:1px solid ${EMAIL_BORDER};border-radius:16px;mso-table-lspace:0pt;mso-table-rspace:0pt;">`,
    "<tr>",
    '<td class="db-email-card-top-space" height="32" style="height:32px;line-height:32px;font-size:1px;mso-line-height-rule:exactly;">&nbsp;</td>',
    "</tr>",
    "<tr>",
    '<td class="db-email-card-content" style="padding-left:28px;padding-right:28px;vertical-align:top;">',
    ...(input.eyebrow === undefined
      ? []
      : [
          `<p style="margin:0 0 10px;color:${EMAIL_TEXT_QUIET};font-size:12px;line-height:16px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;">${escapeHtml(input.eyebrow)}</p>`
        ]),
    `<h1 class="db-email-title" style="margin:0 0 12px;color:${EMAIL_TEXT};font-size:26px;line-height:32px;font-weight:650;">${escapeHtml(input.title)}</h1>`,
    introHtml,
    `<div style="color:${EMAIL_TEXT_MUTED};font-size:16px;line-height:24px;">${input.bodyHtml}</div>`,
    `<div class="db-email-footer" style="margin-top:28px;padding-top:18px;border-top:1px solid ${EMAIL_BORDER};">${footerHtml}</div>`,
    "</td>",
    "</tr>",
    "<tr>",
    '<td class="db-email-card-bottom-space" height="32" style="height:32px;line-height:32px;font-size:1px;mso-line-height-rule:exactly;">&nbsp;</td>',
    "</tr>",
    "</table>",
    "</td>",
    "</tr>",
    "</table>",
    "</td>",
    "</tr>",
    "</table>",
    "</div>",
    "</body>",
    "</html>"
  ].join("");
}
