import Stripe from "stripe";
import { expect, it } from "vitest";
import { prepareStripeOfferCoupon } from "../../../packages/referrals/src/stripe-offer-provisioning.js";
import { readVerifiedStripeOfferCoupon } from "../../../packages/referrals/src/stripe-offer-coupon.js";
import { offerVersion } from "../../helpers/offer-fixtures.js";
import { stripeOfferCouponFixture } from "../../helpers/stripe-offer-coupon.js";

/** Real pinned Stripe SDK, in-memory HTTP boundary; no external request or key. */
function fixture(failCreateResponse: boolean) {
  const f = stripeOfferCouponFixture();
  const saved = new Map<string, Record<string, unknown>>();
  const requests: {
    method: string;
    path: string;
    body: URLSearchParams;
    version: string | null;
    key: string | null;
  }[] = [];
  const client = new Stripe("sk_test_local_fixture_only", {
    apiVersion: "2026-02-25.clover",
    maxNetworkRetries: 2,
    telemetry: false,
    httpClient: Stripe.createFetchHttpClient(async (url, init) => {
      const path = new URL(typeof url === "string" || url instanceof URL ? url : url.url).pathname;
      if (init?.body !== undefined && typeof init.body !== "string")
        throw new Error("unexpected_fixture_body_type");
      const body = new URLSearchParams(init?.body ?? "");
      const headers = new Headers(init?.headers);
      const method = init?.method ?? "GET";
      requests.push({
        method,
        path,
        body,
        version: headers.get("Stripe-Version"),
        key: headers.get("Idempotency-Key")
      });
      const respond = (value: unknown, status = 200) =>
        new Response(JSON.stringify(value), {
          status,
          headers: { "Content-Type": "application/json", "Request-Id": "req_local_offer" }
        });
      if (method === "GET" && path.startsWith("/v1/prices/"))
        return respond(await f.prices(decodeURIComponent(path.split("/").at(-1)!)));
      if (method === "GET" && path.startsWith("/v1/coupons/")) {
        const coupon = saved.get(decodeURIComponent(path.split("/").at(-1)!));
        return coupon
          ? respond(coupon)
          : respond(
              {
                error: {
                  type: "invalid_request_error",
                  code: "resource_missing",
                  param: "coupon",
                  message: "Missing fixture coupon"
                }
              },
              404
            );
      }
      if (method === "POST" && path === "/v1/coupons") {
        const id = body.get("id")!;
        const products = [...body]
          .filter(([key]) => key.startsWith("applies_to[products]"))
          .map(([, value]) => value);
        const coupon = {
          ...f.coupon,
          id,
          percent_off: Number(body.get("percent_off")),
          duration: body.get("duration"),
          applies_to: { products },
          metadata: {
            offer_programme_id: body.get("metadata[offer_programme_id]"),
            offer_version_id: body.get("metadata[offer_version_id]")
          }
        };
        saved.set(id, coupon);
        if (failCreateResponse)
          return respond({ error: { type: "api_error", message: "Lost acknowledgement" } }, 500);
        return respond(coupon);
      }
      throw new Error("unexpected_fixture_provider_request");
    })
  });
  return { provider: { ...f.provider, client }, requests };
}

it.each([false, true])(
  "uses the actual SDK encoding and preserves one coupon when create response fails=%s",
  async (lost) => {
    const f = fixture(lost);
    const version = {
      ...offerVersion,
      policy: { ...offerVersion.policy, discount_basis_points: 1725 }
    };
    const binding = await prepareStripeOfferCoupon(f.provider, version);
    expect(await prepareStripeOfferCoupon(f.provider, version)).toEqual(binding);
    expect(
      await readVerifiedStripeOfferCoupon(
        f.provider,
        binding.coupon_id,
        "price_solo_plan_month",
        version.policy,
        false
      )
    ).toBe(binding.coupon_id);
    const writes = f.requests.filter((request) => request.method !== "GET");
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      method: "POST",
      path: "/v1/coupons",
      key: `offer-coupon:${binding.coupon_id}`
    });
    expect(writes[0]!.body.get("percent_off")).toBe("17.25");
    expect(writes[0]!.body.get("duration")).toBe("once");
    expect(
      [...writes[0]!.body].filter(([key]) => key.startsWith("expand")).map(([, value]) => value)
    ).toEqual(["applies_to"]);
    expect(f.requests.every((request) => request.version === "2026-02-25.clover")).toBe(true);
  }
);
