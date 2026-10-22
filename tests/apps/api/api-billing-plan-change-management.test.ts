import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBillingManagement } from "../../../apps/api/src/billing-management.js";

const { factory, service, operationStore, upgradePreview } = vi.hoisted(() => ({
  factory: vi.fn(),
  service: { getStatus: vi.fn(), preview: vi.fn(), schedule: vi.fn(), cancel: vi.fn() },
  operationStore: { get: vi.fn() },
  upgradePreview: vi.fn()
}));
vi.mock("../../../packages/billing/src/stripe-plan-change.js", () => ({
  createStripePlanChangeService: factory
}));
vi.mock("../../../packages/storage/src/billing-subscription-operation-store.js", () => ({
  createPostgresBillingSubscriptionOperationStore: () => operationStore
}));
vi.mock("../../../packages/billing/src/stripe-upgrade-preview.js", () => ({
  previewStripeSubscriptionUpgrade: upgradePreview
}));

describe("billing plan-change management composition", () => {
  beforeEach(() => {
    factory.mockReturnValue(service);
    service.getStatus.mockResolvedValue({ pending_change: null });
    service.preview.mockResolvedValue("quote_result");
    service.schedule.mockResolvedValue("scheduled_result");
    service.cancel.mockResolvedValue("cancelled_result");
  });

  function fixture(stripeConfigured: boolean, rows: Record<string, unknown>[] = []) {
    const query = vi.fn().mockResolvedValue({ rows });
    const provider = { client: {} };
    const { billingManagement } = createBillingManagement({
      db: { query },
      billingStore: {} as never,
      billingSyncStore: {} as never,
      billingLinks: {} as never,
      ...(stripeConfigured ? { stripeConfig: provider as never } : {})
    });
    return { billingManagement, query, provider };
  }

  it.each([
    { configured: false, rows: [] },
    { configured: true, rows: [] },
    { configured: true, rows: [{ plan: "team", stripe_subscription_id: "sub_test" }] },
    { configured: true, rows: [{ plan: "team", stripe_customer_id: "cus_test" }] }
  ])(
    "fails closed before delegating when subscription ownership is incomplete: %j",
    async ({ configured, rows }) => {
      const { billingManagement: billing } = fixture(configured, rows);
      const input = { organization_id: "org_test" };
      expect(await billing.getPlanChange!(input)).toBe("no_active_subscription");
      expect(await billing.previewPlanChange!(input)).toBe("no_active_subscription");
      expect(
        await billing.schedulePlanChange!({ ...input, confirmation_token: "signed_quote" })
      ).toBe("no_active_subscription");
      expect(await billing.cancelPlanChange!({ ...input, schedule_id: "schedule_test" })).toBe(
        "no_active_subscription"
      );
      expect(factory).not.toHaveBeenCalled();
    }
  );

  it("binds all four actions to stored organization ownership and preserves exact confirmations", async () => {
    const {
      billingManagement: billing,
      provider,
      query
    } = fixture(true, [
      {
        plan: "team",
        stripe_customer_id: "cus_test",
        stripe_subscription_id: "sub_test"
      }
    ]);
    const input = { organization_id: "org_test" };
    expect(await billing.getPlanChange!(input)).toEqual({ pending_change: null });
    expect(await billing.previewPlanChange!(input)).toBe("quote_result");
    expect(
      await billing.schedulePlanChange!({ ...input, confirmation_token: "signed_quote" })
    ).toBe("scheduled_result");
    expect(await billing.cancelPlanChange!({ ...input, schedule_id: "schedule_test" })).toBe(
      "cancelled_result"
    );
    expect(factory).toHaveBeenCalledTimes(4);
    expect(factory).toHaveBeenLastCalledWith({
      provider,
      store: operationStore,
      organizationId: "org_test",
      subscriptionId: "sub_test",
      customerId: "cus_test"
    });
    expect(query.mock.calls.every((call) => JSON.stringify(call[1]) === '["org_test"]')).toBe(true);
    expect(service.schedule).toHaveBeenCalledWith("signed_quote");
    expect(service.cancel).toHaveBeenCalledWith("schedule_test");
  });

  it.each([
    { configured: false, rows: [], expected: "billing_service_error" },
    { configured: true, rows: [], expected: "checkout_not_allowed" },
    {
      configured: true,
      rows: [{ plan: "solo", stripe_subscription_id: "sub_test" }],
      expected: "checkout_not_allowed"
    },
    {
      configured: true,
      rows: [{ plan: "solo", stripe_customer_id: "cus_test" }],
      expected: "checkout_not_allowed"
    }
  ])(
    "does not preview an upgrade without complete provider ownership: %j",
    async ({ configured, rows, expected }) => {
      const { billingManagement: billing } = fixture(configured, rows);
      expect(await billing.previewUpgrade!({ organization_id: "org_test" })).toBe(expected);
      expect(upgradePreview).not.toHaveBeenCalled();
    }
  );

  it("previews an upgrade against the persisted subscription and shared operation store", async () => {
    upgradePreview.mockResolvedValue("validated_quote");
    const { billingManagement: billing, provider } = fixture(true, [
      {
        plan: "solo",
        stripe_customer_id: "cus_test",
        stripe_subscription_id: "sub_test"
      }
    ]);
    expect(await billing.previewUpgrade!({ organization_id: "org_test" })).toBe("validated_quote");
    expect(upgradePreview).toHaveBeenCalledWith({
      provider,
      store: operationStore,
      organizationId: "org_test",
      subscriptionId: "sub_test",
      customerId: "cus_test"
    });
  });
});
