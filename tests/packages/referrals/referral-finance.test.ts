import { expect, it, vi } from "vitest";
import { createReferralFinance } from "../../../packages/referrals/src/referral-finance.js";
import type { ReferralStore } from "../../../packages/storage/src/referral-store.js";
import type { ReferralLedgerStore } from "../../../packages/storage/src/referral-ledger-store.js";
import { mockedObject } from "../../helpers/vitest.js";
const user = "11111111-1111-4111-8111-111111111111",
  partner = "22222222-2222-4222-8222-222222222222",
  batch = "33333333-3333-4333-8333-333333333333";
function setup(allowed = false) {
  const getPartner = vi.fn().mockResolvedValue({ partner_id: partner }),
    balance = vi.fn().mockResolvedValue({
      currency: "usd",
      pending_minor: 0,
      available_minor: 2655,
      claimed_minor: 0,
      paid_minor: 0
    });
  const claim = vi.fn(),
    markUncertain = vi.fn(),
    recordPayment = vi.fn(),
    listPayouts = vi.fn().mockResolvedValue([]),
    listPartnerBalances = vi.fn().mockResolvedValue([]);
  const finance = createReferralFinance({
    partners: mockedObject<ReferralStore>({ getPartner }),
    ledger: mockedObject<ReferralLedgerStore>({
      balance,
      claim,
      markUncertain,
      recordPayment,
      listPayouts,
      listPartnerBalances
    }),
    isOperator: vi.fn().mockResolvedValue(allowed),
    now: () => "2026-12-10T00:00:00.000Z"
  });
  return {
    finance,
    getPartner,
    balance,
    claim,
    markUncertain,
    recordPayment,
    listPayouts,
    listPartnerBalances
  };
}
it("reads only the authenticated partner's balance and payouts", async () => {
  const f = setup();
  expect(await f.finance.earnings(user)).toMatchObject({
    operator_access: false,
    balance: { available_minor: 2655 }
  });
  await f.finance.payouts(user, { limit: 25 });
  expect(f.balance).toHaveBeenCalledWith(partner, "2026-12-10T00:00:00.000Z");
  expect(f.listPayouts).toHaveBeenCalledExactlyOnceWith({ partner_id: partner, limit: 25 });
  f.getPartner.mockResolvedValue(null);
  expect(await f.finance.earnings(user)).toEqual({ operator_access: false, balance: null });
});
it("does not treat workspace ownership, Business tier or a partner ID as operator authority", async () => {
  const f = setup();
  await expect(f.finance.operatorBalances(user, { limit: 25 })).rejects.toMatchObject({
    code: "forbidden"
  });
  await expect(
    f.finance.claim(user, { partner_id: partner, claim_id: batch })
  ).rejects.toMatchObject({ code: "forbidden" });
  await expect(f.finance.markUncertain(user, batch)).rejects.toMatchObject({ code: "forbidden" });
  await expect(
    f.finance.recordPayment(user, { batch_id: batch, external_reference: "bank-001" })
  ).rejects.toMatchObject({ code: "forbidden" });
  expect(f.claim).not.toHaveBeenCalled();
  expect(f.markUncertain).not.toHaveBeenCalled();
  expect(f.recordPayment).not.toHaveBeenCalled();
});
it("binds operator identity and time server-side and preserves stable policy refusals", async () => {
  const f = setup(true);
  f.claim.mockRejectedValue(new Error("payout_already_claimed"));
  await expect(
    f.finance.claim(user, { partner_id: partner, claim_id: batch })
  ).rejects.toMatchObject({ code: "payout_already_claimed" });
  expect(f.claim).toHaveBeenCalledWith({
    partner_id: partner,
    claim_id: batch,
    operator_user_id: user,
    now: "2026-12-10T00:00:00.000Z"
  });
  await expect(
    f.finance.claim(user, {
      partner_id: partner,
      claim_id: batch,
      operator_user_id: partner
    } as never)
  ).rejects.toThrow();
  expect(f.claim).toHaveBeenCalledTimes(1);
});
