import type { TierName } from "../../../packages/shared-types/src/index.js";

import type { AccountAnalyticsStore } from "./account-analytics-store.js";
import {
  isPlanDowngrade,
  normalizePlanForDowngradeAudit,
  recordPlanDowngradeCleanupAudit
} from "./plan-downgrade-audit.js";
import { createOrganizationPlanCleanupService } from "./plan-downgrade-cleanup.js";
import { runInTransaction } from "./transaction.js";
import type { Queryable } from "./types.js";

export interface BillingEntitlementUpdate {
  organization_id: string;
  plan: TierName;
  additional_capacity_units: number;
  billing_state: string;
  stripe_customer_id: string;
  stripe_subscription_id: string;
  billing_period_starts_at: string | null;
  billing_period_ends_at: string | null;
  last_billing_sync_at: string;
  last_billing_event_id: string;
}

export interface BillingSyncStore {
  isEventProcessed(eventId: string): Promise<boolean>;
  markEventProcessed(
    eventId: string,
    eventType: string,
    organizationId: string | null
  ): Promise<void>;
  updateEntitlements(update: BillingEntitlementUpdate): Promise<void>;
  resolveOrganizationByStripeCustomerId(customerId: string): Promise<string | null>;
  linkStripeCustomer(
    organizationId: string,
    customerId: string,
    subscriptionId: string
  ): Promise<void>;
  revokeEntitlements(organizationId: string, eventId: string): Promise<void>;
  updateBillingState(organizationId: string, billingState: string, eventId: string): Promise<void>;
}

type PostgresBillingSyncStoreOptions = {
  accountAnalyticsStore?: AccountAnalyticsStore;
};

function planRank(plan: TierName): number {
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
        | "trial_converted"
        | "plan_upgraded"
        | "plan_downgraded"
        | "capacity_units_purchased"
        | "capacity_units_reduced",
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

export function createPostgresBillingSyncStore(
  db: Queryable,
  options: PostgresBillingSyncStoreOptions = {}
): BillingSyncStore {
  const accountAnalyticsStore = options.accountAnalyticsStore;

  return {
    async isEventProcessed(eventId: string): Promise<boolean> {
      const result = await db.query<{ exists: boolean }>(
        `SELECT EXISTS(SELECT 1 FROM processed_billing_events WHERE event_id = $1) AS exists`,
        [eventId]
      );
      return result.rows[0]?.exists ?? false;
    },

    async markEventProcessed(
      eventId: string,
      eventType: string,
      organizationId: string | null
    ): Promise<void> {
      await db.query(
        `
          INSERT INTO processed_billing_events (event_id, event_type, organization_id, processed_at)
          VALUES ($1, $2, $3, NOW())
          ON CONFLICT (event_id) DO NOTHING
        `,
        [eventId, eventType, organizationId]
      );
    },

    async updateEntitlements(update: BillingEntitlementUpdate): Promise<void> {
      await runInTransaction(db, async (tx) => {
        const previousResult = await tx.query<{
          plan: string;
          additional_capacity_units: number;
          trial_used_at: string | null;
          trial_converted_at: string | null;
        }>(
          `
            SELECT
              COALESCE(plan, 'free') AS plan,
              COALESCE(additional_capacity_units, 0)::int AS additional_capacity_units,
              (to_jsonb(organizations) ->> 'trial_used_at') AS trial_used_at,
              (to_jsonb(organizations) ->> 'trial_converted_at') AS trial_converted_at
            FROM organizations
            WHERE id = $1
            FOR UPDATE
          `,
          [update.organization_id]
        );
        const previousPlan = normalizePlanForDowngradeAudit(previousResult.rows[0]?.plan);
        const targetPlan = normalizePlanForDowngradeAudit(update.plan);
        const previousAdditionalCapacityUnits = previousResult.rows[0]?.additional_capacity_units ?? 0;
        const previousTrialUsedAt = previousResult.rows[0]?.trial_used_at ?? null;
        const previousTrialConvertedAt = previousResult.rows[0]?.trial_converted_at ?? null;

        await tx.query(
          `
            UPDATE organizations
            SET
              plan = $2,
              additional_capacity_units = $3,
              billing_state = $4,
              stripe_customer_id = $5,
              stripe_subscription_id = $6,
              billing_period_starts_at = $7::timestamptz,
              billing_period_ends_at = $8::timestamptz,
              trial_converted_at = CASE
                WHEN $2 <> 'free' AND (to_jsonb(organizations) ->> 'trial_used_at') IS NOT NULL
                  THEN COALESCE((to_jsonb(organizations) ->> 'trial_converted_at')::timestamptz, $9::timestamptz)
                ELSE (to_jsonb(organizations) ->> 'trial_converted_at')::timestamptz
              END,
              last_billing_sync_at = $9::timestamptz,
              last_billing_event_id = $10
            WHERE id = $1
          `,
          [
            update.organization_id,
            update.plan,
            update.additional_capacity_units,
            update.billing_state,
            update.stripe_customer_id,
            update.stripe_subscription_id,
            update.billing_period_starts_at,
            update.billing_period_ends_at,
            update.last_billing_sync_at,
            update.last_billing_event_id
          ]
        );

        const cleanupSummary = await createOrganizationPlanCleanupService(tx).cleanupOrganizationForPlan({
          organization_id: update.organization_id,
          plan: targetPlan,
          now: update.last_billing_sync_at
        });

        if (isPlanDowngrade(previousPlan, targetPlan)) {
          await recordPlanDowngradeCleanupAudit({
            db: tx,
            organization_id: update.organization_id,
            previous_plan: previousPlan,
            target_plan: targetPlan,
            trigger_source: "stripe_sync",
            cleanup_summary: cleanupSummary,
            occurred_at: update.last_billing_sync_at
          });
        }

        const deltas: Partial<
          Record<
            | "trial_converted"
            | "plan_upgraded"
            | "plan_downgraded"
            | "capacity_units_purchased"
            | "capacity_units_reduced",
            number
          >
        > = {};

        if (
          previousTrialUsedAt !== null &&
          previousTrialConvertedAt === null &&
          targetPlan !== "free"
        ) {
          deltas["trial_converted"] = 1;
        }
        if (planRank(targetPlan) > planRank(previousPlan)) {
          deltas["plan_upgraded"] = 1;
        } else if (planRank(targetPlan) < planRank(previousPlan)) {
          deltas["plan_downgraded"] = 1;
        }
        if (update.additional_capacity_units > previousAdditionalCapacityUnits) {
          deltas["capacity_units_purchased"] =
            update.additional_capacity_units - previousAdditionalCapacityUnits;
        } else if (update.additional_capacity_units < previousAdditionalCapacityUnits) {
          deltas["capacity_units_reduced"] =
            previousAdditionalCapacityUnits - update.additional_capacity_units;
        }

        await recordBillingMetricDeltas(accountAnalyticsStore, tx, {
          organization_id: update.organization_id,
          occurred_at: update.last_billing_sync_at,
          source: "billing_entitlements_updated",
          dedupe_key: `billing_entitlements_updated:${update.last_billing_event_id}`,
          deltas
        });
      });
    },

    async resolveOrganizationByStripeCustomerId(customerId: string): Promise<string | null> {
      const result = await db.query<{ id: string }>(
        `SELECT id::text FROM organizations WHERE stripe_customer_id = $1 LIMIT 1`,
        [customerId]
      );
      return result.rows[0]?.id ?? null;
    },

    async linkStripeCustomer(
      organizationId: string,
      customerId: string,
      subscriptionId: string
    ): Promise<void> {
      await db.query(
        `
          UPDATE organizations
          SET stripe_customer_id = $2, stripe_subscription_id = $3
          WHERE id = $1
        `,
        [organizationId, customerId, subscriptionId]
      );
    },

    async revokeEntitlements(organizationId: string, eventId: string): Promise<void> {
      await runInTransaction(db, async (tx) => {
        const previousResult = await tx.query<{ plan: string; additional_capacity_units: number }>(
          `
            SELECT
              COALESCE(plan, 'free') AS plan,
              COALESCE(additional_capacity_units, 0)::int AS additional_capacity_units
            FROM organizations
            WHERE id = $1
            FOR UPDATE
          `,
          [organizationId]
        );
        const previousPlan = normalizePlanForDowngradeAudit(previousResult.rows[0]?.plan);
        const previousAdditionalCapacityUnits = previousResult.rows[0]?.additional_capacity_units ?? 0;

        await tx.query(
          `
            UPDATE organizations
            SET
              plan = 'free',
              additional_capacity_units = 0,
              billing_state = 'canceled',
              billing_period_starts_at = NULL,
              billing_period_ends_at = NULL,
              last_billing_sync_at = NOW(),
              last_billing_event_id = $2
            WHERE id = $1
          `,
          [organizationId, eventId]
        );

        const cleanupSummary = await createOrganizationPlanCleanupService(tx).cleanupOrganizationForPlan({
          organization_id: organizationId,
          plan: "free"
        });

        if (isPlanDowngrade(previousPlan, "free")) {
          await recordPlanDowngradeCleanupAudit({
            db: tx,
            organization_id: organizationId,
            previous_plan: previousPlan,
            target_plan: "free",
            trigger_source: "stripe_sync",
            cleanup_summary: cleanupSummary,
            occurred_at: new Date().toISOString()
          });
        }

        await recordBillingMetricDeltas(accountAnalyticsStore, tx, {
          organization_id: organizationId,
          occurred_at: new Date().toISOString(),
          source: "billing_entitlements_revoked",
          dedupe_key: `billing_entitlements_revoked:${eventId}`,
          deltas: {
            ...(planRank(previousPlan) > planRank("free") ? { plan_downgraded: 1 } : {}),
            ...(previousAdditionalCapacityUnits > 0
              ? { capacity_units_reduced: previousAdditionalCapacityUnits }
              : {})
          }
        });
      });
    },

    async updateBillingState(
      organizationId: string,
      billingState: string,
      eventId: string
    ): Promise<void> {
      await db.query(
        `
          UPDATE organizations
          SET
            billing_state = $2,
            last_billing_sync_at = NOW(),
            last_billing_event_id = $3
          WHERE id = $1
        `,
        [organizationId, billingState, eventId]
      );
    }
  };
}
