import { randomUUID } from "node:crypto";
import { base } from "./base.js";
import {
  PAYOUT_COUNTRIES,
  PAYOUT_CURRENCIES,
  PAYOUT_METHODS,
  PAYOUT_MINIMUM_USD_MINOR,
  maskPayoutDestination,
  type PayoutPreferenceSummary,
  type PayoutDetails
} from "../../packages/referrals/src/payout-preferences.js";
import type { ProgrammeVersion } from "../../packages/referrals/src/programme-policy.js";
import type { MockResponse } from "./api.js";

/** Temporary local UI state only. Production encryption and financial guards are
 * exercised against the real services in isolated integration tests. */
export function createPayoutPreferenceMocks(accepted: () => ProgrammeVersion[]) {
  const preferences = new Map<string, PayoutPreferenceSummary>();
  return {
    handle(name: string, input: Record<string, unknown>): MockResponse | undefined {
      const reply = (body: unknown): MockResponse => ({ status: 200, body });
      switch (name) {
        case "payout_policy":
          return reply({
            configured: true,
            currencies: [...PAYOUT_CURRENCIES],
            methods: [...PAYOUT_METHODS],
            countries: [...PAYOUT_COUNTRIES],
            default_currency: "usd",
            routine_minimum_usd_minor: PAYOUT_MINIMUM_USD_MINOR
          });
        case "payout_preferences":
          return reply({
            user_id: base.session.user_id,
            programmes: accepted().map((p) => ({
              programme_id: p.programme_id,
              name: p.name,
              preference: preferences.get(p.programme_id) ?? null
            }))
          });
        case "save_payout_preferences": {
          if (input["expected_user_id"] !== base.session.user_id)
            return { status: 409, body: { error: "payout_context_changed" } };
          const programmeId = String(input["programme_id"]);
          if (!accepted().some((p) => p.programme_id === programmeId))
            return { status: 404, body: { error: "payout_programme_not_owned" } };
          if ((preferences.get(programmeId)?.revision ?? null) !== input["expected_revision"])
            return { status: 409, body: { error: "payout_preferences_changed" } };
          const details = input["details"] as PayoutDetails;
          const preference: PayoutPreferenceSummary = {
            programme_id: programmeId,
            revision: randomUUID(),
            method: details.method,
            country: details.country,
            currency: details.currency,
            masked_destination: maskPayoutDestination(details.destination),
            updated_at: new Date().toISOString()
          };
          preferences.set(programmeId, preference);
          return reply({ preference });
        }
        case "payout_balances":
          return reply({ programmes: [] });
        case "payout_instructions":
          return reply({ instructions: null });
        case "prepare_payout":
          return { status: 409, body: { error: "no_available_commission" } };
        default:
          return undefined;
      }
    }
  };
}
