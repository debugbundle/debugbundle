import { expect, it, vi } from "vitest";
import { createOfferManagement } from "../../../packages/referrals/src/offer-management.js";
import { createOfferLinkCodec } from "../../../packages/referrals/src/offer-link.js";
import { createReferralLinkCodec } from "../../../packages/referrals/src/referral-link.js";
import { createOfferQuoteCodec } from "../../../packages/referrals/src/offer-quote.js";
import type { OfferProgrammeStore } from "../../../packages/storage/src/offer-programme-store.js";
import type { LegacyOfferAdapter } from "../../../packages/storage/src/legacy-offer-adapter.js";
import { mockedObject } from "../../helpers/vitest.js";
import { offerVersion } from "../../helpers/offer-fixtures.js";
const secret = "offer-link-compatibility-secret-at-least-thirty-two-characters";
function fixture(enabled = true) {
  const version = { ...offerVersion, state: "draft" as typeof offerVersion.state };
  let binding: { coupon_id: string; livemode: boolean } | null = null;
  const prepareCoupon = vi
    .fn()
    .mockResolvedValue({ coupon_id: "automatic_coupon", livemode: false });
  const verifyCoupon = vi.fn().mockResolvedValue(undefined);
  const setState = vi.fn(async (input: Parameters<OfferProgrammeStore["setState"]>[0]) => {
    version.state = input.state;
    return { ...version };
  });
  const bindProvider = vi.fn(async (input: Parameters<OfferProgrammeStore["bindProvider"]>[0]) => {
    binding = { coupon_id: input.coupon_id, livemode: input.livemode };
  });
  const links = createOfferLinkCodec(secret),
    old = createReferralLinkCodec(secret),
    signup = {
      nextDueActor: vi.fn().mockResolvedValue(null),
      read: vi.fn().mockResolvedValue(null),
      take: vi.fn().mockResolvedValue(null),
      complete: vi.fn()
    };
  const legacy = mockedObject<LegacyOfferAdapter>({
    enabled: true,
    readHint: (header: string | undefined) => old.readHint(header),
    issue: (code: string) => old.issue(code),
    clear: () => old.clear(),
    preview: async (code: string) =>
      code === "ABCD234567"
        ? {
            code,
            available: true,
            version: {
              legacy_terms_version: "business-referrals-2026-11",
              name: "Legacy Business referral",
              public_description: "Original agreement",
              policy: {
                ...offerVersion.policy,
                discount_basis_points: 1000,
                eligible_plans: ["business"]
              }
            }
          }
        : null
  });
  const service = createOfferManagement({
    legacy,
    links,
    signup,
    store: mockedObject<OfferProgrammeStore>({
      getVersion: async () => ({ ...version }),
      setState,
      bindProvider,
      preview: async (code: string) =>
        code === "OWEN20" ? { code, version: offerVersion, available: true } : null
    }),
    operators: mockedObject<Parameters<typeof createOfferManagement>[0]["operators"]>({}),
    benefits: mockedObject<Parameters<typeof createOfferManagement>[0]["benefits"]>({}),
    quoteCodec: createOfferQuoteCodec(secret),
    enabled,
    appBaseUrl: "https://app.example.test",
    publicBaseUrl: "https://example.test",
    apiBaseUrl: "https://api.example.test",
    readEligibility: async () => ({
      provider_customer_id_checked: null,
      provider_previously_paid: false
    }),
    providerBinding: async () => binding,
    verifyCoupon,
    prepareCoupon
  });
  return {
    service,
    links,
    old,
    legacy,
    signup,
    version,
    prepareCoupon,
    verifyCoupon,
    setState,
    bindProvider,
    setBinding: (value: typeof binding) => {
      binding = value;
    }
  };
}
const change = {
  actor_user_id: offerVersion.programme_id,
  version_id: offerVersion.version_id,
  state: "active",
  expected_state: "draft",
  acknowledge_unlimited: false
} as const;
it("prepares an automatic binding before activation and reuses it when resuming", async () => {
  const f = fixture();
  await expect(f.service.changeState(change)).resolves.toMatchObject({ state: "active" });
  expect(f.prepareCoupon).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ version_id: change.version_id })
  );
  expect(f.bindProvider).toHaveBeenCalledWith(
    expect.objectContaining({ actor_user_id: change.actor_user_id, coupon_id: "automatic_coupon" })
  );
  await f.service.changeState({ ...change, expected_state: "active", state: "paused" });
  await f.service.changeState({ ...change, expected_state: "paused" });
  expect(f.prepareCoupon).toHaveBeenCalledTimes(1);
  expect(f.verifyCoupon).toHaveBeenCalledWith("automatic_coupon", offerVersion.policy, false);
});
it("retains existing manual bindings and never creates a replacement", async () => {
  const f = fixture();
  f.setBinding({ coupon_id: "existing_coupon", livemode: true });
  await f.service.changeState(change);
  expect(f.prepareCoupon).not.toHaveBeenCalled();
  expect(f.verifyCoupon).toHaveBeenCalledWith("existing_coupon", offerVersion.policy, true);
});
it("keeps failed preparation inactive and retryable without leaking provider errors", async () => {
  const f = fixture();
  f.prepareCoupon.mockRejectedValueOnce(new Error("private Stripe response"));
  await expect(f.service.changeState(change)).rejects.toMatchObject({
    code: "programme_payment_setup_failed"
  });
  expect(f.bindProvider).not.toHaveBeenCalled();
  expect(f.setState).not.toHaveBeenCalled();
  await expect(f.service.changeState(change)).resolves.toMatchObject({ state: "active" });
});
it.each(["disabled", "stale", "unlimited", "zero", "ended"])(
  "rejects invalid %s activation before provider writes",
  async (reason) => {
    const f = fixture(reason !== "disabled");
    if (reason === "unlimited") f.version.policy = { ...f.version.policy, max_claims: null };
    if (reason === "zero") f.version.policy = { ...f.version.policy, discount_basis_points: 9999 };
    if (reason === "ended") f.version.state = "ended";
    await expect(
      f.service.changeState({
        ...change,
        ...(reason === "stale" ? { expected_state: "paused" as const } : {})
      })
    ).rejects.toThrow();
    expect(f.prepareCoupon).not.toHaveBeenCalled();
    expect(f.setState).not.toHaveBeenCalled();
  }
);
it("keeps the first valid referral across cookie formats without refreshing its original expiry", async () => {
  const f = fixture(),
    now = Date.now(),
    old = f.old.issue("ABCD234567", now - 86400000).split(";")[0]!,
    newer = f.links.issue("OWEN20", now).split(";")[0]!,
    both = `${newer}; ${old}`;
  expect(await f.service.visit("OWEN20", both)).toBeNull();
  expect(await f.service.pending(both)).toMatchObject({
    code: "ABCD234567",
    version: { policy: { discount_basis_points: 1000, eligible_plans: ["business"] } }
  });
  expect(f.service.signupHint(both)).toEqual({
    code: "ABCD234567",
    expires_at: new Date(now + 29 * 86400000).toISOString()
  });
  expect(f.service.clearCookies()).toHaveLength(2);
});
it("issues the original cookie for an un-enrolled legacy creator and the new cookie for a versioned offer", async () => {
  const f = fixture();
  expect(await f.service.visit("ABCD234567", undefined)).toMatch(/^dbundle_referral=/);
  expect(await f.service.visit("OWEN20", undefined)).toMatch(/^dbundle_offer=/);
  expect(await f.service.preview("ABCD234567")).toMatchObject({
    version: { legacy_terms_version: "business-referrals-2026-11" }
  });
});
it("captures the original legacy signup hint while new programme enrolment is disabled", () => {
  const f = fixture(false),
    now = Date.now(),
    newer = f.links.issue("OWEN20", now - 86400000).split(";")[0]!,
    old = f.old.issue("ABCD234567", now).split(";")[0]!;
  expect(f.service.signupHint(`${newer}; ${old}`)).toEqual({
    code: "ABCD234567",
    expires_at: new Date(now + 30 * 86400000).toISOString()
  });
  expect(f.service.signupHint(newer)).toBeUndefined();
});
