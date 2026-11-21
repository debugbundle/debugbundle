import { expect, it, vi } from "vitest";
import {
  createReferralMcpTools,
  REFERRAL_MCP_TOOL_CATALOG
} from "../../../apps/mcp/src/referral-tools.js";
import { ReferralApiError, type ReferralApi } from "../../../packages/referral-client/src/index.js";
import { createOfferMcpTools } from "../../../apps/mcp/src/offer-tools.js";
import { createOfferApi } from "../../../packages/referral-client/src/offer-api.js";
import { mockedObject } from "../../helpers/vitest.js";
it("requires explicit partner terms and rejects client-supplied eligibility", async () => {
  const join = vi.fn(),
    apply = vi.fn();
  const tools = createReferralMcpTools(mockedObject<ReferralApi>({ join, apply }));
  await expect(tools.join_referral_program({ bearerToken: "member" })).rejects.toThrow(
    "invalid_referral_input"
  );
  await expect(
    tools.apply_customer_referral({
      bearerToken: "member",
      code: "ABCD234567",
      provider_previously_paid: false
    })
  ).rejects.toThrow("invalid_referral_input");
  expect(join).not.toHaveBeenCalled();
  expect(apply).not.toHaveBeenCalled();
  await tools.apply_customer_referral({
    bearerToken: "member",
    code: "abcd234567",
    explicitCorrection: true
  });
  expect(apply).toHaveBeenCalledWith({
    bearerToken: "member",
    code: "ABCD234567",
    explicitCorrection: true
  });
  expect(
    REFERRAL_MCP_TOOL_CATALOG.find((t) => t.name === "join_referral_program")?.annotations
      .readOnlyHint
  ).toBe(false);
});
it("preserves eligibility refusals without returning private provider errors", async () => {
  const tools = createReferralMcpTools(
    mockedObject<ReferralApi>({
      apply: vi.fn().mockRejectedValue(new ReferralApiError(409, "ineligible_customer"))
    })
  );
  await expect(
    tools.apply_customer_referral({ bearerToken: "member", code: "ABCD234567" })
  ).rejects.toThrow("mcp_tool_error:ineligible_customer");
});
it("requires explicit externally-paid confirmation and cannot forward an operator identity", async () => {
  const recordPayout = vi.fn(),
    tools = createReferralMcpTools(mockedObject<ReferralApi>({ recordPayout })),
    id = "11111111-1111-4111-8111-111111111111";
  await expect(
    tools.record_referral_payout({
      bearerToken: "member",
      batchId: id,
      externalReference: "bank-001"
    })
  ).rejects.toThrow("invalid_referral_input");
  await expect(
    tools.record_referral_payout({
      bearerToken: "member",
      batchId: id,
      externalReference: "bank-001",
      confirmedExternalPayment: true,
      operator_user_id: id
    })
  ).rejects.toThrow("invalid_referral_input");
  expect(recordPayout).not.toHaveBeenCalled();
  await tools.record_referral_payout({
    bearerToken: "member",
    batchId: id,
    externalReference: "bank-001",
    confirmedExternalPayment: true
  });
  expect(recordPayout).toHaveBeenCalledWith({
    bearerToken: "member",
    batchId: id,
    externalReference: "bank-001",
    confirmedExternalPayment: true
  });
});
it("forwards creator analytics and guarded code replacement with the supplied member credential", async () => {
  const counts = { referred_accounts: 0, first_paid_referrals: 0, net_commission_minor: 0 };
  const request = vi
    .fn()
    .mockResolvedValueOnce({
      status: 200,
      body: {
        as_of: "2026-11-20T12:00:00Z",
        currency: "usd",
        totals: counts,
        daily: Array.from({ length: 7 }, (_, day) => ({ date: `2026-11-${14 + day}`, ...counts }))
      }
    })
    .mockResolvedValueOnce({ status: 409, body: { error: "creator_code_changed" } });
  const tools = createOfferMcpTools(createOfferApi({ request }));
  await expect(
    tools.get_creator_referral_analytics({ bearerToken: "member", days: "7" })
  ).resolves.toMatchObject({ totals: counts });
  await expect(
    tools.claim_creator_code({ bearerToken: "member", code: "new20", expected_code: "old20" })
  ).rejects.toThrow("creator_code_changed");
  expect(request.mock.calls).toEqual([
    [{ bearerToken: "member", method: "GET", path: "/v2/referrals/analytics?days=7" }],
    [
      {
        bearerToken: "member",
        method: "POST",
        path: "/v2/offers/creator/code",
        body: { code: "NEW20", expected_code: "OLD20" }
      }
    ]
  ]);
});
