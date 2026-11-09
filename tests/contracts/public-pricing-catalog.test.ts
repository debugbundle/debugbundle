import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { buildPublicPricingCatalog } from "../../scripts/public-site-artifacts.js";
import { TIER_CAPABILITIES } from "../../packages/shared-types/src/tier-capabilities.js";

it("keeps the standalone site's vendored prices and every comparison limit equal to the enforced catalogue", () => {
  const catalog = JSON.parse(readFileSync("site/public/pricing-catalog.json", "utf8"));
  expect(catalog).toEqual(buildPublicPricingCatalog());
  expect(catalog.capabilities).toEqual(TIER_CAPABILITIES);
  expect(catalog.pricing.plans.business).toEqual({ monthlyUsd: "59", yearlyUsd: "588" });
  expect(catalog.pricing.extraCapacity.business).toEqual({
    monthlyUsd: "3",
    yearlyUsd: "30"
  });
});
