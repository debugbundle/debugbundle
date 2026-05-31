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

// --- 4.4 Purchase Confirmation ---

export interface PurchaseConfirmationInput {
  organizationName: string;
  plan: TierName;
  extraCapacity: number;
  portalUrl: string;
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
}

export function renderCapacityQuantityChangeEmail(input: CapacityQuantityChangeInput): BillingEmailRendered {
  return {
    subject: `DebugBundle: capacity quantity updated`,
    text: [
      `Extra capacity units for account "${input.organizationName}" (${input.plan}) changed from ${input.previousCapacity} to ${input.newCapacity}.`,
      `Total allowance capacity is now ${input.totalCapacityUnits}.`
    ].join("\n"),
    html: renderEmailLayout({
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
