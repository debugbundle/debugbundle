import type { RuntimeLogger } from "../../runtime-logger/src/index.js";
import { getTierCapabilities, type TierName } from "../../shared-types/src/index.js";
import {
  buildEmailBrandMarkUrl,
  renderCapacityQuantityChangeEmail,
  renderEntitlementDowngradeConfirmationEmail,
  renderPlanChangeConfirmationEmail,
  type BillingEmailRendered
} from "../../email/src/index.js";
const MAX_BILLING_EMAIL_SEND_ATTEMPTS = 3;

export interface BillingSummarySnapshot {
  plan: TierName;
  additionalCapacityUnits: number;
  totalCapacityUnits: number;
}

export interface BillingSummaryReader {
  getBillingSummaryForOrganization(input: { organization_id: string; now: string }): Promise<{
    plan: TierName;
    active_projects: number;
    capacity_units: {
      total: number;
      additional_purchased: number;
    };
  } | null>;
}

export interface BillingEmailService {
  managementUrl?: string;
  getBillingContactForOrganization(input: { organization_id: string }): Promise<{
    organizationName: string;
    recipientEmail: string;
  } | null>;
  send(input: { to: string[]; subject: string; text: string; html: string }): Promise<void>;
}

export interface RecomputedEntitlements {
  applied: boolean;
  effectivePlan: TierName;
  extraCapacityQuantity: number;
  billingPeriodStartsAt: string | null;
  billingPeriodEndsAt: string | null;
  totalCapacityUnits: number;
}

export async function readBillingSnapshot(
  billingSummaryReader: BillingSummaryReader | undefined,
  organizationId: string
): Promise<BillingSummarySnapshot | null> {
  if (billingSummaryReader === undefined) {
    return null;
  }

  const summary = await billingSummaryReader.getBillingSummaryForOrganization({
    organization_id: organizationId,
    now: new Date().toISOString()
  });
  if (summary === null) {
    return null;
  }

  return {
    plan: summary.plan,
    additionalCapacityUnits: summary.capacity_units.additional_purchased,
    totalCapacityUnits: summary.capacity_units.total
  };
}

export async function sendBillingEmail(
  service: BillingEmailService | undefined,
  organizationId: string,
  render: (contact: { organizationName: string; recipientEmail: string }) => BillingEmailRendered,
  logger?: Pick<RuntimeLogger, "warn" | "error">
): Promise<void> {
  if (service === undefined) {
    return;
  }

  const contact = await service.getBillingContactForOrganization({
    organization_id: organizationId
  });
  if (contact === null) {
    logger?.warn({ organization_id: organizationId }, "stripe_billing_email_no_contact");
    return;
  }

  const rendered = render(contact);
  const message = {
    to: [contact.recipientEmail],
    subject: rendered.subject,
    text: rendered.text,
    html: rendered.html
  };

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_BILLING_EMAIL_SEND_ATTEMPTS; attempt += 1) {
    try {
      await service.send(message);
      return;
    } catch (error) {
      lastError = error;
      const errorMessage = error instanceof Error ? error.message : "unknown_error";

      if (attempt < MAX_BILLING_EMAIL_SEND_ATTEMPTS) {
        logger?.warn(
          {
            attempt,
            error_message: errorMessage,
            max_attempts: MAX_BILLING_EMAIL_SEND_ATTEMPTS,
            organization_id: organizationId,
            recipient_email: contact.recipientEmail,
            subject: rendered.subject
          },
          "stripe_billing_email_retry"
        );
        continue;
      }

      logger?.error(
        {
          attempts: MAX_BILLING_EMAIL_SEND_ATTEMPTS,
          error_message: errorMessage,
          organization_id: organizationId,
          recipient_email: contact.recipientEmail,
          subject: rendered.subject
        },
        "stripe_billing_email_delivery_failed"
      );
    }
  }

  throw lastError instanceof Error ? lastError : new Error("billing_email_send_failed");
}

export async function sendEntitlementDowngradeConfirmation(
  service: BillingEmailService | undefined,
  organizationId: string,
  previous: BillingSummarySnapshot,
  logger?: Pick<RuntimeLogger, "warn" | "error">
): Promise<void> {
  await sendBillingEmail(
    service,
    organizationId,
    (contact) =>
      renderEntitlementDowngradeConfirmationEmail({
        organizationName: contact.organizationName,
        previousPlan: previous.plan,
        previousCapacityUnits: previous.totalCapacityUnits,
        newCapacityUnits: getTierCapabilities("free").included_capacity_units,
        brandMarkUrl: resolveBillingEmailBrandMarkUrl()
      }),
    logger
  );
}

export function resolveBillingEmailBrandMarkUrl(): string | undefined {
  const baseUrl =
    process.env["EMAIL_ASSET_BASE_URL"] ??
    process.env["PUBLIC_SITE_URL"] ??
    process.env["APP_BASE_URL"] ??
    "http://localhost:3000";

  return buildEmailBrandMarkUrl(baseUrl);
}

export function fallbackManagementUrl(): string {
  return `${(process.env["APP_BASE_URL"] ?? "http://localhost:3000").replace(/\/+$/, "")}/billing`;
}

export async function sendBillingChangeConfirmations(
  service: BillingEmailService | undefined,
  organizationId: string,
  previous: BillingSummarySnapshot | null,
  entitlements: RecomputedEntitlements,
  logger?: Pick<RuntimeLogger, "warn" | "error">
): Promise<void> {
  if (!entitlements.applied || previous === null) return;
  if (previous.plan !== "free" && entitlements.effectivePlan === "free") {
    await sendEntitlementDowngradeConfirmation(service, organizationId, previous);
  } else {
    if (previous.plan !== entitlements.effectivePlan) {
      await sendBillingEmail(
        service,
        organizationId,
        (contact) =>
          renderPlanChangeConfirmationEmail({
            organizationName: contact.organizationName,
            previousPlan: previous.plan,
            newPlan: entitlements.effectivePlan,
            extraCapacity: entitlements.extraCapacityQuantity,
            brandMarkUrl: resolveBillingEmailBrandMarkUrl()
          }),
        logger
      );
    }

    if (previous.additionalCapacityUnits !== entitlements.extraCapacityQuantity) {
      await sendBillingEmail(
        service,
        organizationId,
        (contact) =>
          renderCapacityQuantityChangeEmail({
            organizationName: contact.organizationName,
            plan: entitlements.effectivePlan,
            previousCapacity: previous.additionalCapacityUnits,
            newCapacity: entitlements.extraCapacityQuantity,
            totalCapacityUnits: entitlements.totalCapacityUnits,
            brandMarkUrl: resolveBillingEmailBrandMarkUrl()
          }),
        logger
      );
    }
  }
}
