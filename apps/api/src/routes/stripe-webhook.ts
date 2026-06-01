import type { FastifyInstance } from "fastify";
import Stripe from "stripe";

import type { RuntimeLogger } from "../../../../packages/runtime-logger/src/index.js";
import { getTierCapabilities, type TierName } from "../../../../packages/shared-types/src/index.js";
import type { AuditLogStore, BillingSyncStore } from "../../../../packages/storage/src/index.js";
import {
  buildEmailBrandMarkUrl,
  renderCapacityQuantityChangeEmail,
  renderEntitlementDowngradeConfirmationEmail,
  renderEntitlementDowngradeWarningEmail,
  renderPaymentFailureEmail,
  renderPaymentFailureReminderEmail,
  renderPlanChangeConfirmationEmail,
  renderPurchaseConfirmationEmail,
  renderRenewalSuccessEmail,
  type BillingEmailRendered
} from "../../../../packages/email/src/index.js";
import {
  derivePlanFromSubscriptionItems,
  deriveBillingState,
  isEntitlementEligible,
  type StripeConfig
} from "../stripe-config.js";
import { recordAuditLog } from "../audit-logging.js";

interface BillingSummarySnapshot {
  plan: TierName;
  additionalCapacityUnits: number;
  totalCapacityUnits: number;
}

interface BillingSummaryReader {
  getBillingSummaryForOrganization(input: {
    organization_id: string;
    now: string;
  }): Promise<{
    plan: TierName;
    active_projects: number;
    capacity_units: {
      total: number;
      additional_purchased: number;
    };
  } | null>;
}

interface BillingEmailService {
  managementUrl?: string;
  getBillingContactForOrganization(input: { organization_id: string }): Promise<{
    organizationName: string;
    recipientEmail: string;
  } | null>;
  send(input: {
    to: string[];
    subject: string;
    text: string;
    html: string;
  }): Promise<void>;
}

interface RecomputedEntitlements {
  effectivePlan: TierName;
  extraCapacityQuantity: number;
  billingPeriodStartsAt: string | null;
  billingPeriodEndsAt: string | null;
  totalCapacityUnits: number;
}

function readUnixTimestampField(source: unknown, key: string): number | null {
  if (typeof source !== "object" || source === null) {
    return null;
  }

  const value = (source as Record<string, unknown>)[key];
  return typeof value === "number" ? value : null;
}

function readSubscriptionInvoiceLinePeriod(source: unknown): { start: number | null; end: number | null } {
  if (typeof source !== "object" || source === null) {
    return { start: null, end: null };
  }

  const invoice = source as Record<string, unknown>;
  const lines = invoice["lines"];
  if (typeof lines !== "object" || lines === null) {
    return { start: null, end: null };
  }

  const data = (lines as Record<string, unknown>)["data"];
  if (!Array.isArray(data)) {
    return { start: null, end: null };
  }

  for (const line of data) {
    if (typeof line !== "object" || line === null) {
      continue;
    }

    const period = (line as Record<string, unknown>)["period"];
    if (typeof period !== "object" || period === null) {
      continue;
    }

    const start = readUnixTimestampField(period, "start");
    const end = readUnixTimestampField(period, "end");
    if (start !== null || end !== null) {
      return { start, end };
    }
  }

  return { start: null, end: null };
}

export interface StripeWebhookDependencies {
  stripeConfig: StripeConfig;
  billingSyncStore: BillingSyncStore;
  billingSummaryReader?: BillingSummaryReader;
  billingEmails?: BillingEmailService;
  auditLogging?: Pick<AuditLogStore, "createAuditLog">;
  logger?: Pick<RuntimeLogger, "warn" | "error">;
}

const MAX_BILLING_EMAIL_SEND_ATTEMPTS = 3;

export function registerStripeWebhookRoute(app: FastifyInstance, dependencies: StripeWebhookDependencies): void {
  const { stripeConfig } = dependencies;

  app.register((scope) => {
    scope.addContentTypeParser(
      "application/json",
      { parseAs: "buffer" },
      (_req, body, done) => {
        done(null, body);
      }
    );

    scope.post("/v1/billing/stripe-webhook", async (request, reply) => {
      const logger = request.log.child({ route: request.routeOptions.url });
      const signature = request.headers["stripe-signature"];
      if (typeof signature !== "string") {
        return reply.status(400).send({ error: "missing_stripe_signature" });
      }

      const rawBody = request.body;
      if (!(rawBody instanceof Buffer)) {
        return reply.status(400).send({ error: "invalid_body" });
      }

      let event: Stripe.Event;
      try {
        event = stripeConfig.client.webhooks.constructEvent(rawBody, signature, stripeConfig.webhookSecret);
      } catch {
        await recordAuditLog(dependencies.auditLogging, {
          organization_id: null,
          actor_user_id: null,
          actor_type: "system",
          action: "billing.webhook.process",
          target_type: "stripe_event",
          target_id: null,
          status: "failure",
          ip_address: request.ip,
          metadata: {
            reason: "invalid_signature"
          }
        }, logger);

        return reply.status(400).send({ error: "invalid_signature" });
      }

      const scopedDependencies: StripeWebhookDependencies = {
        ...dependencies,
        logger: logger.child({ stripe_event_id: event.id, stripe_event_type: event.type })
      };

      const alreadyProcessed = await dependencies.billingSyncStore.isEventProcessed(event.id);
      if (alreadyProcessed) {
        await recordAuditLog(dependencies.auditLogging, {
          organization_id: null,
          actor_user_id: null,
          actor_type: "system",
          action: "billing.webhook.process",
          target_type: "stripe_event",
          target_id: event.id,
          status: "success",
          ip_address: request.ip,
          metadata: {
            duplicate: true,
            event_type: event.type
          }
        }, scopedDependencies.logger);

        return reply.status(200).send({ received: true, duplicate: true });
      }

      try {
        const organizationId = await processStripeEvent(event, scopedDependencies);

        await recordAuditLog(dependencies.auditLogging, {
          organization_id: organizationId,
          actor_user_id: null,
          actor_type: "system",
          action: "billing.webhook.process",
          target_type: "stripe_event",
          target_id: event.id,
          status: "success",
          ip_address: request.ip,
          metadata: {
            duplicate: false,
            event_type: event.type
          }
        }, scopedDependencies.logger);
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown_error";
        await recordAuditLog(dependencies.auditLogging, {
          organization_id: null,
          actor_user_id: null,
          actor_type: "system",
          action: "billing.webhook.process",
          target_type: "stripe_event",
          target_id: event.id,
          status: "failure",
          ip_address: request.ip,
          metadata: {
            event_type: event.type,
            reason: message
          }
        }, scopedDependencies.logger);
        scopedDependencies.logger?.error({ error_message: message }, "stripe_webhook_processing_error");
        return reply.status(500).send({ error: "processing_failed" });
      }

      return reply.status(200).send({ received: true });
    });
  });
}

async function processStripeEvent(event: Stripe.Event, dependencies: StripeWebhookDependencies): Promise<string | null> {
  switch (event.type) {
    case "checkout.session.completed":
      return handleCheckoutSessionCompleted(event, dependencies);
    case "customer.subscription.created":
    case "customer.subscription.updated":
      return handleSubscriptionChange(event, dependencies);
    case "customer.subscription.deleted":
      return handleSubscriptionDeleted(event, dependencies);
    case "invoice.paid":
      return handleInvoicePaid(event, dependencies);
    case "invoice.payment_failed":
      return handleInvoicePaymentFailed(event, dependencies);
    default:
      await dependencies.billingSyncStore.markEventProcessed(event.id, event.type, null);
      return null;
  }
}

async function handleCheckoutSessionCompleted(
  event: Stripe.Event,
  dependencies: StripeWebhookDependencies
): Promise<string | null> {
  const session = event.data.object as Stripe.Checkout.Session;
  const organizationId = session.client_reference_id ?? (session.metadata?.["organization_id"] ?? null);

  if (organizationId === null) {
    dependencies.logger?.warn({ reason: "organization_missing" }, "stripe_webhook_no_organization");
    await dependencies.billingSyncStore.markEventProcessed(event.id, event.type, null);
    return null;
  }

  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  if (customerId === undefined || subscriptionId === undefined) {
    dependencies.logger?.warn(
      {
        customer_id: customerId ?? null,
        reason: "checkout_session_missing_billing_ids",
        subscription_id: subscriptionId ?? null
      },
      "stripe_webhook_missing_ids"
    );
    await dependencies.billingSyncStore.markEventProcessed(event.id, event.type, organizationId);
    return organizationId;
  }

  await dependencies.billingSyncStore.linkStripeCustomer(organizationId, customerId, subscriptionId);

  const subscription = await dependencies.stripeConfig.client.subscriptions.retrieve(subscriptionId, {
    expand: ["items.data", "latest_invoice"]
  });
  const entitlements = await recomputeEntitlements(subscription, organizationId, event.id, dependencies);

  if (entitlements.effectivePlan !== "free") {
    await sendBillingEmail(dependencies.billingEmails, organizationId, (contact) =>
      renderPurchaseConfirmationEmail({
        organizationName: contact.organizationName,
        plan: entitlements.effectivePlan,
        extraCapacity: entitlements.extraCapacityQuantity,
        portalUrl: dependencies.billingEmails?.managementUrl ?? fallbackManagementUrl(),
        brandMarkUrl: resolveBillingEmailBrandMarkUrl()
      })
    , dependencies.logger);
  }

  await dependencies.billingSyncStore.markEventProcessed(event.id, event.type, organizationId);
  return organizationId;
}

async function handleSubscriptionChange(
  event: Stripe.Event,
  dependencies: StripeWebhookDependencies
): Promise<string | null> {
  const subscription = event.data.object as Stripe.Subscription;
  const organizationId = await resolveOrganizationFromSubscription(subscription, dependencies.billingSyncStore);

  if (organizationId === null) {
    dependencies.logger?.warn(
      {
        customer_id: typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id ?? null,
        reason: "organization_missing"
      },
      "stripe_webhook_no_organization"
    );
    await dependencies.billingSyncStore.markEventProcessed(event.id, event.type, null);
    return null;
  }

  const previous = await readBillingSnapshot(dependencies.billingSummaryReader, organizationId);
  const entitlements = await recomputeEntitlements(subscription, organizationId, event.id, dependencies);

  if (event.type === "customer.subscription.updated" && previous !== null) {
    if (previous.plan !== "free" && entitlements.effectivePlan === "free") {
      await sendEntitlementDowngradeConfirmation(dependencies.billingEmails, organizationId, previous);
    } else {
      if (previous.plan !== entitlements.effectivePlan) {
        await sendBillingEmail(dependencies.billingEmails, organizationId, (contact) =>
          renderPlanChangeConfirmationEmail({
            organizationName: contact.organizationName,
            previousPlan: previous.plan,
            newPlan: entitlements.effectivePlan,
            extraCapacity: entitlements.extraCapacityQuantity,
            brandMarkUrl: resolveBillingEmailBrandMarkUrl()
          })
        , dependencies.logger);
      }

      if (previous.additionalCapacityUnits !== entitlements.extraCapacityQuantity) {
        await sendBillingEmail(dependencies.billingEmails, organizationId, (contact) =>
          renderCapacityQuantityChangeEmail({
            organizationName: contact.organizationName,
            plan: entitlements.effectivePlan,
            previousCapacity: previous.additionalCapacityUnits,
            newCapacity: entitlements.extraCapacityQuantity,
            totalCapacityUnits: entitlements.totalCapacityUnits,
            brandMarkUrl: resolveBillingEmailBrandMarkUrl()
          })
        , dependencies.logger);
      }
    }
  }

  await dependencies.billingSyncStore.markEventProcessed(event.id, event.type, organizationId);
  return organizationId;
}

async function handleSubscriptionDeleted(
  event: Stripe.Event,
  dependencies: StripeWebhookDependencies
): Promise<string | null> {
  const subscription = event.data.object as Stripe.Subscription;
  const organizationId = await resolveOrganizationFromSubscription(subscription, dependencies.billingSyncStore);

  if (organizationId === null) {
    dependencies.logger?.warn({ reason: "organization_missing" }, "stripe_webhook_no_organization");
    await dependencies.billingSyncStore.markEventProcessed(event.id, event.type, null);
    return null;
  }

  const previous = await readBillingSnapshot(dependencies.billingSummaryReader, organizationId);
  await dependencies.billingSyncStore.revokeEntitlements(organizationId, event.id);

  if (previous !== null && previous.plan !== "free") {
    await sendEntitlementDowngradeConfirmation(dependencies.billingEmails, organizationId, previous, dependencies.logger);
  }

  await dependencies.billingSyncStore.markEventProcessed(event.id, event.type, organizationId);
  return organizationId;
}

async function handleInvoicePaid(
  event: Stripe.Event,
  dependencies: StripeWebhookDependencies
): Promise<string | null> {
  const invoice = event.data.object as Stripe.Invoice;
  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;

  if (customerId === undefined) {
    await dependencies.billingSyncStore.markEventProcessed(event.id, event.type, null);
    return null;
  }

  const organizationId = await dependencies.billingSyncStore.resolveOrganizationByStripeCustomerId(customerId);
  if (organizationId === null) {
    dependencies.logger?.warn({ customer_id: customerId, reason: "organization_missing" }, "stripe_webhook_no_organization");
    await dependencies.billingSyncStore.markEventProcessed(event.id, event.type, null);
    return null;
  }

  const parentSubscription = invoice.parent?.subscription_details?.subscription;
  const subscriptionId = typeof parentSubscription === "string" ? parentSubscription : parentSubscription?.id;
  let entitlements: RecomputedEntitlements | null = null;

  if (subscriptionId !== undefined) {
    const subscription = await dependencies.stripeConfig.client.subscriptions.retrieve(subscriptionId, {
      expand: ["items.data", "latest_invoice"]
    });
    entitlements = await recomputeEntitlements(
      subscription,
      organizationId,
      event.id,
      dependencies,
      new Date(invoice.period_end * 1000).toISOString()
    );
  }

  const billingReason = typeof invoice.billing_reason === "string" ? invoice.billing_reason : null;
  if (entitlements !== null && billingReason !== "subscription_create" && entitlements.effectivePlan !== "free") {
    await sendBillingEmail(dependencies.billingEmails, organizationId, (contact) =>
      renderRenewalSuccessEmail({
        organizationName: contact.organizationName,
        plan: entitlements.effectivePlan,
        extraCapacity: entitlements.extraCapacityQuantity,
        nextRenewalDate: entitlements.billingPeriodEndsAt ?? new Date().toISOString(),
        brandMarkUrl: resolveBillingEmailBrandMarkUrl()
      })
    , dependencies.logger);
  }

  await dependencies.billingSyncStore.markEventProcessed(event.id, event.type, organizationId);
  return organizationId;
}

async function handleInvoicePaymentFailed(
  event: Stripe.Event,
  dependencies: StripeWebhookDependencies
): Promise<string | null> {
  const invoice = event.data.object as Stripe.Invoice;
  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;

  if (customerId === undefined) {
    await dependencies.billingSyncStore.markEventProcessed(event.id, event.type, null);
    return null;
  }

  const organizationId = await dependencies.billingSyncStore.resolveOrganizationByStripeCustomerId(customerId);
  if (organizationId === null) {
    dependencies.logger?.warn({ customer_id: customerId, reason: "organization_missing" }, "stripe_webhook_no_organization");
    await dependencies.billingSyncStore.markEventProcessed(event.id, event.type, null);
    return null;
  }

  const previous = await readBillingSnapshot(dependencies.billingSummaryReader, organizationId);
  await dependencies.billingSyncStore.updateBillingState(organizationId, "past_due", event.id);

  if (previous !== null && previous.plan !== "free") {
    const attemptCount = typeof invoice.attempt_count === "number" ? invoice.attempt_count : 1;
    const nextAttemptAt = typeof invoice.next_payment_attempt === "number"
      ? new Date(invoice.next_payment_attempt * 1000).toISOString()
      : null;
    const effectiveDate = resolveDowngradeEffectiveDate(invoice, nextAttemptAt);

    if (attemptCount <= 1) {
      await sendBillingEmail(dependencies.billingEmails, organizationId, (contact) =>
        renderPaymentFailureEmail({
          organizationName: contact.organizationName,
          plan: previous.plan,
          portalUrl: dependencies.billingEmails?.managementUrl ?? fallbackManagementUrl(),
          brandMarkUrl: resolveBillingEmailBrandMarkUrl()
        })
      , dependencies.logger);
    } else if (nextAttemptAt !== null) {
      await sendBillingEmail(dependencies.billingEmails, organizationId, (contact) =>
        renderPaymentFailureReminderEmail({
          organizationName: contact.organizationName,
          plan: previous.plan,
          portalUrl: dependencies.billingEmails?.managementUrl ?? fallbackManagementUrl(),
          daysUntilDowngrade: daysUntilIsoTimestamp(effectiveDate),
          brandMarkUrl: resolveBillingEmailBrandMarkUrl()
        })
      , dependencies.logger);
    }

    if (nextAttemptAt === null || attemptCount >= 3) {
      await sendBillingEmail(dependencies.billingEmails, organizationId, (contact) =>
        renderEntitlementDowngradeWarningEmail({
          organizationName: contact.organizationName,
          currentPlan: previous.plan,
          currentCapacityUnits: previous.totalCapacityUnits,
          effectiveDate,
          portalUrl: dependencies.billingEmails?.managementUrl ?? fallbackManagementUrl(),
          brandMarkUrl: resolveBillingEmailBrandMarkUrl()
        })
      );
    }
  }

  await dependencies.billingSyncStore.markEventProcessed(event.id, event.type, organizationId);
  return organizationId;
}

async function recomputeEntitlements(
  subscription: Stripe.Subscription,
  organizationId: string,
  eventId: string,
  dependencies: StripeWebhookDependencies,
  billingPeriodEndsAt?: string | null
): Promise<RecomputedEntitlements> {
  const { plan, extraCapacityQuantity } = derivePlanFromSubscriptionItems(
    subscription.items.data,
    dependencies.stripeConfig.priceMap
  );
  const billingState = deriveBillingState(subscription.status);
  const effectivePlan = isEntitlementEligible(billingState, "plan") ? plan : "free";
  const effectiveExtraCapacity = isEntitlementEligible(billingState, "extra_capacity") ? extraCapacityQuantity : 0;
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id ?? "";
  const currentPeriodStart = readUnixTimestampField(subscription, "current_period_start");
  const currentPeriodEnd = readUnixTimestampField(subscription, "current_period_end");
  const latestInvoice = typeof subscription.latest_invoice !== "string" && subscription.latest_invoice !== null
    ? subscription.latest_invoice
    : null;
  const latestInvoiceLinePeriod = readSubscriptionInvoiceLinePeriod(latestInvoice);
  const latestInvoicePeriodStart = readUnixTimestampField(latestInvoice, "period_start");
  const latestInvoicePeriodEnd = readUnixTimestampField(latestInvoice, "period_end");

  let periodStartsAt = typeof currentPeriodStart === "number"
    ? new Date(currentPeriodStart * 1000).toISOString()
    : null;

  let periodEndsAt = billingPeriodEndsAt ?? null;
  if (periodEndsAt === null || periodEndsAt === undefined) {
    if (typeof currentPeriodEnd === "number") {
      periodEndsAt = new Date(currentPeriodEnd * 1000).toISOString();
    } else if (latestInvoiceLinePeriod.end !== null) {
      periodEndsAt = new Date(latestInvoiceLinePeriod.end * 1000).toISOString();
    } else if (latestInvoicePeriodEnd !== null) {
      periodEndsAt = new Date(latestInvoicePeriodEnd * 1000).toISOString();
    }
  }

  if (periodStartsAt === null) {
    if (latestInvoiceLinePeriod.start !== null) {
      periodStartsAt = new Date(latestInvoiceLinePeriod.start * 1000).toISOString();
    } else if (latestInvoicePeriodStart !== null) {
      periodStartsAt = new Date(latestInvoicePeriodStart * 1000).toISOString();
    }
  }

  if (effectivePlan === "free") {
    periodStartsAt = null;
    periodEndsAt = null;
  } else if (periodStartsAt !== null && periodEndsAt !== null && periodStartsAt >= periodEndsAt) {
    periodStartsAt = null;
    periodEndsAt = null;
  }

  await dependencies.billingSyncStore.updateEntitlements({
    organization_id: organizationId,
    plan: effectivePlan,
    additional_capacity_units: effectiveExtraCapacity,
    billing_state: billingState,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    billing_period_starts_at: periodStartsAt,
    billing_period_ends_at: periodEndsAt,
    last_billing_sync_at: new Date().toISOString(),
    last_billing_event_id: eventId
  });

  return {
    effectivePlan,
    extraCapacityQuantity: effectiveExtraCapacity,
    billingPeriodStartsAt: periodStartsAt,
    billingPeriodEndsAt: periodEndsAt,
    totalCapacityUnits: getTierCapabilities(effectivePlan).included_capacity_units + effectiveExtraCapacity
  };
}

async function resolveOrganizationFromSubscription(
  subscription: Stripe.Subscription,
  billingSyncStore: BillingSyncStore
): Promise<string | null> {
  const fromMetadata = subscription.metadata?.["organization_id"];
  if (fromMetadata) {
    return fromMetadata;
  }

  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
  if (customerId === undefined) {
    return null;
  }

  return billingSyncStore.resolveOrganizationByStripeCustomerId(customerId);
}

async function readBillingSnapshot(
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

async function sendBillingEmail(
  service: BillingEmailService | undefined,
  organizationId: string,
  render: (contact: { organizationName: string; recipientEmail: string }) => BillingEmailRendered,
  logger?: Pick<RuntimeLogger, "warn" | "error">
): Promise<void> {
  if (service === undefined) {
    return;
  }

  const contact = await service.getBillingContactForOrganization({ organization_id: organizationId });
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

async function sendEntitlementDowngradeConfirmation(
  service: BillingEmailService | undefined,
  organizationId: string,
  previous: BillingSummarySnapshot,
  logger?: Pick<RuntimeLogger, "warn" | "error">
): Promise<void> {
  await sendBillingEmail(service, organizationId, (contact) =>
    renderEntitlementDowngradeConfirmationEmail({
      organizationName: contact.organizationName,
      previousPlan: previous.plan,
      previousCapacityUnits: previous.totalCapacityUnits,
      newCapacityUnits: getTierCapabilities("free").included_capacity_units,
      brandMarkUrl: resolveBillingEmailBrandMarkUrl()
    })
  , logger);
}

function resolveDowngradeEffectiveDate(invoice: Stripe.Invoice, nextAttemptAt: string | null): string {
  if (nextAttemptAt !== null) {
    return nextAttemptAt;
  }

  if (typeof invoice.period_end === "number") {
    return new Date(invoice.period_end * 1000).toISOString();
  }

  return new Date().toISOString();
}

function daysUntilIsoTimestamp(value: string): number {
  const diffMs = new Date(value).getTime() - Date.now();
  return Math.max(1, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
}

function resolveBillingEmailBrandMarkUrl(): string | undefined {
  const baseUrl =
    process.env["EMAIL_ASSET_BASE_URL"]
    ?? process.env["PUBLIC_SITE_URL"]
    ?? process.env["APP_BASE_URL"]
    ?? "http://localhost:3000";

  return buildEmailBrandMarkUrl(baseUrl);
}

function fallbackManagementUrl(): string {
  return `${(process.env["APP_BASE_URL"] ?? "http://localhost:3000").replace(/\/+$/, "")}/billing`;
}
