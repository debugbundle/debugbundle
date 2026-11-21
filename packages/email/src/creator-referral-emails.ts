import {
  CreatorEmailPayloadSchema,
  type CreatorEmailPayload
} from "../../referrals/src/creator-email-contracts.js";
import {
  escapeHtml,
  renderEmailLayout,
  renderEmailParagraph,
  renderEmailButton,
  renderEmailSubheading,
  renderEmailKeyValueList
} from "./email-layout.js";

export function renderCreatorReferralEmail(
  raw: CreatorEmailPayload,
  options: {
    appBaseUrl: string;
    publicBaseUrl: string;
    brandMarkUrl?: string;
  }
): { subject: string; text: string; html: string } {
  const input = CreatorEmailPayloadSchema.parse(raw);
  const fixedUrl = (base: string, path: string): string => {
    const url = new URL(base);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
      throw new Error("creator_email_invalid_origin");
    return new URL(path, url.origin).toString();
  };
  const settings = fixedUrl(options.appBaseUrl, "/settings/referrals");
  const usd = (amount: number): string =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount / 100);
  let subject: string, paragraphs: string[], body: string;
  if (input.kind === "joined") {
    subject = `You're in: ${input.name}`;
    const share = fixedUrl(options.publicBaseUrl, `/r/${input.code}`);
    paragraphs = [
      `You've joined ${input.name}.`,
      `Your creator code: ${input.code}`,
      `Your referral link: ${share}`,
      `Your commission: ${input.commission_basis_points / 100}% of eligible collected payments for the first ${input.commission_months} ${input.commission_months === 1 ? "month" : "months"} of paid service.`,
      `Customer discount: ${input.discount_basis_points / 100}% off the first qualifying invoice.`,
      `Accepted terms: ${input.terms_version}. Your account shows the complete agreement.`,
      "You can choose your branded code and add payout preferences in Referrals. Earning does not require payout setup.",
      "We'll celebrate your first paid referral in this programme. After that, you'll receive one daily summary when new customers make their first qualifying paid purchase."
    ];
    body = paragraphs.map((paragraph) => renderEmailParagraph(escapeHtml(paragraph))).join("");
  } else {
    subject =
      input.kind === "first_purchase"
        ? `Your first paid referral in ${input.sections[0]!.name}!`
        : `Your referral day: ${input.total_referrals} new paying ${input.total_referrals === 1 ? "customer" : "customers"}`;
    const intro =
      input.kind === "first_purchase"
        ? "Congratulations! Your first qualifying referral purchase has been confirmed for this programme."
        : "Here are your newly confirmed paying referrals, grouped by programme.";
    paragraphs = [
      intro,
      `New paying customers: ${input.total_referrals}`,
      `Pending commission at confirmation: ${usd(input.total_commission_minor)} USD`
    ];
    body = paragraphs.map((paragraph) => renderEmailParagraph(escapeHtml(paragraph))).join("");
    for (const section of input.sections) {
      paragraphs.push(
        `\n${section.name}`,
        `New paying customers: ${section.new_referrals}`,
        `Pending commission at confirmation: ${usd(section.pending_commission_minor)} USD`
      );
      body +=
        renderEmailSubheading(section.name) +
        renderEmailKeyValueList([
          { label: "New paying customers", valueHtml: escapeHtml(String(section.new_referrals)) },
          {
            label: "Pending commission at confirmation",
            valueHtml: escapeHtml(`${usd(section.pending_commission_minor)} USD`)
          }
        ]);
    }
    if (input.other_programmes) {
      const more = `Your totals include ${input.other_programmes} more ${input.other_programmes === 1 ? "programme" : "programmes"}. See your account for all activity.`;
      paragraphs.push(more);
      body += renderEmailParagraph(escapeHtml(more));
    }
  }
  const caveat =
    "Earnings remain pending until the 30-day hold, cleared-funds and dispute checks complete. Refunds and payment adjustments can change these amounts. Routine payout review starts at $50 USD. Smaller balances carry forward.";
  paragraphs.push(caveat, `Open your referrals: ${settings}`);
  body +=
    renderEmailParagraph(escapeHtml(caveat)) +
    renderEmailButton({ label: "Open your referrals", url: settings });
  // Programme names are untrusted display text, including in mail headers.
  subject = subject.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 200);
  return {
    subject,
    text: paragraphs.join("\n\n"),
    html: renderEmailLayout({
      eyebrow: "Referrals",
      title: subject,
      preheader: paragraphs[0]!,
      bodyHtml: body,
      ...(options.brandMarkUrl ? { brandMarkUrl: options.brandMarkUrl } : {})
    })
  };
}
