// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { CustomerOfferControl } from "../../../apps/web/src/components/system/customer-offer-control.js";
import { BillingSubscriptionControl } from "../../../apps/web/src/components/system/billing-subscription-control.js";
import { offerApi } from "../../../apps/web/src/lib/offer-api.js";
import { createOfferQuoteCodec } from "../../../packages/referrals/src/offer-quote.js";
import { createBillingSummary, jsonResponse, requestUrl } from "./web-test-helpers.js";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.js";
import { offerClaim, offerPolicy, offerDefinition } from "../../helpers/offer-fixtures.js";
const org = "11111111-1111-4111-8111-111111111111";
afterEach(() => {
  resetBrowserSessionClientState();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("requires explicit code replacement and shows only the confirmed workspace claim", async () => {
  const user = userEvent.setup(),
    writes: unknown[] = [];
  let corrected = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = requestUrl(input);
      if (path.endsWith("/capabilities")) return jsonResponse(200, { enabled: true });
      if (path.endsWith("/retry")) return jsonResponse(200, { intent: null });
      if (path.endsWith("/customer") && init?.method === "POST") {
        const body = JSON.parse(typeof init.body === "string" ? init.body : "{}") as {
          explicit_correction: boolean;
        };
        writes.push(body);
        if (!body.explicit_correction)
          return jsonResponse(409, { error: "offer_change_requires_confirmation" });
        corrected = true;
        return jsonResponse(200, { claim: { ...offerClaim, code: "NEW20" } });
      }
      if (path.endsWith("/customer"))
        return jsonResponse(200, {
          claim: corrected ? { ...offerClaim, code: "NEW20" } : offerClaim,
          pending: null,
          early_purchase_allowed: false
        });
      return jsonResponse(404, { error: "not_found" });
    })
  );
  render(<CustomerOfferControl organizationId={org} />);
  const field = await screen.findByLabelText("Referral or discount code");
  await user.clear(field);
  await user.type(field, "NEW20");
  await user.click(screen.getByRole("button", { name: "Apply code" }));
  expect(await screen.findByRole("alertdialog")).toHaveTextContent("Apply NEW20 instead");
  expect(writes).toHaveLength(1);
  await user.click(screen.getByRole("button", { name: "Replace offer" }));
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  expect(writes).toEqual([
    { code: "NEW20", expected_organization_id: org, explicit_correction: false },
    { code: "NEW20", expected_organization_id: org, explicit_correction: true }
  ]);
  expect(await screen.findByLabelText("Referral or discount code")).toHaveValue("NEW20");
});
it("fails closed on offer-service outage instead of exposing the legacy entry form", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(jsonResponse(503, { error: "offer_service_unavailable" }))
  );
  render(<CustomerOfferControl organizationId={org} />);
  expect(await screen.findByText("Offer details could not be loaded")).toBeVisible();
  expect(screen.queryByRole("button", { name: /Have a Business referral/ })).toBeNull();
  expect(screen.getByRole("button", { name: "Apply code" })).toBeDisabled();
});
it("reviews an available promotion without a saved claim before sending a purchase confirmation", async () => {
  const user = userEvent.setup(),
    navigate = vi.fn(),
    writes: string[] = [];
  const quote = createOfferQuoteCodec("quote-secret-longer-than-thirty-two-characters").issue({
    organization_id: org,
    actor_user_id: org,
    claim_id: offerClaim.claim_id,
    version_id: offerDefinition.version_id,
    selection: { target_plan: "solo", interval: "month" },
    policy: {
      ...offerPolicy,
      kind: "promotion",
      commission_basis_points: 0,
      discount_basis_points: 3000
    },
    code: "SALE30",
    new_claim: { attribution_id: null, partner_code: null }
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const path = requestUrl(input);
      writes.push(path);
      return path.endsWith("/quote")
        ? jsonResponse(200, { quote })
        : path.endsWith("/checkout")
          ? jsonResponse(200, { url: "https://checkout.stripe.com/new-offer" })
          : jsonResponse(404, { error: "not_found" });
    })
  );
  render(
    <BillingSubscriptionControl
      billing={createBillingSummary({ plan: "free" })}
      offerReady
      discoverIntroOffers
      earlyPurchaseAllowed
      onNavigate={navigate}
      onRefresh={vi.fn()}
      requestedPlan={{ plan: "solo", sequence: 1 }}
    />
  );
  await user.click(await screen.findByRole("button", { name: "Review price" }));
  expect(await screen.findByText("$3.50")).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(navigate).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Continue to Stripe" }));
  await waitFor(() =>
    expect(navigate).toHaveBeenCalledWith("https://checkout.stripe.com/new-offer")
  );
  expect(writes).toEqual([
    expect.stringContaining("/v2/offers/quote"),
    expect.stringContaining("/v2/offers/checkout")
  ]);
});
it.each([503, 400])(
  "never treats a failed or unsupported offer lookup (%s) as permission for full-price checkout",
  async (status) => {
    const user = userEvent.setup(),
      paths: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        paths.push(requestUrl(input));
        return jsonResponse(status, {
          error: status === 400 ? "invalid_request" : "programme_unavailable"
        });
      })
    );
    render(
      <BillingSubscriptionControl
        billing={createBillingSummary({ plan: "free" })}
        offerReady
        discoverIntroOffers
        earlyPurchaseAllowed
        onNavigate={vi.fn()}
        onRefresh={vi.fn()}
        requestedPlan={{ plan: "solo", sequence: 1 }}
      />
    );
    await user.click(await screen.findByRole("button", { name: "Review price" }));
    await screen.findByRole("alert");
    expect(paths).toEqual([expect.stringContaining("/v2/offers/quote")]);
  }
);
it("reviews the regular price before ordinary checkout when there is no eligible public offer", async () => {
  const user = userEvent.setup(),
    paths: string[] = [],
    navigate = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = requestUrl(input);
      paths.push(path);
      if (path.endsWith("/v2/offers/quote")) {
        expect(JSON.parse(typeof init?.body === "string" ? init.body : "{}")).toMatchObject({
          include_public_offers: true
        });
        return jsonResponse(409, { error: "offer_ineligible" });
      }
      return jsonResponse(200, { url: "https://checkout.stripe.com/ordinary" });
    })
  );
  render(
    <BillingSubscriptionControl
      billing={createBillingSummary({ plan: "free" })}
      offerReady
      discoverIntroOffers
      earlyPurchaseAllowed
      onNavigate={navigate}
      onRefresh={vi.fn()}
      requestedPlan={{ plan: "solo", sequence: 1 }}
    />
  );
  await user.click(await screen.findByRole("button", { name: "Review price" }));
  const confirm = await screen.findByRole("button", { name: "Continue to Stripe" });
  expect(paths).toHaveLength(1);
  expect(navigate).not.toHaveBeenCalled();
  await user.click(confirm);
  await waitFor(() =>
    expect(navigate).toHaveBeenCalledWith("https://checkout.stripe.com/ordinary")
  );
  expect(paths).toEqual([
    expect.stringContaining("/v2/offers/quote"),
    expect.stringContaining("/v1/billing/checkout")
  ]);
});
it.each([false, true])(
  "reviews yearly totals and replays the same confirmation after a lost response (fresh claim: %s)",
  async (fresh) => {
    const user = userEvent.setup(),
      navigate = vi.fn(),
      execute = vi.spyOn(offerApi, "execute");
    const quote = createOfferQuoteCodec("quote-secret-longer-than-thirty-two-characters").issue({
      organization_id: org,
      actor_user_id: org,
      claim_id: offerClaim.claim_id,
      version_id: offerDefinition.version_id,
      selection: { target_plan: "team", interval: "year" },
      policy: offerPolicy,
      ...(fresh ? { code: "SALE20", new_claim: { attribution_id: null, partner_code: null } } : {})
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = requestUrl(input);
        if (path.endsWith("/quote")) return jsonResponse(200, { quote });
        if (path.endsWith("/checkout")) throw new Error("response_lost");
        return jsonResponse(404, { error: "not_found" });
      })
    );
    const props = {
      billing: createBillingSummary({ plan: "free" }),
      offerClaim: fresh ? null : offerClaim,
      discoverIntroOffers: fresh,
      earlyPurchaseAllowed: true,
      offerReady: true,
      onNavigate: navigate,
      onRefresh: vi.fn(),
      requestedPlan: { plan: "team" as const, interval: "year" as const, sequence: 1 }
    };
    const view = render(<BillingSubscriptionControl {...props} />);
    await user.click(
      await screen.findByRole("button", {
        name: fresh ? "Review price" : "Review introductory price"
      })
    );
    expect(await screen.findByText("$153.60")).toBeVisible();
    expect(screen.getByText("$192.00/year")).toBeVisible();
    expect(execute.mock.calls.map(([name]) => name)).toEqual(["quote"]);
    await user.click(screen.getByRole("button", { name: "Continue to Stripe" }));
    await screen.findByRole("alert");
    view.rerender(
      <BillingSubscriptionControl
        {...props}
        offerClaim={{ ...offerClaim, status: "used", eligible_invoice_id: "in_delayed" }}
        earlyPurchaseAllowed={false}
      />
    );
    await user.click(screen.getByRole("button", { name: "Continue to Stripe" }));
    await waitFor(() =>
      expect(execute.mock.calls.filter(([name]) => name === "checkout")).toHaveLength(2)
    );
    expect(
      execute.mock.calls.filter(([name]) => name === "checkout").map(([, input]) => input)
    ).toEqual([
      { confirmation_token: quote.confirmation_token },
      { confirmation_token: quote.confirmation_token }
    ]);
    expect(navigate).not.toHaveBeenCalled();
  }
);
it("does not let a code alone override the seven-day purchase protection", async () => {
  const billing = createBillingSummary({ plan: "team", billing_state: "trialing" });
  billing.trial.active = true;
  billing.trial.plan = "team";
  billing.trial.started_at = new Date().toISOString();
  billing.trial.ends_at = new Date(Date.now() + 30 * 86400000).toISOString();
  render(
    <BillingSubscriptionControl
      billing={billing}
      offerClaim={offerClaim}
      earlyPurchaseAllowed={false}
      offerReady
      onNavigate={vi.fn()}
      onRefresh={vi.fn()}
      requestedPlan={{ plan: "team", sequence: 1 }}
    />
  );
  expect(await screen.findByRole("button", { name: "Review introductory price" })).toBeDisabled();
  expect(screen.getByText(/Paid purchases open after seven full trial days/)).toBeVisible();
});
it("allows a fresh review and successful purchase after a definitive pre-admission rejection", async () => {
  const user = userEvent.setup(),
    navigate = vi.fn();
  let quotes = 0,
    confirmations = 0;
  const tokens: string[] = [];
  const quote = createOfferQuoteCodec("quote-secret-longer-than-thirty-two-characters").issue({
    organization_id: org,
    actor_user_id: org,
    claim_id: offerClaim.claim_id,
    version_id: offerDefinition.version_id,
    selection: { target_plan: "solo", interval: "month" },
    policy: offerPolicy
  });
  const replacement = createOfferQuoteCodec("quote-secret-longer-than-thirty-two-characters").issue(
    {
      organization_id: org,
      actor_user_id: org,
      claim_id: offerClaim.claim_id,
      version_id: "44444444-4444-4444-8444-444444444444",
      selection: { target_plan: "solo", interval: "month" },
      policy: { ...offerPolicy, discount_basis_points: 3000 }
    }
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (requestUrl(input).endsWith("/quote"))
        return jsonResponse(200, { quote: ++quotes === 1 ? quote : replacement });
      tokens.push(
        (
          JSON.parse(typeof init?.body === "string" ? init.body : "{}") as {
            confirmation_token: string;
          }
        ).confirmation_token
      );
      return ++confirmations === 1
        ? jsonResponse(409, { error: "offer_confirmation_required" })
        : jsonResponse(200, { url: "https://checkout.stripe.com/refreshed" });
    })
  );
  render(
    <BillingSubscriptionControl
      billing={createBillingSummary({ plan: "free" })}
      offerClaim={offerClaim}
      earlyPurchaseAllowed
      offerReady
      onNavigate={navigate}
      onRefresh={vi.fn()}
      requestedPlan={{ plan: "solo", sequence: 1 }}
    />
  );
  await user.click(await screen.findByRole("button", { name: "Review introductory price" }));
  await screen.findByText("$4.00");
  await user.click(screen.getByRole("button", { name: "Continue to Stripe" }));
  await screen.findByRole("alert");
  expect(screen.getByRole("button", { name: "Review introductory price" })).toBeEnabled();
  await user.click(screen.getByRole("button", { name: "Review introductory price" }));
  await screen.findByText("$3.50");
  await user.click(screen.getByRole("button", { name: "Continue to Stripe" }));
  await waitFor(() =>
    expect(navigate).toHaveBeenCalledWith("https://checkout.stripe.com/refreshed")
  );
  expect(tokens).toEqual([quote.confirmation_token, replacement.confirmation_token]);
});
it("keeps a saved discount visible when new programme claims are disabled", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const path = requestUrl(input);
      if (path.endsWith("/capabilities")) return jsonResponse(200, { enabled: false });
      if (path.endsWith("/retry")) return jsonResponse(200, { intent: null });
      return jsonResponse(200, { claim: offerClaim, pending: null, early_purchase_allowed: false });
    })
  );
  render(<CustomerOfferControl organizationId={org} />);
  expect(await screen.findByText("Your discount is saved")).toBeVisible();
  expect(screen.getByText("New code claims are paused")).toBeVisible();
  expect(screen.getByRole("button", { name: "Apply code" })).toBeDisabled();
  expect(screen.getByLabelText("Referral or discount code")).toHaveValue("OWEN20");
});
it("removes only the confirmed unused discount from the displayed workspace", async () => {
  const user = userEvent.setup(),
    writes: unknown[] = [];
  let removed = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = requestUrl(input);
      if (path.endsWith("/capabilities")) return jsonResponse(200, { enabled: true });
      if (path.endsWith("/retry")) return jsonResponse(200, { intent: null });
      if (path.endsWith("/customer/remove")) {
        writes.push(JSON.parse(typeof init?.body === "string" ? init.body : "{}"));
        removed = true;
        return jsonResponse(200, { ok: true });
      }
      return jsonResponse(200, {
        claim: removed ? { ...offerClaim, status: "revoked" } : offerClaim,
        pending: null,
        early_purchase_allowed: false
      });
    })
  );
  render(<CustomerOfferControl organizationId={org} />);
  await screen.findByText("Your discount is saved");
  await user.click(screen.getByRole("button", { name: "Remove discount" }));
  await user.click(screen.getByRole("button", { name: "Keep current offer" }));
  expect(writes).toEqual([]);
  await user.click(screen.getByRole("button", { name: "Remove discount" }));
  await user.click(
    within(screen.getByRole("alertdialog")).getByRole("button", { name: "Remove discount" })
  );
  await waitFor(() => expect(writes).toEqual([{ confirmed: true, expected_organization_id: org }]));
  await waitFor(() => expect(screen.getByLabelText("Referral or discount code")).toHaveValue(""));
});
