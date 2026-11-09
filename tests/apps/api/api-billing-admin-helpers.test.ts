import { expect, it, vi } from "vitest";
import { ensureBillingAdminDefaultPlan } from "../../../apps/api/src/billing-admin-helpers.js";
import { createBillingSummary } from "../web/web-test-helpers.js";

it("preserves an explicit Free override when an operator refreshes their session", async () => {
  const billing = createBillingSummary({ plan: "free", billing_state: "admin_override" });
  const overrideOrganizationBilling = vi.fn();
  const result = await ensureBillingAdminDefaultPlan({
    organization_id: "org_123",
    email: "operator@example.test",
    now: "2026-11-08T00:00:00.000Z",
    dependencies: {
      billingAdmin: { isOperatorAllowed: () => true, overrideOrganizationBilling },
      billingManagement: {
        getBillingSummaryForOrganization: vi.fn().mockResolvedValue(billing),
        createCheckoutLink: vi.fn().mockResolvedValue("billing_not_configured"),
        createPortalLink: vi.fn().mockResolvedValue(null)
      }
    }
  });
  expect(result).toEqual({ billing, default_applied: false });
  expect(overrideOrganizationBilling).not.toHaveBeenCalled();
});
