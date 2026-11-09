import { z } from "zod";
import type { ReferralStore } from "../../storage/src/referral-store.js";
import type { ReferralLedgerStore } from "../../storage/src/referral-ledger-store.js";
import { ReferralError } from "./referral-contracts.js";
import {
  ReferralPayoutPageSchema,
  ReferralOperatorPayoutPageSchema,
  ReferralPayoutClaimSchema,
  ReferralPayoutRecordSchema,
  REFERRAL_FINANCE_ERROR_CODES,
  type ReferralEarningsResponse,
  type ReferralPayout,
  type ReferralPartnerEarnings
} from "./referral-ledger-contracts.js";

type Page = z.input<typeof ReferralPayoutPageSchema>;
function pagination(raw: Page): { limit: number; before?: string } {
  const page = ReferralPayoutPageSchema.parse(raw);
  return { limit: page.limit, ...(page.before === undefined ? {} : { before: page.before }) };
}
export interface ReferralFinance {
  earnings(userId: string): Promise<ReferralEarningsResponse>;
  payouts(userId: string, page: Page): Promise<ReferralPayout[]>;
  operatorBalances(userId: string, page: Page): Promise<ReferralPartnerEarnings[]>;
  operatorPayouts(
    userId: string,
    page: z.input<typeof ReferralOperatorPayoutPageSchema>
  ): Promise<ReferralPayout[]>;
  claim(userId: string, input: z.infer<typeof ReferralPayoutClaimSchema>): Promise<ReferralPayout>;
  markUncertain(userId: string, batchId: string): Promise<ReferralPayout>;
  recordPayment(
    userId: string,
    input: z.infer<typeof ReferralPayoutRecordSchema>
  ): Promise<ReferralPayout>;
}
export function createReferralFinance(input: {
  partners: ReferralStore;
  ledger: ReferralLedgerStore;
  isOperator(userId: string): Promise<boolean>;
  now?: () => string;
}): ReferralFinance {
  const now = input.now ?? (() => new Date().toISOString());
  async function requireOperator(userId: string): Promise<void> {
    z.uuid().parse(userId);
    if (!(await input.isOperator(userId))) throw new ReferralError("forbidden");
  }
  async function perform<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      const known = REFERRAL_FINANCE_ERROR_CODES.find(
        (code) => error instanceof Error && error.message === code
      );
      if (known) throw new ReferralError(known);
      throw error;
    }
  }
  return {
    async earnings(userId) {
      const partner = await input.partners.getPartner({ user_id: z.uuid().parse(userId) });
      return {
        balance: partner ? await input.ledger.balance(partner.partner_id, now()) : null,
        operator_access: await input.isOperator(userId)
      };
    },
    async payouts(userId, raw) {
      const page = pagination(raw),
        partner = await input.partners.getPartner({ user_id: z.uuid().parse(userId) });
      return partner ? input.ledger.listPayouts({ ...page, partner_id: partner.partner_id }) : [];
    },
    async operatorBalances(userId, raw) {
      await requireOperator(userId);
      const page = pagination(raw);
      return input.ledger.listPartnerBalances({ ...page, now: now() });
    },
    async operatorPayouts(userId, raw) {
      await requireOperator(userId);
      const page = ReferralOperatorPayoutPageSchema.parse(raw);
      return input.ledger.listPayouts({
        limit: page.limit,
        ...(page.before === undefined ? {} : { before: page.before }),
        ...(page.partner_id === undefined ? {} : { partner_id: page.partner_id })
      });
    },
    async claim(userId, raw) {
      await requireOperator(userId);
      const request = ReferralPayoutClaimSchema.parse(raw);
      return perform(() =>
        input.ledger.claim({ ...request, operator_user_id: userId, now: now() })
      );
    },
    async markUncertain(userId, batchId) {
      await requireOperator(userId);
      z.uuid().parse(batchId);
      return perform(() =>
        input.ledger.markUncertain({ batch_id: batchId, operator_user_id: userId, now: now() })
      );
    },
    async recordPayment(userId, raw) {
      await requireOperator(userId);
      const request = ReferralPayoutRecordSchema.parse(raw);
      return perform(() =>
        input.ledger.recordPayment({ ...request, operator_user_id: userId, now: now() })
      );
    }
  };
}
