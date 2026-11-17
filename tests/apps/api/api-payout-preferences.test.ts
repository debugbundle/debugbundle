import { afterEach, expect, it, vi } from "vitest";
import { createTokenApiServer } from "../../helpers/api-tokens.js";
import { mockedObject } from "../../helpers/vitest.js";
import type { ApiDependencies } from "../../../apps/api/src/api-types.js";
import { createPayoutManagement } from "../../../packages/referrals/src/payout-management.js";
import type { PayoutPreferenceStore } from "../../../packages/storage/src/payout-preference-store.js";
import type { ReferralLedgerStore } from "../../../packages/storage/src/referral-ledger-store.js";
import { PayoutPreferenceError } from "../../../packages/referrals/src/payout-preferences.js";
import { ProgrammeError } from "../../../packages/referrals/src/programme-policy.js";
import { SESSION_COOKIE_NAME, buildCsrfToken } from "../../../packages/auth/src/index.js";
const user = "11111111-1111-4111-8111-111111111111",
  programme = "22222222-2222-4222-8222-222222222222";
const preference = {
  programme_id: programme,
  revision: programme,
  method: "wise",
  country: "CA",
  currency: "cad",
  masked_destination: "••••vate",
  updated_at: "2026-11-16T00:00:00.000Z"
};
const details = {
  method: "wise",
  country: "CA",
  currency: "cad",
  holder: "Private Recipient",
  destination: "@private"
};
const payload = {
  programme_id: programme,
  expected_revision: null,
  expected_user_id: user,
  details
};
const bearer = { authorization: "Bearer dbundle_mem_test" };
const apps: ReturnType<typeof createTokenApiServer>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
function setup(configured = true) {
  const store = mockedObject<PayoutPreferenceStore>({
    configured,
    list: vi.fn().mockResolvedValue([{ programme_id: programme, name: "Creators", preference }]),
    save: vi.fn().mockResolvedValue(preference),
    balances: vi.fn().mockResolvedValue([]),
    instructions: vi.fn().mockResolvedValue({
      batch_id: programme,
      partner_id: user,
      programme_id: programme,
      revision: programme,
      details
    })
  });
  const ledger = mockedObject<ReferralLedgerStore>({
    claim: vi.fn().mockRejectedValue(new Error("no_available_commission"))
  });
  const operator = vi.fn().mockResolvedValue(false),
    audit = vi.fn().mockResolvedValue(undefined),
    member = vi
      .fn()
      .mockResolvedValue({ member_id: user, organization_id: programme, role: "owner" });
  const service = createPayoutManagement({
    store,
    ledger,
    isOperator: operator,
    now: () => "2026-11-16T00:00:00.000Z"
  });
  const session = vi.fn().mockResolvedValue({
    session_id: programme,
    user_id: user,
    organization_id: programme,
    email: "owner@example.test",
    email_verified_at: "2026-11-16T00:00:00.000Z",
    session_auth_method: "email_code",
    role: "owner",
    created_at: "2026-11-01T00:00:00.000Z",
    expires_at: "2027-01-01T00:00:00.000Z",
    revoked_at: null
  });
  const app = createTokenApiServer({
    payoutPreferences: service,
    memberAuth: mockedObject<ApiDependencies["memberAuth"]>({ resolveMemberByTokenHash: member }),
    webAuth: { resolveSessionByToken: session },
    auditLogging: { createAuditLog: audit }
  });
  apps.push(app);
  return { app, store, ledger, operator, audit, member, session };
}
it("requires member authentication on all payout surfaces and returns private masked creator data", async () => {
  const f = setup();
  const list = await f.app.inject({ url: "/v2/referrals/payout-preferences", headers: bearer });
  expect(list.statusCode).toBe(200);
  expect(list.headers["cache-control"]).toBe("private, no-store");
  expect(list.json()).toEqual({
    user_id: user,
    programmes: [{ programme_id: programme, name: "Creators", preference }]
  });
  expect(list.body).not.toMatch(/Private Recipient|@private/);
  f.member.mockResolvedValue(null);
  f.session.mockResolvedValue(null);
  for (const [method, url] of [
    ["GET", "/v2/referrals/payout-policy"],
    ["GET", "/v2/referrals/payout-preferences"],
    ["POST", "/v2/referrals/payout-preferences"],
    ["GET", `/v2/referrals/payout-balances?partner_id=${user}`],
    ["POST", "/v2/referrals/payouts/prepare"],
    ["GET", `/v2/referrals/payouts/${programme}/instructions`]
  ] as const)
    expect(
      (
        await f.app.inject({
          method,
          url,
          headers: bearer,
          ...(method === "POST" ? { payload: {} } : {})
        })
      ).statusCode
    ).toBe(401);
});
it("requires CSRF, exact identity, validated input and revision while auditing no sensitive fields", async () => {
  const f = setup(),
    cookie = `${SESSION_COOKIE_NAME}=payout-session`,
    request = {
      method: "POST" as const,
      url: "/v2/referrals/payout-preferences",
      payload,
      headers: { cookie }
    };
  expect((await f.app.inject(request)).statusCode).toBe(403);
  expect(f.store.save).not.toHaveBeenCalled();
  const headers = { cookie, "x-csrf-token": buildCsrfToken("payout-session") };
  expect((await f.app.inject({ ...request, headers })).statusCode).toBe(200);
  expect(f.store.save).toHaveBeenCalledExactlyOnceWith(user, {
    programme_id: programme,
    expected_revision: null,
    details
  });
  expect(JSON.stringify(f.audit.mock.calls)).not.toMatch(/Private Recipient|@private|destination/);
  expect(
    (
      await f.app.inject({
        ...request,
        headers,
        payload: { ...payload, expected_user_id: programme }
      })
    ).json()
  ).toEqual({ error: "payout_context_changed" });
  expect(
    (
      await f.app.inject({
        ...request,
        headers,
        payload: { ...payload, details: { ...details, destination: "https://bad" } }
      })
    ).statusCode
  ).toBe(400);
  vi.mocked(f.store.save)
    .mockRejectedValueOnce(new PayoutPreferenceError("payout_preferences_changed"))
    .mockRejectedValueOnce(new ProgrammeError("operator_authorization_required"))
    .mockRejectedValueOnce(new Error("raw-private-provider-secret"));
  expect((await f.app.inject({ ...request, headers })).statusCode).toBe(409);
  expect((await f.app.inject({ ...request, headers })).statusCode).toBe(403);
  const failed = await f.app.inject({ ...request, headers });
  expect(failed.statusCode).toBe(503);
  expect(failed.body).not.toContain("raw-private");
});
it("denies programme delegation and workspace ownership finance authority; explicit operators reveal audited frozen instructions", async () => {
  const f = setup(),
    url = `/v2/referrals/payouts/${programme}/instructions`;
  expect(
    (
      await f.app.inject({
        url,
        headers: { ...bearer, "x-offer-operator-authorization": "a".repeat(43) }
      })
    ).statusCode
  ).toBe(403);
  expect(f.store.instructions).not.toHaveBeenCalled();
  f.operator.mockResolvedValue(true);
  const response = await f.app.inject({ url, headers: bearer });
  expect(response.statusCode).toBe(200);
  expect(response.json().instructions.details).toEqual(details);
  expect(response.headers["cache-control"]).toBe("private, no-store");
  expect(f.audit).toHaveBeenCalledWith(
    expect.objectContaining({
      action: "referral.payout_instructions",
      status: "success",
      metadata: {}
    })
  );
  expect(JSON.stringify(f.audit.mock.calls)).not.toContain("@private");
  expect(
    (
      await f.app.inject({
        url: `/v2/referrals/payout-balances?partner_id=${user}`,
        headers: bearer
      })
    ).json()
  ).toEqual({ programmes: [] });
  const prepare = await f.app.inject({
    method: "POST",
    url: "/v2/referrals/payouts/prepare",
    headers: bearer,
    payload: {
      partner_id: user,
      programme_id: programme,
      preference_revision: programme,
      claim_id: programme
    }
  });
  expect(prepare.statusCode).toBe(409);
  expect(f.ledger.claim).toHaveBeenCalledWith({
    partner_id: user,
    programme_id: programme,
    preference_revision: programme,
    claim_id: programme,
    operator_user_id: user,
    now: "2026-11-16T00:00:00.000Z"
  });
});
it("keeps existing finance usable when new payment setup is unconfigured", async () => {
  const f = setup(false);
  f.operator.mockResolvedValue(true);
  expect(
    (await f.app.inject({ url: "/v2/referrals/payout-policy", headers: bearer })).json()
  ).toMatchObject({
    configured: false,
    currencies: ["usd", "eur", "gbp", "cad", "aud"],
    routine_minimum_usd_minor: 5000
  });
  expect(
    (
      await f.app.inject({
        method: "POST",
        url: "/v2/referrals/payouts/prepare",
        headers: bearer,
        payload: {
          partner_id: user,
          programme_id: programme,
          preference_revision: programme,
          claim_id: programme
        }
      })
    ).statusCode
  ).toBe(503);
  expect(f.ledger.claim).not.toHaveBeenCalled();
});
