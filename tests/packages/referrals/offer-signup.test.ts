import { expect, it, vi } from "vitest";
import { retryOfferSignupIntent } from "../../../packages/referrals/src/offer-signup.js";
import { ProgrammeError } from "../../../packages/referrals/src/programme-policy.js";
import { offerClaim } from "../../helpers/offer-fixtures.js";
const actor = {
  organization_id: "11111111-1111-4111-8111-111111111111",
  actor_user_id: "22222222-2222-4222-8222-222222222222"
};
function fixture() {
  const signup = {
    read: vi.fn().mockResolvedValue({ status: "pending", code: "OWEN20" }),
    take: vi.fn().mockResolvedValue({ intent_id: actor.actor_user_id, code: "OWEN20" }),
    complete: vi.fn().mockResolvedValue(undefined)
  };
  const apply = vi.fn().mockResolvedValue(offerClaim);
  return { signup, apply, enabled: true };
}
it("leaves provider outages retryable without failing authentication", async () => {
  const input = fixture();
  input.apply.mockRejectedValue(new Error("provider_unavailable"));
  expect(await retryOfferSignupIntent(input, actor)).toEqual({ status: "pending", code: "OWEN20" });
  expect(input.signup.complete).toHaveBeenCalledExactlyOnceWith(actor.actor_user_id, "retry");
});
it("finishes exact admitted intent and records a terminal eligibility failure explicitly", async () => {
  const input = fixture();
  await retryOfferSignupIntent(input, actor);
  expect(input.apply).toHaveBeenCalledExactlyOnceWith(actor, "OWEN20");
  expect(input.signup.complete).toHaveBeenCalledWith(actor.actor_user_id, "completed");
  input.signup.complete.mockClear();
  input.apply.mockRejectedValue(new ProgrammeError("offer_ineligible"));
  await retryOfferSignupIntent(input, actor);
  expect(input.signup.complete).toHaveBeenCalledExactlyOnceWith(actor.actor_user_id, "rejected");
});
it("never invents a claim when no due account-bound intent exists", async () => {
  const input = fixture();
  input.signup.take.mockResolvedValue(null);
  await retryOfferSignupIntent(input, actor);
  expect(input.apply).not.toHaveBeenCalled();
  input.enabled = false;
  await retryOfferSignupIntent(input, actor);
  expect(input.apply).not.toHaveBeenCalled();
});
