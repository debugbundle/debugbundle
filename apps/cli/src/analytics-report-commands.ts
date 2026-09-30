import { createCliHttpClient, runAuthenticatedCliCommand } from "./auth-context.js";
import { readCliAuthState, type CliAuthState } from "./auth-state.js";
import {
  AnalyticsReportApiError,
  AnalyticsReportRequestSchema,
  createAnalyticsReportApi,
  type AnalyticsReportRequest
} from "./analytics-report-api.js";
import type { CliCommandResult } from "./token-commands.js";

type Input = { query: AnalyticsReportRequest; authFilePath?: string; json?: boolean };
type Dependencies = {
  readAuthState?: (input: { authFilePath?: string }) => Promise<CliAuthState>;
  fetchImpl?: typeof fetch;
};

export function analyticsReportWithAuthCommand(
  input: Input,
  dependencies?: Dependencies
): Promise<CliCommandResult> {
  const parsed = AnalyticsReportRequestSchema.safeParse(input.query);
  if (!parsed.success)
    return Promise.resolve({ exitCode: 4, output: "invalid_analytics_report_request" });
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
      return { authState, api: createAnalyticsReportApi(http) };
    },
    runCommand: async (auth, api) => {
      try {
        const response = await api.execute({ bearerToken: auth.bearer_token, query: parsed.data });
        if (input.json) return { exitCode: 0, output: JSON.stringify(response) };
        const report = response.report;
        return {
          exitCode: 0,
          output:
            report.status === "unavailable"
              ? `report: unavailable (${report.reason})\nsource_coverage: ${response.evidence.source_coverage}\nfailed_events: ${response.evidence.failed_events}\nexcluded_events: ${response.evidence.excluded_events}\nerasure_tasks: ${response.evidence.erasure_tasks}`
              : `report: ${report.definition_key}\nquality: ${report.quality}\nentered: ${report.population.entered}\ncompleted: ${report.population.completed}\nsource_coverage: ${response.evidence.source_coverage}\nfailed_events: ${response.evidence.failed_events}\nexcluded_events: ${response.evidence.excluded_events}\nerasure_tasks: ${response.evidence.erasure_tasks}`
        };
      } catch (error) {
        if (!(error instanceof AnalyticsReportApiError))
          return { exitCode: 1, output: "analytics_report_request_failed" };
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
