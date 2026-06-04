import { describe, expect, it, vi } from "vitest";

import { BillingApiError } from "../../../packages/billing-client/src/index.js";
import { BILLING_MCP_TOOL_NAMES, createBillingMcpTools } from "../../../apps/mcp/src/billing-tools.js";

const billingFixture = {
  plan: "solo",
  billing_state: "trialing",
  active_projects: 2,
  capacity_units: {
    total: 5,
    included: 3,
    additional_purchased: 2,
    pending_reduction: null
  },
  usage_window: {
    starts_at: "2026-03-23T00:00:00.000Z",
    ends_at: "2026-04-23T00:00:00.000Z"
  },
  allowances: {
    monthly_bundle_requests: { used: 20, limit: 1250 },
    monthly_raw_ingested_events: { used: 200, limit: 10000 },
    retained_bundle_cap: { used: 5, limit: 750 },
    monthly_remote_activations: { used: 1, limit: 125 },
    monthly_alert_deliveries: { used: 3, limit: 375 },
    monthly_webhook_deliveries: { used: 6, limit: 1250 }
  },
  trial: {
    available: false,
    active: true,
    plan: "solo",
    started_at: "2026-03-23T00:00:00.000Z",
    ends_at: "2026-04-23T00:00:00.000Z",
    used_at: "2026-03-23T00:00:00.000Z",
    converted_at: null,
    expired_at: null,
    days_remaining: 20
  }
};

describe("mcp billing tools", () => {
  it("declares billing tool parity", () => {
    expect(BILLING_MCP_TOOL_NAMES).toEqual([
      "get_billing_summary",
      "start_trial",
      "increase_capacity",
      "schedule_capacity_reduction",
      "cancel_capacity_reduction"
    ]);
  });

  it("returns billing payloads for all operations", async () => {
    const tools = createBillingMcpTools({
      getBillingSummary: vi.fn().mockResolvedValue(billingFixture),
      startTrial: vi.fn().mockResolvedValue(billingFixture),
      increaseCapacity: vi.fn().mockResolvedValue({ ...billingFixture, capacity_units: { ...billingFixture.capacity_units, additional_purchased: 4, total: 7 } }),
      scheduleCapacityReduction: vi.fn().mockResolvedValue(billingFixture),
      cancelCapacityReduction: vi.fn().mockResolvedValue(billingFixture)
    });

    await expect(
      tools.get_billing_summary({ bearerToken: "dbundle_mem_x" })
    ).resolves.toEqual({ billing: billingFixture });

    await expect(
      tools.start_trial({ bearerToken: "dbundle_mem_x", targetPlan: "team" })
    ).resolves.toEqual({ billing: billingFixture });

    await expect(
      tools.increase_capacity({ bearerToken: "dbundle_mem_x", targetAdditionalCapacityUnits: 4 })
    ).resolves.toEqual({
      billing: { ...billingFixture, capacity_units: { ...billingFixture.capacity_units, additional_purchased: 4, total: 7 } }
    });

    await expect(
      tools.schedule_capacity_reduction({ bearerToken: "dbundle_mem_x", targetAdditionalCapacityUnits: 1 })
    ).resolves.toEqual({ billing: billingFixture });

    await expect(
      tools.cancel_capacity_reduction({ bearerToken: "dbundle_mem_x" })
    ).resolves.toEqual({ billing: billingFixture });
  });

  it("maps billing api, invalid input, and unknown errors to mcp tool errors", async () => {
    const tools = createBillingMcpTools({
      getBillingSummary: vi.fn().mockRejectedValue(new BillingApiError(401, "invalid_member_token")),
      startTrial: vi.fn().mockRejectedValue(new BillingApiError(409, "trial_unavailable")),
      increaseCapacity: vi.fn().mockRejectedValue(new BillingApiError(409, "capacity_already_at_target")),
      scheduleCapacityReduction: vi.fn().mockRejectedValue(new Error("boom")),
      cancelCapacityReduction: vi.fn()
    });

    await expect(
      tools.get_billing_summary({ bearerToken: "bad" })
    ).rejects.toThrow("mcp_tool_error:invalid_member_token");

    await expect(
      tools.start_trial({ bearerToken: "dbundle_mem_x", targetPlan: "team" })
    ).rejects.toThrow("mcp_tool_error:trial_unavailable");

    await expect(
      tools.start_trial({ bearerToken: "dbundle_mem_x", targetPlan: "enterprise" })
    ).rejects.toThrow("mcp_tool_error:invalid_arguments");

    await expect(
      tools.increase_capacity({ bearerToken: "dbundle_mem_x", targetAdditionalCapacityUnits: 2 })
    ).rejects.toThrow("mcp_tool_error:capacity_already_at_target");

    await expect(
      tools.schedule_capacity_reduction({ bearerToken: "dbundle_mem_x", targetAdditionalCapacityUnits: 1 })
    ).rejects.toThrow("mcp_tool_error:unknown_error");
  });
});
