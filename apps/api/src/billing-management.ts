import { createStripePlanChangeService } from "../../../packages/billing/src/stripe-plan-change.js";
import type { BillingPlanChangeManagement } from "../../../packages/billing-client/src/plan-change.js";
import { confirmStripeCheckout } from "../../../packages/billing/src/stripe-checkout-confirmation.js";
import type { CapacityPaymentRequired } from "../../../packages/billing/src/stripe-capacity-payment.js";
import {
  previewStripeSubscriptionUpgrade,
  type UpgradePreviewResult
} from "../../../packages/billing/src/stripe-upgrade-preview.js";
import { createPostgresBillingSubscriptionOperationStore } from "../../../packages/storage/src/billing-subscription-operation-store.js";
import { reconcileStripeSubscriptionOperation } from "../../../packages/billing/src/stripe-operation-reconciliation.js";
import { createStripeSubscriptionUpgradeLink } from "../../../packages/billing/src/stripe-subscription-upgrade.js";
import {
  runStripeCapacityOperation,
  type CapacityOperationError
} from "../../../packages/billing/src/stripe-capacity-operations.js";
import { createPostgresBillingCheckoutStore } from "../../../packages/storage/src/billing-checkout-store.js";
import { createStripeCheckoutLink, type CheckoutLinkResult } from "./stripe-checkout.js";
export {
  readUnixTimestampField,
  readSubscriptionInvoiceLinePeriod,
  resolveStripeSubscriptionBillingPeriod
} from "./stripe-billing-period.js";

import { MAX_BILLING_ADDITIONAL_CAPACITY_UNITS } from "../../../packages/shared-types/src/index.js";
import type {
  AccountAnalyticsStore,
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
  loadStripeBillingSubscriptionState,
  projectBillingSummary
} from "./billing-slot-management.js";
import type { BillingLinkProvider } from "./billing-links.js";
import { deriveBillingState, type StripeConfig } from "./stripe-config.js";

const BILLING_SUMMARY_STRIPE_PROJECTION_TIMEOUT_MS = 2_500;
const NO_CARD_TRIAL_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

export function normalizeBillingPlan(plan: string | null | undefined): "free" | "solo" | "team" {
  if (plan === "solo" || plan === "team") {
    return plan;
  }

  return "free";
}

interface OrganizationBillingState {
  plan: "free" | "solo" | "team";
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  billing_state: string | null;
}

interface CreateBillingManagementInput {
  db: Queryable;
  stripeConfig?: StripeConfig;
  billingStore: BillingStore;
  billingSyncStore: BillingSyncStore;
  accountAnalyticsStore?: AccountAnalyticsStore;
  billingLinks: BillingLinkProvider;
  appBaseUrl?: string;
}

function planRank(plan: "free" | "solo" | "team"): number {
  switch (plan) {
    case "team":
      return 2;
    case "solo":
      return 1;
    default:
      return 0;
  }
}

async function recordBillingMetricDeltas(
  accountAnalyticsStore: AccountAnalyticsStore | undefined,
  tx: Queryable,
  input: {
    organization_id: string;
    occurred_at: string;
    source: string;
    dedupe_key: string;
    deltas: Partial<
      Record<
        "plan_upgraded" | "plan_downgraded" | "capacity_units_purchased" | "capacity_units_reduced",
        number
      >
    >;
  }
): Promise<void> {
  if (accountAnalyticsStore === undefined) {
    return;
  }

  await accountAnalyticsStore.withDb(tx).recordMetricDeltas(input);
}

async function getOrganizationBillingState(
  db: Queryable,
  organizationId: string
): Promise<OrganizationBillingState | null> {
  const result = await db.query<{
    plan: string;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    billing_state: string | null;
  }>(
    `
      SELECT
        COALESCE(plan, 'free') AS plan,
        stripe_customer_id,
        billing_state,
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
    stripe_subscription_id: row.stripe_subscription_id ?? null,
    billing_state: row.billing_state ?? null
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
    getPlanChange?: BillingPlanChangeManagement["getPlanChange"];
    previewPlanChange?: BillingPlanChangeManagement["previewPlanChange"];
    schedulePlanChange?: BillingPlanChangeManagement["schedulePlanChange"];
    cancelPlanChange?: BillingPlanChangeManagement["cancelPlanChange"];
    previewUpgrade?(input: { organization_id: string }): Promise<UpgradePreviewResult>;
    createCheckoutLink(input: {
      organization_id: string;
      billing_email: string;
      current_plan: "free" | "solo" | "team";
      target_plan: "solo" | "team";
      confirmation_token?: string;
    }): Promise<CheckoutLinkResult>;
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
    }): Promise<BillingSummaryRecord | CapacityPaymentRequired | CapacityOperationError>;
    scheduleCapacityReduction(input: {
      organization_id: string;
      target_additional_capacity_units: number;
      now: string;
    }): Promise<BillingSummaryRecord | CapacityPaymentRequired | CapacityOperationError>;
    cancelCapacityReduction(input: {
      organization_id: string;
      now: string;
    }): Promise<BillingSummaryRecord | CapacityPaymentRequired | CapacityOperationError>;
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
  const subscriptionOperationStore = createPostgresBillingSubscriptionOperationStore(input.db);

  async function planChangeService(
    organizationId: string
  ): Promise<ReturnType<typeof createStripePlanChangeService> | null> {
    if (!input.stripeConfig) return null;
    const organization = await getOrganizationBillingState(input.db, organizationId);
    if (!organization?.stripe_subscription_id || !organization.stripe_customer_id) return null;
    return createStripePlanChangeService({
      provider: input.stripeConfig,
      store: subscriptionOperationStore,
      organizationId,
      subscriptionId: organization.stripe_subscription_id,
      customerId: organization.stripe_customer_id
    });
  }

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
    if (
      organizationBillingState === null ||
      organizationBillingState.stripe_subscription_id === null
    ) {
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

      await reconcileStripeSubscriptionOperation({
        store: subscriptionOperationStore,
        client: input.stripeConfig.client,
        organizationId: inputValue.organization_id,
        subscription: stripeState.subscription
      });

      return projectBillingSummary({
        summary: { ...summary, billing_state: deriveBillingState(stripeState.subscription.status) },
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
      fallbackEffectiveAt: summary.usage_window.ends_at,
      timeoutMs: 8000
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
        : Math.min(inputValue.additional_capacity_units, MAX_BILLING_ADDITIONAL_CAPACITY_UNITS);
    const updated = await runInTransaction(input.db, async (tx) => {
      const previousResult = await tx.query<{ plan: string; additional_capacity_units: number }>(
        `
          SELECT
            COALESCE(plan, 'free') AS plan,
            COALESCE(additional_capacity_units, 0)::int AS additional_capacity_units
          FROM organizations
          WHERE id = $1
          FOR UPDATE
        `,
        [inputValue.organization_id]
      );
      const previousPlan = normalizePlanForDowngradeAudit(previousResult.rows[0]?.plan);
      const targetPlan = normalizePlanForDowngradeAudit(inputValue.plan);
      const previousAdditionalCapacityUnits =
        previousResult.rows[0]?.additional_capacity_units ?? 0;

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

      const cleanupSummary = await createOrganizationPlanCleanupService(
        tx
      ).cleanupOrganizationForPlan({
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

      await recordBillingMetricDeltas(input.accountAnalyticsStore, tx, {
        organization_id: inputValue.organization_id,
        occurred_at: inputValue.now,
        source: "billing_admin_override",
        dedupe_key: `billing_admin_override:${inputValue.organization_id}:${inputValue.now}`,
        deltas: {
          ...(planRank(inputValue.plan) > planRank(previousPlan) ? { plan_upgraded: 1 } : {}),
          ...(planRank(inputValue.plan) < planRank(previousPlan) ? { plan_downgraded: 1 } : {}),
          ...(additionalCapacityUnits > previousAdditionalCapacityUnits
            ? {
                capacity_units_purchased: additionalCapacityUnits - previousAdditionalCapacityUnits
              }
            : {}),
          ...(additionalCapacityUnits < previousAdditionalCapacityUnits
            ? { capacity_units_reduced: previousAdditionalCapacityUnits - additionalCapacityUnits }
            : {})
        }
      });

      return true;
    });

    if (!updated) {
      return "billing_not_found";
    }

    return (
      (await input.billingStore.getBillingSummaryForOrganization({
        organization_id: inputValue.organization_id,
        now: inputValue.now
      })) ?? "billing_not_found"
    );
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
      getPlanChange: async ({ organization_id }) =>
        (await planChangeService(organization_id))?.getStatus() ?? "no_active_subscription",
      previewPlanChange: async ({ organization_id }) =>
        (await planChangeService(organization_id))?.preview() ?? "no_active_subscription",
      schedulePlanChange: async ({ organization_id, confirmation_token }) =>
        (await planChangeService(organization_id))?.schedule(confirmation_token) ??
        "no_active_subscription",
      cancelPlanChange: async ({ organization_id, schedule_id }) =>
        (await planChangeService(organization_id))?.cancel(schedule_id) ?? "no_active_subscription",
      previewUpgrade: async ({ organization_id }) => {
        if (!input.stripeConfig) return "billing_service_error";
        const organization = await getOrganizationBillingState(input.db, organization_id);
        if (!organization?.stripe_subscription_id || !organization.stripe_customer_id)
          return "checkout_not_allowed";
        return previewStripeSubscriptionUpgrade({
          provider: input.stripeConfig,
          store: subscriptionOperationStore,
          organizationId: organization_id,
          subscriptionId: organization.stripe_subscription_id,
          customerId: organization.stripe_customer_id
        });
      },
      createCheckoutLink: async (checkoutInput) => {
        if (input.stripeConfig !== undefined) {
          try {
            const organization = await getOrganizationBillingState(
              input.db,
              checkoutInput.organization_id
            );
            if (
              organization?.stripe_subscription_id &&
              checkoutInput.current_plan === "solo" &&
              checkoutInput.target_plan === "team" &&
              organization.billing_state !== "canceled"
            ) {
              return createStripeSubscriptionUpgradeLink({
                provider: input.stripeConfig,
                store: subscriptionOperationStore,
                organizationId: checkoutInput.organization_id,
                appBaseUrl,
                ...(checkoutInput.confirmation_token
                  ? { confirmationToken: checkoutInput.confirmation_token }
                  : {})
              });
            }
            let endedSubscriptionId: string | undefined;
            if (organization?.stripe_subscription_id && organization.billing_state === "canceled") {
              const subscription = await input.stripeConfig.client.subscriptions.retrieve(
                organization.stripe_subscription_id,
                {},
                { timeout: 8000, maxNetworkRetries: 0 }
              );
              if (
                subscription.status !== "canceled" &&
                subscription.status !== "incomplete_expired"
              )
                return "checkout_not_allowed";
              endedSubscriptionId = subscription.id;
            }
            return createStripeCheckoutLink({
              stripe: input.stripeConfig,
              store: createPostgresBillingCheckoutStore(input.db),
              appBaseUrl,
              input: {
                ...checkoutInput,
                ...(endedSubscriptionId === undefined
                  ? {}
                  : { confirmed_ended_subscription_id: endedSubscriptionId })
              }
            });
          } catch {
            return "billing_service_error";
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

        const confirmation = await confirmStripeCheckout({
          db: input.db,
          store: input.billingSyncStore,
          provider: input.stripeConfig,
          organizationId: confirmInput.organization_id,
          sessionId: confirmInput.session_id,
          now: confirmInput.now
        });
        if (confirmation !== "confirmed") return confirmation;

        return (
          (await getProjectedBillingSummary({
            organization_id: confirmInput.organization_id,
            now: confirmInput.now
          })) ?? "billing_not_found"
        );
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
      increaseCapacity: async (capacityInput) =>
        input.stripeConfig === undefined
          ? "billing_not_configured"
          : runStripeCapacityOperation({
              store: subscriptionOperationStore,
              provider: input.stripeConfig,
              organizationId: capacityInput.organization_id,
              kind: "capacity_increase",
              target: capacityInput.target_additional_capacity_units,
              loadContext: () => loadCapacityManagementContext(capacityInput)
            }),
      scheduleCapacityReduction: async (capacityInput) =>
        input.stripeConfig === undefined
          ? "billing_not_configured"
          : runStripeCapacityOperation({
              store: subscriptionOperationStore,
              provider: input.stripeConfig,
              organizationId: capacityInput.organization_id,
              kind: "capacity_schedule",
              target: capacityInput.target_additional_capacity_units,
              loadContext: () => loadCapacityManagementContext(capacityInput)
            }),
      cancelCapacityReduction: async (capacityInput) =>
        input.stripeConfig === undefined
          ? "billing_not_configured"
          : runStripeCapacityOperation({
              store: subscriptionOperationStore,
              provider: input.stripeConfig,
              organizationId: capacityInput.organization_id,
              kind: "capacity_cancel",
              loadContext: () => loadCapacityManagementContext(capacityInput)
            })
    },
    getProjectedBillingSummary,
    overrideOrganizationBilling
  };
}
