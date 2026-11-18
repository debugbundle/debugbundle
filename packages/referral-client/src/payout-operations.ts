import { z } from "zod";
import {
  PAYOUT_CURRENCIES,
  PAYOUT_METHODS,
  PayoutStoredDetailsSchema,
  PayoutPreferenceSummarySchema,
  CreatorPayoutProgrammeSchema,
  PayoutProgrammeBalanceSchema,
  SavePayoutPreferenceActorSchema,
  PrepareProgrammePayoutSchema
} from "../../referrals/src/payout-preferences.js";
import { ReferralPayoutSchema } from "../../referrals/src/referral-ledger-contracts.js";
const instructions = z
  .object({
    batch_id: z.uuid(),
    partner_id: z.uuid(),
    programme_id: z.uuid(),
    revision: z.uuid(),
    details: PayoutStoredDetailsSchema
  })
  .strict();
// Billing-operator endpoints use their own allowlist. The programme delegation
// bit is false so a programme proof can never substitute for that authority.
export const PAYOUT_OPERATIONS = {
  payout_policy: {
    method: "GET",
    path: "/v2/referrals/payout-policy",
    input: z.object({}).strict(),
    response: z
      .object({
        configured: z.boolean(),
        currencies: z.array(z.enum(PAYOUT_CURRENCIES)),
        methods: z.array(z.enum(PAYOUT_METHODS)),
        countries: z.array(z.string().regex(/^[A-Z]{2}$/)).max(250),
        default_currency: z.literal("usd"),
        routine_minimum_usd_minor: z.literal(5000)
      })
      .strict(),
    read: true,
    operator: false
  },
  payout_preferences: {
    method: "GET",
    path: "/v2/referrals/payout-preferences",
    input: z.object({}).strict(),
    response: z
      .object({ user_id: z.uuid(), programmes: z.array(CreatorPayoutProgrammeSchema).max(100) })
      .strict(),
    read: true,
    operator: false
  },
  save_payout_preferences: {
    method: "POST",
    path: "/v2/referrals/payout-preferences",
    input: SavePayoutPreferenceActorSchema,
    response: z.object({ preference: PayoutPreferenceSummarySchema }).strict(),
    read: false,
    operator: false
  },
  payout_balances: {
    method: "GET",
    path: "/v2/referrals/payout-balances",
    input: z.object({ partner_id: z.uuid() }).strict(),
    response: z.object({ programmes: z.array(PayoutProgrammeBalanceSchema).max(100) }).strict(),
    read: true,
    operator: false
  },
  prepare_payout: {
    method: "POST",
    path: "/v2/referrals/payouts/prepare",
    input: PrepareProgrammePayoutSchema,
    response: z.object({ payout: ReferralPayoutSchema }).strict(),
    read: false,
    operator: false
  },
  payout_instructions: {
    method: "GET",
    path: "/v2/referrals/payouts/:batch_id/instructions",
    input: z.object({ batch_id: z.uuid() }).strict(),
    response: z.object({ instructions: instructions.nullable() }).strict(),
    read: true,
    operator: false
  }
} as const;
