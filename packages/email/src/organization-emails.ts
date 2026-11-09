import {
  buildEmailBrandMarkUrl,
  escapeHtml,
  renderEmailButton,
  renderEmailLayout,
  renderEmailParagraph,
  renderEmailTextLink
} from "./email-layout.js";

export function renderOrganizationAccessEmail(input: {
  kind: "invite" | "ownership_transfer";
  organizationName: string;
  senderName: string;
  acceptUrl: string;
  accessSummary?: string;
  brandMarkUrl?: string | undefined;
}): { subject: string; text: string; html: string } {
  const transfer = input.kind === "ownership_transfer";
  const subject = transfer
    ? `Accept ownership of ${input.organizationName} in DebugBundle`
    : `Join ${input.organizationName} in DebugBundle`;
  const intro = transfer
    ? `${input.senderName} asked you to become the Owner of ${input.organizationName}. Accepting transfers organisation administration and billing responsibility. Your personal credentials remain yours.`
    : `${input.senderName} invited you to ${input.organizationName}. ${input.accessSummary ?? "Open the invitation to review your access."}`;
  const expiry = "This link expires. Sign in with the invited, verified email address to accept.";
  return {
    subject,
    text: [intro, "", expiry, "", input.acceptUrl].join("\n"),
    html: renderEmailLayout({
      brandMarkUrl: input.brandMarkUrl ?? buildEmailBrandMarkUrl(input.acceptUrl),
      eyebrow: transfer ? "Ownership transfer" : "Organisation invitation",
      title: subject,
      intro: escapeHtml(intro),
      preheader: intro,
      bodyHtml:
        renderEmailParagraph(escapeHtml(expiry)) +
        renderEmailButton({
          label: transfer ? "Review ownership transfer" : "Review invitation",
          url: input.acceptUrl
        }) +
        renderEmailParagraph(renderEmailTextLink({ label: input.acceptUrl, url: input.acceptUrl }))
    })
  };
}
