import { vi } from "vitest";
import { getBillingCatalogPrice } from "../../packages/shared-types/src/billing-catalog.js";
import type {
  StripeBillingProvider,
  StripePriceMapping
} from "../../packages/billing/src/stripe-subscription.js";

export function stripeOfferCouponFixture(livemode = false) {
  const coupon = {
    id: "coupon_offer",
    valid: true,
    livemode,
    percent_off: 20,
    max_redemptions: null as number | null,
    redeem_by: null as number | null,
    amount_off: null,
    duration: "once",
    applies_to: { products: ["prod_solo", "prod_team", "prod_business"] },
    metadata: {} as Record<string, string>
  };
  const saved = new Map<string, typeof coupon>([[coupon.id, coupon]]);
  const priceMap = new Map<string, StripePriceMapping>();
  for (const plan of ["solo", "team", "business"] as const)
    for (const interval of ["month", "year"] as const)
      for (const type of ["plan", "extra_capacity"] as const)
        priceMap.set(`price_${plan}_${type}_${interval}`, {
          plan,
          interval,
          type,
          currency: "usd"
        });
  const prices = vi.fn(async (id: string) => {
    const mapping = priceMap.get(id)!;
    return {
      id,
      active: true,
      livemode,
      currency: "usd",
      unit_amount: getBillingCatalogPrice(
        mapping.plan as "solo" | "team" | "business",
        mapping.interval ?? "month",
        mapping.type
      ).amount_minor,
      tax_behavior: "exclusive",
      recurring: {
        interval: mapping.interval ?? "month",
        interval_count: 1,
        usage_type: "licensed"
      },
      product:
        mapping.type === "extra_capacity" ? `prod_capacity_${mapping.plan}` : `prod_${mapping.plan}`
    };
  });
  const coupons = vi.fn(async (id: string) => {
    const value = saved.get(id);
    if (!value)
      throw Object.assign(new Error("missing"), { statusCode: 404, code: "resource_missing" });
    return value;
  });
  const create = vi.fn(
    async (params: {
      id?: string;
      percent_off?: number;
      duration?: string;
      applies_to?: { products?: string[] };
      metadata?: Record<string, string>;
    }) => {
      const value = {
        ...coupon,
        ...params,
        id: params.id!,
        applies_to: { products: params.applies_to?.products ?? [] },
        metadata: params.metadata ?? {}
      };
      saved.set(value.id, value);
      return value;
    }
  );
  return {
    coupon,
    prices,
    coupons,
    create,
    saved,
    provider: {
      priceMap,
      client: { prices: { retrieve: prices }, coupons: { retrieve: coupons, create } }
    } as unknown as StripeBillingProvider
  };
}
