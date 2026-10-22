import { assertSupportedSubscriptionItems } from "../../../../packages/billing/src/stripe-subscription.js";
import {
  readBillingSnapshot,
  sendBillingEmail,
  sendEntitlementDowngradeConfirmation,
  resolveBillingEmailBrandMarkUrl,
  fallbackManagementUrl,
  sendBillingChangeConfirmations,
  type BillingSummaryReader,
  type BillingEmailService,
  type RecomputedEntitlements
} from "../../../../packages/billing/src/stripe-webhook-emails.js";
import { resolveStripeSubscriptionBillingPeriod } from "../stripe-billing-period.js";
import type { BillingWebhookTransaction } from "../../../../packages/billing/src/stripe-webhook-transaction.js";
import { reconcileStripeSubscriptionOperation } from "../../../../packages/billing/src/stripe-operation-reconciliation.js";
import type { BillingSubscriptionOperationStore } from "../../../../packages/storage/src/billing-subscription-operation-store.js";
import { BILLING_PROVIDER_REQUEST_OPTIONS } from "../../../../packages/billing/src/stripe-subscription-upgrade.js";
import type { FastifyInstance } from "fastify";
import Stripe from "stripe";

import type { RuntimeLogger } from "../../../../packages/runtime-logger/src/index.js";
import { getTierCapabilities } from "../../../../packages/shared-types/src/index.js";
import type { AuditLogStore, BillingSyncStore } from "../../../../packages/storage/src/index.js";
import {
  renderEntitlementDowngradeWarningEmail,
  renderPaymentFailureEmail,
  renderPaymentFailureReminderEmail,
  renderPurchaseConfirmationEmail,
  renderRenewalSuccessEmail
} from "../../../../packages/email/src/index.js";
import {
  derivePlanFromSubscriptionItems,
  deriveBillingState,
  isEntitlementEligible,
  type StripeConfig
} from "../stripe-config.js";
import { recordAuditLog } from "../audit-logging.js";

export interface StripeWebhookDependencies {
  stripeConfig: StripeConfig;
  billingSyncStore: BillingSyncStore;
  eventTransaction?: BillingWebhookTransaction;
  subscriptionOperationStore?: BillingSubscriptionOperationStore;
  billingSummaryReader?: BillingSummaryReader;
  billingEmails?: BillingEmailService;
  auditLogging?: Pick<AuditLogStore, "createAuditLog">;
  logger?: Pick<RuntimeLogger, "warn" | "error">;
}

export function registerStripeWebhookRoute(
  app: FastifyInstance,
  dependencies: StripeWebhookDependencies
): void {
  const { stripeConfig } = dependencies;

  app.register((scope) => {
    scope.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => {
      done(null, body);
    });

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
        event = stripeConfig.client.webhooks.constructEvent(
          rawBody,
          signature,
          stripeConfig.webhookSecret
        );
      } catch {
        await recordAuditLog(
          dependencies.auditLogging,
          {
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
          },
          logger
        );

        return reply.status(400).send({ error: "invalid_signature" });
      }

      const scopedDependencies: StripeWebhookDependencies = {
        ...dependencies,
        logger: logger.child({ stripe_event_id: event.id, stripe_event_type: event.type })
      };

      const alreadyProcessed = await dependencies.billingSyncStore.isEventProcessed(event.id);
      if (alreadyProcessed) {
        await recordAuditLog(
          dependencies.auditLogging,
          {
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
          },
          scopedDependencies.logger
        );

        return reply.status(200).send({ received: true, duplicate: true });
      }

      try {
        let organizationId: string | null;
        if (dependencies.eventTransaction) {
          const object = event.data.object as {
            customer?: string | { id: string };
            client_reference_id?: string;
            metadata?: Record<string, string>;
          };
          const customerId =
            typeof object.customer === "string" ? object.customer : object.customer?.id;
          const organizationKey =
            object.client_reference_id ??
            object.metadata?.["organization_id"] ??
            (customerId
              ? await dependencies.billingSyncStore.resolveOrganizationByStripeCustomerId(
                  customerId
                )
              : null) ??
            customerId ??
            event.id;
          const outcome = await dependencies.eventTransaction(
            organizationKey,
            event.id,
            async (context) => {
              let emailOrganizationId: string | undefined;
              const service = dependencies.billingEmails;
              return processStripeEvent(event, {
                ...scopedDependencies,
                ...context,
                ...(service
                  ? {
                      billingEmails: {
                        ...service,
                        async getBillingContactForOrganization(input) {
                          emailOrganizationId = input.organization_id;
                          return service.getBillingContactForOrganization(input);
                        },
                        async send(message) {
                          if (!emailOrganizationId)
                            throw new Error("billing_email_organization_missing");
                          await context.queueEmail(emailOrganizationId, {
                            subject: message.subject,
                            text: message.text,
                            html: message.html
                          });
                        }
                      }
                    }
                  : {})
              });
            }
          );
          if (outcome === "duplicate")
            return reply.status(200).send({ received: true, duplicate: true });
          organizationId = outcome;
        } else organizationId = await processStripeEvent(event, scopedDependencies);

        await recordAuditLog(
          dependencies.auditLogging,
          {
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
          },
          scopedDependencies.logger
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown_error";
        await recordAuditLog(
          dependencies.auditLogging,
          {
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
          },
          scopedDependencies.logger
        );
        scopedDependencies.logger?.error(
          { error_message: message },
          "stripe_webhook_processing_error"
        );
        return reply.status(500).send({ error: "processing_failed" });
      }

      return reply.status(200).send({ received: true });
    });
  });
}

async function processStripeEvent(
  event: Stripe.Event,
  dependencies: StripeWebhookDependencies
): Promise<string | null> {
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
  const organizationId =
    session.client_reference_id ?? session.metadata?.["organization_id"] ?? null;

  if (organizationId === null) {
    dependencies.logger?.warn({ reason: "organization_missing" }, "stripe_webhook_no_organization");
    await dependencies.billingSyncStore.markEventProcessed(event.id, event.type, null);
    return null;
  }

  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
  const subscriptionId =
    typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
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

  const subscription = await dependencies.stripeConfig.client.subscriptions.retrieve(
    subscriptionId,
    {
      expand: ["items.data", "latest_invoice"]
    },
    BILLING_PROVIDER_REQUEST_OPTIONS
  );
  const liveCustomer =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
  if (
    liveCustomer !== customerId ||
    (subscription.metadata?.["organization_id"] &&
      subscription.metadata["organization_id"] !== organizationId)
  )
    throw new Error("billing_subscription_ownership_mismatch");
  if (["canceled", "incomplete_expired", "paused", "unpaid"].includes(subscription.status)) {
    await dependencies.billingSyncStore.markEventProcessed(event.id, event.type, organizationId);
    return organizationId;
  }
  await dependencies.billingSyncStore.linkStripeCustomer(
    organizationId,
    customerId,
    subscriptionId
  );
  const entitlements = await recomputeEntitlements(
    subscription,
    organizationId,
    event.id,
    dependencies
  );

  if (entitlements.applied && entitlements.effectivePlan !== "free") {
    await sendBillingEmail(
      dependencies.billingEmails,
      organizationId,
      (contact) =>
        renderPurchaseConfirmationEmail({
          organizationName: contact.organizationName,
          plan: entitlements.effectivePlan,
          extraCapacity: entitlements.extraCapacityQuantity,
          portalUrl: dependencies.billingEmails?.managementUrl ?? fallbackManagementUrl(),
          brandMarkUrl: resolveBillingEmailBrandMarkUrl()
        }),
      dependencies.logger
    );
  }

  await dependencies.billingSyncStore.markEventProcessed(event.id, event.type, organizationId);
  return organizationId;
}

async function handleSubscriptionChange(
  event: Stripe.Event,
  dependencies: StripeWebhookDependencies
): Promise<string | null> {
  const eventSubscription = event.data.object as Stripe.Subscription;
  // Event delivery order is not subscription state order. Retrieve the current
  // items, including pending upgrades, before deriving any paid entitlement.
  const subscription = await dependencies.stripeConfig.client.subscriptions.retrieve(
    eventSubscription.id,
    { expand: ["items.data", "latest_invoice"] },
    BILLING_PROVIDER_REQUEST_OPTIONS
  );
  const organizationId = await resolveOrganizationFromSubscription(
    subscription,
    dependencies.billingSyncStore
  );

  if (organizationId === null) {
    dependencies.logger?.warn(
      {
        customer_id:
          typeof subscription.customer === "string"
            ? subscription.customer
            : (subscription.customer?.id ?? null),
        reason: "organization_missing"
      },
      "stripe_webhook_no_organization"
    );
    await dependencies.billingSyncStore.markEventProcessed(event.id, event.type, null);
    return null;
  }

  const previous = await readBillingSnapshot(dependencies.billingSummaryReader, organizationId);
  const entitlements = await recomputeEntitlements(
    subscription,
    organizationId,
    event.id,
    dependencies
  );

  if (event.type === "customer.subscription.updated") {
    await sendBillingChangeConfirmations(
      dependencies.billingEmails,
      organizationId,
      previous,
      entitlements,
      dependencies.logger
    );
  }

  await dependencies.billingSyncStore.markEventProcessed(event.id, event.type, organizationId);
  return organizationId;
}

async function handleSubscriptionDeleted(
  event: Stripe.Event,
  dependencies: StripeWebhookDependencies
): Promise<string | null> {
  const subscription = event.data.object as Stripe.Subscription;
  const organizationId = await resolveOrganizationFromSubscription(
    subscription,
    dependencies.billingSyncStore
  );

  if (organizationId === null) {
    dependencies.logger?.warn({ reason: "organization_missing" }, "stripe_webhook_no_organization");
    await dependencies.billingSyncStore.markEventProcessed(event.id, event.type, null);
    return null;
  }

  const previous = await readBillingSnapshot(dependencies.billingSummaryReader, organizationId);
  const revoked = await dependencies.billingSyncStore.revokeEntitlements(
    organizationId,
    event.id,
    subscription.id
  );

  if (revoked !== false && previous !== null && previous.plan !== "free") {
    await sendEntitlementDowngradeConfirmation(
      dependencies.billingEmails,
      organizationId,
      previous,
      dependencies.logger
    );
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

  const organizationId =
    await dependencies.billingSyncStore.resolveOrganizationByStripeCustomerId(customerId);
  if (organizationId === null) {
    dependencies.logger?.warn(
      { customer_id: customerId, reason: "organization_missing" },
      "stripe_webhook_no_organization"
    );
    await dependencies.billingSyncStore.markEventProcessed(event.id, event.type, null);
    return null;
  }

  const previous = await readBillingSnapshot(dependencies.billingSummaryReader, organizationId);
  const parentSubscription = invoice.parent?.subscription_details?.subscription;
  const subscriptionId =
    typeof parentSubscription === "string" ? parentSubscription : parentSubscription?.id;
  let entitlements: RecomputedEntitlements | null = null;

  if (subscriptionId !== undefined) {
    const subscription = await dependencies.stripeConfig.client.subscriptions.retrieve(
      subscriptionId,
      {
        expand: ["items.data", "latest_invoice"]
      },
      BILLING_PROVIDER_REQUEST_OPTIONS
    );
    entitlements = await recomputeEntitlements(
      subscription,
      organizationId,
      event.id,
      dependencies
    );
  }

  const billingReason = typeof invoice.billing_reason === "string" ? invoice.billing_reason : null;
  // A scheduled downgrade arrives on a renewal invoice. Either event order
  // must emit the transition before its persisted previous plan is replaced.
  if (billingReason !== "subscription_create" && entitlements !== null) {
    await sendBillingChangeConfirmations(
      dependencies.billingEmails,
      organizationId,
      previous,
      entitlements,
      dependencies.logger
    );
  }
  if (
    entitlements !== null &&
    entitlements.applied &&
    billingReason !== "subscription_create" &&
    billingReason !== "subscription_update" &&
    entitlements.effectivePlan !== "free"
  ) {
    await sendBillingEmail(
      dependencies.billingEmails,
      organizationId,
      (contact) =>
        renderRenewalSuccessEmail({
          organizationName: contact.organizationName,
          plan: entitlements.effectivePlan,
          extraCapacity: entitlements.extraCapacityQuantity,
          nextRenewalDate: entitlements.billingPeriodEndsAt ?? new Date().toISOString(),
          brandMarkUrl: resolveBillingEmailBrandMarkUrl()
        }),
      dependencies.logger
    );
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

  const organizationId =
    await dependencies.billingSyncStore.resolveOrganizationByStripeCustomerId(customerId);
  if (organizationId === null) {
    dependencies.logger?.warn(
      { customer_id: customerId, reason: "organization_missing" },
      "stripe_webhook_no_organization"
    );
    await dependencies.billingSyncStore.markEventProcessed(event.id, event.type, null);
    return null;
  }

  const previous = await readBillingSnapshot(dependencies.billingSummaryReader, organizationId);
  const parentSubscription = invoice.parent?.subscription_details?.subscription;
  const subscriptionId =
    typeof parentSubscription === "string" ? parentSubscription : parentSubscription?.id;
  if (subscriptionId !== undefined) {
    const subscription = await dependencies.stripeConfig.client.subscriptions.retrieve(
      subscriptionId,
      { expand: ["items.data", "latest_invoice"] },
      BILLING_PROVIDER_REQUEST_OPTIONS
    );
    const current = await recomputeEntitlements(
      subscription,
      organizationId,
      event.id,
      dependencies
    );
    if (!current.applied || subscription.status !== "past_due") {
      // A declined/authentication-pending upgrade leaves the paid base plan
      // active. It must not start base-subscription dunning or downgrade mail.
      await dependencies.billingSyncStore.markEventProcessed(event.id, event.type, organizationId);
      return organizationId;
    }
  } else {
    // A one-off invoice is not evidence that the recurring subscription failed.
    await dependencies.billingSyncStore.markEventProcessed(event.id, event.type, organizationId);
    return organizationId;
  }

  if (previous !== null && previous.plan !== "free") {
    const attemptCount = typeof invoice.attempt_count === "number" ? invoice.attempt_count : 1;
    const nextAttemptAt =
      typeof invoice.next_payment_attempt === "number"
        ? new Date(invoice.next_payment_attempt * 1000).toISOString()
        : null;
    const effectiveDate = resolveDowngradeEffectiveDate(invoice, nextAttemptAt);

    if (attemptCount <= 1) {
      await sendBillingEmail(
        dependencies.billingEmails,
        organizationId,
        (contact) =>
          renderPaymentFailureEmail({
            organizationName: contact.organizationName,
            plan: previous.plan,
            portalUrl: dependencies.billingEmails?.managementUrl ?? fallbackManagementUrl(),
            brandMarkUrl: resolveBillingEmailBrandMarkUrl()
          }),
        dependencies.logger
      );
    } else if (nextAttemptAt !== null) {
      await sendBillingEmail(
        dependencies.billingEmails,
        organizationId,
        (contact) =>
          renderPaymentFailureReminderEmail({
            organizationName: contact.organizationName,
            plan: previous.plan,
            portalUrl: dependencies.billingEmails?.managementUrl ?? fallbackManagementUrl(),
            daysUntilDowngrade: daysUntilIsoTimestamp(effectiveDate),
            brandMarkUrl: resolveBillingEmailBrandMarkUrl()
          }),
        dependencies.logger
      );
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
  dependencies: StripeWebhookDependencies
): Promise<RecomputedEntitlements> {
  if (isEntitlementEligible(deriveBillingState(subscription.status)))
    assertSupportedSubscriptionItems(subscription, dependencies.stripeConfig.priceMap);
  const { plan, extraCapacityQuantity } = derivePlanFromSubscriptionItems(
    subscription.items.data,
    dependencies.stripeConfig.priceMap
  );
  const billingState = deriveBillingState(subscription.status);
  const effectivePlan = isEntitlementEligible(billingState, "plan") ? plan : "free";
  const effectiveExtraCapacity = isEntitlementEligible(billingState, "extra_capacity")
    ? extraCapacityQuantity
    : 0;
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : (subscription.customer?.id ?? "");
  const period = resolveStripeSubscriptionBillingPeriod(subscription);
  let periodStartsAt = period.starts_at;
  let periodEndsAt = period.ends_at;

  if (effectivePlan === "free") {
    periodStartsAt = null;
    periodEndsAt = null;
  } else if (periodStartsAt !== null && periodEndsAt !== null && periodStartsAt >= periodEndsAt) {
    periodStartsAt = null;
    periodEndsAt = null;
  }

  const applied = await dependencies.billingSyncStore.updateEntitlements({
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

  if (applied !== false && dependencies.subscriptionOperationStore) {
    await reconcileStripeSubscriptionOperation({
      store: dependencies.subscriptionOperationStore,
      client: dependencies.stripeConfig.client,
      organizationId,
      subscription
    });
  }

  return {
    applied: applied !== false,
    effectivePlan,
    extraCapacityQuantity: effectiveExtraCapacity,
    billingPeriodStartsAt: periodStartsAt,
    billingPeriodEndsAt: periodEndsAt,
    totalCapacityUnits:
      getTierCapabilities(effectivePlan).included_capacity_units + effectiveExtraCapacity
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

  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
  if (customerId === undefined) {
    return null;
  }

  return billingSyncStore.resolveOrganizationByStripeCustomerId(customerId);
}

function resolveDowngradeEffectiveDate(
  invoice: Stripe.Invoice,
  nextAttemptAt: string | null
): string {
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
