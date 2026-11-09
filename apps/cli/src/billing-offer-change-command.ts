import { BillingOfferSelectionSchema } from "../../../packages/shared-types/src/index.js";
import type {
  OfferChangeRequest,
  OfferChangeResponse
} from "../../../packages/billing-client/src/offer-change-client.js";
import { runBillingJsonCommand } from "./billing-command-result.js";
import { createAuthenticatedBillingApi, runAuthenticatedCliCommand } from "./auth-context.js";
import {
  appendCommonAuthOptions,
  CliInputError,
  ensureNoExtraPositionals,
  expectNoUnknownOptions,
  readStringOption,
  requirePositional,
  type ParsedArgv
} from "./argv-helpers.js";
import type { CliCommandResult } from "./token-commands.js";

export async function billingOfferChangeCommand(
  input: OfferChangeRequest,
  api: { offerChange(input: OfferChangeRequest): Promise<OfferChangeResponse> }
): Promise<CliCommandResult> {
  return runBillingJsonCommand(() => api.offerChange(input));
}
export async function handleBillingOfferChange(parsed: ParsedArgv): Promise<CliCommandResult> {
  const action = requirePositional(parsed, 2, "offer-change-action");
  ensureNoExtraPositionals(parsed, 3);
  expectNoUnknownOptions(parsed, [
    "auth-file",
    "json",
    ...(action === "preview"
      ? ["target-plan", "interval"]
      : action === "schedule"
        ? ["confirmation-token"]
        : action === "cancel"
          ? ["schedule-id"]
          : [])
  ]);
  let request: (bearerToken: string) => OfferChangeRequest;
  if (action === "status") request = (bearerToken) => ({ action, bearerToken });
  else if (action === "preview") {
    const selection = BillingOfferSelectionSchema.safeParse({
      target_plan: readStringOption(parsed, "target-plan"),
      interval: readStringOption(parsed, "interval")
    });
    if (!selection.success)
      throw new CliInputError(
        "Preview requires --target-plan solo|team|business and --interval month|year."
      );
    request = (bearerToken) => ({
      action,
      bearerToken,
      targetPlan: selection.data.target_plan,
      interval: selection.data.interval
    });
  } else if (action === "schedule") {
    const confirmationToken = readStringOption(parsed, "confirmation-token");
    if (!confirmationToken || confirmationToken.length > 8192)
      throw new CliInputError("A valid --confirmation-token is required.");
    request = (bearerToken) => ({ action, bearerToken, confirmationToken });
  } else if (action === "cancel") {
    const scheduleId = readStringOption(parsed, "schedule-id");
    if (!scheduleId || scheduleId.length > 255)
      throw new CliInputError("A valid --schedule-id is required.");
    request = (bearerToken) => ({ action, bearerToken, scheduleId });
  } else throw new CliInputError("Unknown billing offer-change command.");
  return runAuthenticatedCliCommand(appendCommonAuthOptions(parsed, {}), {
    createApi: createAuthenticatedBillingApi,
    dependencies: undefined,
    runCommand: (auth, api) => billingOfferChangeCommand(request(auth.bearer_token), api)
  });
}
