import { expect, it, vi } from "vitest";
import {
  createReferralApi,
  type ReferralHttpClient
} from "../../../packages/referral-client/src/index.js";
const auth = { bearerToken: "member-private" },
  partner = "11111111-1111-4111-8111-111111111111",
  batch = "22222222-2222-4222-8222-222222222222";
const balance = {
  currency: "usd",
  available_minor: 2655,
  pending_minor: 0,
  claimed_minor: 0,
  paid_minor: 0
};
const payout = {
  batch_id: batch,
  partner_id: partner,
  currency: "usd",
  amount_minor: 2655,
  status: "claimed",
  external_reference: null,
  claimed_at: "2026-12-10T00:00:00.000Z",
  paid_at: null
};
it("keeps personal/operator endpoints distinct and freezes a stable claim ID", async () => {
  const request = vi
    .fn<ReferralHttpClient["request"]>()
    .mockResolvedValueOnce({ status: 200, body: { balance, operator_access: false } })
    .mockResolvedValueOnce({ status: 200, body: { payouts: [] } })
    .mockResolvedValueOnce({
      status: 200,
      body: { partners: [{ partner_id: partner, code: "ABCD234567", balance }] }
    })
    .mockResolvedValue({ status: 200, body: { payout } });
  const api = createReferralApi({ request });
  expect(await api.earnings(auth)).toEqual({ balance, operator_access: false });
  await api.payouts(auth);
  await api.operatorBalances({ ...auth, limit: 10 });
  await api.claimPayout({ ...auth, partnerId: partner, claimId: batch });
  await api.claimPayout({ ...auth, partnerId: partner, claimId: batch });
  expect(request.mock.calls.map(([input]) => input.path)).toEqual([
    "/v1/referrals/earnings",
    "/v1/referrals/payouts?limit=25",
    "/v1/referrals/operator/balances?limit=10",
    "/v1/referrals/operator/payouts/claim",
    "/v1/referrals/operator/payouts/claim"
  ]);
  expect(request.mock.calls[3]?.[0].body).toEqual({ partner_id: partner, claim_id: batch });
  expect(request.mock.calls[4]?.[0].body).toEqual(request.mock.calls[3]?.[0].body);
});
it("requires explicit externally-paid confirmation and cannot forge actor/time/amount", async () => {
  const request = vi.fn<ReferralHttpClient["request"]>(),
    api = createReferralApi({ request });
  await expect(
    api.recordPayout({ ...auth, batchId: batch, externalReference: "bank-001" } as never)
  ).rejects.toThrow();
  await expect(
    api.claimPayout({ ...auth, partnerId: partner, claimId: batch, amount_minor: 99999 } as never)
  ).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
  request.mockResolvedValue({
    status: 200,
    body: {
      payout: {
        ...payout,
        status: "paid",
        paid_at: "2026-12-10T00:01:00.000Z",
        external_reference: "bank-001"
      }
    }
  });
  await api.recordPayout({
    ...auth,
    batchId: batch,
    externalReference: "bank-001",
    confirmedExternalPayment: true
  });
  expect(request).toHaveBeenCalledWith({
    ...auth,
    method: "POST",
    path: `/v1/referrals/operator/payouts/${batch}/paid`,
    body: { external_reference: "bank-001", confirmed_external_payment: true }
  });
});
it("withholds unexpected private fields and preserves stable claimed-payment refusals", async () => {
  const request = vi
      .fn<ReferralHttpClient["request"]>()
      .mockResolvedValueOnce({
        status: 200,
        body: { payouts: [{ ...payout, customer_email: "private@example.test" }] }
      })
      .mockResolvedValueOnce({ status: 409, body: { error: "payout_already_claimed" } }),
    api = createReferralApi({ request });
  await expect(api.payouts(auth)).rejects.toMatchObject({ code: "invalid_response" });
  await expect(
    api.claimPayout({ ...auth, partnerId: partner, claimId: batch })
  ).rejects.toMatchObject({ code: "payout_already_claimed", status: 409 });
});
