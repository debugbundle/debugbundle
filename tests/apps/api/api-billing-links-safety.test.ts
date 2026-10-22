import { expect, it } from "vitest";
import { createEnvBillingLinkProvider } from "../../../apps/api/src/billing-links.js";

it("does not fall back to unscoped static payment links in production", () => {
  const provider = createEnvBillingLinkProvider({
    NODE_ENV: "production",
    STRIPE_SOLO_CHECKOUT_URL: "https://buy.stripe.com/legacy_solo",
    STRIPE_TEAM_CHECKOUT_URL: "https://buy.stripe.com/legacy_team",
    STRIPE_CUSTOMER_PORTAL_URL: "https://billing.stripe.com/legacy_portal"
  });
  expect(provider.createCheckoutUrl({ target_plan: "solo" })).toBeNull();
  expect(provider.createCheckoutUrl({ target_plan: "team" })).toBeNull();
  expect(provider.createPortalUrl()).toBeNull();
});

it("preserves the documented local manual billing-link scaffold", () => {
  const provider = createEnvBillingLinkProvider({
    NODE_ENV: "development",
    STRIPE_SOLO_CHECKOUT_URL: "https://billing.example.test/solo",
    STRIPE_CUSTOMER_PORTAL_URL: "https://billing.example.test/portal"
  });
  expect(provider.createCheckoutUrl({ target_plan: "solo" })).toBe(
    "https://billing.example.test/solo"
  );
  expect(provider.createPortalUrl()).toBe("https://billing.example.test/portal");
});
