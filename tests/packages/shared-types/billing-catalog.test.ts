import { describe, expect, it } from "vitest";
import {
  getBillingCatalogPrice,
  isPaidTier,
  normalizeTierName,
  classifyBillingOfferChange
} from "../../../packages/shared-types/src/billing-catalog.js";
import { getTierCapabilities } from "../../../packages/shared-types/src/tier-capabilities.js";

describe("paid catalogue and pooled allowances", () => {
  it("applies same-interval increases now and interval switches only at renewal", () => {
    expect(
      classifyBillingOfferChange(
        { plan: "team", interval: "month" },
        { target_plan: "business", interval: "month" }
      )
    ).toBe("upgrade");
    expect(
      classifyBillingOfferChange(
        { plan: "team", interval: "month" },
        { target_plan: "business", interval: "year" }
      )
    ).toBe("renewal");
    expect(
      classifyBillingOfferChange(
        { plan: "business", interval: "year" },
        { target_plan: "team", interval: "year" }
      )
    ).toBe("renewal");
    expect(
      classifyBillingOfferChange(
        { plan: "business", interval: "year" },
        { target_plan: "business", interval: "year" }
      )
    ).toBeNull();
  });
  it("uses the approved explicit monthly and annual catalogue without changing allowance units", () => {
    const amounts = {
      solo: { plan: [500, 4800], extra_capacity: [100, 1000] },
      team: { plan: [1900, 19200], extra_capacity: [300, 3000] },
      business: { plan: [5900, 58800], extra_capacity: [300, 3000] }
    } as const;
    for (const tier of ["solo", "team", "business"] as const) {
      for (const kind of ["plan", "extra_capacity"] as const) {
        const monthly = getBillingCatalogPrice(tier, "month", kind);
        const annual = getBillingCatalogPrice(tier, "year", kind);
        expect([monthly.amount_minor, annual.amount_minor]).toEqual(amounts[tier][kind]);
        expect(annual).toMatchObject({ tier, interval: "year", currency: "usd", kind });
        expect(annual.amount_minor).toBeLessThan(monthly.amount_minor * 12);
        if (kind === "plan") expect(annual.amount_minor % 1200).toBe(0);
      }
    }
  });

  it("rejects unknown tier names rather than inventing enterprise pricing", () => {
    expect(isPaidTier("business")).toBe(true);
    expect(isPaidTier("enterprise")).toBe(false);
    expect(normalizeTierName("business")).toBe("business");
    expect(normalizeTierName("enterprise")).toBe("free");
    expect(normalizeTierName(undefined)).toBe("free");
  });

  it("keeps Free/Solo limits and gives Business twice Team's pooled capacity", () => {
    expect(getTierCapabilities("solo").monthly_analytics_events).toBe(50_000);
    expect(getTierCapabilities("free").monthly_analytics_events).toBe(5_000);
    const team = getTierCapabilities("team");
    const business = getTierCapabilities("business");
    expect(team.included_capacity_units * team.monthly_analytics_events).toBe(375_000);
    expect(business.included_capacity_units * business.monthly_analytics_events).toBe(750_000);
    expect(business.included_capacity_units * business.monthly_raw_ingested_events).toBe(300_000);
    expect(business.included_capacity_units * business.retained_bundle_cap).toBe(12_000);
    expect(team.availability_active_checks_per_organization).toBe(30);
    expect(business.availability_active_checks_per_organization).toBe(50);
    expect(business.max_members).toBe(1_000);
  });
});
