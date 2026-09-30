import { createCliHttpClient, runAuthenticatedCliCommand } from "./auth-context.js";
import { readCliAuthState, type CliAuthState } from "./auth-state.js";
import {
  AnalyticsPlanApiError,
  AnalyticsPlanOperationSchema,
  createAnalyticsPlanApi,
  type AnalyticsPlanApiResponse,
  type AnalyticsPlanOperation
} from "./analytics-plan-api.js";
import type { CliCommandResult } from "./token-commands.js";

type Input = { operation: AnalyticsPlanOperation; authFilePath?: string; json?: boolean };
type Dependencies = {
  readAuthState?: (input: { authFilePath?: string }) => Promise<CliAuthState>;
  fetchImpl?: typeof fetch;
};

function format(value: AnalyticsPlanApiResponse): string {
  if ("valid" in value)
    return value.valid
      ? "Measurement plan is valid."
      : value.issues
          .map(
            (issue) =>
              `${issue.code}${issue.report_index === null ? "" : ` report_index=${issue.report_index}`}`
          )
          .join("\n");
  if ("preview_hash" in value)
    return `preview_hash: ${value.preview_hash}\nrevision: ${value.expected_revision} -> ${value.resulting_revision}\ncatalog_revision: ${value.catalog_revision}\ncapacity: ${value.report_slots_after}/${value.capacity_limit}\nadded: ${value.added_reports.join(", ") || "none"}\nchanged: ${value.changed_reports.join(", ") || "none"}\nremoved: ${value.removed_reports.join(", ") || "none"}\nalready_applied: ${value.already_applied}`;
  const plan = "plan" in value ? value.plan : value;
  return `project_id: ${plan.project_id}\nrevision: ${plan.revision}\ncatalog_revision: ${plan.catalog_revision}\ncatalog_entries: ${plan.catalog.length}\nreports: ${plan.reports.length}${plan.observations === undefined ? "" : `\nobserved_producers: ${plan.observations.length}`}${"replayed" in value ? `\nreplayed: ${value.replayed}` : ""}`;
}

export function analyticsPlanWithAuthCommand(
  input: Input,
  dependencies?: Dependencies
): Promise<CliCommandResult> {
  const parsed = AnalyticsPlanOperationSchema.safeParse(input.operation);
  if (!parsed.success)
    return Promise.resolve({ exitCode: 4, output: "invalid_analytics_plan_request" });
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
      return { authState, api: createAnalyticsPlanApi(http) };
    },
    runCommand: async (auth, api) => {
      try {
        const response = await api.execute({
          bearerToken: auth.bearer_token,
          operation: parsed.data
        });
        return { exitCode: 0, output: input.json ? JSON.stringify(response) : format(response) };
      } catch (error) {
        if (!(error instanceof AnalyticsPlanApiError))
          return { exitCode: 1, output: "analytics_plan_request_failed" };
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
