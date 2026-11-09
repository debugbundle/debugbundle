import { expect, it, vi } from "vitest";
import {
  createReferralApi,
  ReferralApiError,
  type ReferralHttpClient
} from "../../../packages/referral-client/src/index.js";
import { REFERRAL_TERMS_VERSION } from "../../../packages/referrals/src/referral-contracts.js";
const auth = { bearerToken: "member-token-private" };
const attribution = {
  referral_id: "11111111-1111-4111-8111-111111111111",
  partner_code: "ABCD234567",
  source: "manual",
  checkout_reserved: false
};
it("uses only the intended identity-free request bodies and validates response projections", async () => {
  const request = vi
    .fn<ReferralHttpClient["request"]>()
    .mockResolvedValueOnce({
      status: 200,
      body: {
        partner: null,
        share_url: null,
        enrollment_enabled: true,
        terms_version: REFERRAL_TERMS_VERSION
      }
    })
    .mockResolvedValueOnce({
      status: 200,
      body: {
        partner: {
          partner_id: attribution.referral_id,
          code: "ABCD234567",
          status: "active",
          terms_version: REFERRAL_TERMS_VERSION,
          commission_basis_points: 5000,
          accepted_at: "2026-11-07T00:00:00.000Z"
        },
        share_url: "https://api.debugbundle.com/v1/referrals/visit/ABCD234567",
        enrollment_enabled: true,
        terms_version: REFERRAL_TERMS_VERSION
      }
    })
    .mockResolvedValueOnce({ status: 200, body: { clients: [] } })
    .mockResolvedValueOnce({ status: 200, body: { attribution: null, pending_code: null } })
    .mockResolvedValueOnce({ status: 200, body: { attribution } });
  const api = createReferralApi({ request });
  await api.partner(auth);
  await api.join({ ...auth, termsVersion: REFERRAL_TERMS_VERSION });
  await api.clients({ ...auth, limit: 25 });
  await api.customer(auth);
  expect(await api.apply({ ...auth, code: "abcd234567", explicitCorrection: true })).toEqual(
    attribution
  );
  expect(request.mock.calls.map((call) => call[0])).toEqual([
    { ...auth, method: "GET", path: "/v1/referrals/partner" },
    {
      ...auth,
      method: "POST",
      path: "/v1/referrals/partner",
      body: { terms_version: REFERRAL_TERMS_VERSION }
    },
    { ...auth, method: "GET", path: "/v1/referrals/clients?limit=25" },
    { ...auth, method: "GET", path: "/v1/referrals/attribution" },
    {
      ...auth,
      method: "POST",
      path: "/v1/referrals/attribution",
      body: { code: "ABCD234567", explicit_correction: true }
    }
  ]);
});
it("rejects invalid codes, forged eligibility/identity fields and invalid pagination before transport", async () => {
  const request = vi.fn<ReferralHttpClient["request"]>(),
    api = createReferralApi({ request });
  await expect(api.apply({ ...auth, code: "bad", explicitCorrection: false })).rejects.toThrow();
  await expect(
    api.apply({ ...auth, code: "ABCD234567", provider_previously_paid: false } as never)
  ).rejects.toThrow();
  await expect(api.clients({ ...auth, limit: 101 })).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
});
it("keeps policy refusals stable and withholds unexpected private response shapes", async () => {
  const request = vi
    .fn<ReferralHttpClient["request"]>()
    .mockResolvedValueOnce({ status: 409, body: { error: "attribution_frozen" } })
    .mockResolvedValueOnce({
      status: 200,
      body: {
        clients: [
          {
            client_id: "11111111-1111-4111-8111-111111111111",
            created_at: "2026-11-07T00:00:00.000Z",
            status: "awaiting_purchase",
            customer_email: "private@example.test"
          }
        ]
      }
    });
  const api = createReferralApi({ request });
  await expect(api.apply({ ...auth, code: "ABCD234567" })).rejects.toMatchObject({
    status: 409,
    code: "attribution_frozen"
  });
  await expect(api.clients(auth)).rejects.toBeInstanceOf(ReferralApiError);
});

it("rejects a successful join response that did not actually enrol the partner", async () => {
  const api = createReferralApi({
    request: vi.fn<ReferralHttpClient["request"]>().mockResolvedValue({
      status: 200,
      body: {
        partner: null,
        share_url: null,
        enrollment_enabled: true,
        terms_version: REFERRAL_TERMS_VERSION
      }
    })
  });
  await expect(api.join({ ...auth, termsVersion: REFERRAL_TERMS_VERSION })).rejects.toMatchObject({
    code: "invalid_response"
  });
});

it.each(["http://localhost:3003", "http://127.0.0.1:3003", "http://[::1]:3003"])(
  "accepts partner and join links from the self-hosted HTTP origin %s",
  async (origin) => {
    const body = {
      partner: {
        partner_id: attribution.referral_id,
        code: "ABCD234567",
        status: "active",
        terms_version: REFERRAL_TERMS_VERSION,
        commission_basis_points: 5000,
        accepted_at: "2026-11-07T00:00:00.000Z"
      },
      share_url: `${origin}/v1/referrals/visit/ABCD234567`,
      enrollment_enabled: true,
      terms_version: REFERRAL_TERMS_VERSION
    };
    const api = createReferralApi({ request: vi.fn().mockResolvedValue({ status: 200, body }) });
    expect((await api.partner(auth)).share_url).toBe(body.share_url);
    expect((await api.join({ ...auth, termsVersion: REFERRAL_TERMS_VERSION })).share_url).toBe(
      body.share_url
    );
  }
);

it("rejects non-HTTP share links from the server", async () => {
  const api = createReferralApi({
    request: vi.fn().mockResolvedValue({
      status: 200,
      body: {
        partner: null,
        share_url: "javascript:alert(1)",
        enrollment_enabled: true,
        terms_version: REFERRAL_TERMS_VERSION
      }
    })
  });
  await expect(api.partner(auth)).rejects.toMatchObject({ code: "invalid_response" });
});
