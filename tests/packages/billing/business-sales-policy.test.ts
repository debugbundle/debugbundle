import { expect, it } from "vitest";
import {
  businessSalesReady,
  canStartBusinessSale
} from "../../../packages/billing/src/business-sales-policy.js";
it("requires explicit launch, reporting and configured AI readiness for new Business sales", () => {
  expect(businessSalesReady({ launch: true, reports: true, ai: true })).toBe(true);
  for (const missing of ["launch", "reports", "ai"] as const)
    expect(
      businessSalesReady({ ...{ launch: true, reports: true, ai: true }, [missing]: false })
    ).toBe(false);
});
it("does not disable an existing Business renewal or unrelated tier purchase", () => {
  expect(
    canStartBusinessSale({ enabled: false, current_plan: "business", target_plan: "business" })
  ).toBe(true);
  expect(canStartBusinessSale({ enabled: false, current_plan: "team", target_plan: "team" })).toBe(
    true
  );
  expect(canStartBusinessSale({ enabled: false, current_plan: "free", target_plan: "solo" })).toBe(
    true
  );
  expect(
    canStartBusinessSale({ enabled: false, current_plan: "team", target_plan: "business" })
  ).toBe(false);
});
