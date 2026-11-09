import { expect, it, vi } from "vitest";
import { createReferralManagement } from "../../../packages/referrals/src/referral-management.js";
import { REFERRAL_TERMS_VERSION } from "../../../packages/referrals/src/referral-contracts.js";
import { createReferralLinkCodec } from "../../../packages/referrals/src/referral-link.js";
import type { ReferralStore } from "../../../packages/storage/src/referral-store.js";
import { mockedObject } from "../../helpers/vitest.js";
const actor = {
  organization_id: "11111111-1111-4111-8111-111111111111",
  actor_user_id: "22222222-2222-4222-8222-222222222222"
};
const profile = {
  partner_id: actor.actor_user_id,
  code: "ABCD234567",
  status: "active" as const,
  terms_version: REFERRAL_TERMS_VERSION,
  commission_basis_points: 5000 as const,
  accepted_at: "2026-11-07T00:00:00.000Z"
};
const attribution = {
  referral_id: actor.actor_user_id,
  partner_code: profile.code,
  source: "link" as const,
  checkout_reserved: false
};
function setup(enabled = true) {
  const join = vi.fn().mockResolvedValue(profile),
    save = vi.fn().mockResolvedValue(attribution),
    existing = vi.fn().mockResolvedValue(null),
    current = vi.fn().mockResolvedValue(null),
    active = vi.fn().mockResolvedValue(true);
  const store = mockedObject<ReferralStore>({
    joinProgram: join,
    getPartner: existing,
    getAttribution: current,
    saveAttribution: save,
    isActiveCode: active,
    listPartnerClients: vi.fn().mockResolvedValue([])
  });
  const readEligibility = vi.fn().mockResolvedValue({
    provider_customer_id_checked: "cus_verified",
    provider_previously_paid: false
  });
  const links = createReferralLinkCodec(
    "referral-management-test-secret-with-thirty-two-characters"
  );
  const service = createReferralManagement({
    store,
    readEligibility,
    links,
    enrollmentEnabled: enabled
  });
  return { service, join, save, existing, current, active, links, readEligibility };
}
it("keeps enrollment off without disabling existing partner history", async () => {
  const f = setup(false);
  await expect(f.service.join(actor.actor_user_id, REFERRAL_TERMS_VERSION)).rejects.toMatchObject({
    code: "program_unavailable"
  });
  expect(f.join).not.toHaveBeenCalled();
  f.existing.mockResolvedValue(profile);
  expect(await f.service.partner(actor.actor_user_id)).toEqual(profile);
  expect(await f.service.join(actor.actor_user_id, REFERRAL_TERMS_VERSION)).toEqual(profile);
});
it("binds attribution to server-read eligibility and never accepts caller-supplied provider flags", async () => {
  const f = setup();
  await f.service.attribute({
    ...actor,
    code: profile.code,
    source: "manual",
    explicit_correction: true
  });
  expect(f.readEligibility).toHaveBeenCalledExactlyOnceWith(actor);
  expect(f.save).toHaveBeenCalledExactlyOnceWith({
    ...actor,
    code: profile.code,
    source: "manual",
    explicit_correction: true,
    provider_customer_id_checked: "cus_verified",
    provider_previously_paid: false
  });
  await expect(
    f.service.attribute({
      ...actor,
      code: profile.code,
      source: "manual",
      explicit_correction: false,
      provider_previously_paid: false
    } as never)
  ).rejects.toThrow();
  expect(f.save).toHaveBeenCalledTimes(1);
});
it("withholds attribution on unavailable eligibility and does not consume or replace anything", async () => {
  const f = setup();
  f.readEligibility.mockRejectedValue(new Error("provider_unavailable"));
  await expect(
    f.service.attribute({
      ...actor,
      code: profile.code,
      source: "manual",
      explicit_correction: false
    })
  ).rejects.toThrow("provider_unavailable");
  expect(f.save).not.toHaveBeenCalled();
});
it("captures only valid new-signup links and keeps failed capture retryable without failing login", async () => {
  const f = setup(),
    cookie = f.links.issue(profile.code);
  const input = { ...actor, cookie_header: cookie, created_user: true };
  expect(await f.service.captureSignup({ ...input, created_user: false })).toBe(false);
  expect(f.save).not.toHaveBeenCalled();
  expect(await f.service.captureSignup(input)).toBe(true);
  expect(f.save).toHaveBeenCalledWith(
    expect.objectContaining({
      ...actor,
      code: profile.code,
      source: "link",
      explicit_correction: false
    })
  );
  f.save.mockRejectedValue(new Error("database_unavailable"));
  expect(await f.service.captureSignup(input)).toBe(false);
});
it("keeps the first valid pending link without extending its lifetime on another visit", async () => {
  const f = setup(),
    first = f.links.issue(profile.code);
  expect(await f.service.visit("BCDE234567", first)).toEqual({ cookie: null });
  expect(await f.service.visit(profile.code, undefined)).toEqual({
    cookie: expect.stringContaining("HttpOnly")
  });
  f.active.mockResolvedValue(false);
  expect(await f.service.visit(profile.code, undefined)).toBeNull();
  expect(await setup(false).service.visit(profile.code, undefined)).toBeNull();
});
it("keeps already-saved attribution readable when new enrollment pauses", async () => {
  const f = setup(false);
  f.current.mockResolvedValue(attribution);
  expect(await f.service.customer(actor)).toEqual(attribution);
  expect(
    await f.service.attribute({
      ...actor,
      code: profile.code,
      source: "manual",
      explicit_correction: false
    })
  ).toEqual(attribution);
  expect(f.readEligibility).not.toHaveBeenCalled();
  expect(f.save).not.toHaveBeenCalled();
});
