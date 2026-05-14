import { describe, expect, it, vi } from "vitest";

import { CliAuthStateError } from "../../../apps/cli/src/auth-state.js";
import {
  cancelBillingCapacityReductionCommand,
  cancelBillingCapacityReductionWithAuthCommand,
  getBillingSummaryCommand,
  getBillingSummaryWithAuthCommand,
  increaseBillingCapacityCommand,
  increaseBillingCapacityWithAuthCommand,
  scheduleBillingCapacityReductionCommand,
  scheduleBillingCapacityReductionWithAuthCommand
} from "../../../apps/cli/src/billing-commands.js";
import { BillingApiError } from "../../../packages/billing-client/src/index.js";

const billingFixture = {
  plan: "solo" as const,
  active_projects: 2,
  capacity_units: {
    total: 5,
    included: 3,
    additional_purchased: 2,
    pending_reduction: {
      additional_purchased: 1,
      total: 4,
      effective_at: "2026-04-23T11:56:12.000Z"
    }
  },
  usage_window: {
    starts_at: "2026-03-23T11:56:12.000Z",
    ends_at: "2026-04-23T11:56:12.000Z"
  },
  allowances: {
    monthly_bundle_requests: { used: 20, limit: 1250 },
    monthly_raw_ingested_events: { used: 200, limit: 10000 },
    retained_bundle_cap: { used: 5, limit: 750 },
    monthly_remote_activations: { used: 1, limit: 125 },
    monthly_alert_deliveries: { used: 3, limit: 375 }
  }
};

describe("cli billing commands", () => {
  it("renders billing summaries in human and json modes", async () => {
    const humanResult = await getBillingSummaryCommand(
      {
        bearerToken: "dbundle_mem_x"
      },
      {
        getBillingSummary: vi.fn().mockResolvedValue(billingFixture)
      }
    );
    const jsonResult = await getBillingSummaryCommand(
      {
        bearerToken: "dbundle_mem_x",
        json: true
      },
      {
        getBillingSummary: vi.fn().mockResolvedValue(billingFixture)
      }
    );

    expect(humanResult.exitCode).toBe(0);
    expect(humanResult.output).toContain("Plan: solo");
    expect(humanResult.output).toContain("Projects: 2 active");
    expect(humanResult.output).toContain("Allowance capacity: 5 total units");
    expect(humanResult.output).toContain("Pending reduction: 4 total units");
    expect(JSON.parse(jsonResult.output)).toEqual({ billing: billingFixture });
  });

  it("loads stored auth and forwards billing capacity operations", async () => {
    const readAuthState = vi.fn().mockResolvedValue({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test"
    });
    const httpClient = { request: vi.fn() };
    const createHttpClient = vi.fn().mockReturnValue(httpClient);
    const getBillingSummary = vi.fn().mockResolvedValue(billingFixture);
    const increaseCapacity = vi.fn().mockResolvedValue(billingFixture);
    const scheduleCapacityReduction = vi.fn().mockResolvedValue(billingFixture);
    const cancelCapacityReduction = vi.fn().mockResolvedValue(billingFixture);
    const createApi = vi.fn().mockReturnValue({
      getBillingSummary,
      increaseCapacity,
      scheduleCapacityReduction,
      cancelCapacityReduction
    });

    const getResult = await getBillingSummaryWithAuthCommand(
      { authFilePath: "/tmp/auth.json", json: true },
      { readAuthState, createHttpClient, createApi }
    );
    const increaseResult = await increaseBillingCapacityWithAuthCommand(
      { authFilePath: "/tmp/auth.json", targetAdditionalCapacityUnits: 4 },
      { readAuthState, createHttpClient, createApi }
    );
    const scheduleResult = await scheduleBillingCapacityReductionWithAuthCommand(
      { authFilePath: "/tmp/auth.json", targetAdditionalCapacityUnits: 1 },
      { readAuthState, createHttpClient, createApi }
    );
    const cancelResult = await cancelBillingCapacityReductionWithAuthCommand(
      { authFilePath: "/tmp/auth.json" },
      { readAuthState, createHttpClient, createApi }
    );

    expect(createHttpClient).toHaveBeenCalledWith({
      baseUrl: "https://selfhost.debugbundle.test"
    });
    expect(getBillingSummary).toHaveBeenCalledWith({ bearerToken: "dbundle_mem_saved" });
    expect(increaseCapacity).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved",
      targetAdditionalCapacityUnits: 4
    });
    expect(scheduleCapacityReduction).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved",
      targetAdditionalCapacityUnits: 1
    });
    expect(cancelCapacityReduction).toHaveBeenCalledWith({ bearerToken: "dbundle_mem_saved" });
    expect(getResult.exitCode).toBe(0);
    expect(increaseResult.exitCode).toBe(0);
    expect(scheduleResult.exitCode).toBe(0);
    expect(cancelResult.exitCode).toBe(0);
  });

  it("maps auth and billing api failures to deterministic exit codes", async () => {
    const authFailure = await getBillingSummaryWithAuthCommand(
      {},
      {
        readAuthState: vi.fn().mockRejectedValue(new CliAuthStateError("auth_state_missing", "Not logged in."))
      }
    );
    const conflictFailure = await increaseBillingCapacityCommand(
      {
        bearerToken: "dbundle_mem_x",
        targetAdditionalCapacityUnits: 4
      },
      {
        increaseCapacity: vi.fn().mockRejectedValue(new BillingApiError(409, "pending_capacity_reduction_exists"))
      }
    );

    expect(authFailure).toEqual({
      exitCode: 2,
      output: "Not logged in."
    });
    expect(conflictFailure.exitCode).toBe(5);
    expect(conflictFailure.output).toContain("pending_capacity_reduction_exists");
  });

  it("renders success output for schedule and cancel commands", async () => {
    const scheduleResult = await scheduleBillingCapacityReductionCommand(
      {
        bearerToken: "dbundle_mem_x",
        targetAdditionalCapacityUnits: 1
      },
      {
        scheduleCapacityReduction: vi.fn().mockResolvedValue(billingFixture)
      }
    );
    const cancelResult = await cancelBillingCapacityReductionCommand(
      {
        bearerToken: "dbundle_mem_x"
      },
      {
        cancelCapacityReduction: vi.fn().mockResolvedValue({
          ...billingFixture,
          capacity_units: {
            ...billingFixture.capacity_units,
            pending_reduction: null
          }
        })
      }
    );

    expect(scheduleResult.output).toContain("Capacity reduction scheduled.");
    expect(cancelResult.output).toContain("Capacity reduction cancelled.");
  });
});