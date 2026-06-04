import type { TierName } from "../../../packages/shared-types/src/index.js";
import {
  escapeHtml,
  renderEmailButton,
  renderEmailKeyValueList,
  renderEmailLayout,
  renderEmailParagraph
} from "./email-layout.js";

export interface BillingEmailRendered {
  subject: string;
  text: string;
  html: string;
}

export interface TrialStartedEmailInput {
  organizationName: string;
  trialPlan: TierName;
  trialEndsAt: string;
  billingUrl: string;
  brandMarkUrl?: string | undefined;
}

export interface TrialEndingSoonEmailInput {
  organizationName: string;
  trialPlan: TierName;
  trialEndsAt: string;
  daysRemaining: number;
  billingUrl: string;
  brandMarkUrl?: string | undefined;
}

export interface TrialExpiredEmailInput {
  organizationName: string;
  trialPlan: TierName;
  trialEndedAt: string;
  billingUrl: string;
  brandMarkUrl?: string | undefined;
}

export interface TrialConvertedEmailInput {
  organizationName: string;
  trialPlan: TierName;
  paidPlan: TierName;
  billingUrl: string;
  brandMarkUrl?: string | undefined;
}

export function renderTrialStartedEmail(input: TrialStartedEmailInput): BillingEmailRendered {
  return {
    subject: `DebugBundle: your ${input.trialPlan} trial has started`,
    text: [
      `Your 30-day ${input.trialPlan} trial for "${input.organizationName}" is active now.`,
      `Trial end: ${input.trialEndsAt}.`,
      "",
      "No credit card is required during the trial.",
      "Extra purchased capacity requires paid conversion.",
      "",
      `Manage billing: ${input.billingUrl}`
    ].join("\n"),
    html: renderEmailLayout({
      brandMarkUrl: input.brandMarkUrl,
      eyebrow: "Billing",
      title: "Trial started",
      intro: `Your 30-day ${escapeHtml(input.trialPlan)} trial for "${escapeHtml(input.organizationName)}" is active now.`,
      preheader: `${input.organizationName} started a ${input.trialPlan} trial ending on ${input.trialEndsAt}.`,
      bodyHtml: [
        renderEmailKeyValueList([
          { label: "Account", valueHtml: escapeHtml(input.organizationName) },
          { label: "Trial plan", valueHtml: escapeHtml(input.trialPlan) },
          { label: "Trial end", valueHtml: escapeHtml(input.trialEndsAt) }
        ]),
        renderEmailParagraph(
          "No credit card is required during the trial. Extra purchased capacity remains unavailable until you convert to a paid subscription."
        ),
        renderEmailButton({
          label: "View billing",
          url: input.billingUrl
        })
      ].join("")
    })
  };
}

export function renderTrialEndingSoonEmail(input: TrialEndingSoonEmailInput): BillingEmailRendered {
  return {
    subject: `DebugBundle: ${input.daysRemaining} day(s) left in your trial`,
    text: [
      `Your ${input.trialPlan} trial for "${input.organizationName}" ends in ${input.daysRemaining} day(s).`,
      `Trial end: ${input.trialEndsAt}.`,
      "",
      "Convert to a paid plan to keep paid features and unlock extra capacity purchases.",
      "",
      `Manage billing: ${input.billingUrl}`
    ].join("\n"),
    html: renderEmailLayout({
      brandMarkUrl: input.brandMarkUrl,
      eyebrow: "Billing",
      title: "Trial ending soon",
      intro: `Your ${escapeHtml(input.trialPlan)} trial for "${escapeHtml(input.organizationName)}" ends in ${input.daysRemaining} day(s).`,
      preheader: `${input.organizationName} has ${input.daysRemaining} day(s) left in its trial.`,
      bodyHtml: [
        renderEmailKeyValueList([
          { label: "Account", valueHtml: escapeHtml(input.organizationName) },
          { label: "Trial plan", valueHtml: escapeHtml(input.trialPlan) },
          { label: "Days remaining", valueHtml: `${input.daysRemaining}` },
          { label: "Trial end", valueHtml: escapeHtml(input.trialEndsAt) }
        ]),
        renderEmailParagraph(
          "Convert to a paid plan to keep paid features active and unlock extra purchased capacity."
        ),
        renderEmailButton({
          label: "Convert to paid",
          url: input.billingUrl
        })
      ].join("")
    })
  };
}

export function renderTrialExpiredEmail(input: TrialExpiredEmailInput): BillingEmailRendered {
  return {
    subject: "DebugBundle: your trial has ended",
    text: [
      `Your ${input.trialPlan} trial for "${input.organizationName}" ended on ${input.trialEndedAt}.`,
      "",
      "The account is now back on the free tier. Existing projects remain available, and you can convert to a paid plan at any time.",
      "",
      `Manage billing: ${input.billingUrl}`
    ].join("\n"),
    html: renderEmailLayout({
      brandMarkUrl: input.brandMarkUrl,
      eyebrow: "Billing",
      title: "Trial ended",
      intro: `Your ${escapeHtml(input.trialPlan)} trial for "${escapeHtml(input.organizationName)}" ended on ${escapeHtml(input.trialEndedAt)}.`,
      preheader: `${input.organizationName} moved back to the free tier after trial expiry.`,
      bodyHtml: [
        renderEmailKeyValueList([
          { label: "Account", valueHtml: escapeHtml(input.organizationName) },
          { label: "Expired trial", valueHtml: escapeHtml(input.trialPlan) },
          { label: "Ended at", valueHtml: escapeHtml(input.trialEndedAt) }
        ]),
        renderEmailParagraph(
          "The account is now back on the free tier. Existing projects remain available, and you can convert to a paid plan at any time."
        ),
        renderEmailButton({
          label: "View billing",
          url: input.billingUrl
        })
      ].join("")
    })
  };
}

export function renderTrialConvertedEmail(input: TrialConvertedEmailInput): BillingEmailRendered {
  return {
    subject: `DebugBundle: ${input.paidPlan} plan activated`,
    text: [
      `Your "${input.organizationName}" account has converted from a ${input.trialPlan} trial to the paid ${input.paidPlan} plan.`,
      "",
      `Manage billing: ${input.billingUrl}`
    ].join("\n"),
    html: renderEmailLayout({
      brandMarkUrl: input.brandMarkUrl,
      eyebrow: "Billing",
      title: "Trial converted",
      intro: `Your account "${escapeHtml(input.organizationName)}" has converted from a ${escapeHtml(input.trialPlan)} trial to the paid ${escapeHtml(input.paidPlan)} plan.`,
      preheader: `${input.organizationName} converted from trial to the paid ${input.paidPlan} plan.`,
      bodyHtml: [
        renderEmailKeyValueList([
          { label: "Account", valueHtml: escapeHtml(input.organizationName) },
          { label: "Trial plan", valueHtml: escapeHtml(input.trialPlan) },
          { label: "Paid plan", valueHtml: escapeHtml(input.paidPlan) }
        ]),
        renderEmailButton({
          label: "Manage billing",
          url: input.billingUrl
        })
      ].join("")
    })
  };
}

// --- 4.4 Purchase Confirmation ---

export interface PurchaseConfirmationInput {
  organizationName: string;
  plan: TierName;
  extraCapacity: number;
  portalUrl: string;
  brandMarkUrl?: string | undefined;
}

export function renderPurchaseConfirmationEmail(input: PurchaseConfirmationInput): BillingEmailRendered {
  const capacity = input.extraCapacity > 0 ? ` + ${input.extraCapacity} extra capacity unit(s)` : "";
  return {
    subject: `DebugBundle: ${input.plan} plan activated`,
    text: [
      `Your DebugBundle account "${input.organizationName}" is now on the ${input.plan} plan${capacity}.`,
      "",
      `Manage your subscription: ${input.portalUrl}`
    ].join("\n"),
    html: renderEmailLayout({
      brandMarkUrl: input.brandMarkUrl,
      eyebrow: "Billing",
      title: "Subscription confirmed",
      intro: `Your account "${escapeHtml(input.organizationName)}" is now on the ${escapeHtml(input.plan)} plan${escapeHtml(capacity)}.`,
      preheader: `Your ${input.plan} plan is active for ${input.organizationName}${capacity}.`,
      bodyHtml: [
        renderEmailKeyValueList([
          { label: "Account", valueHtml: escapeHtml(input.organizationName) },
          { label: "Plan", valueHtml: escapeHtml(input.plan) },
          { label: "Extra capacity", valueHtml: input.extraCapacity.toString() }
        ]),
        renderEmailButton({
          label: "Manage subscription",
          url: input.portalUrl
        })
      ].join("")
    })
  };
}

// --- 4.5 Renewal Success ---

export interface RenewalSuccessInput {
  organizationName: string;
  plan: TierName;
  extraCapacity: number;
  nextRenewalDate: string;
  brandMarkUrl?: string | undefined;
}

export function renderRenewalSuccessEmail(input: RenewalSuccessInput): BillingEmailRendered {
  const capacity = input.extraCapacity > 0 ? ` with ${input.extraCapacity} extra capacity unit(s)` : "";
  return {
    subject: `DebugBundle: subscription renewed`,
    text: [
      `Your ${input.plan} plan${capacity} for account "${input.organizationName}" has been renewed.`,
      `Next renewal: ${input.nextRenewalDate}.`
    ].join("\n"),
    html: renderEmailLayout({
      brandMarkUrl: input.brandMarkUrl,
      eyebrow: "Billing",
      title: "Subscription renewed",
      intro: `Your ${escapeHtml(input.plan)} plan${escapeHtml(capacity)} for account "${escapeHtml(input.organizationName)}" has been renewed.`,
      preheader: `Your ${input.plan} plan renewed; next renewal is ${input.nextRenewalDate}.`,
      bodyHtml: renderEmailKeyValueList([
        { label: "Account", valueHtml: escapeHtml(input.organizationName) },
        { label: "Plan", valueHtml: escapeHtml(input.plan) },
        { label: "Next renewal", valueHtml: escapeHtml(input.nextRenewalDate) }
      ])
    })
  };
}

// --- 4.6 Payment Failure ---

export interface PaymentFailureInput {
  organizationName: string;
  plan: TierName;
  portalUrl: string;
  brandMarkUrl?: string | undefined;
}

export function renderPaymentFailureEmail(input: PaymentFailureInput): BillingEmailRendered {
  return {
    subject: `DebugBundle: payment failed`,
    text: [
      `A payment for your ${input.plan} plan on account "${input.organizationName}" could not be processed.`,
      "",
      "Your paid features remain active while Stripe retries the charge.",
      "If payment continues to fail, your entitlements may be reduced to the free tier.",
      "",
      `Update your payment method: ${input.portalUrl}`
    ].join("\n"),
    html: renderEmailLayout({
      brandMarkUrl: input.brandMarkUrl,
      eyebrow: "Billing",
      title: "Payment failed",
      intro: `A payment for your ${escapeHtml(input.plan)} plan on account "${escapeHtml(input.organizationName)}" could not be processed.`,
      preheader: `Payment failed for ${input.organizationName}; paid features remain active while Stripe retries.`,
      bodyHtml: [
        renderEmailParagraph(
          "Your paid features remain active while Stripe retries the charge. If payment continues to fail, your entitlements may be reduced to the free tier."
        ),
        renderEmailButton({
          label: "Update payment method",
          url: input.portalUrl
        })
      ].join("")
    })
  };
}

// --- 4.7 Payment Failure Reminder ---

export interface PaymentFailureReminderInput {
  organizationName: string;
  plan: TierName;
  portalUrl: string;
  daysUntilDowngrade: number;
  brandMarkUrl?: string | undefined;
}

export function renderPaymentFailureReminderEmail(input: PaymentFailureReminderInput): BillingEmailRendered {
  return {
    subject: `DebugBundle: payment still unresolved`,
    text: [
      `Payment for your ${input.plan} plan on account "${input.organizationName}" remains unresolved.`,
      "",
      `If not resolved within ${input.daysUntilDowngrade} day(s), your account will be downgraded to the free tier.`,
      "",
      `Update your payment method: ${input.portalUrl}`
    ].join("\n"),
    html: renderEmailLayout({
      brandMarkUrl: input.brandMarkUrl,
      eyebrow: "Billing",
      title: "Payment still unresolved",
      intro: `Payment for your ${escapeHtml(input.plan)} plan on account "${escapeHtml(input.organizationName)}" remains unresolved.`,
      preheader: `Resolve payment within ${input.daysUntilDowngrade} day(s) to avoid a downgrade.`,
      bodyHtml: [
        renderEmailParagraph(
          `If not resolved within <strong>${input.daysUntilDowngrade} day(s)</strong>, your account will be downgraded to the free tier.`
        ),
        renderEmailButton({
          label: "Update payment method",
          url: input.portalUrl
        })
      ].join("")
    })
  };
}

// --- 4.8 Entitlement Downgrade Warning ---

export interface EntitlementDowngradeWarningInput {
  organizationName: string;
  currentPlan: TierName;
  currentCapacityUnits: number;
  effectiveDate: string;
  portalUrl: string;
  brandMarkUrl?: string | undefined;
}

export function renderEntitlementDowngradeWarningEmail(input: EntitlementDowngradeWarningInput): BillingEmailRendered {
  return {
    subject: `DebugBundle: entitlement downgrade pending`,
    text: [
      `Due to unresolved billing, your account "${input.organizationName}" (currently ${input.currentPlan} with ${input.currentCapacityUnits} capacity unit(s)) will be downgraded to the free tier on ${input.effectiveDate}.`,
      "",
      "Free tier allowance limits will apply. Existing projects remain available, but your shared capacity will be reduced.",
      "",
      `Resolve payment to keep your plan: ${input.portalUrl}`
    ].join("\n"),
    html: renderEmailLayout({
      brandMarkUrl: input.brandMarkUrl,
      eyebrow: "Billing",
      title: "Entitlement downgrade pending",
      intro: `Due to unresolved billing, your account "${escapeHtml(input.organizationName)}" (currently ${escapeHtml(input.currentPlan)} with ${input.currentCapacityUnits} capacity unit(s)) will be downgraded to the free tier on ${escapeHtml(input.effectiveDate)}.`,
      preheader: `${input.organizationName} will move from ${input.currentPlan} to the free tier on ${input.effectiveDate}.`,
      bodyHtml: [
        renderEmailKeyValueList([
          { label: "Current plan", valueHtml: escapeHtml(input.currentPlan) },
          { label: "Current capacity", valueHtml: `${input.currentCapacityUnits} capacity unit(s)` },
          { label: "Effective date", valueHtml: escapeHtml(input.effectiveDate) }
        ]),
        renderEmailParagraph(
          "Free tier allowance limits will apply. Existing projects remain available, but your shared capacity will be reduced."
        ),
        renderEmailButton({
          label: "Resolve payment",
          url: input.portalUrl
        })
      ].join("")
    })
  };
}

// --- 4.9 Entitlement Downgrade Confirmation ---

export interface EntitlementDowngradeConfirmationInput {
  organizationName: string;
  previousPlan: TierName;
  previousCapacityUnits: number;
  newCapacityUnits: number;
  brandMarkUrl?: string | undefined;
}

export function renderEntitlementDowngradeConfirmationEmail(input: EntitlementDowngradeConfirmationInput): BillingEmailRendered {
  return {
    subject: `DebugBundle: entitlements reduced`,
    text: [
      `Your account "${input.organizationName}" has been downgraded from ${input.previousPlan} (${input.previousCapacityUnits} capacity unit(s)) to the free tier (${input.newCapacityUnits} capacity unit(s)).`,
      "",
      "Your shared allowance capacity has been reduced. Existing projects remain available, and you can re-subscribe at any time to expand capacity again."
    ].join("\n"),
    html: renderEmailLayout({
      brandMarkUrl: input.brandMarkUrl,
      eyebrow: "Billing",
      title: "Entitlements reduced",
      intro: `Your account "${escapeHtml(input.organizationName)}" has been downgraded from ${escapeHtml(input.previousPlan)} (${input.previousCapacityUnits} capacity unit(s)) to the free tier (${input.newCapacityUnits} capacity unit(s)).`,
      preheader: `${input.organizationName} moved from ${input.previousPlan} to the free tier with ${input.newCapacityUnits} capacity unit(s).`,
      bodyHtml: [
        renderEmailKeyValueList([
          { label: "Previous plan", valueHtml: escapeHtml(input.previousPlan) },
          { label: "Previous capacity", valueHtml: `${input.previousCapacityUnits} capacity unit(s)` },
          { label: "New capacity", valueHtml: `${input.newCapacityUnits} capacity unit(s)` }
        ]),
        renderEmailParagraph(
          "Your shared allowance capacity has been reduced. Existing projects remain available, and you can re-subscribe at any time to expand capacity again."
        )
      ].join("")
    })
  };
}

// --- 4.10 Plan Change Confirmation ---

export interface PlanChangeConfirmationInput {
  organizationName: string;
  previousPlan: TierName;
  newPlan: TierName;
  extraCapacity: number;
  brandMarkUrl?: string | undefined;
}

export function renderPlanChangeConfirmationEmail(input: PlanChangeConfirmationInput): BillingEmailRendered {
  const capacity = input.extraCapacity > 0 ? ` with ${input.extraCapacity} extra capacity unit(s)` : "";
  return {
    subject: `DebugBundle: plan changed to ${input.newPlan}`,
    text: [
      `Your account "${input.organizationName}" plan has been changed from ${input.previousPlan} to ${input.newPlan}${capacity}.`,
      "",
      "Your entitlements have been updated to reflect the new plan."
    ].join("\n"),
    html: renderEmailLayout({
      brandMarkUrl: input.brandMarkUrl,
      eyebrow: "Billing",
      title: "Plan changed",
      intro: `Your account "${escapeHtml(input.organizationName)}" plan has been changed from ${escapeHtml(input.previousPlan)} to ${escapeHtml(input.newPlan)}${escapeHtml(capacity)}.`,
      preheader: `${input.organizationName} changed from ${input.previousPlan} to ${input.newPlan}${capacity}.`,
      bodyHtml: [
        renderEmailKeyValueList([
          { label: "Previous plan", valueHtml: escapeHtml(input.previousPlan) },
          { label: "New plan", valueHtml: escapeHtml(input.newPlan) },
          { label: "Extra capacity", valueHtml: input.extraCapacity.toString() }
        ]),
        renderEmailParagraph("Your entitlements have been updated to reflect the new plan.")
      ].join("")
    })
  };
}

// --- 4.11 Extra Capacity Quantity Change Confirmation ---

export interface CapacityQuantityChangeInput {
  organizationName: string;
  plan: TierName;
  previousCapacity: number;
  newCapacity: number;
  totalCapacityUnits: number;
  brandMarkUrl?: string | undefined;
}

export function renderCapacityQuantityChangeEmail(input: CapacityQuantityChangeInput): BillingEmailRendered {
  return {
    subject: `DebugBundle: capacity quantity updated`,
    text: [
      `Extra capacity units for account "${input.organizationName}" (${input.plan}) changed from ${input.previousCapacity} to ${input.newCapacity}.`,
      `Total allowance capacity is now ${input.totalCapacityUnits}.`
    ].join("\n"),
    html: renderEmailLayout({
      brandMarkUrl: input.brandMarkUrl,
      eyebrow: "Billing",
      title: "Capacity quantity updated",
      intro: `Extra capacity units for account "${escapeHtml(input.organizationName)}" (${escapeHtml(input.plan)}) changed from ${input.previousCapacity} to ${input.newCapacity}.`,
      preheader: `Extra capacity changed from ${input.previousCapacity} to ${input.newCapacity}; total capacity is ${input.totalCapacityUnits}.`,
      bodyHtml: renderEmailKeyValueList([
        { label: "Plan", valueHtml: escapeHtml(input.plan) },
        { label: "Previous extra capacity", valueHtml: input.previousCapacity.toString() },
        { label: "New extra capacity", valueHtml: input.newCapacity.toString() },
        { label: "Total capacity units", valueHtml: input.totalCapacityUnits.toString() }
      ])
    })
  };
}
