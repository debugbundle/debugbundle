import { expect, it, vi } from "vitest";
import {
  createReferralMcpTools,
  REFERRAL_MCP_TOOL_CATALOG
} from "../../../apps/mcp/src/referral-tools.js";
import { ReferralApiError, type ReferralApi } from "../../../packages/referral-client/src/index.js";
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
