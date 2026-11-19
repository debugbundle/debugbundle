import { stripeOfferCouponFixture } from "../helpers/stripe-offer-coupon.js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { createDefaultOffers } from "../../apps/api/src/default-offers.js";
import type { StripeConfig } from "../../apps/api/src/stripe-config.js";
import { SESSION_COOKIE_NAME, buildCsrfToken } from "../../packages/auth/src/index.js";
import { ProgrammeVersionSchema } from "../../packages/referrals/src/programme-policy.js";
import { REFERRAL_TERMS_VERSION } from "../../packages/referrals/src/referral-contracts.js";
import { createReferralStore } from "../../packages/storage/src/referral-store.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration
} from "../helpers/integration-setup.js";
import {
  resetOfferIntegrationSchema,
  createOfferTestAccount,
  createOfferTestUser,
  offerIntegrationPolicy
} from "../helpers/offer-integration.js";
import { createTokenApiServer } from "../helpers/api-tokens.js";
import { mockedObject } from "../helpers/vitest.js";
runIntegration("offer HTTP and default domain composition", () => {
  const pool = createIntegrationPool(),
    db = createQueryable(pool);
  let user: string, org: string, creator: string, creatorOrg: string;
  beforeEach(async () => {
    await resetOfferIntegrationSchema(db);
    user = await createOfferTestUser(db);
    org = await createOfferTestAccount(db, user);
    creator = await createOfferTestUser(db);
    creatorOrg = await createOfferTestAccount(db, creator);
  });
  afterAll(async () => pool.end());
  it("keeps operator configuration, creator consent, customer promises and inventories on the same services", async () => {
    const providerFixture = stripeOfferCouponFixture();
    const stripe = mockedObject<StripeConfig>({
      ...providerFixture.provider,
      client: {
        ...providerFixture.provider.client,
        customers: { list: async () => ({ data: [], has_more: false }) }
      }
    });
    const offers = createDefaultOffers({
      db,
      config: {
        secret: "offer-http-composition-secret-at-least-thirty-two-characters",
        enrollmentEnabled: true,
        publicApiUrl: "http://localhost:3003",
        publicLandingUrl: "https://debugbundle.test/"
      },
      stripeConfig: stripe,
      enabled: true,
      operatorEmails: [`${user}@example.test`],
      appBaseUrl: "http://localhost:5291"
    });
    let actor = user,
      workspace = org;
    const browserSession = randomUUID(),
      memberToken = randomUUID();
    await db.query(
      "INSERT INTO sessions(id,user_id,organization_id,session_token_hash,auth_method,expires_at) VALUES($1,$2,$3,$4,'email_code',now()+interval '1 day')",
      [browserSession, user, org, "a".repeat(64)]
    );
    await db.query(
      "INSERT INTO member_tokens(id,user_id,organization_id,token_hash,label) VALUES($1,$2,$3,$4,'offer HTTP fixture')",
      [memberToken, user, org, "b".repeat(64)]
    );
    const app = createTokenApiServer({
      offers,
      webAuth: {
        resolveSessionByToken: vi.fn(async () => ({
          session_id: browserSession,
          user_id: actor,
          organization_id: workspace,
          email: `${actor}@example.test`,
          email_verified_at: new Date().toISOString(),
          session_auth_method: "email_code",
          role: "owner",
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 3600000).toISOString(),
          revoked_at: null
        }))
      }
    });
    const request = async (path: string, payload?: Record<string, unknown>) => {
      const response = await app.inject({
        url: `/v2/offers/${path}`,
        method: payload ? "POST" : "GET",
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=test-session`,
          "x-csrf-token": buildCsrfToken("test-session"),
          origin: "http://localhost:5291"
        },
        ...(payload ? { payload } : {})
      });
      expect(response.statusCode, response.body).toBe(200);
      return response.json<Record<string, unknown>>();
    };
    try {
      const legacy = await createReferralStore(db, {
        identityHashSecret: "offer-http-composition-secret-at-least-thirty-two-characters"
      }).joinProgram({ user_id: creator, terms_version: REFERRAL_TERMS_VERSION });
      const original = await request("customer", {
        code: legacy.code,
        expected_organization_id: org
      });
      expect(original["claim"]).toBeNull();
      expect(original["legacy_attribution"]).toMatchObject({ partner_code: legacy.code });
      expect(await request("operator/access-status")).toEqual({ status: "ready" });
      const delegation = await request("operator/delegations", {
        member_token_id: memberToken,
        actions: ["read", "manage"]
      });
      await request("operator/delegations/revoke", { operator_authorization: delegation["proof"] });
      const draft = ProgrammeVersionSchema.parse(
        (
          await request("operator/programmes", {
            name: "Reviewed programme",
            public_description: "Accepted terms",
            policy: {
              ...offerIntegrationPolicy,
              commission_basis_points: 7500,
              allow_early_purchase_grants: true
            }
          })
        )["programme"]
      );
      expect(draft.policy.commission_basis_points).toBe(7500);
      await request(`operator/programmes/${draft.version_id}/state`, {
        state: "active",
        expected_state: "draft",
        acknowledge_unlimited: true
      });
      expect((await request("programmes?limit=25"))["programmes"]).toHaveLength(1);
      expect((await request("operator/programmes?limit=25"))["programmes"]).toHaveLength(1);
      const promotion = ProgrammeVersionSchema.parse(
        (
          await request("operator/programmes", {
            name: "Holiday",
            public_description: "Reviewed holiday terms",
            policy: {
              ...offerIntegrationPolicy,
              kind: "promotion",
              commission_basis_points: 0,
              allow_early_purchase_grants: true,
              discount_basis_points: 3000
            }
          })
        )["programme"]
      );
      await request(`operator/programmes/${promotion.version_id}/state`, {
        state: "active",
        expected_state: "draft",
        acknowledge_unlimited: true
      });
      expect(providerFixture.create).toHaveBeenCalledTimes(2);
      await request("operator/promotion-codes", {
        version_id: promotion.version_id,
        code: "HOLIDAY30"
      });
      const unavailable = createDefaultOffers({
        db,
        config: {
          secret: "offer-http-composition-secret-at-least-thirty-two-characters",
          enrollmentEnabled: true
        },
        enabled: false,
        operatorEmails: [],
        appBaseUrl: "http://localhost:5291"
      });
      await expect(unavailable.verifyProvider(draft.version_id)).rejects.toMatchObject({
        code: "programme_unavailable"
      });
      actor = creator;
      workspace = creatorOrg;
      await request("creator", {
        version_id: draft.version_id,
        terms_version: draft.policy.terms_version
      });
      await request("creator/code", { code: "HTTP20" });
      expect((await request("creator"))["creator"]).toMatchObject({
        code: "HTTP20",
        accepting_new_referrals: true
      });
      expect((await request("context?code=HTTP20"))["offer"]).toMatchObject({
        code: "HTTP20",
        available: true
      });
      actor = user;
      workspace = org;
      const saved = (
        await request("customer", {
          code: "HTTP20",
          expected_organization_id: org,
          explicit_correction: true
        })
      )["claim"] as { claim_id: string };
      expect((await request("customer"))["claim"]).toMatchObject({
        claim_id: saved.claim_id,
        status: "saved"
      });
      const quote = (
        await request("quote", {
          target_plan: "team",
          interval: "year",
          additional_capacity_units: 1
        })
      )["quote"] as { initial_total_minor: number };
      // The live 30% promotion beats the 20% referral; capacity is unchanged.
      expect(quote.initial_total_minor).toBe(16440);
      await request("operator/creator-codes", {
        partner_id: (await offers.store.creators.read(creator))!.partner_id,
        code: "RENAMED20",
        reason: "Verified correction"
      });
      await request("operator/codes/block", {
        code: "RENAMED20",
        blocked: true,
        reason: "New-claim review"
      });
      expect((await request("operator/codes?limit=25&code=RENAMED20"))["codes"]).toMatchObject([
        { code: "RENAMED20", blocked: true }
      ]);
      expect((await request(`operator/claims?organization_id=${org}`))["claims"]).toMatchObject([
        { claim_id: saved.claim_id, status: "saved" }
      ]);
      const grant = (
        await request("operator/early-grants", {
          claim_id: saved.claim_id,
          reason: "Verified early-purchase support",
          expires_at: new Date(Date.now() + 3600000).toISOString()
        })
      )["grant_id"] as string;
      await request(`operator/early-grants/${grant}/revoke`, {});
      expect(
        (await request(`operator/early-grants?claim_id=${saved.claim_id}`))["grants"]
      ).toHaveLength(1);
      const from = new Date(Date.now() - 86400000).toISOString(),
        to = new Date(Date.now() + 86400000).toISOString();
      expect(
        (
          await request(
            `operator/performance?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
          )
        )["performance"]
      ).toMatchObject({ claims: 1, unreconciled_claims: 1 });
      await request(`operator/programmes/${draft.version_id}/state`, {
        state: "paused",
        expected_state: "active",
        acknowledge_unlimited: true
      });
      expect((await request("customer"))["claim"]).toMatchObject({
        claim_id: saved.claim_id,
        status: "saved"
      });
      await request(`operator/claims/${saved.claim_id}/revoke`, {
        reason: "Reviewed test-only revocation"
      });
      expect((await request("customer"))["claim"]).toMatchObject({ status: "revoked" });
      actor = creator;
      workspace = creatorOrg;
      const denied = await app.inject({
        url: "/v2/offers/operator/claims",
        headers: { cookie: `${SESSION_COOKIE_NAME}=test-session` }
      });
      expect(denied.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});
