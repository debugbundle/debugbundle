import type {
  OfferPolicy,
  ProgrammeVersion,
  OfferClaim
} from "../../packages/referrals/src/programme-policy.js";
export const offerPolicy: OfferPolicy = {
  kind: "referral",
  discount_basis_points: 2000,
  eligible_plans: ["solo", "team", "business"],
  eligible_intervals: ["month", "year"],
  commission_basis_points: 5000,
  commission_months: 12,
  claims_start_at: "2026-01-01T00:00:00.000Z",
  claims_end_at: null,
  redeem_by: null,
  max_claims: 100,
  allow_early_purchase_grants: true,
  terms_version: "referrals-2026-11"
};
export const offerVersion: ProgrammeVersion = {
  programme_id: "11111111-1111-4111-8111-111111111111",
  version_id: "22222222-2222-4222-8222-222222222222",
  revision: 1,
  name: "Creators",
  public_description: "Share with a creator code.",
  state: "active",
  policy: offerPolicy,
  claims_count: 0,
  created_at: "2026-11-16T00:00:00.000Z"
};
import { publicOfferDefinition } from "../../packages/referrals/src/programme-policy.js";
const definition = publicOfferDefinition(offerVersion);
// Keep fixture projection identical to the public commercial definition.
export const offerDefinition = definition;
export const offerClaim: OfferClaim = {
  claim_id: "33333333-3333-4333-8333-333333333333",
  code: "OWEN20",
  referral_code: "OWEN20",
  version: definition,
  claimed_at: "2026-11-16T00:00:00.000Z",
  redeem_by: null,
  checkout_reserved: false,
  eligible_invoice_id: null,
  status: "saved"
};
