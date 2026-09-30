import { createCliHttpClient, runAuthenticatedCliCommand } from "./auth-context.js";
import { readCliAuthState, type CliAuthState } from "./auth-state.js";
import {
  AnalyticsSpacePlanApiError,
  AnalyticsSpacePlanOperationSchema,
  createAnalyticsSpacePlanApi,
  type AnalyticsSpacePlanApiResponse,
  type AnalyticsSpacePlanOperation
} from "./analytics-space-plan-api.js";
import type { CliCommandResult } from "./token-commands.js";

type Input = { operation: AnalyticsSpacePlanOperation; authFilePath?: string; json?: boolean };
type Dependencies = {
  readAuthState?: (input: { authFilePath?: string }) => Promise<CliAuthState>;
  fetchImpl?: typeof fetch;
};

function format(value: AnalyticsSpacePlanApiResponse): string {
  if ("valid" in value)
    return value.valid
      ? "Space measurement plan is valid."
      : value.issues.map((issue) => issue.code).join("\n");
  if ("preview_hash" in value)
    return `preview_hash: ${value.preview_hash}\nrevision: ${value.expected_revision} -> ${value.resulting_revision}\nspace_revision: ${value.space_revision}\nsource_catalogs: ${value.source_catalog_revisions.length}\nalready_applied: ${value.already_applied}`;
  const plan = "plan" in value ? value.plan : value;
  return `space_id: ${plan.space_id}\nrevision: ${plan.revision}\nspace_revision: ${plan.space_revision}\nsource_catalogs: ${plan.source_catalog_revisions.length}\ncatalog_entries: ${plan.catalog.length}\nreports: ${plan.reports.length}${"replayed" in value ? `\nreplayed: ${value.replayed}` : ""}`;
}

export function analyticsSpacePlanWithAuthCommand(
  input: Input,
  dependencies?: Dependencies
): Promise<CliCommandResult> {
  const parsed = AnalyticsSpacePlanOperationSchema.safeParse(input.operation);
  if (!parsed.success)
    return Promise.resolve({ exitCode: 4, output: "invalid_analytics_space_plan_request" });
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
      return { authState, api: createAnalyticsSpacePlanApi(http) };
    },
    runCommand: async (auth, api) => {
      try {
        const response = await api.execute({
          bearerToken: auth.bearer_token,
          operation: parsed.data
        });
        return { exitCode: 0, output: input.json ? JSON.stringify(response) : format(response) };
      } catch (error) {
        if (!(error instanceof AnalyticsSpacePlanApiError))
          return { exitCode: 1, output: "analytics_space_plan_request_failed" };
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
