import { expect, it, vi } from "vitest";
import { createTokenApiServer } from "../../helpers/api-tokens.js";
import { mockedObject } from "../../helpers/vitest.js";
import type { ApiDependencies } from "../../../apps/api/src/api-types.js";
import {
  REFERRAL_TERMS_VERSION,
  ReferralError
} from "../../../packages/referrals/src/referral-contracts.js";
import { SESSION_COOKIE_NAME, buildCsrfToken } from "../../../packages/auth/src/index.js";

const user = "22222222-2222-4222-8222-222222222222",
  org = "11111111-1111-4111-8111-111111111111";
const headers = { authorization: "Bearer dbundle_mem_test" };
const profile = {
  partner_id: user,
  code: "ABCD234567",
  status: "active",
  terms_version: REFERRAL_TERMS_VERSION,
  commission_basis_points: 5000,
  accepted_at: "2026-11-07T00:00:00.000Z"
};
function setup(role = "owner") {
  const join = vi.fn().mockResolvedValue(profile),
    attribute = vi.fn().mockResolvedValue({
      referral_id: user,
      partner_code: profile.code,
      source: "manual",
      checkout_reserved: false
    });
  const resolve = vi.fn().mockResolvedValue({ member_id: user, organization_id: org, role });
  const service = mockedObject<NonNullable<ApiDependencies["referrals"]>>({
    enrollmentEnabled: true,
    publicLandingUrl: "https://debugbundle.com/",
    partner: vi.fn().mockResolvedValue(profile),
    join,
    clients: vi.fn().mockResolvedValue([]),
    customer: vi.fn().mockResolvedValue(null),
    attribute,
    pendingCode: vi.fn().mockResolvedValue(null),
    shareLink: vi.fn().mockReturnValue("https://api.debugbundle.com/v1/referrals/visit/ABCD234567"),
    visit: vi.fn().mockResolvedValue({
      cookie: "dbundle_referral=signed; HttpOnly; Secure; SameSite=Lax; Path=/"
    }),
    clearPendingCookie: vi.fn().mockReturnValue("dbundle_referral=; Max-Age=0"),
    captureSignup: vi.fn().mockResolvedValue(false)
  });
  const app = createTokenApiServer({
    referrals: service,
    memberAuth: mockedObject<ApiDependencies["memberAuth"]>({ resolveMemberByTokenHash: resolve })
  });
  return { app, service, join, attribute, resolve };
}
it.each([true, false, "unavailable"] as const)(
  "captures only a new email signup and preserves authentication cookies: %s",
  async (outcome) => {
    const f = setup();
    const capture = vi.fn();
    if (outcome === "unavailable") capture.mockRejectedValue(new Error("private-provider-detail"));
    else capture.mockResolvedValue(outcome);
    const session = {
      session_id: user,
      user_id: user,
      organization_id: org,
      email: "new@example.test",
      email_verified_at: "2026-11-07T00:00:00.000Z",
      role: "owner",
      created_at: "2026-11-07T00:00:00.000Z",
      expires_at: "2026-11-08T00:00:00.000Z",
      revoked_at: null,
      has_email_auth: true,
      has_github_oauth: false
    };
    const app = createTokenApiServer({
      projectManagement: mockedObject<NonNullable<ApiDependencies["projectManagement"]>>({
        listProjectsForOrganization: vi.fn().mockResolvedValue([])
      }),
      referrals: { ...f.service, captureSignup: capture },
      webAuth: {
        verifyEmailCode: vi.fn().mockResolvedValue({
          ok: true,
          created_user: true,
          session_token: "new-session",
          session
        })
      }
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/verify-code",
      headers: { cookie: "dbundle_referral=pending" },
      payload: { email: session.email, code: "123456" }
    });
    expect(response.statusCode).toBe(200);
    expect(capture).toHaveBeenCalledExactlyOnceWith({
      organization_id: org,
      actor_user_id: user,
      created_user: true,
      cookie_header: "dbundle_referral=pending"
    });
    const cookies = String(response.headers["set-cookie"]);
    expect(cookies).toContain(SESSION_COOKIE_NAME);
    expect(cookies.includes("dbundle_referral=; Max-Age=0")).toBe(outcome === true);
    await app.close();
    await f.app.close();
  }
);
it("joins the authenticated human on any tier and uses the same shared partner response", async () => {
  const f = setup("member");
  const response = await f.app.inject({
    method: "POST",
    url: "/v1/referrals/partner",
    headers,
    payload: { terms_version: REFERRAL_TERMS_VERSION }
  });
  expect(response.statusCode).toBe(200);
  expect(f.join).toHaveBeenCalledExactlyOnceWith(user, REFERRAL_TERMS_VERSION);
  expect(response.json()).toEqual({
    partner: profile,
    share_url: "https://api.debugbundle.com/v1/referrals/visit/ABCD234567",
    enrollment_enabled: true,
    terms_version: REFERRAL_TERMS_VERSION
  });
  expect(response.headers["cache-control"]).toBe("no-store");
  await f.app.close();
});
it.each([true, false])(
  "retains GitHub OAuth cookies and captures only a new identity: %s",
  async (created) => {
    const f = setup(),
      capture = vi.fn().mockResolvedValue(true);
    const session = {
      session_id: user,
      user_id: user,
      organization_id: org,
      email: "github@example.test",
      email_verified_at: "2026-11-07T00:00:00.000Z",
      role: "owner",
      created_at: "2026-11-07T00:00:00.000Z",
      expires_at: "2026-11-08T00:00:00.000Z",
      revoked_at: null,
      has_email_auth: false,
      has_github_oauth: true
    };
    const app = createTokenApiServer({
      referrals: { ...f.service, captureSignup: capture },
      webAuth: {
        completeGithubAuth: vi.fn().mockResolvedValue({
          ok: true,
          created_user: created,
          session_token: "new-session",
          session,
          accepted_terms_at: null,
          redirect_url: "http://localhost:5291/"
        })
      }
    });
    const response = await app.inject({
      method: "GET",
      url: "/v1/auth/github/callback?code=oauth-code&state=oauth-state",
      headers: { cookie: "dbundle_referral=pending; dbundle_github_oauth_state=oauth-state" }
    });
    expect(response.statusCode).toBe(302);
    const cookies = String(response.headers["set-cookie"]);
    expect(cookies).toContain(SESSION_COOKIE_NAME);
    expect(cookies).toContain("dbundle_github_oauth_state=;");
    expect(cookies.includes("dbundle_referral=; Max-Age=0")).toBe(created);
    expect(capture).toHaveBeenCalledTimes(created ? 1 : 0);
    await app.close();
    await f.app.close();
  }
);
it("rejects caller-supplied identity, provider eligibility and financial terms", async () => {
  const f = setup();
  for (const extra of [
    { actor_user_id: user },
    { provider_previously_paid: false },
    { commission_basis_points: 9999 }
  ]) {
    const response = await f.app.inject({
      method: "POST",
      url: "/v1/referrals/attribution",
      headers,
      payload: { code: profile.code, ...extra }
    });
    expect(response.statusCode).toBe(400);
  }
  expect(f.attribute).not.toHaveBeenCalled();
  await f.app.close();
});
it("uses the current verified Owner context for attribution and denies org Admins", async () => {
  const f = setup();
  const response = await f.app.inject({
    method: "POST",
    url: "/v1/referrals/attribution",
    headers,
    payload: { code: profile.code, explicit_correction: true }
  });
  expect(response.statusCode).toBe(200);
  expect(f.attribute).toHaveBeenCalledExactlyOnceWith({
    organization_id: org,
    actor_user_id: user,
    code: profile.code,
    explicit_correction: true,
    source: "manual"
  });
  f.resolve.mockResolvedValue({ member_id: user, organization_id: org, role: "admin" });
  expect(
    (await f.app.inject({ method: "GET", url: "/v1/referrals/attribution", headers })).statusCode
  ).toBe(403);
  await f.app.close();
});
it("rejects a stale browser workspace instead of applying its code to a newly selected account", async () => {
  const f = setup();
  const response = await f.app.inject({
    method: "POST",
    url: "/v1/referrals/attribution",
    headers,
    payload: { code: profile.code, expected_organization_id: user }
  });
  expect(response.statusCode).toBe(409);
  expect(response.json()).toEqual({ error: "organization_context_changed" });
  expect(f.attribute).not.toHaveBeenCalled();
  await f.app.close();
});
it("keeps restricted project credentials away from personal financial data", async () => {
  const f = setup();
  f.resolve.mockResolvedValue({
    member_id: user,
    organization_id: org,
    role: "owner",
    token_policy: {
      version: 1,
      mode: "projects",
      permissions: ["project:read"],
      projects: [{ project_id: org, origin_project_ids: [org] }]
    }
  });
  expect(
    (await f.app.inject({ method: "GET", url: "/v1/referrals/partner", headers })).statusCode
  ).toBe(403);
  expect(f.service.partner).not.toHaveBeenCalled();
  await f.app.close();
});
it("captures a public link through a fixed same-product redirect without leaking actor or payment data", async () => {
  const f = setup();
  const response = await f.app.inject({
    method: "GET",
    url: "/v1/referrals/visit/ABCD234567?redirect=https://attacker.invalid"
  });
  expect(response.statusCode).toBe(302);
  expect(response.headers.location).toBe("https://debugbundle.com/");
  expect(response.headers["set-cookie"]).toContain("HttpOnly");
  expect(response.body).not.toContain(user);
  expect(f.service.visit).toHaveBeenCalledWith(profile.code, undefined);
  await f.app.close();
});
it("returns stable policy errors and withholds internal provider or database error details", async () => {
  const f = setup();
  f.attribute
    .mockRejectedValueOnce(new ReferralError("attribution_frozen"))
    .mockRejectedValueOnce(new Error("private-provider-key-and-stack"));
  const request = {
    method: "POST" as const,
    url: "/v1/referrals/attribution",
    headers,
    payload: { code: profile.code }
  };
  expect((await f.app.inject(request)).json()).toEqual({ error: "attribution_frozen" });
  const unavailable = await f.app.inject(request);
  expect(unavailable.statusCode).toBe(503);
  expect(unavailable.body).not.toContain("private-provider");
  await f.app.close();
});
it("requires CSRF for browser financial mutations", async () => {
  const session = {
    user_id: user,
    organization_id: org,
    role: "owner",
    email: "owner@example.test",
    email_verified_at: "2026-11-07T00:00:00Z"
  };
  const join = vi.fn().mockResolvedValue(profile);
  const f = setup();
  const app = createTokenApiServer({
    referrals: { ...f.service, join },
    webAuth: { resolveSessionByToken: vi.fn().mockResolvedValue(session) }
  });
  const request = {
    method: "POST" as const,
    url: "/v1/referrals/partner",
    headers: { cookie: `${SESSION_COOKIE_NAME}=secret` },
    payload: { terms_version: REFERRAL_TERMS_VERSION }
  };
  expect((await app.inject(request)).statusCode).toBe(403);
  expect(join).not.toHaveBeenCalled();
  expect(
    (
      await app.inject({
        ...request,
        headers: { ...request.headers, "x-csrf-token": buildCsrfToken("secret") }
      })
    ).statusCode
  ).toBe(200);
  await app.close();
  await f.app.close();
});
