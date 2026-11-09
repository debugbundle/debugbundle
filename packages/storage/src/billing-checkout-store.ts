import { z } from "zod";
import { createReferralBenefitStore } from "./referral-benefit-store.js";
import { createSavepointQueryable } from "./savepoint-queryable.js";
import { randomUUID } from "node:crypto";
import { isCurrentBillingOwner } from "./billing-owner.js";
import type { PaidTierName } from "../../shared-types/src/index.js";
import type { Queryable } from "./types.js";
import { runInTransaction } from "./transaction.js";
import { getFirstPurchaseEligibility } from "../../shared-types/src/first-purchase-eligibility.js";

export interface BillingCheckoutAttempt {
  id: string;
  organization_id: string;
  target_plan: PaidTierName;
  stripe_session_id: string | null;
  parameters: Record<string, unknown>;
}

export interface BillingCheckoutReferral {
  provider_customer_id_checked: string | null;
  verified_owner_email_checked: string;
  attribution_id: string;
  coupon_id: string;
}
export interface BillingCheckoutStore {
  getReferralCheckoutContext?(input: { organization_id: string; actor_user_id: string }): Promise<{
    attribution_id: string;
    discount_eligible: boolean;
    current_customer_id: string | null;
    verified_owner_email: string;
  } | null>;
  claim(input: {
    organization_id: string;
    target_plan: PaidTierName;
    confirmed_ended_subscription_id?: string;
    expected_owner_user_id?: string;
    referral_coupon?: BillingCheckoutReferral;
    parameters(
      customerId: string | null,
      expiresAt: number,
      referral?: BillingCheckoutReferral
    ): Record<string, unknown>;
  }): Promise<
    | BillingCheckoutAttempt
    | "checkout_in_progress"
    | "checkout_not_allowed"
    | "paid_purchase_locked"
    | "referral_coupon_required"
  >;
  saveSession(organizationId: string, attemptId: string, sessionId: string): Promise<boolean>;
  retireExpired(organizationId: string, attemptId: string, sessionId: string): Promise<boolean>;
  retireEndedSubscription(
    organizationId: string,
    attemptId: string,
    sessionId: string,
    subscriptionId: string
  ): Promise<boolean>;
}

// One row per account survives process/Redis restarts and carries the exact Stripe
// request for idempotent recovery. Never rotate an ambiguous or completed payment.
export function createPostgresBillingCheckoutStore(db: Queryable): BillingCheckoutStore {
  return {
    getReferralCheckoutContext: (input) => createReferralBenefitStore(db).checkoutContext(input),
    claim: (input) =>
      runInTransaction(db, async (tx) => {
        const org = (
          await tx.query<{
            stripe_customer_id: string | null;
            stripe_subscription_id: string | null;
            billing_state: string | null;
            suspended_at: string | null;
            trial_started_at: string | null;
            previously_paid: boolean;
          }>(
            `SELECT stripe_customer_id, stripe_subscription_id, billing_state, suspended_at,
            to_jsonb(organizations)->>'trial_started_at' AS trial_started_at,
            EXISTS (SELECT 1 FROM processed_billing_events receipt
              WHERE receipt.organization_id=organizations.id AND receipt.event_type='invoice.paid') AS previously_paid
          FROM organizations WHERE id = $1 FOR UPDATE`,
            [input.organization_id]
          )
        ).rows[0];
        if (
          org === undefined ||
          org.suspended_at !== null ||
          (org.stripe_subscription_id !== null &&
            (org.billing_state !== "canceled" ||
              org.stripe_subscription_id !== input.confirmed_ended_subscription_id))
        ) {
          // A plan upgrade must update the existing subscription, never create a
          // second recurring subscription while its first one remains linked.
          return "checkout_not_allowed";
        }
        if (
          input.expected_owner_user_id !== undefined &&
          !(await isCurrentBillingOwner(tx, input.organization_id, input.expected_owner_user_id))
        )
          return "checkout_not_allowed";
        // Enforce before returning/replaying any request. Never discard an old,
        // possibly charged attempt when the first-purchase policy blocks it.
        if (
          !getFirstPurchaseEligibility(
            {
              trial_started_at: org.trial_started_at ?? null,
              previously_paid: org.previously_paid === true
            },
            Date.now()
          ).allowed
        )
          return "paid_purchase_locked";
        const current = (
          await tx.query<BillingCheckoutAttempt & Record<string, unknown>>(
            "SELECT id, organization_id, target_plan, stripe_session_id, parameters FROM billing_checkout_attempts WHERE organization_id = $1",
            [input.organization_id]
          )
        ).rows[0];
        if (current !== undefined) {
          // A saved session can be inspected for provider-confirmed expiry even
          // when the requested plan changes. An unsaved attempt stays fenced.
          return current.target_plan === input.target_plan || current.stripe_session_id !== null
            ? current
            : "checkout_in_progress";
        }
        const attemptId = randomUUID();
        let referral: BillingCheckoutReferral | undefined;
        if (input.target_plan === "business") {
          const attributed =
            (
              await tx.query("SELECT id FROM referral_attributions WHERE organization_id=$1", [
                input.organization_id
              ])
            ).rows.length > 0;
          if (attributed) {
            if (!input.expected_owner_user_id) return "checkout_not_allowed";
            const benefits = createReferralBenefitStore(createSavepointQueryable(tx));
            const context = await benefits.checkoutContext({
              organization_id: input.organization_id,
              actor_user_id: input.expected_owner_user_id
            });
            if (context?.discount_eligible) {
              if (
                !input.referral_coupon ||
                input.referral_coupon.attribution_id !== context.attribution_id
              )
                return "referral_coupon_required";
              if (
                input.referral_coupon.provider_customer_id_checked !== org.stripe_customer_id ||
                input.referral_coupon.verified_owner_email_checked !== context.verified_owner_email
              )
                return "checkout_in_progress";
              referral = input.referral_coupon;
            } else if (input.referral_coupon) return "checkout_not_allowed";
          } else if (input.referral_coupon) return "checkout_not_allowed";
        }
        const parameters = input.parameters(
          org.stripe_customer_id,
          Math.floor(Date.now() / 1000) + 3600,
          referral
        );
        if (referral) {
          const validated = z
            .object({
              discounts: z.tuple([z.object({ coupon: z.literal(referral.coupon_id) }).strict()]),
              allow_promotion_codes: z.literal(false)
            })
            .passthrough()
            .safeParse(parameters);
          if (!validated.success) return "checkout_not_allowed";
          const reserved = await createReferralBenefitStore(
            createSavepointQueryable(tx)
          ).reserveCheckout({
            organization_id: input.organization_id,
            actor_user_id: input.expected_owner_user_id!,
            attribution_id: referral.attribution_id,
            coupon_id: referral.coupon_id,
            checkout_attempt_id: attemptId
          });
          if (!reserved) return "checkout_not_allowed";
        }
        const attempt: BillingCheckoutAttempt = {
          id: attemptId,
          organization_id: input.organization_id,
          target_plan: input.target_plan,
          stripe_session_id: null,
          parameters
        };
        await tx.query(
          `INSERT INTO billing_checkout_attempts
        (organization_id, id, target_plan, parameters) VALUES ($1, $2, $3, $4::jsonb)`,
          [
            attempt.organization_id,
            attempt.id,
            attempt.target_plan,
            JSON.stringify(attempt.parameters)
          ]
        );
        return attempt;
      }),
    async saveSession(organizationId, attemptId, sessionId) {
      const result = await db.query(
        `UPDATE billing_checkout_attempts SET stripe_session_id = $3
        WHERE organization_id = $1 AND id = $2 AND (stripe_session_id IS NULL OR stripe_session_id = $3)
        RETURNING id`,
        [organizationId, attemptId, sessionId]
      );
      return result.rows.length === 1;
    },
    async retireExpired(organizationId, attemptId, sessionId) {
      return runInTransaction(db, async (tx) => {
        await tx.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [organizationId]);
        const result = await tx.query<{ id: string; target_plan: string }>(
          `DELETE FROM billing_checkout_attempts
          WHERE organization_id=$1 AND id=$2 AND stripe_session_id=$3 RETURNING id,target_plan`,
          [organizationId, attemptId, sessionId]
        );
        if (result.rows[0]?.target_plan === "business")
          await createReferralBenefitStore(tx).releaseCheckout({
            organization_id: organizationId,
            checkout_attempt_id: attemptId
          });
        return result.rows.length === 1;
      });
    },
    async retireEndedSubscription(organizationId, attemptId, sessionId, subscriptionId) {
      return runInTransaction(db, async (tx) => {
        await tx.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [organizationId]);
        const result = await tx.query<{ id: string; target_plan: string }>(
          `DELETE FROM billing_checkout_attempts attempt
          USING organizations org WHERE attempt.organization_id=$1 AND attempt.id=$2 AND attempt.stripe_session_id=$3
          AND org.id=attempt.organization_id AND org.stripe_subscription_id=$4 AND org.billing_state='canceled' AND org.suspended_at IS NULL
          RETURNING attempt.id,attempt.target_plan`,
          [organizationId, attemptId, sessionId, subscriptionId]
        );
        if (result.rows[0]?.target_plan === "business")
          await createReferralBenefitStore(tx).releaseCheckout({
            organization_id: organizationId,
            checkout_attempt_id: attemptId
          });
        return result.rows.length === 1;
      });
    }
  };
}
