import { expect, it, vi } from "vitest";
import { BillingApiError } from "../../../packages/billing-client/src/index.js";
import {
  billingOfferChangeCommand,
  handleBillingOfferChange
} from "../../../apps/cli/src/billing-offer-change-command.js";
import { parseArgv } from "../../../apps/cli/src/argv-helpers.js";

const { dispatch } = vi.hoisted(() => ({
  dispatch: vi.fn(async () => ({ pending_change: null }))
}));
vi.mock("../../../apps/cli/src/auth-context.js", () => ({
  createAuthenticatedBillingApi: vi.fn(),
  runAuthenticatedCliCommand: async (
    _options: unknown,
    dependencies: { runCommand: (auth: { bearer_token: string }, api: unknown) => Promise<unknown> }
  ) => dependencies.runCommand({ bearer_token: "owner" }, { offerChange: dispatch })
}));

it("forwards explicit annual offer selection and prints the canonical quote", async () => {
  const offerChange = vi.fn(async () => ({ pending_change: null }));
  const input = {
    action: "preview" as const,
    bearerToken: "owner",
    targetPlan: "business" as const,
    interval: "year" as const
  };
  const result = await billingOfferChangeCommand(input, { offerChange });
  expect(result).toEqual({
    exitCode: 0,
    output: JSON.stringify({ pending_change: null }, null, 2)
  });
  expect(offerChange).toHaveBeenCalledExactlyOnceWith(input);
});
it("preserves the command failure code for an uncertain billing operation", async () => {
  const result = await billingOfferChangeCommand(
    { action: "status", bearerToken: "owner" },
    {
      offerChange: vi.fn().mockRejectedValue(new BillingApiError(409, "billing_change_in_progress"))
    }
  );
  expect(result.exitCode).toBe(5);
  expect(result.output).toContain("billing_change_in_progress");
});
it.each([
  ["status", [], { action: "status" }],
  [
    "preview",
    ["--target-plan", "business", "--interval", "year"],
    { action: "preview", targetPlan: "business", interval: "year" }
  ],
  [
    "schedule",
    ["--confirmation-token", "signed"],
    { action: "schedule", confirmationToken: "signed" }
  ],
  ["cancel", ["--schedule-id", "schedule"], { action: "cancel", scheduleId: "schedule" }]
] as const)("parses authenticated %s offer requests", async (action, args, expected) => {
  expect(
    (await handleBillingOfferChange(parseArgv(["billing", "offer-change", action, ...args])))
      .exitCode
  ).toBe(0);
  expect(dispatch).toHaveBeenLastCalledWith({ ...expected, bearerToken: "owner" });
});
it.each([
  ["preview"],
  ["preview", "--target-plan", "business"],
  ["preview", "--target-plan", "free", "--interval", "year"],
  ["schedule"],
  ["cancel"],
  ["status", "--interval", "year"],
  ["status", "extra"]
])("rejects incomplete or ambiguous billing arguments %j", async (...args) => {
  const before = dispatch.mock.calls.length;
  await expect(
    handleBillingOfferChange(parseArgv(["billing", "offer-change", ...args]))
  ).rejects.toThrow();
  expect(dispatch).toHaveBeenCalledTimes(before);
});
