import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { buildPublicPricingCatalog } from "../../scripts/public-site-artifacts.js";
import { TIER_CAPABILITIES } from "../../packages/shared-types/src/tier-capabilities.js";

const siteRoot = process.env["DEBUGBUNDLE_SITE_ROOT"] ?? join(process.cwd(), "site");
// Public core CI has no private companion checkout; site CI supplies it explicitly.
const itSitePricing =
  process.env["DEBUGBUNDLE_SITE_ROOT"] !== undefined || existsSync(join(siteRoot, "package.json"))
    ? it
    : it.skip;

itSitePricing(
  "keeps the standalone site's vendored prices and every comparison limit equal to the enforced catalogue",
  () => {
    const catalog = JSON.parse(readFileSync(join(siteRoot, "public/pricing-catalog.json"), "utf8"));
    expect(catalog).toEqual(buildPublicPricingCatalog());
    expect(catalog.capabilities).toEqual(TIER_CAPABILITIES);
    expect(catalog.pricing.plans.business).toEqual({ monthlyUsd: "59", yearlyUsd: "588" });
    expect(catalog.pricing.extraCapacity.business).toEqual({
      monthlyUsd: "3",
      yearlyUsd: "30"
    });
  }
);
