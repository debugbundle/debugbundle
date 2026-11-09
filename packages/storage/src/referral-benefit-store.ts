import { z } from "zod";
import { referralCustomerBindingMatches } from "./referral-customer-binding.js";
import {
  decideReferralInvoiceBenefit,
  type ReferralInvoiceBenefitDecision
} from "../../referrals/src/customer-benefit.js";
import { isCurrentBillingOwner } from "./billing-owner.js";
import { runInTransaction } from "./transaction.js";
import type { Queryable } from "./types.js";
const providerId = z.string().min(1).max(255);
const ActorSchema = z.object({ organization_id: z.uuid(), actor_user_id: z.uuid() }).strict();
const ReserveSchema = ActorSchema.extend({
  attribution_id: z.uuid(),
  checkout_attempt_id: z.uuid(),
  coupon_id: providerId
}).strict();
const ObserveSchema = z
  .object({
    organization_external_id: z.uuid(),
    provider_customer_id: providerId,
    provider_subscription_id: providerId,
    invoice: z
      .object({
        invoice_id: providerId,
        finalized: z.boolean(),
        trial: z.boolean(),
        amount_due_minor: z.number().int().safe().nonnegative(),
        business_base_net_minor: z.number().int().safe().nonnegative(),
        expected_discount_applied: z.boolean()
      })
      .strict()
  })
  .strict();
const ContextSchema = z
  .object({
    attribution_id: z.uuid(),
    owner_identity_hash: z.string().regex(/^[a-f0-9]{64}$/),
    eligible_invoice_id: providerId.nullable(),
    coupon_id: providerId.nullable(),
    checkout_attempt_id: z.uuid().nullable(),
    current_customer_id: providerId.nullable(),
    verified_owner_email: z.email(),
    discount_eligible: z.boolean()
  })
  .strict();
type Context = z.infer<typeof ContextSchema>;
interface Attribution extends Record<string, unknown> {
  id: string;
  owner_identity_hash: string;
  partner_user_id: string | null;
  partner_status: string;
  period_status: string | null;
}
export interface ReferralBenefitStore {
  checkoutContext(raw: z.infer<typeof ActorSchema>): Promise<Context | null>;
  reserveCheckout(
    raw: z.infer<typeof ReserveSchema>
  ): Promise<{ attribution_id: string; coupon_id: string } | null>;
  observeInvoice(raw: z.infer<typeof ObserveSchema>): Promise<ReferralInvoiceBenefitDecision>;
  releaseCheckout(raw: { organization_id: string; checkout_attempt_id: string }): Promise<void>;
}
async function lockOwner(
  tx: Queryable,
  input: z.infer<typeof ActorSchema>
): Promise<{ current_customer_id: string | null; verified_owner_email: string }> {
  const org = (
    await tx.query<{ stripe_customer_id: string | null }>(
      "SELECT stripe_customer_id FROM organizations WHERE id=$1 AND suspended_at IS NULL FOR UPDATE",
      [input.organization_id]
    )
  ).rows[0];
  if (!org || !(await isCurrentBillingOwner(tx, input.organization_id, input.actor_user_id)))
    throw new Error("referral_benefit_forbidden");
  const user = (
    await tx.query<{ email: string }>(
      "SELECT email FROM users WHERE id=$1 AND email_verified_at IS NOT NULL",
      [input.actor_user_id]
    )
  ).rows[0];
  if (!user) throw new Error("referral_benefit_forbidden");
  return { current_customer_id: org.stripe_customer_id, verified_owner_email: user.email };
}

async function attribution(
  tx: Queryable,
  org: string,
  lock = false
): Promise<Attribution | undefined> {
  return (
    await tx.query<Attribution>(
      `SELECT a.id,a.owner_identity_hash,p.user_id AS partner_user_id,p.status AS partner_status,period.status AS period_status
 FROM referral_attributions a JOIN referral_partners p ON p.id=a.partner_id LEFT JOIN referral_commission_periods period ON period.attribution_id=a.id
 WHERE a.organization_id=$1 ${lock ? "FOR UPDATE OF a" : ""}`,
      [org]
    )
  ).rows[0];
}
async function identityLock(tx: Queryable, hash: string): Promise<void> {
  await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    `referral-benefit:${hash}`
  ]);
}
async function priorPaid(tx: Queryable, hash: string): Promise<boolean> {
  return (
    (
      await tx.query(
        "SELECT organization_external_id FROM billing_customer_history WHERE owner_identity_hash=$1 LIMIT 1",
        [hash]
      )
    ).rows.length > 0
  );
}
/** No network calls. The organisation/attribution/identity order serialises new
 * reservations and invoice observation. The identity marker deliberately has no
 * account FK: deletion cannot give the same identity another introductory offer. */
export function createReferralBenefitStore(db: Queryable): ReferralBenefitStore {
  return {
    async checkoutContext(raw) {
      const input = ActorSchema.parse(raw);
      return runInTransaction(db, async (tx) => {
        const owner = await lockOwner(tx, input);
        const a = await attribution(tx, input.organization_id);
        if (!a) return null;
        const benefit = (
          await tx.query<Record<string, unknown>>(
            "SELECT * FROM referral_invoice_benefits WHERE owner_identity_hash=$1",
            [a.owner_identity_hash]
          )
        ).rows[0];
        const own = benefit?.["attribution_id"] === a.id;
        const paid = await priorPaid(tx, a.owner_identity_hash);
        return ContextSchema.parse({
          ...owner,
          attribution_id: a.id,
          owner_identity_hash: a.owner_identity_hash,
          eligible_invoice_id: own ? benefit["eligible_invoice_id"] : null,
          coupon_id: own ? benefit["coupon_id"] : null,
          checkout_attempt_id: own ? benefit["checkout_attempt_id"] : null,
          discount_eligible:
            a.partner_status === "active" &&
            a.partner_user_id !== input.actor_user_id &&
            a.period_status !== "ineligible" &&
            (!paid || own) &&
            (!benefit || own) &&
            benefit?.["eligible_invoice_id"] == null
        });
      });
    },
    async reserveCheckout(raw) {
      const input = ReserveSchema.parse(raw);
      return runInTransaction(db, async (tx) => {
        await lockOwner(tx, input);
        const a = await attribution(tx, input.organization_id, true);
        if (!a || a.id !== input.attribution_id)
          throw new Error("referral_benefit_context_changed");
        await identityLock(tx, a.owner_identity_hash);
        const old = (
          await tx.query<Record<string, unknown>>(
            "SELECT * FROM referral_invoice_benefits WHERE owner_identity_hash=$1 FOR UPDATE",
            [a.owner_identity_hash]
          )
        ).rows[0];
        const paid = await priorPaid(tx, a.owner_identity_hash);
        if (
          a.partner_status !== "active" ||
          a.partner_user_id === input.actor_user_id ||
          a.period_status === "ineligible" ||
          (paid && !old) ||
          (old && (old["attribution_id"] !== a.id || old["eligible_invoice_id"] !== null))
        )
          return null;
        if (
          old &&
          old["checkout_attempt_id"] !== null &&
          (old["checkout_attempt_id"] !== input.checkout_attempt_id ||
            old["coupon_id"] !== input.coupon_id)
        )
          throw new Error("referral_checkout_in_progress");
        await tx.query(
          `INSERT INTO referral_invoice_benefits(owner_identity_hash,attribution_id,organization_external_id,coupon_id,checkout_attempt_id)
 VALUES($1,$2,$3,$4,$5) ON CONFLICT(owner_identity_hash) DO UPDATE SET coupon_id=EXCLUDED.coupon_id,checkout_attempt_id=EXCLUDED.checkout_attempt_id,updated_at=now()`,
          [
            a.owner_identity_hash,
            a.id,
            input.organization_id,
            input.coupon_id,
            input.checkout_attempt_id
          ]
        );
        await tx.query(
          "UPDATE referral_attributions SET reserved_checkout_attempt_id=$2,updated_at=now() WHERE id=$1",
          [a.id, input.checkout_attempt_id]
        );
        return { attribution_id: a.id, coupon_id: input.coupon_id };
      });
    },
    async observeInvoice(raw) {
      const input = ObserveSchema.parse(raw);
      return runInTransaction(db, async (tx) => {
        const live = (
          await tx.query<{ stripe_customer_id: string | null }>(
            "SELECT stripe_customer_id FROM organizations WHERE id=$1 FOR SHARE",
            [input.organization_external_id]
          )
        ).rows[0];
        if (
          live &&
          !(await referralCustomerBindingMatches(
            tx,
            input.organization_external_id,
            input.provider_customer_id
          ))
        )
          throw new Error("referral_benefit_customer_mismatch");
        const row = (
          await tx.query<Record<string, unknown>>(
            "SELECT * FROM referral_invoice_benefits WHERE organization_external_id=$1",
            [input.organization_external_id]
          )
        ).rows[0];
        if (!row) return { action: "keep_pending" };
        await identityLock(tx, String(row["owner_identity_hash"]));
        const current = (
          await tx.query<Record<string, unknown>>(
            "SELECT * FROM referral_invoice_benefits WHERE owner_identity_hash=$1 FOR UPDATE",
            [row["owner_identity_hash"]]
          )
        ).rows[0]!;
        if (
          (current["provider_customer_id"] !== null &&
            current["provider_customer_id"] !== input.provider_customer_id) ||
          (current["provider_subscription_id"] !== null &&
            current["provider_subscription_id"] !== input.provider_subscription_id)
        )
          throw new Error("referral_benefit_customer_mismatch");
        const decision = decideReferralInvoiceBenefit({
          reserved_invoice_id: providerId.nullable().parse(current["eligible_invoice_id"]),
          invoice: input.invoice
        });
        if (decision.action === "reserve_invoice")
          await tx.query(
            "UPDATE referral_invoice_benefits SET eligible_invoice_id=$2,provider_customer_id=$3,provider_subscription_id=$4,updated_at=now() WHERE owner_identity_hash=$1",
            [
              current["owner_identity_hash"],
              decision.invoice_id,
              input.provider_customer_id,
              input.provider_subscription_id
            ]
          );
        return decision;
      });
    },
    async releaseCheckout(raw) {
      const input = z
        .object({ organization_id: z.uuid(), checkout_attempt_id: z.uuid() })
        .strict()
        .parse(raw);
      // Only a provider-confirmed terminal checkout/subscription retirement may
      // call this internal operation. An eligible invoice can never be released.
      await db.query(
        "UPDATE referral_invoice_benefits SET checkout_attempt_id=NULL,provider_customer_id=NULL,provider_subscription_id=NULL,recovery_invoice_id=NULL,recovery_requested_at=NULL,recovery_completed_at=NULL,updated_at=now() WHERE organization_external_id=$1 AND checkout_attempt_id=$2 AND eligible_invoice_id IS NULL AND (recovery_requested_at IS NULL OR recovery_completed_at IS NOT NULL)",
        [input.organization_id, input.checkout_attempt_id]
      );
    }
  };
}
