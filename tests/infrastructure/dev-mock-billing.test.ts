import { describe, expect, it, vi } from "vitest";
import { createDevMockApi } from "../../scripts/dev-mock/api.js";
import {
  BillingOfferQuoteSchema,
  BillingOfferStatusSchema,
  classifyBillingOfferChange,
  type PaidTierName,
  type BillingInterval
} from "../../packages/shared-types/src/index.js";

const previewPath = "/v1/__dev/billing";
function setup(plan: string, interval = "month", mode = "paid") {
  const api = createDevMockApi();
  expect(
    api.handle("POST", previewPath, {
      action: "configure",
      scenario: { plan, interval, mode, additional_capacity_units: 2 }
    }).status
  ).toBe(200);
  return api;
}
function quote(
  api: ReturnType<typeof createDevMockApi>,
  target_plan: PaidTierName,
  interval: BillingInterval
) {
  const current = BillingOfferStatusSchema.parse(
    api.handle("GET", "/v1/billing/offers/change").body
  ).subscription!;
  const action = classifyBillingOfferChange(current, { target_plan, interval });
  const path = action === "upgrade" ? "upgrade-preview" : "change/preview";
  const response = api.handle("POST", `/v1/billing/offers/${path}`, { target_plan, interval });
  expect(response.status).toBe(200);
  return BillingOfferQuoteSchema.parse((response.body as { quote: unknown }).quote);
}

describe("local billing catalogue preview", () => {
  for (const plan of ["solo", "team", "business"] as const)
    for (const interval of ["month", "year"] as const)
      for (const target of ["solo", "team", "business"] as const)
        for (const nextInterval of ["month", "year"] as const) {
          if (plan === target && interval === nextInterval) continue;
          it(`${plan}/${interval} to ${target}/${nextInterval} retains capacity and applies at the correct boundary`, () => {
            const api = setup(plan, interval),
              next = quote(api, target, nextInterval);
            expect(next.additional_capacity_units).toBe(2);
            if (next.action === "upgrade") {
              const checkout = api.handle("POST", "/v1/billing/checkout", {
                target_plan: target,
                interval: nextInterval,
                confirmation_token: next.confirmation_token
              });
              expect(checkout.status).toBe(200);
              const url = new URL((checkout.body as { url: string }).url);
              expect(url.origin).toBe("http://localhost:5291");
              expect(api.handle("GET", "/v1/billing").body).toHaveProperty("billing.plan", plan);
              expect(
                api.handle("POST", "/v1/billing/checkout/confirm", {
                  session_id: url.searchParams.get("session_id")
                }).status
              ).toBe(200);
            } else {
              expect(next.amount_due).toBe(0);
              expect(
                api.handle("POST", "/v1/billing/offers/change", {
                  confirmation_token: next.confirmation_token
                }).status
              ).toBe(200);
              expect(api.handle("GET", "/v1/billing").body).toHaveProperty("billing.plan", plan);
              expect(api.handle("POST", previewPath, { action: "renew" }).status).toBe(200);
            }
            const status = BillingOfferStatusSchema.parse(
              api.handle("GET", "/v1/billing/offers/change").body
            );
            expect(status.subscription).toMatchObject({
              plan: target,
              interval: nextInterval,
              additional_capacity_units: 2
            });
            expect(api.handle("GET", "/v1/auth/session").body).toHaveProperty(
              "session.organization_plan",
              target
            );
            expect(api.handle("GET", "/v1/projects").body).toHaveProperty(
              "projects.0.organization_plan",
              target
            );
          });
        }

  it("keeps complimentary and trial fixtures separate from paid subscriptions", () => {
    for (const mode of ["complimentary", "trial", "trial_locked"]) {
      const api = setup("business", "year", mode);
      expect(api.handle("GET", "/v1/billing/offers/change").body).toEqual({
        subscription: null,
        pending_change: null
      });
      expect(
        api.handle("POST", "/v1/billing/offers/upgrade-preview", {
          target_plan: "business",
          interval: "year"
        }).status
      ).toBe(409);
      if (mode === "complimentary")
        expect(api.handle("GET", "/v1/billing").body).toHaveProperty(
          "billing.stripe_customer_id",
          null
        );
    }
  });
  it("preserves trial waits and converts a mature Business trial through a local checkout", () => {
    for (const mode of ["trial_locked", "trial"]) {
      const api = setup("business", "month", mode);
      const result = api.handle("POST", "/v1/billing/checkout", {
        target_plan: "business",
        interval: "year"
      });
      expect(result.status).toBe(mode === "trial_locked" ? 409 : 200);
    }
  });
  it("rejects stale quotes, does not silently replace schedules and permits exact schedule cancellation", () => {
    const api = setup("business"),
      next = quote(api, "team", "month");
    api.handle("POST", "/v1/billing/capacity/increase", { target_additional_capacity_units: 3 });
    expect(
      api.handle("POST", "/v1/billing/offers/change", {
        confirmation_token: next.confirmation_token
      }).status
    ).toBe(409);
    const fresh = quote(api, "solo", "month");
    const scheduled = api.handle("POST", "/v1/billing/offers/change", {
      confirmation_token: fresh.confirmation_token
    });
    const pending = BillingOfferStatusSchema.parse(
      api.handle("GET", "/v1/billing/offers/change").body
    ).pending_change!;
    expect(scheduled.status).toBe(200);
    expect(api.handle("DELETE", "/v1/billing/offers/change", { schedule_id: "wrong" }).status).toBe(
      409
    );
    expect(
      api.handle("DELETE", "/v1/billing/offers/change", { schedule_id: pending.schedule_id }).status
    ).toBe(200);
    api.handle("POST", previewPath, { action: "renew" });
    expect(api.handle("GET", "/v1/billing").body).toHaveProperty("billing.plan", "business");
  });
  it("rejects expired confirmations without changing access", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const api = setup("team"),
        next = quote(api, "business", "month");
      vi.advanceTimersByTime(601_000);
      expect(
        api.handle("POST", "/v1/billing/checkout", {
          target_plan: "business",
          interval: "month",
          confirmation_token: next.confirmation_token
        }).status
      ).toBe(409);
      expect(api.handle("GET", "/v1/billing").body).toHaveProperty("billing.plan", "team");
    } finally {
      vi.useRealTimers();
    }
  });
  it("simulates cancellation to Free only at renewal and resets on a new preview instance", () => {
    const api = setup("business", "year");
    expect(api.handle("POST", previewPath, { action: "cancel" }).status).toBe(200);
    expect(api.handle("GET", "/v1/billing").body).toHaveProperty("billing.plan", "business");
    api.handle("POST", previewPath, { action: "renew" });
    expect(api.handle("GET", "/v1/billing").body).toMatchObject({
      billing: { plan: "free", capacity_units: { additional_purchased: 0 } }
    });
    expect(createDevMockApi().handle("GET", "/v1/billing").body).toHaveProperty(
      "billing.plan",
      "team"
    );
  });
  it("validates preview commands and rejects foreign checkout origins", () => {
    const api = setup("team");
    expect(
      api.handle("POST", previewPath, { action: "configure", scenario: { plan: "enterprise" } })
        .status
    ).toBe(400);
    expect(
      api.handle("POST", previewPath, {
        action: "configure",
        scenario: { plan: "solo", interval: "year", mode: "paid", additional_capacity_units: 100 }
      }).status
    ).toBe(400);
    expect(
      api.handle(
        "POST",
        "/v1/billing/checkout",
        { target_plan: "business", interval: "year" },
        "https://example.com"
      ).status
    ).not.toBe(200);
  });
  it("applies paid capacity reductions at renewal and complimentary reductions immediately", () => {
    const api = setup("business", "year");
    api.handle("POST", "/v1/billing/capacity/scheduled-reduction", {
      target_additional_capacity_units: 1
    });
    expect(api.handle("GET", "/v1/billing").body).toHaveProperty(
      "billing.capacity_units.additional_purchased",
      2
    );
    api.handle("POST", previewPath, { action: "renew" });
    expect(api.handle("GET", "/v1/billing").body).toHaveProperty(
      "billing.capacity_units.additional_purchased",
      1
    );
    const internal = setup("team", "month", "complimentary");
    internal.handle("POST", "/v1/billing/capacity/scheduled-reduction", {
      target_additional_capacity_units: 0
    });
    expect(internal.handle("GET", "/v1/billing").body).toHaveProperty(
      "billing.capacity_units.additional_purchased",
      0
    );
  });
});
