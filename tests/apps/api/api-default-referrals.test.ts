import { expect, it, vi } from "vitest";
import {
  createDefaultReferrals,
  referralConfigFromEnv
} from "../../../apps/api/src/default-referrals.js";
import type { StripeConfig } from "../../../apps/api/src/stripe-config.js";
import { mockedObject } from "../../helpers/vitest.js";
const actor = {
  organization_id: "11111111-1111-4111-8111-111111111111",
  actor_user_id: "22222222-2222-4222-8222-222222222222"
};
const secret = "a-dedicated-referral-key-of-at-least-32-characters";
it("keeps unconfigured referrals optional and retains history when new enrolment is off", () => {
  expect(referralConfigFromEnv({})).toBeUndefined();
  expect(
    referralConfigFromEnv({ REFERRAL_SECRET: "short", REFERRAL_ENROLLMENT_ENABLED: "true" })
  ).toBeUndefined();
  const config = referralConfigFromEnv({
    REFERRAL_SECRET: secret,
    REFERRAL_ENROLLMENT_ENABLED: "false"
  });
  expect(config?.enrollmentEnabled).toBe(false);
  const db = { query: vi.fn() };
  expect(createDefaultReferrals({ db })).toBeUndefined();
  const service = createDefaultReferrals({ db, config: config! });
  expect(service?.enrollmentEnabled).toBe(false);
  expect(db.query).not.toHaveBeenCalled();
});
it("never consults the payment provider for an actor without current verified Owner authority", async () => {
  const list = vi.fn();
  const service = createDefaultReferrals({
    db: { query: vi.fn().mockResolvedValue({ rows: [] }) },
    config: { secret, enrollmentEnabled: true },
    stripeConfig: mockedObject<StripeConfig>({
      client: mockedObject<StripeConfig["client"]>({
        invoices: mockedObject<StripeConfig["client"]["invoices"]>({ list })
      })
    })
  });
  await expect(
    service!.attribute({
      ...actor,
      code: "ABCD234567",
      source: "manual",
      explicit_correction: false
    })
  ).rejects.toMatchObject({ code: "forbidden" });
  expect(list).not.toHaveBeenCalled();
});
it("refuses an unverifiable saved provider customer instead of treating it as a new customer", async () => {
  const service = createDefaultReferrals({
    db: { query: vi.fn().mockResolvedValue({ rows: [{ stripe_customer_id: "cus_saved" }] }) },
    config: { secret, enrollmentEnabled: true }
  });
  await expect(
    service!.attribute({
      ...actor,
      code: "ABCD234567",
      source: "manual",
      explicit_correction: false
    })
  ).rejects.toMatchObject({ code: "program_unavailable" });
});

it.each([
  "http://localhost:3003",
  "http://127.0.0.1:3003",
  "http://[::1]:3003",
  "https://api.debugbundle.com"
])("constructs referrals with the configured HTTP origin %s", (origin) => {
  const config = referralConfigFromEnv({
    REFERRAL_SECRET: secret,
    REFERRAL_ENROLLMENT_ENABLED: "true",
    REFERRAL_API_BASE_URL: origin,
    REFERRAL_LANDING_URL: "http://localhost:5291"
  });
  expect(config).toBeDefined();
  const service = createDefaultReferrals({ db: { query: vi.fn() }, config: config! });
  expect(service?.enrollmentEnabled).toBe(true);
  expect(service?.publicLandingUrl).toBe("http://localhost:5291");
  expect(service?.shareLink("ABCD234567")).toBe(`${origin}/v1/referrals/visit/ABCD234567`);
});

it.each(["javascript:alert(1)", "file:///tmp/referral", "ftp://example.com", "not a URL"])(
  "rejects unsupported referral origins %s",
  (origin) => {
    expect(
      referralConfigFromEnv({ REFERRAL_SECRET: secret, REFERRAL_API_BASE_URL: origin })
    ).toBeUndefined();
    expect(
      referralConfigFromEnv({ REFERRAL_SECRET: secret, REFERRAL_LANDING_URL: origin })
    ).toBeUndefined();
  }
);
