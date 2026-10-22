import { expect, it, vi } from "vitest";
import { parseArgv } from "../../../apps/cli/src/argv-helpers.js";
import {
  handleBillingPlanChange,
  billingPlanChangeCommand
} from "../../../apps/cli/src/billing-plan-change-command.js";
import { BillingApiError } from "../../../packages/billing-client/src/index.js";
it("does not report a successful switch when a durable change is unresolved", async () => {
  const planChange = vi.fn(async () => {
    throw new BillingApiError(409, "billing_change_in_progress");
  });
  expect(
    await billingPlanChangeCommand({ action: "status", bearerToken: "owner" }, { planChange })
  ).toMatchObject({ exitCode: 5, output: expect.stringContaining("billing_change_in_progress") });
});
it("returns the exact pending schedule for later cancellation", async () => {
  const planChange = vi.fn(async () => ({ pending_change: null }));
  expect(
    await billingPlanChangeCommand(
      { action: "cancel", bearerToken: "owner", scheduleId: "sched_test" },
      { planChange }
    )
  ).toMatchObject({ exitCode: 0, output: expect.stringContaining('"pending_change": null') });
  expect(planChange).toHaveBeenCalledExactlyOnceWith({
    action: "cancel",
    bearerToken: "owner",
    scheduleId: "sched_test"
  });
});

const { dispatch } = vi.hoisted(() => ({
  dispatch: vi.fn(async () => ({ pending_change: null }))
}));
vi.mock("../../../apps/cli/src/auth-context.js", () => ({
  createAuthenticatedBillingApi: vi.fn(),
  runAuthenticatedCliCommand: async (
    _options: unknown,
    dependencies: { runCommand: (auth: { bearer_token: string }, api: unknown) => Promise<unknown> }
  ) => dependencies.runCommand({ bearer_token: "dbundle_mem_test" }, { planChange: dispatch })
}));
it.each([
  ["status", [], { action: "status" }],
  ["preview", [], { action: "preview" }],
  [
    "schedule",
    ["--confirmation-token", "signed"],
    { action: "schedule", confirmationToken: "signed" }
  ],
  ["cancel", ["--schedule-id", "sched_test"], { action: "cancel", scheduleId: "sched_test" }]
] as const)(
  "parses %s and dispatches only the authenticated confirmed request",
  async (action, args, expected) => {
    const result = await handleBillingPlanChange(
      parseArgv(["billing", "plan-change", action, ...args, "--json"])
    );
    expect(result.exitCode).toBe(0);
    expect(dispatch).toHaveBeenLastCalledWith({ ...expected, bearerToken: "dbundle_mem_test" });
  }
);
it.each([
  ["schedule"],
  ["cancel"],
  ["unknown"],
  ["status", "extra"],
  ["status", "--schedule-id", "sched_test"]
])("rejects incomplete or ambiguous arguments %j", async (...args) => {
  const before = dispatch.mock.calls.length;
  await expect(
    handleBillingPlanChange(parseArgv(["billing", "plan-change", ...args]))
  ).rejects.toThrow();
  expect(dispatch).toHaveBeenCalledTimes(before);
});
it.each([
  [401, 2],
  [400, 4],
  [403, 5],
  [503, 1]
])("maps provider status %i to actionable exit %i", async (status, exitCode) => {
  expect(
    await billingPlanChangeCommand(
      { action: "status", bearerToken: "owner" },
      { planChange: vi.fn().mockRejectedValue(new BillingApiError(status, "failure")) }
    )
  ).toMatchObject({ exitCode });
});
it.each([new Error("network unavailable"), "unknown"])(
  "never claims success after an unexpected failure",
  async (error) => {
    expect(
      await billingPlanChangeCommand(
        { action: "status", bearerToken: "owner" },
        { planChange: vi.fn().mockRejectedValue(error) }
      )
    ).toMatchObject({ exitCode: 1 });
  }
);
