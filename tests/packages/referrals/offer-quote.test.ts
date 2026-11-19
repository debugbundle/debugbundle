import { expect, it } from "vitest";
import { createOfferQuoteCodec } from "../../../packages/referrals/src/offer-quote.js";
import type { OfferPolicy } from "../../../packages/referrals/src/programme-policy.js";
const actor = {
  organization_id: "11111111-1111-4111-8111-111111111111",
  actor_user_id: "22222222-2222-4222-8222-222222222222"
};
const policy: OfferPolicy = {
  kind: "referral",
  discount_basis_points: 2000,
  eligible_plans: ["solo", "team", "business"],
  eligible_intervals: ["month", "year"],
  commission_basis_points: 5000,
  commission_months: 12,
  claims_start_at: "2026-01-01T00:00:00.000Z",
  claims_end_at: null,
  redeem_by: null,
  max_claims: null,
  allow_early_purchase_grants: false,
  terms_version: "v2"
};
it("binds the exact annual base discount, unchanged capacity and renewal to the Owner and workspace", () => {
  const codec = createOfferQuoteCodec("offer-quote-secret-longer-than-thirty-two-characters");
  const quote = codec.issue(
    {
      ...actor,
      claim_id: actor.organization_id,
      version_id: actor.actor_user_id,
      selection: { target_plan: "business", interval: "year", additional_capacity_units: 2 },
      policy
    },
    1000
  );
  expect(quote).toMatchObject({
    base_minor: 58800,
    discount_minor: 11760,
    capacity_minor: 6000,
    initial_total_minor: 53040,
    renewal_total_minor: 64800,
    tax_calculated_at_checkout: true
  });
  expect(codec.verify(quote.confirmation_token, actor)).toMatchObject({
    version_id: actor.actor_user_id
  });
  expect(
    codec.verify(quote.confirmation_token, { ...actor, actor_user_id: actor.organization_id })
  ).toBeNull();
  expect(codec.verify(`x${quote.confirmation_token}`, actor)).toBeNull();
});
it("signs a cheaper replacement against its original saved version without exposing private quote metadata", () => {
  const codec = createOfferQuoteCodec("offer-quote-secret-longer-than-thirty-two-characters");
  const quote = codec.issue({
    ...actor,
    claim_id: actor.organization_id,
    version_id: actor.actor_user_id,
    source_version_id: actor.organization_id,
    code: "SALE30",
    selection: { target_plan: "solo", interval: "month" },
    policy: {
      ...policy,
      kind: "promotion",
      commission_basis_points: 0,
      discount_basis_points: 3000
    }
  });
  expect(quote.initial_total_minor).toBe(350);
  expect(quote).not.toHaveProperty("source_version_id");
  expect(quote).not.toHaveProperty("code");
  expect(codec.verify(quote.confirmation_token, actor)).toMatchObject({
    source_version_id: actor.organization_id,
    code: "SALE30",
    version_id: actor.actor_user_id
  });
  expect(codec.verify(quote.confirmation_token.replace(/.$/, "!"), actor)).toBeNull();
});
it("binds a fresh claim nonce to its attribution snapshot inside the opaque proof", () => {
  const codec = createOfferQuoteCodec("offer-quote-secret-longer-than-thirty-two-characters");
  const input = {
    ...actor,
    claim_id: actor.organization_id,
    version_id: actor.actor_user_id,
    code: "SALE30",
    new_claim: { attribution_id: actor.organization_id, partner_code: "CREATOR20" },
    selection: { target_plan: "solo" as const, interval: "month" as const },
    policy
  };
  const quote = codec.issue(input);
  expect(quote).not.toHaveProperty("new_claim");
  expect(quote).not.toHaveProperty("code");
  expect(codec.verify(quote.confirmation_token, actor)).toMatchObject({
    claim_id: input.claim_id,
    new_claim: input.new_claim,
    code: "SALE30"
  });
  expect(() =>
    codec.issue({ ...input, new_claim: { attribution_id: null, partner_code: "CREATOR20" } })
  ).toThrow();
});
