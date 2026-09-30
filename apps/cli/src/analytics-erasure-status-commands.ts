import { createCliHttpClient, runAuthenticatedCliCommand } from "./auth-context.js";
import { readCliAuthState, type CliAuthState } from "./auth-state.js";
import {
  AnalyticsErasureStatusApiError,
  AnalyticsErasureStatusInputSchema,
  createAnalyticsErasureStatusApi,
  type AnalyticsErasureStatusInput
} from "./analytics-erasure-status-api.js";
import type { CliCommandResult } from "./token-commands.js";

type Input = { query: AnalyticsErasureStatusInput; authFilePath?: string; json?: boolean };
type Dependencies = {
  readAuthState?: (input: { authFilePath?: string }) => Promise<CliAuthState>;
  fetchImpl?: typeof fetch;
};

export function analyticsErasureStatusWithAuthCommand(
  input: Input,
  dependencies?: Dependencies
): Promise<CliCommandResult> {
  const parsed = AnalyticsErasureStatusInputSchema.safeParse(input.query);
  if (!parsed.success)
    return Promise.resolve({ exitCode: 4, output: "invalid_analytics_erasure_status_request" });
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
      return { authState, api: createAnalyticsErasureStatusApi(http) };
    },
    runCommand: async (auth, api) => {
      try {
        const task = await api.read({ bearerToken: auth.bearer_token, query: parsed.data });
        return {
          exitCode: 0,
          output: input.json
            ? JSON.stringify(task)
            : `task_id: ${task.task_id}\nstatus: ${task.status}\ncutoff_at: ${task.cutoff_at}\ncompleted_at: ${task.completed_at ?? "pending"}`
        };
      } catch (error) {
        if (!(error instanceof AnalyticsErasureStatusApiError))
          return { exitCode: 1, output: "analytics_erasure_status_request_failed" };
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
