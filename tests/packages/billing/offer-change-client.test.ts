import { expect, it, vi } from "vitest";
import { createBillingApi } from "../../../packages/billing-client/src/index.js";

it("uses the opt-in interval contract without changing the legacy monthly client", async () => {
  const request = vi.fn(async () => ({
    status: 200,
    body: { subscription: null, pending_change: null } as unknown
  }));
  const api = createBillingApi({ request });
  expect(await api.offerChange({ action: "status", bearerToken: "owner" })).toEqual({
    subscription: null,
    pending_change: null
  });
  expect(request).toHaveBeenLastCalledWith({
    method: "GET",
    path: "/v1/billing/offers/change",
    bearerToken: "owner"
  });
  request.mockResolvedValueOnce({ status: 200, body: { pending_change: null } });
  await api.offerChange({ action: "schedule", bearerToken: "owner", confirmationToken: "signed" });
  expect(request).toHaveBeenLastCalledWith({
    method: "POST",
    path: "/v1/billing/offers/change",
    bearerToken: "owner",
    body: { confirmation_token: "signed" }
  });
  request.mockResolvedValueOnce({ status: 200, body: { pending_change: null } });
  await api.planChange({ action: "status", bearerToken: "owner" });
  expect(request).toHaveBeenLastCalledWith({
    method: "GET",
    path: "/v1/billing/plan-change",
    bearerToken: "owner"
  });
});
it("rejects legacy monthly fields on an interval-aware quote", async () => {
  const request = vi.fn(async () => ({
    status: 200,
    body: {
      quote: {
        target_plan: "business",
        interval: "year",
        action: "renewal",
        currency: "usd",
        amount_due: 0,
        recurring_total: 59000,
        tax: 0,
        additional_capacity_units: 0,
        effective_at: "2027-01-31T00:00:00.000Z",
        expires_at: "2026-02-10T00:10:00.000Z",
        confirmation_token: "signed",
        monthly_total: 59000
      }
    }
  }));
  const api = createBillingApi({ request });
  await expect(
    api.offerChange({
      action: "preview",
      bearerToken: "owner",
      targetPlan: "business",
      interval: "year"
    })
  ).rejects.toThrow("invalid_response_shape");
  expect(request).toHaveBeenLastCalledWith({
    method: "POST",
    path: "/v1/billing/offers/change/preview",
    bearerToken: "owner",
    body: { target_plan: "business", interval: "year" }
  });
});
