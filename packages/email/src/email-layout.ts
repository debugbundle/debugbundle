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

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderEmailParagraph(content: string): string {
  return `<p style="margin:0 0 16px;color:${EMAIL_TEXT_MUTED};font-size:16px;line-height:24px;">${content}</p>`;
}

export function renderEmailSubheading(text: string): string {
  return `<h2 style="margin:0 0 14px;color:${EMAIL_TEXT};font-size:17px;line-height:24px;font-weight:600;">${escapeHtml(text)}</h2>`;
}

export function renderEmailPanel(contentHtml: string): string {
  return `<div style="margin:0 0 20px;padding:16px 18px;border:1px solid ${EMAIL_BORDER};border-radius:12px;background-color:${EMAIL_PANEL_BACKGROUND};">${contentHtml}</div>`;
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
  return `<a href="${escapeHtml(input.url)}" style="color:${EMAIL_TEXT};text-decoration:underline;">${escapeHtml(input.label)}</a>`;
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

export function renderEmailKeyValueList(items: Array<{ label: string; valueHtml: string }>): string {
  return renderEmailPanel(
    [
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">',
      ...items.map((item, index) =>
        [
          `<tr${index > 0 ? ` style="border-top:1px solid ${EMAIL_BORDER};"` : ""}>`,
          `<td style="padding:${index === 0 ? "0 12px 0 0" : "12px 12px 0 0"};vertical-align:top;color:${EMAIL_TEXT_QUIET};font-size:13px;line-height:18px;font-weight:600;letter-spacing:0.02em;text-transform:uppercase;">${escapeHtml(item.label)}</td>`,
          `<td style="padding:${index === 0 ? "0" : "12px 0 0 0"};vertical-align:top;color:${EMAIL_TEXT};font-size:15px;line-height:22px;text-align:right;">${item.valueHtml}</td>`,
          "</tr>"
        ].join("")
      ),
      "</table>"
    ].join("")
  );
}

export function renderEmailLayout(input: {
  title: string;
  bodyHtml: string;
  eyebrow?: string;
  intro?: string;
  footerHtml?: string;
}): string {
  const introHtml = input.intro === undefined ? "" : renderEmailParagraph(input.intro);
  const footerHtml =
    input.footerHtml ??
    `<p style="margin:0;color:${EMAIL_TEXT_QUIET};font-size:13px;line-height:20px;">This is an automated email from DebugBundle.</p>`;

  return [
    `<div style="margin:0;padding:0;background-color:${EMAIL_BACKGROUND};">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;background-color:${EMAIL_BACKGROUND};">`,
    "<tr>",
    '<td align="center" style="padding:32px 16px;">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px;border-collapse:collapse;">',
    "<tr>",
    '<td style="padding:0 0 14px 0;">',
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">',
    "<tr>",
    `<td style="width:28px;height:28px;vertical-align:middle;">${DEBUGBUNDLE_EMAIL_MARK_SVG}</td>`,
    `<td style="padding-left:10px;vertical-align:middle;color:${EMAIL_TEXT};font-size:18px;line-height:24px;font-weight:600;">DebugBundle</td>`,
    "</tr>",
    "</table>",
    "</td>",
    "</tr>",
    "<tr>",
    `<td style="background-color:${EMAIL_CARD_BACKGROUND};border:1px solid ${EMAIL_BORDER};border-radius:16px;padding:32px 28px;">`,
    ...(input.eyebrow === undefined
      ? []
      : [
          `<p style="margin:0 0 10px;color:${EMAIL_TEXT_QUIET};font-size:12px;line-height:16px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;">${escapeHtml(input.eyebrow)}</p>`
        ]),
    `<h1 style="margin:0 0 12px;color:${EMAIL_TEXT};font-size:28px;line-height:34px;font-weight:650;">${escapeHtml(input.title)}</h1>`,
    introHtml,
    `<div style="color:${EMAIL_TEXT_MUTED};font-size:16px;line-height:24px;">${input.bodyHtml}</div>`,
    `<div style="margin-top:28px;padding-top:18px;border-top:1px solid ${EMAIL_BORDER};">${footerHtml}</div>`,
    "</td>",
    "</tr>",
    "</table>",
    "</td>",
    "</tr>",
    "</table>",
    "</div>"
  ].join("");
}
