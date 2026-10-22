import { expect, it, vi } from "vitest";
import { createBillingApi } from "../../../packages/billing-client/src/index.js";
it("preserves hosted authentication recovery across the shared CLI and MCP client", async () => {
  const payment = { payment_required: { url: "https://invoice.stripe.com/i/synthetic" } };
  const client = createBillingApi({ request: vi.fn(async () => ({ status: 200, body: payment })) });
  expect(
    await client.increaseCapacity({ bearerToken: "synthetic", targetAdditionalCapacityUnits: 3 })
  ).toEqual(payment);
});
it("rejects an unexpected provider payment origin", async () => {
  const client = createBillingApi({
    request: vi.fn(async () => ({
      status: 200,
      body: { payment_required: { url: "https://unexpected.test/payment" } }
    }))
  });
  await expect(
    client.increaseCapacity({ bearerToken: "synthetic", targetAdditionalCapacityUnits: 3 })
  ).rejects.toThrow("invalid_response_shape");
});
