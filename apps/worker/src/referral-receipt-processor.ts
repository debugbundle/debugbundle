import { z } from "zod";
import type { StripeBillingProvider } from "../../../packages/billing/src/stripe-subscription.js";
import { readStripeReferralSnapshot } from "../../../packages/referrals/src/stripe-receipt-snapshot.js";
import { readStripeReconciliationCustomer } from "../../../packages/referrals/src/stripe-reconciliation-customer.js";
import { readStripeReferralResourceContext } from "../../../packages/referrals/src/stripe-resource-context.js";
import {
  createReferralReconciliationStore,
  bindReferralReconciliationCustomer,
  completeReferralReconciliationEvent,
  type ReferralReconciliationStore
} from "../../../packages/storage/src/referral-reconciliation-store.js";
import { createReferralLedgerStore } from "../../../packages/storage/src/referral-ledger-store.js";
import {
  readReferralBenefitContext,
  completeReferralBenefitRecovery
} from "../../../packages/storage/src/referral-benefit-recovery-store.js";
import { reconcileReferralInvoiceBenefits } from "../../../packages/storage/src/referral-benefit-reconciliation.js";
import { restoreStripeReferralBenefit } from "../../../packages/referrals/src/stripe-benefit-recovery.js";
import { createWorkerJobStore } from "../../../packages/storage/src/worker-job-store.js";
import { runInTransaction } from "../../../packages/storage/src/transaction.js";
import { createSavepointQueryable } from "../../../packages/storage/src/savepoint-queryable.js";
import type { Queryable } from "../../../packages/storage/src/types.js";

const PayloadSchema = z.object({ event_id: z.string().min(1).max(255) }).strict();
export async function processNextReferralReceiptJob(input: {
  db: Queryable;
  store: ReferralReconciliationStore;
  provider: StripeBillingProvider;
  readCustomer?: typeof readStripeReconciliationCustomer;
  readSnapshot?: typeof readStripeReferralSnapshot;
  restoreBenefit?: typeof restoreStripeReferralBenefit;
  readResourceContext?: typeof readStripeReferralResourceContext;
}): Promise<{ processed: boolean }> {
  const jobs = createWorkerJobStore(input.db);
  await input.store.dispatchNext();
  const claim = await jobs.claim("reconcile-referral-receipts");
  if (!claim) return { processed: false };
  try {
    const payload = PayloadSchema.parse(claim.payload),
      event = await input.store.get(payload.event_id);
    if (!event) throw new Error("referral_retained_source_missing");
    if (event.status === "completed") {
      await runInTransaction(input.db, async (tx) => {
        const scoped = createWorkerJobStore(tx);
        await scoped.lock(claim);
        await scoped.complete(claim);
      });
      return { processed: true };
    }
    // All bounded provider reads precede any transaction/financial row lock.
    const resource = input.readCustomer
      ? {
          provider_customer_id: await input.readCustomer(input.provider.client, event),
          organization_external_id: null,
          subscription_related: true
        }
      : await (input.readResourceContext ?? readStripeReferralResourceContext)(
          input.provider.client,
          event
        );
    if (
      resource.organization_external_id !== null &&
      event.organization_external_id !== null &&
      resource.organization_external_id !== event.organization_external_id
    )
      throw new Error("referral_customer_binding_conflict");
    if (!resource.subscription_related) {
      await runInTransaction(input.db, async (tx) => {
        const scopedJobs = createWorkerJobStore(tx);
        await scopedJobs.lock(claim);
        await completeReferralReconciliationEvent(tx, event.event_id);
        await scopedJobs.complete(claim);
      });
      return { processed: true };
    }
    const customerId = resource.provider_customer_id;
    const customer =
      event.organization_external_id && event.owner_identity_hash
        ? {
            provider_customer_id: customerId,
            organization_external_id: event.organization_external_id,
            owner_identity_hash: event.owner_identity_hash
          }
        : await input.store.resolveCustomer(
            customerId,
            resource.organization_external_id ?? undefined
          );
    if (!customer) throw new Error("referral_customer_binding_unavailable");
    if (
      event.provider_customer_id !== null &&
      event.provider_customer_id !== customer.provider_customer_id
    )
      throw new Error("referral_customer_binding_conflict");
    const benefit = await readReferralBenefitContext(input.db, customer.organization_external_id);
    const snapshot = await (input.readSnapshot ?? readStripeReferralSnapshot)(
      input.provider,
      customer,
      { expectedResource: event, ...(benefit ? { includeInvoiceBenefits: true } : {}) }
    );
    if (
      snapshot.organization_external_id !== customer.organization_external_id ||
      snapshot.owner_identity_hash !== customer.owner_identity_hash ||
      snapshot.provider_customer_id !== customer.provider_customer_id
    )
      throw new Error("referral_customer_binding_conflict");
    const recovery = benefit
      ? await runInTransaction(input.db, async (connection) => {
          const tx = createSavepointQueryable(connection);
          await createWorkerJobStore(tx).lock(claim);
          await bindReferralReconciliationCustomer(tx, event.event_id, customer);
          return reconcileReferralInvoiceBenefits(tx, snapshot, event.livemode);
        })
      : null;
    if (recovery) {
      const result = await (input.restoreBenefit ?? restoreStripeReferralBenefit)(
        input.provider,
        recovery
      );
      if (result === "recheck_invoices") throw new Error("referral_invoice_state_changed");
    }
    await runInTransaction(input.db, async (connection) => {
      const tx = createSavepointQueryable(connection),
        scopedJobs = createWorkerJobStore(tx);
      await tx.query("SET LOCAL statement_timeout='30s'", []);
      await tx.query("SET LOCAL idle_in_transaction_session_timeout='60s'", []);
      await scopedJobs.lock(claim);
      if (recovery)
        await completeReferralBenefitRecovery(
          tx,
          recovery.organization_external_id,
          recovery.invoice_id
        );
      await bindReferralReconciliationCustomer(tx, event.event_id, customer);
      await createReferralLedgerStore(tx).reconcile(snapshot);
      await completeReferralReconciliationEvent(tx, event.event_id);
      await scopedJobs.complete(claim);
    });
    return { processed: true };
  } catch {
    await jobs.fail(claim).catch(() => undefined);
    throw new Error("referral_reconciliation_unavailable");
  }
}

export function createReferralReceiptProcessor(input: {
  db: Queryable;
  provider: StripeBillingProvider | null;
  secret: string | undefined;
}): (() => Promise<{ processed: boolean }>) | null {
  const secret = z.string().min(32).max(4096).safeParse(input.secret);
  if (!input.provider) return null;
  const store = createReferralReconciliationStore(
      input.db,
      secret.success ? { identityHashSecret: secret.data } : {}
    ),
    provider = input.provider;
  return () => processNextReferralReceiptJob({ db: input.db, store, provider });
}
