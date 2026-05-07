import type { TierName } from "../../../packages/shared-types/src/index.js";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

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
      `Your DebugBundle organization "${input.organizationName}" is now on the ${input.plan} plan${capacity}.`,
      "",
      `Manage your subscription: ${input.portalUrl}`
    ].join("\n"),
    html: [
      `<h1>Subscription Confirmed</h1>`,
      `<p>Your organization <strong>${escapeHtml(input.organizationName)}</strong> is now on the <strong>${escapeHtml(input.plan)}</strong> plan${escapeHtml(capacity)}.</p>`,
      `<p><a href="${escapeHtml(input.portalUrl)}">Manage subscription</a></p>`
    ].join("")
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
      `Your ${input.plan} plan${capacity} for "${input.organizationName}" has been renewed.`,
      `Next renewal: ${input.nextRenewalDate}.`
    ].join("\n"),
    html: [
      `<h1>Subscription Renewed</h1>`,
      `<p>Your <strong>${escapeHtml(input.plan)}</strong> plan${escapeHtml(capacity)} for <strong>${escapeHtml(input.organizationName)}</strong> has been renewed.</p>`,
      `<p>Next renewal: ${escapeHtml(input.nextRenewalDate)}</p>`
    ].join("")
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
      `A payment for your ${input.plan} plan on "${input.organizationName}" could not be processed.`,
      "",
      "Your paid features remain active while Stripe retries the charge.",
      "If payment continues to fail, your entitlements may be reduced to the free tier.",
      "",
      `Update your payment method: ${input.portalUrl}`
    ].join("\n"),
    html: [
      `<h1>Payment Failed</h1>`,
      `<p>A payment for your <strong>${escapeHtml(input.plan)}</strong> plan on <strong>${escapeHtml(input.organizationName)}</strong> could not be processed.</p>`,
      `<p>Your paid features remain active while Stripe retries the charge. If payment continues to fail, your entitlements may be reduced to the free tier.</p>`,
      `<p><a href="${escapeHtml(input.portalUrl)}">Update payment method</a></p>`
    ].join("")
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
      `Payment for your ${input.plan} plan on "${input.organizationName}" remains unresolved.`,
      "",
      `If not resolved within ${input.daysUntilDowngrade} day(s), your organization will be downgraded to the free tier.`,
      "",
      `Update your payment method: ${input.portalUrl}`
    ].join("\n"),
    html: [
      `<h1>Payment Still Unresolved</h1>`,
      `<p>Payment for your <strong>${escapeHtml(input.plan)}</strong> plan on <strong>${escapeHtml(input.organizationName)}</strong> remains unresolved.</p>`,
      `<p>If not resolved within <strong>${input.daysUntilDowngrade} day(s)</strong>, your organization will be downgraded to the free tier.</p>`,
      `<p><a href="${escapeHtml(input.portalUrl)}">Update payment method</a></p>`
    ].join("")
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
      `Due to unresolved billing, your organization "${input.organizationName}" (currently ${input.currentPlan} with ${input.currentCapacityUnits} capacity unit(s)) will be downgraded to the free tier on ${input.effectiveDate}.`,
      "",
      "Free tier allowance limits will apply. Existing projects remain available, but your shared capacity will be reduced.",
      "",
      `Resolve payment to keep your plan: ${input.portalUrl}`
    ].join("\n"),
    html: [
      `<h1>Entitlement Downgrade Pending</h1>`,
      `<p>Due to unresolved billing, <strong>${escapeHtml(input.organizationName)}</strong> (currently <strong>${escapeHtml(input.currentPlan)}</strong> with <strong>${input.currentCapacityUnits}</strong> capacity unit(s)) will be downgraded to the free tier on <strong>${escapeHtml(input.effectiveDate)}</strong>.</p>`,
      `<p>Free tier allowance limits will apply. Existing projects remain available, but your shared capacity will be reduced.</p>`,
      `<p><a href="${escapeHtml(input.portalUrl)}">Resolve payment</a></p>`
    ].join("")
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
      `Your organization "${input.organizationName}" has been downgraded from ${input.previousPlan} (${input.previousCapacityUnits} capacity unit(s)) to the free tier (${input.newCapacityUnits} capacity unit(s)).`,
      "",
      "Your shared allowance capacity has been reduced. Existing projects remain available, and you can re-subscribe at any time to expand capacity again."
    ].join("\n"),
    html: [
      `<h1>Entitlements Reduced</h1>`,
      `<p><strong>${escapeHtml(input.organizationName)}</strong> has been downgraded from <strong>${escapeHtml(input.previousPlan)}</strong> (${input.previousCapacityUnits} capacity unit(s)) to the <strong>free</strong> tier (${input.newCapacityUnits} capacity unit(s)).</p>`,
      `<p>Your shared allowance capacity has been reduced. Existing projects remain available, and you can re-subscribe at any time to expand capacity again.</p>`
    ].join("")
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
      `Your organization "${input.organizationName}" plan has been changed from ${input.previousPlan} to ${input.newPlan}${capacity}.`,
      "",
      "Your entitlements have been updated to reflect the new plan."
    ].join("\n"),
    html: [
      `<h1>Plan Changed</h1>`,
      `<p><strong>${escapeHtml(input.organizationName)}</strong> plan has been changed from <strong>${escapeHtml(input.previousPlan)}</strong> to <strong>${escapeHtml(input.newPlan)}</strong>${escapeHtml(capacity)}.</p>`,
      `<p>Your entitlements have been updated to reflect the new plan.</p>`
    ].join("")
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
      `Extra capacity units for "${input.organizationName}" (${input.plan}) changed from ${input.previousCapacity} to ${input.newCapacity}.`,
      `Total allowance capacity is now ${input.totalCapacityUnits}.`
    ].join("\n"),
    html: [
      `<h1>Capacity Quantity Updated</h1>`,
      `<p>Extra capacity units for <strong>${escapeHtml(input.organizationName)}</strong> (${escapeHtml(input.plan)}) changed from <strong>${input.previousCapacity}</strong> to <strong>${input.newCapacity}</strong>.</p>`,
      `<p>Total allowance capacity is now <strong>${input.totalCapacityUnits}</strong>.</p>`
    ].join("")
  };
}
