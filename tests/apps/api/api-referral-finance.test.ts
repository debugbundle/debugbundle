import { expect, it, vi } from "vitest";
import type { ApiDependencies } from "../../../apps/api/src/api-types.js";
import { createTokenApiServer } from "../../helpers/api-tokens.js";
import { mockedObject } from "../../helpers/vitest.js";
import { ReferralError } from "../../../packages/referrals/src/referral-contracts.js";
const user = "11111111-1111-4111-8111-111111111111",
  org = "22222222-2222-4222-8222-222222222222",
  batch = "33333333-3333-4333-8333-333333333333";
const headers = { authorization: "Bearer dbundle_mem_test" };
function setup() {
  const analytics = vi.fn().mockResolvedValue(null);
  const earnings = vi.fn().mockResolvedValue({ balance: null, operator_access: false }),
    payouts = vi.fn().mockResolvedValue([]),
    operatorBalances = vi.fn().mockRejectedValue(new ReferralError("forbidden")),
    operatorPayouts = vi.fn().mockRejectedValue(new ReferralError("forbidden")),
    claim = vi.fn().mockRejectedValue(new ReferralError("forbidden")),
    markUncertain = vi.fn().mockRejectedValue(new ReferralError("forbidden")),
    recordPayment = vi.fn().mockRejectedValue(new ReferralError("forbidden"));
  const app = createTokenApiServer({
    referrals: mockedObject<NonNullable<ApiDependencies["referrals"]>>({
      finance: {
        analytics,
        earnings,
        payouts,
        operatorBalances,
        operatorPayouts,
        claim,
        markUncertain,
        recordPayment
      }
    }),
    memberAuth: mockedObject<ApiDependencies["memberAuth"]>({
      resolveMemberByTokenHash: vi
        .fn()
        .mockResolvedValue({ member_id: user, organization_id: org, role: "owner" })
    })
  });
  return {
    app,
    analytics,
    earnings,
    payouts,
    operatorBalances,
    claim,
    markUncertain,
    recordPayment
  };
}
it("reads a bounded, private analytics report for the authenticated creator only", async () => {
  const { app, analytics } = setup();
  const url = "/v2/referrals/analytics";
  try {
    const noPartner = await app.inject({ method: "GET", url, headers });
    expect(noPartner.statusCode).toBe(404);
    expect(noPartner.json()).toEqual({ error: "creator_membership_required" });
    expect(analytics).toHaveBeenCalledWith(user, "30");
    for (const query of ["days=8", "days=7&days=90", `user_id=${org}`]) {
      const invalid = await app.inject({ method: "GET", url: `${url}?${query}`, headers });
      expect(invalid.statusCode).toBe(400);
    }
    const totals = { referred_accounts: 0, first_paid_referrals: 0, net_commission_minor: 0 };
    const report = {
      as_of: "2026-11-20T12:00:00Z",
      currency: "usd",
      totals,
      daily: Array.from({ length: 7 }, (_, day) => ({ ...totals, date: `2026-11-${14 + day}` }))
    };
    analytics.mockResolvedValueOnce(report);
    const available = await app.inject({ method: "GET", url: `${url}?days=7`, headers });
    expect(available.statusCode).toBe(200);
    expect(available.json()).toEqual(report);
    expect(available.headers["cache-control"]).toBe("no-store");
    expect(analytics.mock.calls).toEqual([
      [user, "30"],
      [user, "7"]
    ]);
  } finally {
    await app.close();
  }
});
it("reads personal earnings using the authenticated identity without customer data", async () => {
  const f = setup();
  const response = await f.app.inject({ method: "GET", url: "/v1/referrals/earnings", headers });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ balance: null, operator_access: false });
  expect(f.earnings).toHaveBeenCalledExactlyOnceWith(user);
  expect(response.headers["cache-control"]).toBe("no-store");
  await f.app.inject({ method: "GET", url: "/v1/referrals/payouts?limit=10", headers });
  expect(f.payouts).toHaveBeenCalledWith(user, { limit: 10 });
  await f.app.close();
});
it("does not promote a Business workspace Owner into a DebugBundle payout operator", async () => {
  const f = setup();
  for (const input of [
    { method: "GET" as const, url: "/v1/referrals/operator/balances" },
    {
      method: "POST" as const,
      url: "/v1/referrals/operator/payouts/claim",
      payload: { partner_id: org, claim_id: batch }
    },
    {
      method: "POST" as const,
      url: `/v1/referrals/operator/payouts/${batch}/uncertain`,
      payload: {}
    }
  ]) {
    const response = await f.app.inject({ ...input, headers });
    expect(response.statusCode).toBe(403);
  }
  await f.app.close();
});
it("requires explicit confirmation of an externally completed payment and rejects forged operator fields", async () => {
  const f = setup();
  for (const payload of [
    { external_reference: "bank-001" },
    { external_reference: "bank-001", confirmed_external_payment: true, operator_user_id: org }
  ]) {
    expect(
      (
        await f.app.inject({
          method: "POST",
          url: `/v1/referrals/operator/payouts/${batch}/paid`,
          headers,
          payload
        })
      ).statusCode
    ).toBe(400);
  }
  expect(f.recordPayment).not.toHaveBeenCalled();
  f.recordPayment.mockResolvedValue({ batch_id: batch, status: "paid" });
  const response = await f.app.inject({
    method: "POST",
    url: `/v1/referrals/operator/payouts/${batch}/paid`,
    headers,
    payload: { external_reference: "bank-001", confirmed_external_payment: true }
  });
  expect(response.statusCode).toBe(200);
  expect(f.recordPayment).toHaveBeenCalledExactlyOnceWith(user, {
    batch_id: batch,
    external_reference: "bank-001"
  });
  await f.app.close();
});
it("keeps uncertain/duplicate claim conflicts stable and suppresses unexpected provider details", async () => {
  const f = setup();
  f.claim
    .mockRejectedValueOnce(new ReferralError("payout_already_claimed"))
    .mockRejectedValueOnce(new Error("private-account-receipt"));
  const input = {
    method: "POST" as const,
    url: "/v1/referrals/operator/payouts/claim",
    headers,
    payload: { partner_id: org, claim_id: batch }
  };
  expect((await f.app.inject(input)).json()).toEqual({ error: "payout_already_claimed" });
  const response = await f.app.inject(input);
  expect(response.statusCode).toBe(503);
  expect(response.body).not.toContain("private-account-receipt");
  await f.app.close();
});
