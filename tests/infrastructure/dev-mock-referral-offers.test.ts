import { expect, it } from "vitest";
import { createDevMockApi } from "../../scripts/dev-mock/api.js";
import { createOfferApi } from "../../packages/referral-client/src/offer-api.js";
import { offerPolicy } from "../helpers/offer-fixtures.js";
import { createReferralApi } from "../../packages/referral-client/src/index.js";
import { base } from "../../scripts/dev-mock/base.js";

function preview() {
  const mock = createDevMockApi();
  const client = createOfferApi({
    async request({ method, path, body }) {
      const result = mock.handle(method, path, body);
      return { status: result.status, body: result.body };
    }
  });
  return { mock, client };
}
it("keeps chosen draft codes and version-filtered inventory aligned with the real creation flow", async () => {
  const { client } = preview();
  const before = (await client.execute("operator_programmes", {})).programmes.length;
  const input = {
    name: "Black Friday",
    public_description: "Local only",
    policy: { ...offerPolicy, kind: "promotion" as const, commission_basis_points: 0 },
    promotion_code: "blckfryd26"
  };
  const { programme } = await client.execute("draft", input);
  expect(
    (await client.execute("operator_codes", { version_id: programme.version_id })).codes
  ).toMatchObject([{ code: "BLCKFRYD26", version_id: programme.version_id }]);
  await expect(client.execute("draft", input)).rejects.toMatchObject({
    code: "creator_code_unavailable"
  });
  expect((await client.execute("operator_programmes", {})).programmes).toHaveLength(before + 1);
  await client.execute("state", {
    version_id: programme.version_id,
    expected_state: "draft",
    state: "active",
    acknowledge_unlimited: false
  });
  expect((await client.execute("context", {})).offer).toMatchObject({ code: "BLCKFRYD26" });
});
it("models per-programme payment setup with masked state and stale/identity guards", async () => {
  const { client } = preview();
  const programme = (await client.execute("programmes", {})).programmes.find(
    (p) => p.policy.kind === "referral"
  )!;
  expect((await client.execute("payout_preferences", {})).programmes).toEqual([]);
  await client.execute("join", {
    version_id: programme.version_id,
    terms_version: programme.policy.terms_version
  });
  const request = {
    expected_user_id: base.session.user_id,
    programme_id: programme.programme_id,
    expected_revision: null,
    details: {
      method: "revolut",
      holder: "Local Recipient",
      destination: "@localrecipient",
      country: "AU",
      currency: "aud"
    }
  };
  expect(await client.execute("payout_policy", {})).toMatchObject({
    routine_minimum_usd_minor: 5000,
    currencies: ["usd", "eur", "gbp", "cad", "aud"]
  });
  const saved = await client.execute("save_payout_preferences", request);
  expect(saved.preference).toMatchObject({ currency: "aud", masked_destination: "••••ient" });
  expect(JSON.stringify(await client.execute("payout_preferences", {}))).not.toMatch(
    /Local Recipient|@localrecipient/
  );
  await expect(client.execute("save_payout_preferences", request)).rejects.toMatchObject({
    code: "payout_preferences_changed"
  });
  await expect(
    client.execute("save_payout_preferences", {
      ...request,
      expected_user_id: programme.programme_id
    })
  ).rejects.toMatchObject({ code: "payout_context_changed" });
  await expect(
    client.execute("save_payout_preferences", {
      ...request,
      programme_id: "11111111-1111-4111-8111-111111111111"
    })
  ).rejects.toMatchObject({ code: "payout_programme_not_owned" });
  expect(await client.execute("payout_balances", { partner_id: programme.programme_id })).toEqual({
    programmes: []
  });
  expect(await client.execute("payout_instructions", { batch_id: programme.programme_id })).toEqual(
    { instructions: null }
  );
  await expect(
    client.execute("prepare_payout", {
      partner_id: programme.programme_id,
      programme_id: programme.programme_id,
      preference_revision: saved.preference.revision,
      claim_id: programme.programme_id
    })
  ).rejects.toMatchObject({ code: "no_available_commission" });
});

it("loads the local programme editor, creates revisions and resets simulated changes", async () => {
  const { mock, client } = preview();
  expect(mock.handle("GET", "/v2/offers/operator/access-status")).toMatchObject({
    status: 200,
    body: { status: "ready" }
  });
  const initial = await client.execute("operator_programmes", {});
  expect(initial.programmes.some((v) => v.policy.kind === "referral")).toBe(true);
  const { programme } = await client.execute("draft", {
    name: "Local winter offer",
    public_description: "Preview only",
    policy: { ...offerPolicy, kind: "promotion", commission_basis_points: 0 }
  });
  expect(programme).toMatchObject({ state: "draft", revision: 1, name: "Local winter offer" });
  const revised = await client.execute("draft", {
    programme_id: programme.programme_id,
    name: "Revised local offer",
    public_description: "Preview only",
    policy: programme.policy
  });
  expect(revised.programme).toMatchObject({ programme_id: programme.programme_id, revision: 2 });
  expect((await client.execute("operator_programmes", {})).programmes).toHaveLength(
    initial.programmes.length + 2
  );
  expect((await preview().client.execute("operator_programmes", {})).programmes).toHaveLength(
    initial.programmes.length
  );
});

it("prepares simulated payment setup on activation and protects stale edits", async () => {
  const { client } = preview();
  const { programme } = await client.execute("draft", {
    name: "Holiday",
    public_description: "Local only",
    policy: { ...offerPolicy, kind: "promotion", commission_basis_points: 0 }
  });
  const change = {
    version_id: programme.version_id,
    expected_state: "draft",
    state: "active",
    acknowledge_unlimited: false
  } as const;
  await expect(
    client.execute("provider", {
      version_id: programme.version_id,
      coupon_id: "live_coupon",
      livemode: true
    })
  ).rejects.toMatchObject({ code: "local_preview_live_provider_unavailable" });
  expect((await client.execute("state", change)).programme.state).toBe("active");
  await expect(client.execute("state", change)).rejects.toMatchObject({
    code: "programme_changed"
  });
  await client.execute("promotion_code", { version_id: programme.version_id, code: "WINTER20" });
  expect((await client.execute("context", { code: "WINTER20" })).offer).toMatchObject({
    code: "WINTER20",
    available: true
  });
  await client.execute("state", { ...change, expected_state: "active", state: "paused" });
  expect((await client.execute("context", { code: "WINTER20" })).offer).toMatchObject({
    available: false
  });
});

it("returns validated empty inventories and performance, rejects malformed writes and logged-out access", async () => {
  const { mock, client } = preview();
  expect(await client.execute("operator_codes", {})).toHaveProperty("codes");
  expect(await client.execute("operator_claims", {})).toEqual({ claims: [] });
  expect(await client.execute("operator_grants", {})).toEqual({ grants: [] });
  expect(
    await client.execute("operator_performance", {
      from: "2026-11-01T00:00:00.000Z",
      to: "2026-12-01T00:00:00.000Z"
    })
  ).toMatchObject({ performance: { claims: 0, base_cash_collected_minor: 0 } });
  expect(mock.handle("POST", "/v2/offers/operator/programmes", { policy: {} }).status).toBe(400);
  expect(mock.handle("POST", "/v2/offers/checkout", { confirmation_token: "invalid" }).status).toBe(
    503
  );
  mock.handle("POST", "/v1/auth/logout");
  expect(mock.handle("GET", "/v2/offers/operator/access-status").status).toBe(401);
});

it("loads referral balances, clients and payments plus the internal analytics preview", async () => {
  const { mock, client } = preview();
  const legacy = createReferralApi({
    async request({ method, path, body }) {
      const result = mock.handle(method, path, body);
      return { status: result.status, body: result.body };
    }
  });
  const auth = { bearerToken: "local-preview-only" };
  expect(await legacy.partner(auth)).toMatchObject({ partner: null });
  expect(await legacy.earnings(auth)).toEqual({ balance: null, operator_access: false });
  expect(await legacy.clients(auth)).toEqual([]);
  expect(await legacy.payouts(auth)).toEqual([]);
  const { programmes } = await client.execute("programmes", {});
  const first = programmes[0]!;
  const joined = await client.execute("join", {
    version_id: first.version_id,
    terms_version: first.policy.terms_version
  });
  expect(joined.creator?.legacy_code).toBe("REVIEWABCD");
  expect(joined.share_url).toBe("http://localhost:5292/affiliates/?offer=REVIEWABCD");
  expect((await client.execute("code", { code: "MYREVIEW20" })).creator?.code).toBe("MYREVIEW20");
  expect(mock.handle("GET", "/v1/admin/analytics/summary")).toMatchObject({
    status: 200,
    body: {
      summary: {
        kpis: { active_accounts_total: 0 },
        health: { malformed_rejections_this_month: 0 }
      }
    }
  });
  expect(mock.handle("GET", "/v1/admin/analytics/malformed-rejections")).toMatchObject({
    status: 200,
    body: { breakdown: { top_sources: [] } }
  });
  mock.handle("POST", "/v1/auth/logout");
  expect(mock.handle("GET", "/v1/admin/analytics/summary").status).toBe(401);
  expect(mock.handle("GET", "/v1/referrals/earnings").status).toBe(401);
});
