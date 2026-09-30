import { createCliHttpClient, runAuthenticatedCliCommand } from "./auth-context.js";
import { readCliAuthState, type CliAuthState } from "./auth-state.js";
import {
  AnalyticsWriterApiError,
  AnalyticsWriterOperationSchema,
  createAnalyticsWriterApi,
  type AnalyticsWriterOperation,
  type AnalyticsWriterApiResponse
} from "./analytics-writer-api.js";
import type { CliCommandResult } from "./token-commands.js";

type Input = { operation: AnalyticsWriterOperation; authFilePath?: string; json?: boolean };
type Dependencies = {
  readAuthState?: (input: { authFilePath?: string }) => Promise<CliAuthState>;
  fetchImpl?: typeof fetch;
};
function format(value: AnalyticsWriterApiResponse): string {
  if ("writers" in value)
    return value.writers.length === 0
      ? `No active analytics writers.\nrevision: ${value.revision}`
      : `revision: ${value.revision}\n${value.writers.map((writer) => `${writer.id} ${writer.kind} ${writer.display_name}`).join("\n")}`;
  if ("preview_hash" in value)
    return `preview_hash: ${value.preview_hash}\naction: ${value.action}\ndisplay_name: ${value.display_name}\nrevision: ${value.expected_revision} -> ${value.resulting_revision}\nremaining_active_capacity: ${value.remaining_active_capacity}\nalready_applied: ${value.already_applied}`;
  const summary = `writer_id: ${value.writer.id}\nrevision: ${value.revision}\ndisposition: ${value.disposition}\nreplayed: ${value.replayed}`;
  return value.disposition === "issued" ? `${summary}\nplaintext: ${value.plaintext}` : summary;
}
export function analyticsWritersWithAuthCommand(
  input: Input,
  dependencies?: Dependencies
): Promise<CliCommandResult> {
  const parsed = AnalyticsWriterOperationSchema.safeParse(input.operation);
  if (!parsed.success)
    return Promise.resolve({ exitCode: 4, output: "invalid_analytics_writer_request" });
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
      return { authState, api: createAnalyticsWriterApi(http) };
    },
    runCommand: async (auth, api) => {
      try {
        const response = await api.execute({
          bearerToken: auth.bearer_token,
          operation: parsed.data
        });
        return { exitCode: 0, output: input.json ? JSON.stringify(response) : format(response) };
      } catch (error) {
        if (!(error instanceof AnalyticsWriterApiError))
          return { exitCode: 1, output: "analytics_writer_request_failed" };
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
