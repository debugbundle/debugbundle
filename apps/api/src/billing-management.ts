import type Stripe from "stripe";

import { MAX_BILLING_ADDITIONAL_CAPACITY_UNITS } from "../../../packages/shared-types/src/index.js";
import type {
  BillingStore,
  BillingSummaryRecord,
  BillingSyncStore,
  Queryable
} from "../../../packages/storage/src/index.js";
import {
  createOrganizationPlanCleanupService,
  isPlanDowngrade,
  normalizePlanForDowngradeAudit,
  recordPlanDowngradeCleanupAudit,
  runInTransaction
} from "../../../packages/storage/src/index.js";

import {
  buildSchedulePhasesForReduction,
  buildSubscriptionItemsForQuantity,
  loadStripeBillingSubscriptionState,
  projectBillingSummary
} from "./billing-slot-management.js";
import type { BillingLinkProvider } from "./billing-links.js";
import {
  deriveBillingState,
  derivePlanFromSubscriptionItems,
  isEntitlementEligible,
  type StripeConfig
} from "./stripe-config.js";

const BILLING_SUMMARY_STRIPE_PROJECTION_TIMEOUT_MS = 2_500;
const NO_CARD_TRIAL_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

export function normalizeBillingPlan(plan: string | null | undefined): "free" | "solo" | "team" {
  if (plan === "solo" || plan === "team") {
    return plan;
  }

  return "free";
}

export function readUnixTimestampField(source: unknown, key: string): number | null {
  if (typeof source !== "object" || source === null) {
    return null;
  }

  const value = (source as Record<string, unknown>)[key];
  return typeof value === "number" ? value : null;
}

export function readSubscriptionInvoiceLinePeriod(source: unknown): { start: number | null; end: number | null } {
  if (typeof source !== "object" || source === null) {
    return { start: null, end: null };
  }

  const lines = (source as Record<string, unknown>)["lines"];
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

export function resolveStripeSubscriptionBillingPeriod(subscription: Stripe.Subscription): {
  starts_at: string | null;
  ends_at: string | null;
} {
  const invoicePeriod = readSubscriptionInvoiceLinePeriod(subscription.latest_invoice);
  const startSeconds =
    invoicePeriod.start ??
    readUnixTimestampField(subscription.latest_invoice, "period_start") ??
    readUnixTimestampField(subscription, "current_period_start");
  const endSeconds =
    invoicePeriod.end ??
    readUnixTimestampField(subscription.latest_invoice, "period_end") ??
    readUnixTimestampField(subscription, "current_period_end");

  if (startSeconds !== null && endSeconds !== null && endSeconds <= startSeconds) {
    return {
      starts_at: null,
      ends_at: null
    };
  }

  return {
    starts_at: startSeconds === null ? null : new Date(startSeconds * 1000).toISOString(),
    ends_at: endSeconds === null ? null : new Date(endSeconds * 1000).toISOString()
  };
}

interface OrganizationBillingState {
  plan: "free" | "solo" | "team";
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

interface CreateBillingManagementInput {
  db: Queryable;
  stripeConfig?: StripeConfig;
  billingStore: BillingStore;
  billingSyncStore: BillingSyncStore;
  billingLinks: BillingLinkProvider;
  appBaseUrl?: string;
}

async function getOrganizationBillingState(
  db: Queryable,
  organizationId: string
): Promise<OrganizationBillingState | null> {
  const result = await db.query<{
    plan: string;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
  }>(
    `
      SELECT
        COALESCE(plan, 'free') AS plan,
        stripe_customer_id,
        to_jsonb(organizations) ->> 'stripe_subscription_id' AS stripe_subscription_id
      FROM organizations
      WHERE id = $1
      LIMIT 1
    `,
    [organizationId]
  );

  const row = result.rows[0];
  if (row === undefined) {
    return null;
  }

  return {
    plan: normalizeBillingPlan(row.plan),
    stripe_customer_id: row.stripe_customer_id ?? null,
    stripe_subscription_id: row.stripe_subscription_id ?? null
  };
}

export function createBillingManagement(input: CreateBillingManagementInput): {
  billingManagement: {
    getBillingSummaryForOrganization(input: {
      organization_id: string;
      now: string;
    }): Promise<BillingSummaryRecord | null>;
    getBillingSummaryForProject(input: {
      project_id: string;
      now: string;
    }): Promise<BillingSummaryRecord | null>;
    incrementOrgUsageCounter(input: {
      organization_id: string;
      period_starts_at: string;
      count: number;
    }): Promise<void>;
    incrementProjectUsageCounter(input: {
      project_id: string;
      period_starts_at: string;
      count: number;
    }): Promise<void>;
    startTrial(input: {
      organization_id: string;
      target_plan: "solo" | "team";
      now: string;
    }): Promise<BillingSummaryRecord | "billing_not_found" | "trial_unavailable">;
    createCheckoutLink(input: {
      organization_id: string;
      billing_email: string;
      current_plan: "free" | "solo" | "team";
      target_plan: "solo" | "team";
    }): Promise<{ url: string } | null>;
    confirmCheckoutSession(input: {
      organization_id: string;
      session_id: string;
      now: string;
    }): Promise<
      | BillingSummaryRecord
      | "billing_not_configured"
      | "billing_not_found"
      | "checkout_session_not_found"
      | "checkout_not_complete"
      | "billing_service_error"
    >;
    createPortalLink(input: {
      organization_id: string;
      current_plan: "solo" | "team";
    }): Promise<{ url: string } | null>;
    increaseCapacity(input: {
      organization_id: string;
      target_additional_capacity_units: number;
      now: string;
    }): Promise<
      | BillingSummaryRecord
      | "billing_not_configured"
      | "billing_not_found"
      | "no_active_subscription"
      | "invalid_target_quantity"
      | "pending_capacity_reduction_exists"
    >;
    scheduleCapacityReduction(input: {
      organization_id: string;
      target_additional_capacity_units: number;
      now: string;
    }): Promise<
      | BillingSummaryRecord
      | "billing_not_configured"
      | "billing_not_found"
      | "no_active_subscription"
      | "invalid_target_quantity"
    >;
    cancelCapacityReduction(input: {
      organization_id: string;
      now: string;
    }): Promise<
      | BillingSummaryRecord
      | "billing_not_configured"
      | "billing_not_found"
      | "no_active_subscription"
      | "capacity_reduction_not_found"
    >;
  };
  getProjectedBillingSummary(input: {
    organization_id: string;
    now: string;
  }): Promise<BillingSummaryRecord | null>;
  overrideOrganizationBilling(input: {
    organization_id: string;
    plan: "free" | "solo" | "team";
    additional_capacity_units: number;
    now: string;
  }): Promise<BillingSummaryRecord | "billing_not_found">;
} {
  const appBaseUrl = input.appBaseUrl ?? "http://localhost:3000";

  async function getProjectedBillingSummary(inputValue: {
    organization_id: string;
    now: string;
  }): Promise<BillingSummaryRecord | null> {
    const summary = await input.billingStore.getBillingSummaryForOrganization(inputValue);
    if (summary === null || input.stripeConfig === undefined || summary.plan === "free") {
      return summary;
    }

    const organizationBillingState = await getOrganizationBillingState(
      input.db,
      inputValue.organization_id
    );
    if (organizationBillingState === null || organizationBillingState.stripe_subscription_id === null) {
      return summary;
    }

    try {
      const stripeState = await loadStripeBillingSubscriptionState({
        stripeConfig: input.stripeConfig,
        subscriptionId: organizationBillingState.stripe_subscription_id,
        fallbackPlan: organizationBillingState.plan,
        fallbackEffectiveAt: summary.usage_window.ends_at,
        timeoutMs: BILLING_SUMMARY_STRIPE_PROJECTION_TIMEOUT_MS
      });

      return projectBillingSummary({
        summary,
        plan: stripeState.plan,
        additionalPurchased: stripeState.additionalPurchased,
        pendingReduction: stripeState.pendingReduction
      });
    } catch {
      return summary;
    }
  }

  async function loadCapacityManagementContext(inputValue: {
    organization_id: string;
    now: string;
  }): Promise<
    | {
        summary: BillingSummaryRecord;
        organizationBillingState: OrganizationBillingState;
        stripeState: Awaited<ReturnType<typeof loadStripeBillingSubscriptionState>>;
      }
    | "billing_not_configured"
    | "billing_not_found"
    | "no_active_subscription"
  > {
    const summary = await input.billingStore.getBillingSummaryForOrganization(inputValue);
    if (summary === null) {
      return "billing_not_found";
    }

    const organizationBillingState = await getOrganizationBillingState(
      input.db,
      inputValue.organization_id
    );
    if (organizationBillingState === null) {
      return "billing_not_found";
    }

    if (input.stripeConfig === undefined) {
      return "billing_not_configured";
    }

    if (
      organizationBillingState.plan === "free" ||
      organizationBillingState.stripe_subscription_id === null
    ) {
      return "no_active_subscription";
    }

    const stripeState = await loadStripeBillingSubscriptionState({
      stripeConfig: input.stripeConfig,
      subscriptionId: organizationBillingState.stripe_subscription_id,
      fallbackPlan: organizationBillingState.plan,
      fallbackEffectiveAt: summary.usage_window.ends_at
    });

    return {
      summary: projectBillingSummary({
        summary,
        plan: stripeState.plan,
        additionalPurchased: stripeState.additionalPurchased,
        pendingReduction: stripeState.pendingReduction
      }),
      organizationBillingState,
      stripeState
    };
  }

  async function overrideOrganizationBilling(inputValue: {
    organization_id: string;
    plan: "free" | "solo" | "team";
    additional_capacity_units: number;
    now: string;
  }): Promise<BillingSummaryRecord | "billing_not_found"> {
    const additionalCapacityUnits =
      inputValue.plan === "free"
        ? 0
        : Math.min(
            inputValue.additional_capacity_units,
            MAX_BILLING_ADDITIONAL_CAPACITY_UNITS
          );
    const updated = await runInTransaction(input.db, async (tx) => {
      const previousResult = await tx.query<{ plan: string }>(
        `
          SELECT COALESCE(plan, 'free') AS plan
          FROM organizations
          WHERE id = $1
          FOR UPDATE
        `,
        [inputValue.organization_id]
      );
      const previousPlan = normalizePlanForDowngradeAudit(previousResult.rows[0]?.plan);
      const targetPlan = normalizePlanForDowngradeAudit(inputValue.plan);

      const result = await tx.query<{ id: string }>(
        `
          UPDATE organizations
          SET
            plan = $2,
            additional_capacity_units = $3,
            stripe_customer_id = NULL,
            stripe_subscription_id = NULL,
            billing_state = CASE WHEN $2 = 'free' THEN NULL ELSE 'admin_override' END,
            billing_period_starts_at = NULL,
            billing_period_ends_at = NULL,
            last_billing_sync_at = $4::timestamptz,
            last_billing_event_id = $5,
            updated_at = $4::timestamptz
          WHERE id = $1
          RETURNING id::text AS id
        `,
        [
          inputValue.organization_id,
          inputValue.plan,
          additionalCapacityUnits,
          inputValue.now,
          `admin_override:${inputValue.now}`
        ]
      );

      if (result.rows[0] === undefined) {
        return false;
      }

      const cleanupSummary = await createOrganizationPlanCleanupService(tx).cleanupOrganizationForPlan({
        organization_id: inputValue.organization_id,
        plan: targetPlan,
        now: inputValue.now
      });

      if (isPlanDowngrade(previousPlan, targetPlan)) {
        await recordPlanDowngradeCleanupAudit({
          db: tx,
          organization_id: inputValue.organization_id,
          previous_plan: previousPlan,
          target_plan: targetPlan,
          trigger_source: "admin_override",
          cleanup_summary: cleanupSummary,
          occurred_at: inputValue.now
        });
      }

      return true;
    });

    if (!updated) {
      return "billing_not_found";
    }

    return (
      await input.billingStore.getBillingSummaryForOrganization({
        organization_id: inputValue.organization_id,
        now: inputValue.now
      })
    ) ?? "billing_not_found";
  }

  return {
    billingManagement: {
      getBillingSummaryForOrganization: (inputValue) => getProjectedBillingSummary(inputValue),
      getBillingSummaryForProject: (inputValue) =>
        input.billingStore.getBillingSummaryForProject(inputValue),
      incrementOrgUsageCounter: (inputValue) =>
        input.billingStore.incrementOrgUsageCounter(inputValue),
      incrementProjectUsageCounter: (inputValue) =>
        input.billingStore.incrementProjectUsageCounter(inputValue),
      startTrial: (trialInput) =>
        input.billingStore.startTrialForOrganization({
          organization_id: trialInput.organization_id,
          target_plan: trialInput.target_plan,
          started_at: trialInput.now,
          ends_at: new Date(
            new Date(trialInput.now).getTime() + NO_CARD_TRIAL_DURATION_MS
          ).toISOString()
        }),
      createCheckoutLink: async (checkoutInput) => {
        if (input.stripeConfig !== undefined) {
          const stripe = input.stripeConfig;
          const priceId =
            checkoutInput.target_plan === "solo" ? stripe.soloPriceId : stripe.teamPriceId;
          const orgResult = await input.db.query<{ stripe_customer_id: string | null }>(
            `SELECT stripe_customer_id FROM organizations WHERE id = $1 LIMIT 1`,
            [checkoutInput.organization_id]
          );
          const existingCustomerId = orgResult.rows[0]?.stripe_customer_id ?? null;

          const sessionParams: NonNullable<
            Parameters<typeof stripe.client.checkout.sessions.create>[0]
          > = {
            mode: "subscription",
            client_reference_id: checkoutInput.organization_id,
            metadata: { organization_id: checkoutInput.organization_id },
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: `${appBaseUrl}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${appBaseUrl}/billing?checkout=canceled`,
            automatic_tax: { enabled: true },
            billing_address_collection: "auto",
            tax_id_collection: { enabled: true },
            allow_promotion_codes: true,
            subscription_data: {
              metadata: { organization_id: checkoutInput.organization_id }
            }
          };

          if (existingCustomerId !== null) {
            sessionParams.customer = existingCustomerId;
            sessionParams.customer_update = { address: "auto", name: "auto" };
          } else {
            sessionParams.customer_email = checkoutInput.billing_email;
          }

          try {
            const session = await stripe.client.checkout.sessions.create(sessionParams);
            return session.url ? { url: session.url } : null;
          } catch {
            return null;
          }
        }

        const url = input.billingLinks.createCheckoutUrl({
          target_plan: checkoutInput.target_plan
        });
        return url === null ? null : { url };
      },
      confirmCheckoutSession: async (confirmInput) => {
        if (input.stripeConfig === undefined) {
          return "billing_not_configured";
        }

        let session: Stripe.Checkout.Session;
        try {
          session = await input.stripeConfig.client.checkout.sessions.retrieve(
            confirmInput.session_id,
            {
              expand: ["subscription", "subscription.items.data", "subscription.latest_invoice"]
            }
          );
        } catch {
          return "checkout_session_not_found";
        }

        const sessionOrganizationId =
          session.client_reference_id ?? session.metadata?.["organization_id"] ?? null;
        if (sessionOrganizationId !== confirmInput.organization_id) {
          return "checkout_session_not_found";
        }

        if (session.status !== "complete") {
          return "checkout_not_complete";
        }

        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;
        if (subscriptionId === undefined) {
          return "checkout_not_complete";
        }

        let subscription: Stripe.Subscription;
        try {
          if (typeof session.subscription === "string") {
            subscription = await input.stripeConfig.client.subscriptions.retrieve(
              subscriptionId,
              {
                expand: ["items.data", "latest_invoice"]
              }
            );
          } else if (session.subscription !== null) {
            subscription = session.subscription;
          } else {
            return "checkout_not_complete";
          }
        } catch {
          return "billing_service_error";
        }

        const customerId =
          typeof session.customer === "string" ? session.customer : session.customer?.id;
        if (customerId === undefined) {
          return "checkout_not_complete";
        }

        const { plan, extraCapacityQuantity } = derivePlanFromSubscriptionItems(
          subscription.items.data,
          input.stripeConfig.priceMap
        );
        const billingState = deriveBillingState(subscription.status);
        const effectivePlan = isEntitlementEligible(billingState, "plan") ? plan : "free";
        const effectiveExtraCapacity = isEntitlementEligible(
          billingState,
          "extra_capacity"
        )
          ? extraCapacityQuantity
          : 0;
        const period =
          effectivePlan === "free"
            ? { starts_at: null, ends_at: null }
            : resolveStripeSubscriptionBillingPeriod(subscription);

        try {
          await input.billingSyncStore.linkStripeCustomer(
            confirmInput.organization_id,
            customerId,
            subscription.id
          );
          await input.billingSyncStore.updateEntitlements({
            organization_id: confirmInput.organization_id,
            plan: effectivePlan,
            additional_capacity_units: effectiveExtraCapacity,
            billing_state: billingState,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscription.id,
            billing_period_starts_at: period.starts_at,
            billing_period_ends_at: period.ends_at,
            last_billing_sync_at: confirmInput.now,
            last_billing_event_id: `checkout_session:${session.id}`
          });
        } catch {
          return "billing_service_error";
        }

        return (
          await getProjectedBillingSummary({
            organization_id: confirmInput.organization_id,
            now: confirmInput.now
          })
        ) ?? "billing_not_found";
      },
      createPortalLink: async (portalInput) => {
        if (input.stripeConfig !== undefined) {
          const orgResult = await input.db.query<{ stripe_customer_id: string | null }>(
            `SELECT stripe_customer_id FROM organizations WHERE id = $1 LIMIT 1`,
            [portalInput.organization_id]
          );
          const customerId = orgResult.rows[0]?.stripe_customer_id;
          if (customerId === undefined || customerId === null) {
            return null;
          }

          try {
            const session = await input.stripeConfig.client.billingPortal.sessions.create({
              customer: customerId,
              return_url: `${appBaseUrl}/billing`
            });
            return { url: session.url };
          } catch {
            return null;
          }
        }

        const url = input.billingLinks.createPortalUrl();
        return url === null ? null : { url };
      },
      increaseCapacity: async (capacityInput) => {
        let context: Awaited<ReturnType<typeof loadCapacityManagementContext>>;

        try {
          context = await loadCapacityManagementContext(capacityInput);
        } catch {
          return "billing_not_configured";
        }

        if (typeof context === "string") {
          return context;
        }

        if (capacityInput.target_additional_capacity_units <= context.stripeState.additionalPurchased) {
          return "invalid_target_quantity";
        }

        if (context.stripeState.pendingReduction !== null) {
          return "pending_capacity_reduction_exists";
        }

        try {
          await input.stripeConfig!.client.subscriptions.update(
            context.stripeState.subscription.id,
            {
              items: buildSubscriptionItemsForQuantity({
                subscription: context.stripeState.subscription,
                stripeConfig: input.stripeConfig!,
                targetAdditionalPurchased: capacityInput.target_additional_capacity_units,
                plan: context.stripeState.plan
              }),
              proration_behavior: "always_invoice"
            }
          );
        } catch {
          return "billing_not_configured";
        }

        return projectBillingSummary({
          summary: context.summary,
          plan: context.stripeState.plan,
          additionalPurchased: capacityInput.target_additional_capacity_units,
          pendingReduction: null
        });
      },
      scheduleCapacityReduction: async (capacityInput) => {
        let context: Awaited<ReturnType<typeof loadCapacityManagementContext>>;

        try {
          context = await loadCapacityManagementContext(capacityInput);
        } catch {
          return "billing_not_configured";
        }

        if (typeof context === "string") {
          return context;
        }

        if (
          capacityInput.target_additional_capacity_units < 0 ||
          capacityInput.target_additional_capacity_units >=
            context.stripeState.additionalPurchased
        ) {
          return "invalid_target_quantity";
        }

        const pendingReduction = {
          additional_purchased: capacityInput.target_additional_capacity_units,
          total:
            context.summary.capacity_units.included +
            capacityInput.target_additional_capacity_units,
          effective_at: context.summary.usage_window.ends_at
        };

        try {
          const scheduleId =
            context.stripeState.schedule?.id ??
            (
              await input.stripeConfig!.client.subscriptionSchedules.create({
                from_subscription: context.stripeState.subscription.id
              })
            ).id;

          await input.stripeConfig!.client.subscriptionSchedules.update(scheduleId, {
            end_behavior: "release",
            proration_behavior: "none",
            phases: buildSchedulePhasesForReduction({
              subscription: context.stripeState.subscription,
              schedule: context.stripeState.schedule,
              stripeConfig: input.stripeConfig!,
              summary: context.summary,
              targetAdditionalPurchased: capacityInput.target_additional_capacity_units,
              plan: context.stripeState.plan
            })
          });
        } catch {
          return "billing_not_configured";
        }

        return projectBillingSummary({
          summary: context.summary,
          plan: context.stripeState.plan,
          additionalPurchased: context.stripeState.additionalPurchased,
          pendingReduction
        });
      },
      cancelCapacityReduction: async (capacityInput) => {
        let context: Awaited<ReturnType<typeof loadCapacityManagementContext>>;

        try {
          context = await loadCapacityManagementContext(capacityInput);
        } catch {
          return "billing_not_configured";
        }

        if (typeof context === "string") {
          return context;
        }

        if (context.stripeState.schedule === null || context.stripeState.pendingReduction === null) {
          return "capacity_reduction_not_found";
        }

        try {
          await input.stripeConfig!.client.subscriptionSchedules.release(
            context.stripeState.schedule.id
          );
        } catch {
          return "billing_not_configured";
        }

        return projectBillingSummary({
          summary: context.summary,
          plan: context.stripeState.plan,
          additionalPurchased: context.stripeState.additionalPurchased,
          pendingReduction: null
        });
      }
    },
    getProjectedBillingSummary,
    overrideOrganizationBilling
  };
}
