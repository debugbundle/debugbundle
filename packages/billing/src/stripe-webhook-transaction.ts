import type { z } from "zod";
import { BillingLifecycleEmailPayloadSchema } from "./billing-email-payload.js";
import { getTierCapabilities, type TierName } from "../../shared-types/src/index.js";
import { createPostgresBillingSyncStore } from "../../storage/src/billing-sync-store.js";
import { createPostgresBillingSubscriptionOperationStore } from "../../storage/src/billing-subscription-operation-store.js";
import { createPostgresOperationalEmailDeliveryStore } from "../../storage/src/operational-email-delivery-store.js";
import { runInTransaction } from "../../storage/src/transaction.js";
import { createSavepointQueryable } from "../../storage/src/savepoint-queryable.js";
import type { Queryable } from "../../storage/src/types.js";
import type { BillingSummaryReader } from "./stripe-webhook-emails.js";

export function createBillingWebhookTransaction(db: Queryable) {
  return async function run<Result>(
    organizationKey: string,
    eventId: string,
    handle: (context: {
      billingSyncStore: ReturnType<typeof createPostgresBillingSyncStore>;
      subscriptionOperationStore: ReturnType<
        typeof createPostgresBillingSubscriptionOperationStore
      >;
      billingSummaryReader: BillingSummaryReader;
      queueEmail(
        organizationId: string,
        payload: z.infer<typeof BillingLifecycleEmailPayloadSchema>
      ): Promise<void>;
    }) => Promise<Result>
  ): Promise<Result | "duplicate"> {
    return runInTransaction(db, async (connection) => {
      const tx = createSavepointQueryable(connection);
      // Bound lock contention and serialize retrieval + recomputation per account.
      // Email delivery is queued in this transaction, never sent while it is held.
      await tx.query("SET LOCAL lock_timeout = '5s'", []);
      await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `billing:${organizationKey}`
      ]);
      // Checkout return reconciliation uses xmin compare-and-swap. Holding the
      // row before provider retrieval makes both write orders safe.
      await tx.query("SELECT id FROM organizations WHERE id::text=$1 FOR UPDATE", [
        organizationKey
      ]);
      const billingSyncStore = createPostgresBillingSyncStore(tx);
      if (await billingSyncStore.isEventProcessed(eventId)) return "duplicate";
      let notification = 0;
      return handle({
        billingSyncStore,
        subscriptionOperationStore: createPostgresBillingSubscriptionOperationStore(tx),
        billingSummaryReader: {
          async getBillingSummaryForOrganization(input) {
            // Transition notifications require persisted before-state, never the
            // customer-facing projection which already reads the new Stripe plan.
            const row = (
              await tx.query<{ plan: TierName; additional_capacity_units: number }>(
                "SELECT plan,additional_capacity_units FROM organizations WHERE id=$1",
                [input.organization_id]
              )
            ).rows[0];
            return row
              ? {
                  plan: row.plan,
                  active_projects: 0,
                  capacity_units: {
                    total:
                      getTierCapabilities(row.plan).included_capacity_units +
                      row.additional_capacity_units,
                    additional_purchased: row.additional_capacity_units
                  }
                }
              : null;
          }
        },
        async queueEmail(organizationId, payload) {
          await createPostgresOperationalEmailDeliveryStore(
            tx
          ).queueOrganizationOperationalEmailDelivery({
            organization_id: organizationId,
            kind: "billing_lifecycle",
            dedupe_key: `${eventId}:${notification++}`,
            payload: BillingLifecycleEmailPayloadSchema.parse(payload)
          });
        }
      });
    });
  };
}
export type BillingWebhookTransaction = ReturnType<typeof createBillingWebhookTransaction>;
