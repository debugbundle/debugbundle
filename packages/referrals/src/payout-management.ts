import { z } from "zod";
import {
  PAYOUT_COUNTRIES,
  PAYOUT_CURRENCIES,
  PAYOUT_METHODS,
  PAYOUT_MINIMUM_USD_MINOR,
  PrepareProgrammePayoutSchema,
  SavePayoutPreferenceActorSchema,
  PayoutPreferenceError
} from "./payout-preferences.js";
import type { PayoutPreferenceStore } from "../../storage/src/payout-preference-store.js";
import type { ReferralLedgerStore } from "../../storage/src/referral-ledger-store.js";

/** Personal payment setup and billing-operator review. Programme/Analytics
 * delegations intentionally grant no authority here. No transfer is initiated. */
export interface PayoutManagement {
  policy(): {
    configured: boolean;
    currencies: (typeof PAYOUT_CURRENCIES)[number][];
    methods: (typeof PAYOUT_METHODS)[number][];
    countries: string[];
    default_currency: "usd";
    routine_minimum_usd_minor: typeof PAYOUT_MINIMUM_USD_MINOR;
  };
  list(userId: string): ReturnType<PayoutPreferenceStore["list"]>;
  save(userId: string, raw: unknown): ReturnType<PayoutPreferenceStore["save"]>;
  balances(userId: string, partnerId: string): ReturnType<PayoutPreferenceStore["balances"]>;
  prepare(userId: string, raw: unknown): ReturnType<ReferralLedgerStore["claim"]>;
  instructions(userId: string, batchId: string): ReturnType<PayoutPreferenceStore["instructions"]>;
}
export function createPayoutManagement(input: {
  store: PayoutPreferenceStore;
  ledger: ReferralLedgerStore;
  isOperator(userId: string): Promise<boolean>;
  now?: () => string;
}): PayoutManagement {
  const now = input.now ?? (() => new Date().toISOString());
  async function operator(userId: string): Promise<void> {
    z.uuid().parse(userId);
    if (!(await input.isOperator(userId)))
      throw new PayoutPreferenceError("payout_operator_required");
  }
  return {
    policy() {
      return {
        configured: input.store.configured,
        currencies: [...PAYOUT_CURRENCIES],
        methods: [...PAYOUT_METHODS],
        countries: [...PAYOUT_COUNTRIES],
        default_currency: "usd" as const,
        routine_minimum_usd_minor: PAYOUT_MINIMUM_USD_MINOR
      };
    },
    list(userId: string) {
      return input.store.list(z.uuid().parse(userId));
    },
    save(userId: string, request: unknown) {
      const { expected_user_id, ...preference } = SavePayoutPreferenceActorSchema.parse(request);
      if (expected_user_id !== userId) throw new PayoutPreferenceError("payout_context_changed");
      return input.store.save(z.uuid().parse(userId), preference);
    },
    async balances(userId: string, partnerId: string) {
      await operator(userId);
      return input.store.balances(partnerId, now());
    },
    async prepare(userId: string, raw: unknown) {
      await operator(userId);
      if (!input.store.configured)
        throw new PayoutPreferenceError("payout_preferences_unavailable");
      const request = PrepareProgrammePayoutSchema.parse(raw);
      return input.ledger.claim({ ...request, operator_user_id: userId, now: now() });
    },
    async instructions(userId: string, batchId: string) {
      await operator(userId);
      return input.store.instructions(batchId);
    }
  };
}
