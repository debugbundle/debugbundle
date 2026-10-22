import { BillingApiError } from "../../../packages/billing-client/src/index.js";
import type {
  PlanChangeRequest,
  PlanChangeResponse
} from "../../../packages/billing-client/src/plan-change-client.js";
import { createAuthenticatedBillingApi, runAuthenticatedCliCommand } from "./auth-context.js";
import type { CliCommandResult } from "./token-commands.js";
import {
  appendCommonAuthOptions,
  CliInputError,
  ensureNoExtraPositionals,
  expectNoUnknownOptions,
  readStringOption,
  requirePositional,
  type ParsedArgv
} from "./argv-helpers.js";

export async function billingPlanChangeCommand(
  input: PlanChangeRequest,
  api: { planChange(input: PlanChangeRequest): Promise<PlanChangeResponse> }
): Promise<CliCommandResult> {
  try {
    return { exitCode: 0, output: JSON.stringify(await api.planChange(input), null, 2) };
  } catch (error) {
    return {
      exitCode:
        error instanceof BillingApiError
          ? error.status === 401
            ? 2
            : error.status === 400
              ? 4
              : error.status === 409 || error.status === 403
                ? 5
                : 1
          : 1,
      output: error instanceof Error ? error.message : "billing_service_error"
    };
  }
}
export async function handleBillingPlanChange(parsed: ParsedArgv): Promise<CliCommandResult> {
  const action = requirePositional(parsed, 2, "plan-change-action");
  ensureNoExtraPositionals(parsed, 3);
  expectNoUnknownOptions(parsed, [
    "auth-file",
    "json",
    ...(action === "schedule" ? ["confirmation-token"] : action === "cancel" ? ["schedule-id"] : [])
  ]);
  let request: Omit<PlanChangeRequest, "bearerToken">;
  if (action === "status" || action === "preview") request = { action };
  else if (action === "schedule") {
    const confirmationToken = readStringOption(parsed, "confirmation-token");
    if (!confirmationToken)
      throw new CliInputError("Missing required option --confirmation-token.");
    request = { action, confirmationToken } as PlanChangeRequest;
  } else if (action === "cancel") {
    const scheduleId = readStringOption(parsed, "schedule-id");
    if (!scheduleId) throw new CliInputError("Missing required option --schedule-id.");
    request = { action, scheduleId } as PlanChangeRequest;
  } else throw new CliInputError("Unknown billing plan-change command.");
  return runAuthenticatedCliCommand(appendCommonAuthOptions(parsed, {}), {
    createApi: createAuthenticatedBillingApi,
    dependencies: undefined,
    runCommand: (auth, api) =>
      billingPlanChangeCommand(
        { ...request, bearerToken: auth.bearer_token } as PlanChangeRequest,
        api
      )
  });
}
