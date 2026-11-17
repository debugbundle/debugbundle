import { randomUUID } from "node:crypto";
import { createOfferProgrammeStore } from "../../packages/storage/src/offer-programme-store.js";
import { createReferralLedgerStore } from "../../packages/storage/src/referral-ledger-store.js";
import {
  lockCreatorEmailEpoch,
  recordCreatorFirstPurchase
} from "../../packages/storage/src/creator-email-events.js";
import { runInTransaction } from "../../packages/storage/src/transaction.js";
import type { Queryable } from "../../packages/storage/src/types.js";
import type { ProgrammeVersion } from "../../packages/referrals/src/programme-policy.js";
import type { ReferralReceiptSnapshot } from "../../packages/referrals/src/referral-ledger-contracts.js";
import {
  createOfferTestUser,
  createOfferTestAccount,
  createOfferTestProgramme
} from "./offer-integration.js";

export async function creatorEmailFixture(db: Queryable) {
  const operator = await createOfferTestUser(db),
    creator = await createOfferTestUser(db);
  const programmes = createOfferProgrammeStore(db, {
    identityHashSecret: "creator-email-fixture-secret-at-least-32-characters"
  });
  const version = await createOfferTestProgramme(programmes, operator);
  const joined = await programmes.creators.join({
    user_id: creator,
    version_id: version.version_id,
    terms_version: version.policy.terms_version
  });
  await programmes.creators.claimCode({ user_id: creator, code: "MAIL20" });
  const settle = (snapshot: ReferralReceiptSnapshot) =>
    runInTransaction(db, async (tx) => {
      const epoch = await lockCreatorEmailEpoch(tx);
      await createReferralLedgerStore(tx).reconcile(snapshot);
      await recordCreatorFirstPurchase(tx, snapshot, epoch);
    });
  async function purchase(v: ProgrammeVersion = version) {
    await programmes.creators.join({
      user_id: creator,
      version_id: v.version_id,
      terms_version: v.policy.terms_version
    });
    const owner = await createOfferTestUser(db),
      org = await createOfferTestAccount(db, owner),
      customer = `cus_${randomUUID()}`;
    await programmes.claims.apply({
      organization_id: org,
      actor_user_id: owner,
      code: "MAIL20",
      source: "manual",
      explicit_correction: false,
      provider_customer_id_checked: null,
      provider_previously_paid: false
    });
    await db.query("UPDATE organizations SET stripe_customer_id=$2 WHERE id=$1", [org, customer]);
    const identity = String(
      (
        await db.query("SELECT owner_identity_hash FROM offer_claims WHERE organization_id=$1", [
          org
        ])
      ).rows[0]!["owner_identity_hash"]
    );
    const now = (await db.query<{ now: string }>("SELECT clock_timestamp()::text AS now", []))
      .rows[0]!.now;
    const start = new Date(now).toISOString(),
      end = new Date(Date.parse(start) + 30 * 86400000).toISOString(),
      key = randomUUID();
    const snapshot: ReferralReceiptSnapshot = {
      organization_external_id: org,
      provider_customer_id: customer,
      owner_identity_hash: identity,
      observed_at: start,
      invoices: [
        {
          invoice_id: `in_${key}`,
          currency: "usd",
          lines: [
            {
              id: `line_${key}`,
              plan: "team",
              kind: "plan",
              net_amount_minor: 1520,
              tax_amount_minor: 0,
              service_starts_at: start,
              service_ends_at: end
            }
          ],
          payments: [
            {
              payment_id: `pay_${key}`,
              cash_minor: 1520,
              collected_at: start,
              provider_available_at: start
            }
          ],
          refunds: [],
          disputed: false
        }
      ]
    };
    return snapshot;
  }
  return { operator, creator, programmes, version, partner: joined.partner_id, purchase, settle };
}
