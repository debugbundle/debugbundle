import {
  createPayoutManagement,
  type PayoutManagement
} from "../../../packages/referrals/src/payout-management.js";
import { createPayoutPreferenceStore } from "../../../packages/storage/src/payout-preference-store.js";
import { createReferralLedgerStore } from "../../../packages/storage/src/referral-ledger-store.js";
import type { Queryable } from "../../../packages/storage/src/types.js";
import type { ReferralFinance } from "../../../packages/referrals/src/referral-finance.js";
export function createDefaultPayoutPreferences(input: {
  db: Queryable;
  finance: ReferralFinance;
  encryptionKey?: string;
}): PayoutManagement {
  return createPayoutManagement({
    store: createPayoutPreferenceStore({
      db: input.db,
      ...(input.encryptionKey ? { encryptionKey: input.encryptionKey } : {})
    }),
    ledger: createReferralLedgerStore(
      input.db,
      input.encryptionKey ? { payoutEncryptionKey: input.encryptionKey } : {}
    ),
    async isOperator(userId) {
      return (await input.finance.earnings(userId)).operator_access;
    }
  });
}
