import { createOfferQuoteCodec } from "../../../packages/referrals/src/offer-quote.js";
import { offerClaim, offerPolicy } from "../../helpers/offer-fixtures.js";
import { offerDefinition } from "../../helpers/offer-fixtures.js";
import { expect, it, vi } from "vitest";
import { createTokenApiServer } from "../../helpers/api-tokens.js";
import { mockedObject } from "../../helpers/vitest.js";
import type { ApiDependencies } from "../../../apps/api/src/api-types.js";
import { SESSION_COOKIE_NAME, buildCsrfToken } from "../../../packages/auth/src/index.js";

const user = "22222222-2222-4222-8222-222222222222",
  org = "11111111-1111-4111-8111-111111111111";
const bearer = { authorization: "Bearer dbundle_mem_test" };
const session = {
  session_id: user,
  user_id: user,
  organization_id: org,
  email: "operator@example.test",
  email_verified_at: "2026-11-16T00:00:00.000Z",
  session_auth_method: "email_code" as const,
  role: "owner" as const,
  created_at: "2026-11-16T00:00:00.000Z",
  expires_at: "2027-01-01T00:00:00.000Z",
  revoked_at: null
};
function setup(billing?: NonNullable<ApiDependencies["billingManagement"]>) {
  const preview = vi
      .fn()
      .mockResolvedValue({ code: "OWEN20", version: offerDefinition, available: true }),
    apply = vi.fn().mockResolvedValue({ claim_id: user });
  const list = vi.fn().mockResolvedValue([]),
    authorize = vi.fn().mockResolvedValue(null);
  const offers = mockedObject<NonNullable<ApiDependencies["offers"]>>({
    enabled: true,
    publicOrigin: "https://debugbundle.test",
    appOrigin: "http://localhost:5291",
    publicLandingUrl: "https://debugbundle.test/",
    preview,
    pending: vi.fn().mockResolvedValue(null),
    visit: vi
      .fn()
      .mockResolvedValue("dbundle_offer=signed; HttpOnly; Secure; SameSite=Lax; Path=/"),
    clearCookie: vi.fn().mockReturnValue("dbundle_offer=; Max-Age=0"),
    clearCookies: vi
      .fn()
      .mockReturnValue(["dbundle_offer=; Max-Age=0", "dbundle_referral=; Max-Age=0"]),
    apply,
    retrySignup: vi.fn().mockResolvedValue({ code: "OWEN20", status: "pending" }),
    operators: mockedObject<NonNullable<ApiDependencies["offers"]>["operators"]>({
      isAllowed: (email: string) => email === session.email,
      authorize
    }),
    store: mockedObject<NonNullable<ApiDependencies["offers"]>["store"]>({
      list,
      claims: mockedObject<NonNullable<ApiDependencies["offers"]>["store"]["claims"]>({
        read: vi.fn().mockResolvedValue(null)
      })
    })
  });
  const member = vi
    .fn()
    .mockResolvedValue({ member_id: user, organization_id: org, role: "owner" });
  const resolveSession = vi.fn().mockResolvedValue(session);
  const app = createTokenApiServer({
    offers,
    ...(billing ? { billingManagement: billing } : {}),
    memberAuth: mockedObject<ApiDependencies["memberAuth"]>({ resolveMemberByTokenHash: member }),
    webAuth: mockedObject<NonNullable<ApiDependencies["webAuth"]>>({
      resolveSessionByToken: resolveSession
    })
  });
  return { app, offers, member, resolveSession, preview, apply, list, authorize };
}
it("returns minimal no-store public offer context with scoped credentialed CORS", async () => {
  const f = setup();
  const response = await f.app.inject({
    url: "/v2/offers/context?code=owen20",
    headers: { origin: "https://debugbundle.test" }
  });
  expect(response.statusCode).toBe(200);
  expect(f.preview).toHaveBeenCalledWith("OWEN20");
  expect(response.headers["cache-control"]).toBe("private, no-store");
  expect(response.headers["access-control-allow-origin"]).toBe("https://debugbundle.test");
  expect(response.headers["access-control-allow-credentials"]).toBe("true");
  const preflight = await f.app.inject({
    method: "OPTIONS",
    url: "/v1/referrals/partner",
    headers: { origin: "https://debugbundle.test", "access-control-request-method": "GET" }
  });
  expect(preflight.statusCode).toBe(403);
});
it("requires an exact Origin for anonymous hint writes without granting account authority", async () => {
  const f = setup();
  expect(
    (
      await f.app.inject({
        method: "POST",
        url: "/v2/offers/pending",
        payload: { code: "OWEN20" },
        headers: { origin: "https://attacker.test" }
      })
    ).statusCode
  ).toBe(403);
  const response = await f.app.inject({
    method: "POST",
    url: "/v2/offers/pending",
    payload: { code: "OWEN20" },
    headers: { origin: "https://debugbundle.test" }
  });
  expect(response.statusCode).toBe(200);
  expect([response.headers["set-cookie"]].flat().join("; ")).toContain("HttpOnly");
  expect(f.apply).not.toHaveBeenCalled();
});
it("requires confirmation before replacing a valid hint and rejects an unavailable code", async () => {
  const f = setup();
  vi.mocked(f.offers.pending).mockResolvedValue({
    code: "ORIGINAL20",
    version: offerDefinition,
    available: true
  });
  const request = {
    method: "POST" as const,
    url: "/v2/offers/pending",
    headers: { origin: "https://debugbundle.test" },
    payload: { code: "OWEN20" }
  };
  expect((await f.app.inject(request)).json()).toEqual({
    error: "offer_change_requires_confirmation"
  });
  expect(f.offers.visit).not.toHaveBeenCalled();
  f.preview.mockResolvedValue({ code: "OWEN20", version: offerDefinition, available: false });
  expect(
    (
      await f.app.inject({ ...request, payload: { code: "OWEN20", explicit_correction: true } })
    ).json()
  ).toEqual({ error: "invalid_offer_code" });
  expect(f.offers.visit).not.toHaveBeenCalled();
  await f.app.close();
});
it("rejects missing credentials on every private customer and creator operation", async () => {
  const f = setup();
  f.member.mockResolvedValue(null);
  f.resolveSession.mockResolvedValue(null);
  for (const [method, path] of [
    ["GET", "creator"],
    ["POST", "creator"],
    ["POST", "creator/code"],
    ["GET", "customer"],
    ["POST", "customer"],
    ["POST", "quote"],
    ["POST", "checkout"],
    ["POST", "signup-intent/retry"],
    ["POST", "customer/remove"]
  ] as const) {
    expect(
      (
        await f.app.inject({
          method,
          url: `/v2/offers/${path}`,
          headers: bearer,
          ...(method === "POST" ? { payload: {} } : {})
        })
      ).statusCode
    ).toBe(401);
  }
  expect(f.apply).not.toHaveBeenCalled();
  await f.app.close();
});
it("guards the displayed workspace before applying a customer offer", async () => {
  const f = setup();
  const response = await f.app.inject({
    method: "POST",
    url: "/v2/offers/customer",
    headers: bearer,
    payload: { code: "OWEN20", expected_organization_id: user }
  });
  expect(response.statusCode).toBe(409);
  expect(response.json()).toEqual({ error: "offer_context_changed" });
  expect(f.apply).not.toHaveBeenCalled();
  expect(
    (
      await f.app.inject({
        method: "POST",
        url: "/v2/offers/customer",
        headers: bearer,
        payload: { code: "OWEN20", expected_organization_id: org, discount_basis_points: 9900 }
      })
    ).statusCode
  ).toBe(400);
});
it("keeps browser customer mutations behind CSRF and passes only server identity", async () => {
  const f = setup();
  const cookie = `${SESSION_COOKIE_NAME}=operator-session`;
  const request = {
    method: "POST" as const,
    url: "/v2/offers/customer",
    payload: { code: "OWEN20", expected_organization_id: org },
    headers: { cookie }
  };
  expect((await f.app.inject(request)).statusCode).toBe(403);
  expect(
    (
      await f.app.inject({
        ...request,
        headers: { cookie, "x-csrf-token": buildCsrfToken("operator-session") }
      })
    ).statusCode
  ).toBe(200);
  expect(f.apply).toHaveBeenCalledExactlyOnceWith(
    { organization_id: org, actor_user_id: user },
    "OWEN20",
    false,
    "manual"
  );
});
it.each(["missing", "github", "unverified", "not_allowlisted", "member-token"])(
  "denies operator programme access for %s",
  async (kind) => {
    const f = setup();
    if (kind === "missing") f.resolveSession.mockResolvedValue(null);
    if (kind === "github")
      f.resolveSession.mockResolvedValue({ ...session, session_auth_method: "github_oauth" });
    if (kind === "unverified")
      f.resolveSession.mockResolvedValue({ ...session, email_verified_at: null });
    if (kind === "not_allowlisted")
      f.resolveSession.mockResolvedValue({ ...session, email: "other@example.test" });
    const response = await f.app.inject({
      url: "/v2/offers/operator/programmes",
      headers:
        kind === "member-token" ? bearer : { cookie: `${SESSION_COOKIE_NAME}=operator-session` }
    });
    expect(response.statusCode).toBe(404);
    expect(f.list).not.toHaveBeenCalled();
  }
);
it("admits the verified email operator and a separately scoped delegation", async () => {
  const f = setup();
  expect(
    (
      await f.app.inject({
        url: "/v2/offers/operator/programmes",
        headers: { cookie: `${SESSION_COOKIE_NAME}=operator-session` }
      })
    ).statusCode
  ).toBe(200);
  f.authorize.mockResolvedValue({ user_id: user, organization_id: org });
  expect(
    (
      await f.app.inject({
        url: "/v2/offers/operator/programmes",
        headers: { ...bearer, "x-debugbundle-operator-authorization": "Bearer delegated-proof" }
      })
    ).statusCode
  ).toBe(200);
  expect(f.authorize).toHaveBeenCalledWith({
    bearer_token: "dbundle_mem_test",
    proof: "delegated-proof",
    action: "read"
  });
});
it("does not expose provider exception details", async () => {
  const f = setup();
  f.preview.mockRejectedValue(new Error("private-provider-secret"));
  const response = await f.app.inject({ url: "/v2/offers/context?code=OWEN20" });
  expect(response.statusCode).toBe(503);
  expect(response.body).not.toContain("private-provider-secret");
});

it("confirms a signed offer through the Owner billing adapter without trusting a browser amount", async () => {
  const create = vi.fn().mockResolvedValue({ url: "https://checkout.stripe.com/test" }),
    billing = mockedObject<NonNullable<ApiDependencies["billingManagement"]>>({
      getBillingSummaryForOrganization: vi.fn().mockResolvedValue({ plan: "free" }),
      createCheckoutLink: create
    }),
    f = setup(billing),
    codec = createOfferQuoteCodec("api-offer-quote-secret-at-least-thirty-two-characters");
  f.offers.verifyQuote = vi.fn(codec.verify);
  f.offers.benefits = mockedObject<typeof f.offers.benefits>({
    context: vi.fn().mockResolvedValue({
      claim_id: offerClaim.claim_id,
      version_id: offerDefinition.version_id,
      verified_owner_email: session.email
    })
  });
  const quote = codec.issue({
    organization_id: org,
    actor_user_id: user,
    claim_id: offerClaim.claim_id,
    version_id: offerDefinition.version_id,
    selection: { target_plan: "team", interval: "year", additional_capacity_units: 2 },
    policy: offerPolicy
  });
  const headers = {
    cookie: `${SESSION_COOKIE_NAME}=operator-session`,
    "x-csrf-token": buildCsrfToken("operator-session")
  };
  const response = await f.app.inject({
    method: "POST",
    url: "/v2/offers/checkout",
    headers,
    payload: { confirmation_token: quote.confirmation_token }
  });
  expect(response.statusCode).toBe(200);
  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({
      organization_id: org,
      actor_user_id: user,
      target_plan: "team",
      interval: "year",
      additional_capacity_units: 2,
      expected_offer: {
        claim_id: offerClaim.claim_id,
        version_id: offerDefinition.version_id,
        expires_at: quote.expires_at
      }
    })
  );
  expect(
    (
      await f.app.inject({
        method: "POST",
        url: "/v2/offers/checkout",
        headers,
        payload: { confirmation_token: quote.confirmation_token, amount: 1 }
      })
    ).statusCode
  ).toBe(400);
  expect(create).toHaveBeenCalledOnce();
  await f.app.close();
});
it("keeps public visit/removal as hints and applies customer removal only to the displayed workspace", async () => {
  const f = setup(),
    headers = {
      cookie: `${SESSION_COOKIE_NAME}=operator-session`,
      "x-csrf-token": buildCsrfToken("operator-session")
    },
    remove = vi.fn().mockResolvedValue(undefined);
  f.offers.store.claims.remove = remove;
  expect((await f.app.inject({ url: "/v2/offers/capabilities" })).json()).toEqual({
    enabled: true
  });
  const visit = await f.app.inject({ url: "/v2/offers/visit/OWEN20" });
  expect(visit.statusCode).toBe(302);
  expect(visit.headers.location).toBe("https://debugbundle.test/");
  expect(f.apply).not.toHaveBeenCalled();
  const clear = await f.app.inject({
    method: "DELETE",
    url: "/v2/offers/pending",
    headers: { origin: "https://debugbundle.test" }
  });
  expect(clear.statusCode).toBe(200);
  expect(clear.json()).toEqual({ offer: null });
  expect(
    (
      await f.app.inject({
        method: "POST",
        url: "/v2/offers/signup-intent/retry",
        headers,
        payload: {}
      })
    ).statusCode
  ).toBe(200);
  expect(
    (
      await f.app.inject({
        method: "POST",
        url: "/v2/offers/customer/remove",
        headers,
        payload: { expected_organization_id: org, confirmed: true }
      })
    ).statusCode
  ).toBe(200);
  expect(remove).toHaveBeenCalledExactlyOnceWith({ organization_id: org, actor_user_id: user });
  await f.app.close();
});
