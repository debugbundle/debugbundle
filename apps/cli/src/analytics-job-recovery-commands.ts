import { createCliHttpClient, runAuthenticatedCliCommand } from "./auth-context.js";
import { readCliAuthState, type CliAuthState } from "./auth-state.js";
import {
  AnalyticsJobRecoveryApiError,
  AnalyticsJobRecoveryInputSchema,
  createAnalyticsJobRecoveryApi,
  type AnalyticsJobRecoveryInput
} from "./analytics-job-recovery-api.js";
import type { CliCommandResult } from "./token-commands.js";

type Input = { retry: AnalyticsJobRecoveryInput; authFilePath?: string; json?: boolean };
type Dependencies = {
  readAuthState?: (input: { authFilePath?: string }) => Promise<CliAuthState>;
  fetchImpl?: typeof fetch;
};

export function analyticsJobRecoveryWithAuthCommand(
  input: Input,
  dependencies?: Dependencies
): Promise<CliCommandResult> {
  const parsed = AnalyticsJobRecoveryInputSchema.safeParse(input.retry);
  if (!parsed.success)
    return Promise.resolve({ exitCode: 4, output: "invalid_analytics_job_recovery_request" });
  return runAuthenticatedCliCommand(input, {
    dependencies,
    createApi: async (authInput, options) => {
      const authState = await (options?.readAuthState ?? readCliAuthState)(
        authInput.authFilePath === undefined ? {} : { authFilePath: authInput.authFilePath }
      );
      const http = createCliHttpClient(
        { baseUrl: authState.base_url },
        options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }
      );
      return { authState, api: createAnalyticsJobRecoveryApi(http) };
    },
    runCommand: async (auth, api) => {
      try {
        const result = await api.retry({ bearerToken: auth.bearer_token, retry: parsed.data });
        return {
          exitCode: 0,
          output: input.json
            ? JSON.stringify(result)
            : `event_id: ${result.event_id}\nstatus: queued`
        };
      } catch (error) {
        if (!(error instanceof AnalyticsJobRecoveryApiError))
          return { exitCode: 1, output: "analytics_job_recovery_request_failed" };
        return {
          exitCode:
            error.status === 401
              ? 2
              : error.status === 404
                ? 3
                : [400, 403, 409].includes(error.status)
                  ? 4
                  : 1,
          output: error.message
        };
      }
    }
  });
}
