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
  scheduleBillingCapacityReductionWithAuthCommand,
  startBillingTrialCommand,
  startBillingTrialWithAuthCommand
} from "../../../apps/cli/src/billing-commands.js";
import { BillingApiError } from "../../../packages/billing-client/src/index.js";

const billingFixture = {
  plan: "solo" as const,
  billing_state: "trialing" as const,
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
    monthly_alert_deliveries: { used: 3, limit: 375 },
    monthly_webhook_deliveries: { used: 6, limit: 1250 }
  },
  trial: {
    available: false,
    active: true,
    plan: "solo" as const,
    started_at: "2026-03-23T11:56:12.000Z",
    ends_at: "2026-04-23T11:56:12.000Z",
    used_at: "2026-03-23T11:56:12.000Z",
    converted_at: null,
    expired_at: null,
    days_remaining: 20
  }
};

describe("cli billing commands", () => {
  it("renders billing summaries in human and json modes with active trial state", async () => {
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
    expect(humanResult.output).toContain("Billing state: trialing");
    expect(humanResult.output).toContain("Projects: 2 active");
    expect(humanResult.output).toContain("Trial: active solo trial");
    expect(humanResult.output).toContain("Trial remaining: 20 days");
    expect(humanResult.output).toContain("Allowance capacity: 5 total units");
    expect(humanResult.output).toContain("Pending reduction: 4 total units");
    expect(JSON.parse(jsonResult.output)).toEqual({ billing: billingFixture });
  });

  it("preserves trial metadata in json output for expired and eligible free organizations", async () => {
    const expiredTrial = {
      ...billingFixture,
      plan: "free" as const,
      billing_state: "trial_expired" as const,
      trial: {
        ...billingFixture.trial,
        active: false,
        expired_at: "2026-04-23T11:56:12.000Z",
        days_remaining: null
      }
    };
    const eligibleFree = {
      ...billingFixture,
      plan: "free" as const,
      billing_state: null,
      trial: {
        available: true,
        active: false,
        plan: null,
        started_at: null,
        ends_at: null,
        used_at: null,
        converted_at: null,
        expired_at: null,
        days_remaining: null
      }
    };

    const expiredResult = await getBillingSummaryCommand(
      { bearerToken: "dbundle_mem_x", json: true },
      { getBillingSummary: vi.fn().mockResolvedValue(expiredTrial) }
    );
    const eligibleResult = await getBillingSummaryCommand(
      { bearerToken: "dbundle_mem_x", json: true },
      { getBillingSummary: vi.fn().mockResolvedValue(eligibleFree) }
    );

    expect(JSON.parse(expiredResult.output)).toEqual({ billing: expiredTrial });
    expect(JSON.parse(eligibleResult.output)).toEqual({ billing: eligibleFree });
  });

  it("renders inactive trial states in human billing summaries", async () => {
    const summaries = [
      {
        billing: {
          ...billingFixture,
          trial: {
            ...billingFixture.trial,
            active: false,
            converted_at: "2026-04-01T00:00:00.000Z",
            days_remaining: null
          }
        },
        expected: "Trial: converted from solo"
      },
      {
        billing: {
          ...billingFixture,
          plan: "free" as const,
          billing_state: "trial_expired" as const,
          trial: {
            ...billingFixture.trial,
            active: false,
            expired_at: "2026-04-23T11:56:12.000Z",
            days_remaining: null
          }
        },
        expected: "Trial: expired solo"
      },
      {
        billing: {
          ...billingFixture,
          trial: {
            ...billingFixture.trial,
            active: false,
            converted_at: null,
            expired_at: null,
            days_remaining: null
          }
        },
        expected: "Trial: used solo"
      },
      {
        billing: {
          ...billingFixture,
          trial: {
            available: false,
            active: false,
            plan: null,
            started_at: null,
            ends_at: null,
            used_at: null,
            converted_at: null,
            expired_at: null,
            days_remaining: null
          }
        },
        expected: "Trial: unavailable"
      }
    ];

    for (const summary of summaries) {
      const result = await getBillingSummaryCommand(
        { bearerToken: "dbundle_mem_x" },
        { getBillingSummary: vi.fn().mockResolvedValue(summary.billing) }
      );

      expect(result.output).toContain(summary.expected);
    }
  });

  it("loads stored auth and forwards billing trial and capacity operations", async () => {
    const readAuthState = vi.fn().mockResolvedValue({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test"
    });
    const httpClient = { request: vi.fn() };
    const createHttpClient = vi.fn().mockReturnValue(httpClient);
    const getBillingSummary = vi.fn().mockResolvedValue(billingFixture);
    const startTrial = vi.fn().mockResolvedValue(billingFixture);
    const increaseCapacity = vi.fn().mockResolvedValue(billingFixture);
    const scheduleCapacityReduction = vi.fn().mockResolvedValue(billingFixture);
    const cancelCapacityReduction = vi.fn().mockResolvedValue(billingFixture);
    const createApi = vi.fn().mockReturnValue({
      getBillingSummary,
      startTrial,
      increaseCapacity,
      scheduleCapacityReduction,
      cancelCapacityReduction
    });

    const getResult = await getBillingSummaryWithAuthCommand(
      { authFilePath: "/tmp/auth.json", json: true },
      { readAuthState, createHttpClient, createApi }
    );
    const trialResult = await startBillingTrialWithAuthCommand(
      { authFilePath: "/tmp/auth.json", targetPlan: "team" },
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
    expect(startTrial).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved",
      targetPlan: "team"
    });
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
    expect(trialResult.exitCode).toBe(0);
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

  it("starts trials and renders trial conversion guidance for blocked capacity changes", async () => {
    const startResult = await startBillingTrialCommand(
      {
        bearerToken: "dbundle_mem_x",
        targetPlan: "solo"
      },
      {
        startTrial: vi.fn().mockResolvedValue(billingFixture)
      }
    );
    const blockedCapacityResult = await increaseBillingCapacityCommand(
      {
        bearerToken: "dbundle_mem_x",
        targetAdditionalCapacityUnits: 4
      },
      {
        increaseCapacity: vi.fn().mockRejectedValue(new BillingApiError(409, "trial_conversion_required"))
      }
    );

    expect(startResult.output).toContain("Trial started.");
    expect(blockedCapacityResult.exitCode).toBe(5);
    expect(blockedCapacityResult.output).toContain("trial_conversion_required");
    expect(blockedCapacityResult.output).toContain("billing page");
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

  it("returns json for successful trial and capacity mutations", async () => {
    const startResult = await startBillingTrialCommand(
      {
        bearerToken: "dbundle_mem_x",
        targetPlan: "solo",
        json: true
      },
      {
        startTrial: vi.fn().mockResolvedValue(billingFixture)
      }
    );
    const increaseResult = await increaseBillingCapacityCommand(
      {
        bearerToken: "dbundle_mem_x",
        targetAdditionalCapacityUnits: 4,
        json: true
      },
      {
        increaseCapacity: vi.fn().mockResolvedValue(billingFixture)
      }
    );
    const scheduleResult = await scheduleBillingCapacityReductionCommand(
      {
        bearerToken: "dbundle_mem_x",
        targetAdditionalCapacityUnits: 1,
        json: true
      },
      {
        scheduleCapacityReduction: vi.fn().mockResolvedValue(billingFixture)
      }
    );
    const cancelResult = await cancelBillingCapacityReductionCommand(
      {
        bearerToken: "dbundle_mem_x",
        json: true
      },
      {
        cancelCapacityReduction: vi.fn().mockResolvedValue(billingFixture)
      }
    );

    expect(JSON.parse(startResult.output)).toEqual({ billing: billingFixture });
    expect(JSON.parse(increaseResult.output)).toEqual({ billing: billingFixture });
    expect(JSON.parse(scheduleResult.output)).toEqual({ billing: billingFixture });
    expect(JSON.parse(cancelResult.output)).toEqual({ billing: billingFixture });
  });

  it("maps billing api status codes and unknown failures", async () => {
    const cases = [
      { error: new BillingApiError(401, "unauthorized"), exitCode: 2 },
      { error: new BillingApiError(404, "billing_not_found"), exitCode: 3 },
      { error: new BillingApiError(400, "invalid_request"), exitCode: 4 },
      { error: new Error("network down"), exitCode: 1 }
    ];

    for (const testCase of cases) {
      const result = await getBillingSummaryCommand(
        { bearerToken: "dbundle_mem_x" },
        { getBillingSummary: vi.fn().mockRejectedValue(testCase.error) }
      );

      expect(result.exitCode).toBe(testCase.exitCode);
    }
  });
});
