import { describe, expect, it } from "vitest";

import {
  AnalyticsSavedFunnelCreateSchema,
  AnalyticsSavedFunnelUpdateSchema
} from "../../../packages/shared-types/src/index.js";

describe("analytics saved funnel shared types", () => {
  it("validates a bounded ordered funnel definition", () => {
    expect(
      AnalyticsSavedFunnelCreateSchema.parse({
        funnel_key: "checkout",
        display_name: "Checkout",
        steps: [
          { step_key: "cart", display_name: "Cart" },
          { step_key: "payment", display_name: "Payment" }
        ]
      })
    ).toEqual({
      funnel_key: "checkout",
      display_name: "Checkout",
      steps: [
        { step_key: "cart", display_name: "Cart" },
        { step_key: "payment", display_name: "Payment" }
      ]
    });
  });

  it("rejects duplicate, malformed, and underspecified steps", () => {
    expect(
      AnalyticsSavedFunnelCreateSchema.safeParse({
        funnel_key: "checkout",
        display_name: "Checkout",
        steps: [
          { step_key: "payment", display_name: "Payment" },
          { step_key: "payment", display_name: "Confirmation" }
        ]
      }).success
    ).toBe(false);
    expect(
      AnalyticsSavedFunnelCreateSchema.safeParse({
        funnel_key: "checkout with spaces",
        display_name: "Checkout",
        steps: [{ step_key: "cart", display_name: "Cart" }]
      }).success
    ).toBe(false);
  });

  it("requires saved funnel updates to change a mutable field", () => {
    expect(AnalyticsSavedFunnelUpdateSchema.safeParse({}).success).toBe(false);
    expect(AnalyticsSavedFunnelUpdateSchema.parse({ display_name: "Primary checkout" })).toEqual({
      display_name: "Primary checkout"
    });
  });
});
