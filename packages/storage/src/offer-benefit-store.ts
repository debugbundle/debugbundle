import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  OfferPolicySchema,
  ProgrammeError,
  type OfferPolicy
} from "../../referrals/src/programme-policy.js";
import {
  OfferActorSchema,
  lockOfferIdentity,
  lockOfferOwner,
  type OfferActor
} from "./offer-store-helpers.js";
import { runInTransaction } from "./transaction.js";
import type { Queryable } from "./types.js";

export interface OfferCheckoutContext {
  claim_id: string;
  attribution_id: string | null;
  version_id: string;
  policy: OfferPolicy;
  coupon_id: string | null;
  livemode: boolean | null;
  current_customer_id: string | null;
  verified_owner_email: string;
  required: boolean;
  discount_eligible: boolean;
}
export interface BillingCheckoutOffer {
  claim_id: string;
  version_id: string;
  attribution_id: string | null;
  coupon_id: string;
  provider_customer_id_checked: string | null;
  verified_owner_email_checked: string;
}
export async function readOfferCheckoutContext(
  tx: Queryable,
  actor: OfferActor
): Promise<OfferCheckoutContext | null> {
  OfferActorSchema.parse(actor);
  const owner = await lockOfferOwner(tx, actor);
  const row = (
    await tx.query<{
      id: string;
      attribution_id: string | null;
      version_id: string;
      policy: unknown;
      coupon_id: string | null;
      configured_coupon_id: string | null;
      livemode: boolean | null;
      owner_user_id: string;
      eligible_invoice_id: string | null;
      revoked_reason: string | null;
      revoked_at: string | null;
      redeem_by: string | null;
      owner_identity_hash: string;
      paid: boolean;
    }>(
      `SELECT c.id,c.owner_user_id,c.attribution_id,c.version_id,c.coupon_id,c.eligible_invoice_id,c.revoked_reason,c.revoked_at,
    c.redeem_by::text,c.owner_identity_hash,v.policy,b.coupon_id AS configured_coupon_id,b.livemode,
    EXISTS(SELECT 1 FROM billing_customer_history h WHERE h.owner_identity_hash=c.owner_identity_hash) AS paid
    FROM offer_claims c JOIN offer_programme_versions v ON v.id=c.version_id
    LEFT JOIN offer_provider_bindings b ON b.version_id=v.id WHERE c.organization_id=$1`,
      [actor.organization_id]
    )
  ).rows[0];
  if (!row) return null;
  const required =
    row.eligible_invoice_id === null && row.revoked_reason !== "customer_removed_offer";
  return {
    claim_id: row.id,
    attribution_id: row.attribution_id,
    version_id: row.version_id,
    policy: OfferPolicySchema.parse(row.policy),
    coupon_id: row.coupon_id ?? row.configured_coupon_id,
    livemode: row.livemode,
    current_customer_id: owner.customer_id,
    verified_owner_email: owner.email,
    required,
    discount_eligible:
      required &&
      row.owner_user_id === actor.actor_user_id &&
      row.revoked_at === null &&
      !row.paid &&
      (row.redeem_by === null || Date.parse(row.redeem_by) > Date.now())
  };
}

/** Called only inside the existing organisation-locked Checkout reservation.
 * External coupon and paid-history verification happened before this transaction;
 * every local claim/owner/provider binding is rechecked before committing it. */
export async function reserveOfferCheckout(
  tx: Queryable,
  actor: OfferActor,
  input: {
    attempt_id: string;
    plan: "solo" | "team" | "business";
    interval: "month" | "year";
    offer: BillingCheckoutOffer;
  }
): Promise<boolean> {
  const context = await readOfferCheckoutContext(tx, actor);
  if (
    !context ||
    !context.discount_eligible ||
    context.claim_id !== input.offer.claim_id ||
    context.version_id !== input.offer.version_id ||
    context.attribution_id !== input.offer.attribution_id ||
    context.coupon_id !== input.offer.coupon_id ||
    context.current_customer_id !== input.offer.provider_customer_id_checked ||
    context.verified_owner_email !== input.offer.verified_owner_email_checked ||
    !context.policy.eligible_plans.includes(input.plan) ||
    !context.policy.eligible_intervals.includes(input.interval)
  )
    return false;
  const row = (
    await tx.query<{ owner_identity_hash: string; checkout_attempt_id: string | null }>(
      "SELECT owner_identity_hash,checkout_attempt_id FROM offer_claims WHERE id=$1",
      [context.claim_id]
    )
  ).rows[0]!;
  await lockOfferIdentity(tx, row.owner_identity_hash);
  if (row.checkout_attempt_id && row.checkout_attempt_id !== input.attempt_id) return false;
  const conflict = (
    await tx.query(
      "SELECT owner_identity_hash FROM referral_invoice_benefits WHERE owner_identity_hash=$1 AND (eligible_invoice_id IS NOT NULL OR checkout_attempt_id IS NOT NULL OR provider_customer_id IS NOT NULL OR provider_subscription_id IS NOT NULL OR recovery_requested_at IS NOT NULL)",
      [row.owner_identity_hash]
    )
  ).rows.length;
  if (conflict) return false;
  await tx.query(
    "UPDATE offer_claims SET checkout_attempt_id=$2,coupon_id=$3,updated_at=now() WHERE id=$1",
    [context.claim_id, input.attempt_id, context.coupon_id]
  );
  if (context.attribution_id)
    await tx.query(
      "UPDATE referral_attributions SET reserved_checkout_attempt_id=$2,updated_at=now() WHERE id=$1",
      [context.attribution_id, input.attempt_id]
    );
  return true;
}

export async function releaseOfferCheckout(
  tx: Queryable,
  organizationId: string,
  attemptId: string
): Promise<void> {
  // This internal hook is called only after provider-confirmed terminal retirement.
  await tx.query(
    `UPDATE offer_claims SET checkout_attempt_id=NULL,provider_customer_id=NULL,provider_subscription_id=NULL,
    recovery_invoice_id=NULL,recovery_requested_at=NULL,recovery_completed_at=NULL,updated_at=now()
    WHERE organization_id=$1 AND checkout_attempt_id=$2 AND eligible_invoice_id IS NULL
    AND (recovery_requested_at IS NULL OR recovery_completed_at IS NOT NULL)`,
    [organizationId, attemptId]
  );
}

export async function offerEarlyPurchaseAllowed(
  tx: Queryable,
  organizationId: string,
  attemptId?: string
): Promise<boolean> {
  const row = (
    await tx.query(
      `SELECT g.id FROM offer_early_purchase_grants g JOIN offer_claims c ON c.id=g.claim_id
    JOIN offer_programme_versions v ON v.id=c.version_id WHERE c.organization_id=$1 AND c.revoked_at IS NULL
    AND c.eligible_invoice_id IS NULL AND (c.redeem_by IS NULL OR c.redeem_by>clock_timestamp())
    AND (v.policy->>'allow_early_purchase_grants')::boolean
    AND ((g.checkout_attempt_id=COALESCE($2::uuid,(SELECT id FROM billing_checkout_attempts WHERE organization_id=$1))) OR (g.checkout_attempt_id IS NULL AND g.revoked_at IS NULL AND g.expires_at>clock_timestamp()))
    ORDER BY g.created_at,g.id FOR UPDATE OF g LIMIT 1`,
      [organizationId, attemptId ?? null]
    )
  ).rows[0];
  return row !== undefined;
}
export async function consumeOfferEarlyPurchase(
  tx: Queryable,
  organizationId: string,
  attemptId: string
): Promise<void> {
  await tx.query(
    `UPDATE offer_early_purchase_grants SET checkout_attempt_id=$2 WHERE id=(SELECT g.id
    FROM offer_early_purchase_grants g JOIN offer_claims c ON c.id=g.claim_id WHERE c.organization_id=$1
    AND g.revoked_at IS NULL AND g.expires_at>clock_timestamp() AND g.checkout_attempt_id IS NULL
    ORDER BY g.created_at,g.id LIMIT 1)`,
    [organizationId, attemptId]
  );
}
export interface OfferBenefitStore {
  context(actor: OfferActor): Promise<OfferCheckoutContext | null>;
  earlyPurchaseAllowed(actor: OfferActor): Promise<boolean>;
  grantEarlyPurchase(raw: {
    claim_id: string;
    operator_user_id: string;
    expires_at: string;
    reason: string;
  }): Promise<{ grant_id: string; expires_at: string }>;
  revokeEarlyPurchase(grantId: string): Promise<void>;
}
export function createOfferBenefitStore(db: Queryable): OfferBenefitStore {
  return {
    context: (actor: OfferActor) =>
      runInTransaction(db, (tx) => readOfferCheckoutContext(tx, actor)),
    earlyPurchaseAllowed: (actor: OfferActor) =>
      runInTransaction(db, async (tx) => {
        await lockOfferOwner(tx, OfferActorSchema.parse(actor));
        return offerEarlyPurchaseAllowed(tx, actor.organization_id);
      }),
    async grantEarlyPurchase(raw: {
      claim_id: string;
      operator_user_id: string;
      expires_at: string;
      reason: string;
    }) {
      const input = z
        .object({
          claim_id: z.uuid(),
          operator_user_id: z.uuid(),
          expires_at: z.string().datetime(),
          reason: z.string().trim().min(1).max(300)
        })
        .strict()
        .parse(raw);
      if (
        Date.parse(input.expires_at) <= Date.now() ||
        Date.parse(input.expires_at) > Date.now() + 7 * 86400_000
      )
        throw new ProgrammeError("early_purchase_grant_invalid");
      return runInTransaction(db, async (tx) => {
        const claim = (
          await tx.query<{ organization_id: string | null }>(
            "SELECT organization_id FROM offer_claims WHERE id=$1",
            [input.claim_id]
          )
        ).rows[0];
        if (!claim?.organization_id) throw new ProgrammeError("early_purchase_grant_invalid");
        await tx.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [
          claim.organization_id
        ]);
        const eligible = (
          await tx.query(
            `SELECT c.id FROM offer_claims c JOIN offer_programme_versions v ON v.id=c.version_id
          WHERE c.id=$1 AND c.revoked_at IS NULL AND c.checkout_attempt_id IS NULL AND c.eligible_invoice_id IS NULL
          AND (c.redeem_by IS NULL OR c.redeem_by>clock_timestamp()) AND (v.policy->>'allow_early_purchase_grants')::boolean`,
            [input.claim_id]
          )
        ).rows.length;
        if (!eligible) throw new ProgrammeError("early_purchase_grant_invalid");
        const id = randomUUID();
        await tx.query(
          "INSERT INTO offer_early_purchase_grants(id,claim_id,operator_user_id,expires_at,reason) VALUES($1,$2,$3,$4,$5)",
          [id, input.claim_id, input.operator_user_id, input.expires_at, input.reason]
        );
        return { grant_id: id, expires_at: input.expires_at };
      });
    },
    async revokeEarlyPurchase(grantId: string): Promise<void> {
      z.uuid().parse(grantId);
      await db.query(
        "UPDATE offer_early_purchase_grants SET revoked_at=COALESCE(revoked_at,now()) WHERE id=$1",
        [grantId]
      );
    }
  };
}
