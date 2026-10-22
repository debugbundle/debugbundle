import { expect, it, vi } from "vitest";
import { createBillingApi } from "../../../packages/billing-client/src/index.js";

it("forwards the confirmed token or exact schedule and never accepts a malformed success", async () => {
  const request = vi.fn(async () => ({ status: 200, body: { pending_change: null } as unknown }));
  const api = createBillingApi({ request });
  await api.planChange({ action: "schedule", bearerToken: "owner", confirmationToken: "signed" });
  expect(request).toHaveBeenLastCalledWith({
    method: "POST",
    path: "/v1/billing/plan-change",
    bearerToken: "owner",
    body: { confirmation_token: "signed" }
  });
  await api.planChange({ action: "cancel", bearerToken: "owner", scheduleId: "sched_test" });
  expect(request).toHaveBeenLastCalledWith({
    method: "DELETE",
    path: "/v1/billing/plan-change",
    bearerToken: "owner",
    body: { schedule_id: "sched_test" }
  });
  request.mockResolvedValueOnce({ status: 200, body: {} });
  await expect(api.planChange({ action: "status", bearerToken: "owner" })).rejects.toThrow(
    "invalid_response_shape"
  );
  request.mockResolvedValueOnce({ status: 409, body: { error: "billing_change_in_progress" } });
  await expect(api.planChange({ action: "status", bearerToken: "owner" })).rejects.toThrow(
    "billing_change_in_progress"
  );
});
