import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getBillingCatalogPrice } from "../../shared-types/src/billing-catalog.js";
import { previewOfferPrice, type OfferPolicy } from "./programme-policy.js";

export {
  OfferQuoteSelectionSchema,
  OfferPurchaseQuoteSchema,
  type OfferPurchaseQuote
} from "./offer-quote-contracts.js";
import {
  OfferQuoteSelectionSchema,
  OfferPurchaseQuoteSchema,
  type OfferPurchaseQuote
} from "./offer-quote-contracts.js";
const claimsSchema = OfferPurchaseQuoteSchema.omit({ confirmation_token: true })
  .extend({ organization_id: z.uuid(), actor_user_id: z.uuid() })
  .strict();
export interface OfferQuoteCodec {
  issue(
    input: {
      organization_id: string;
      actor_user_id: string;
      claim_id: string;
      version_id: string;
      selection: z.input<typeof OfferQuoteSelectionSchema>;
      policy: OfferPolicy;
    },
    now?: number
  ): OfferPurchaseQuote;
  verify(
    this: void,
    token: string,
    actor: { organization_id: string; actor_user_id: string }
  ): z.infer<typeof claimsSchema> | null;
}
export function createOfferQuoteCodec(secret: string): OfferQuoteCodec {
  z.string().min(32).max(4096).parse(secret);
  const sign = (body: string): Buffer =>
    createHmac("sha256", secret).update(`offer-purchase-quote:v1:${body}`).digest();
  return {
    issue(
      input: {
        organization_id: string;
        actor_user_id: string;
        claim_id: string;
        version_id: string;
        selection: z.input<typeof OfferQuoteSelectionSchema>;
        policy: OfferPolicy;
      },
      now = Date.now()
    ): OfferPurchaseQuote {
      const selection = OfferQuoteSelectionSchema.parse(input.selection);
      if (
        !input.policy.eligible_plans.includes(selection.target_plan) ||
        !input.policy.eligible_intervals.includes(selection.interval)
      )
        throw new Error("offer_selection_ineligible");
      const base = getBillingCatalogPrice(
        selection.target_plan,
        selection.interval,
        "plan"
      ).amount_minor;
      const capacity =
        getBillingCatalogPrice(selection.target_plan, selection.interval, "extra_capacity")
          .amount_minor * selection.additional_capacity_units;
      const prices = previewOfferPrice(base, input.policy);
      const claims = claimsSchema.parse({
        ...selection,
        organization_id: input.organization_id,
        actor_user_id: input.actor_user_id,
        claim_id: input.claim_id,
        version_id: input.version_id,
        currency: "usd",
        base_minor: base,
        discount_minor: prices.discount_minor,
        capacity_minor: capacity,
        initial_total_minor: prices.payable_minor + capacity,
        renewal_total_minor: base + capacity,
        tax_calculated_at_checkout: true,
        expires_at: new Date(now + 5 * 60_000).toISOString()
      });
      const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
      const quote = OfferPurchaseQuoteSchema.omit({ confirmation_token: true })
        .strip()
        .parse(claims);
      return { ...quote, confirmation_token: `${body}.${sign(body).toString("base64url")}` };
    },
    verify(
      token: string,
      actor: { organization_id: string; actor_user_id: string }
    ): z.infer<typeof claimsSchema> | null {
      try {
        if (token.length > 8192) return null;
        const [body, signature, extra] = token.split(".");
        if (!body || !signature || extra !== undefined || !/^[A-Za-z0-9_-]+$/.test(signature))
          return null;
        const actual = Buffer.from(signature, "base64url"),
          expected = sign(body);
        if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
        const claims = claimsSchema.parse(
          JSON.parse(Buffer.from(body, "base64url").toString("utf8"))
        );
        if (
          claims.organization_id !== actor.organization_id ||
          claims.actor_user_id !== actor.actor_user_id
        )
          return null;
        const base = getBillingCatalogPrice(
          claims.target_plan,
          claims.interval,
          "plan"
        ).amount_minor;
        const capacity =
          getBillingCatalogPrice(claims.target_plan, claims.interval, "extra_capacity")
            .amount_minor * claims.additional_capacity_units;
        if (
          claims.base_minor !== base ||
          claims.capacity_minor !== capacity ||
          claims.renewal_total_minor !== base + capacity ||
          claims.initial_total_minor !== base + capacity - claims.discount_minor
        )
          return null;
        // Expiry is checked under the Checkout lock for new reservations. An
        // already admitted exact attempt can still reconcile its original proof.
        return claims;
      } catch {
        return null;
      }
    }
  };
}
