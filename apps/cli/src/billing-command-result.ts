import { BillingApiError } from "../../../packages/billing-client/src/index.js";
import type { CliCommandResult } from "./token-commands.js";

/** Both billing change contracts retain the established JSON and exit codes. */
export async function runBillingJsonCommand(
  run: () => Promise<unknown>
): Promise<CliCommandResult> {
  try {
    return { exitCode: 0, output: JSON.stringify(await run(), null, 2) };
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
