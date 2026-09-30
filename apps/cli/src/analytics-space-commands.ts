import { createCliHttpClient, runAuthenticatedCliCommand } from "./auth-context.js";
import { readCliAuthState, type CliAuthState } from "./auth-state.js";
import {
  AnalyticsSpaceApiError,
  AnalyticsSpaceOperationSchema,
  createAnalyticsSpaceApi,
  type AnalyticsSpaceOperation,
  type AnalyticsSpaceApiResponse
} from "./analytics-space-api.js";
import type { CliCommandResult } from "./token-commands.js";

type Input = { operation: AnalyticsSpaceOperation; authFilePath?: string; json?: boolean };
type Dependencies = {
  readAuthState?: (input: { authFilePath?: string }) => Promise<CliAuthState>;
  fetchImpl?: typeof fetch;
};
function format(value: AnalyticsSpaceApiResponse): string {
  if ("spaces" in value)
    return value.spaces.length === 0
      ? "No analytics spaces."
      : value.spaces
          .map(
            (space) =>
              `${space.id} ${space.display_name} (revision ${space.revision}, ${space.project_ids.length} projects)`
          )
          .join("\n");
  if ("space" in value)
    return `space_id: ${value.space.id}\nrevision: ${value.space.revision}\narchived: ${value.space.archived}\nreplayed: ${value.replayed}`;
  return `preview_hash: ${value.preview_hash}\ndisplay_name: ${value.display_name}\nmode: ${value.mode}\nrevision: ${value.expected_revision} -> ${value.resulting_revision}\nprojects_added: ${value.added_project_ids.length}\nprojects_removed: ${value.removed_project_ids.length}\nalready_applied: ${value.already_applied}`;
}
export function analyticsSpacesWithAuthCommand(
  input: Input,
  dependencies?: Dependencies
): Promise<CliCommandResult> {
  const parsed = AnalyticsSpaceOperationSchema.safeParse(input.operation);
  if (!parsed.success)
    return Promise.resolve({ exitCode: 4, output: "invalid_analytics_space_request" });
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
      return { authState, api: createAnalyticsSpaceApi(http) };
    },
    runCommand: async (auth, api) => {
      try {
        const response = await api.execute({
          bearerToken: auth.bearer_token,
          operation: parsed.data
        });
        return { exitCode: 0, output: input.json ? JSON.stringify(response) : format(response) };
      } catch (error) {
        if (!(error instanceof AnalyticsSpaceApiError))
          return { exitCode: 1, output: "analytics_space_request_failed" };
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
