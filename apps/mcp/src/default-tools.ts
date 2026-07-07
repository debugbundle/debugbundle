import { createAlertApi } from "../../../packages/alert-client/src/index.js";
import { createBillingApi } from "../../../packages/billing-client/src/index.js";
import { createGitHubManagementApi } from "../../../packages/github-client/src/index.js";
import { createProjectManagementApi } from "../../../packages/project-management-client/src/index.js";
import { createRetrievalApi } from "../../../packages/retrieval-client/src/index.js";
import { createSlackApi } from "../../../packages/slack-client/src/index.js";
import { createTokenManagementApi } from "../../../packages/token-management/src/index.js";
import { createWebhookApi } from "../../../packages/webhook-client/src/index.js";
import { createWeeklyReportApi } from "../../../packages/weekly-report-client/src/index.js";
import { analyzeCommand } from "../../cli/src/analyze-command.js";
import { createCliHttpClient } from "../../cli/src/auth-context.js";
import { readCliAuthState } from "../../cli/src/auth-state.js";
import { createAnalyticsMetricsApi } from "../../cli/src/analytics-metrics-commands.js";
import { createAnalyticsSettingsApi } from "../../cli/src/analytics-settings-commands.js";
import { createCaptureRuleApi } from "../../cli/src/capture-rule-commands.js";
import { createCapturePolicyApi } from "../../cli/src/capture-policy-commands.js";
import { createImprovementSettingsApi } from "../../cli/src/improvement-settings-commands.js";
import { createMemberApi } from "../../cli/src/member-commands.js";
import { createProbeApi } from "../../cli/src/probe-commands.js";
import { createHealthCheckApi } from "../../cli/src/health-check-commands.js";
import { doctorCommand } from "../../cli/src/doctor-command.js";
import { smokeCommand } from "../../cli/src/smoke-command.js";
import { validateCommand } from "../../cli/src/validate-command.js";
import { verifyCloudCommand, verifyLocalCommand } from "../../cli/src/verify-command.js";
import { createAlertMcpTools } from "./alert-tools.js";
import { createAnalyzeMcpTools } from "./analyze-tools.js";
import { createAnalyticsMetricsMcpTools } from "./analytics-metrics-tools.js";
import { createAnalyticsSettingsMcpTools } from "./analytics-settings-tools.js";
import { createBillingMcpTools } from "./billing-tools.js";
import { createCaptureRuleMcpTools } from "./capture-rule-tools.js";
import { createCapturePolicyMcpTools } from "./capture-policy-tools.js";
import { createGitHubMcpTools } from "./github-tools.js";
import { createImprovementMcpTools } from "./improvement-tools.js";
import { createImprovementSettingsMcpTools } from "./improvement-settings-tools.js";
import { createMemberMcpTools } from "./member-tools.js";
import { createProbeMcpTools } from "./probe-tools.js";
import { createHealthCheckMcpTools } from "./health-check-tools.js";
import { createProjectMcpTools } from "./project-tools.js";
import { createRetrievalMcpTools } from "./retrieval-tools.js";
import { createServicesMcpTools } from "./services-tools.js";
import { createSetupMcpTools } from "./setup-tools.js";
import { createSlackMcpTools } from "./slack-tools.js";
import { createTokenMcpTools } from "./token-tools.js";
import { createWebhookMcpTools } from "./webhook-tools.js";
import { createWeeklyReportMcpTools } from "./weekly-report-tools.js";

type ToolHandler = (input: Record<string, unknown>) => Promise<unknown>;
type ToolRegistry = Record<string, ToolHandler>;

const DEFAULT_API_BASE_URL = "https://api.debugbundle.com";
const MEMBER_TOKEN_ENV_VAR = "DEBUGBUNDLE_MEMBER_TOKEN";

function readEnvMemberToken(): string | null {
  const rawToken = process.env[MEMBER_TOKEN_ENV_VAR];
  if (typeof rawToken !== "string") {
    return null;
  }

  const token = rawToken.trim();
  return token.length > 0 ? token : null;
}

async function readLocalAuthState(): Promise<{ bearer_token: string; base_url: string } | null> {
  try {
    return await readCliAuthState({});
  } catch {
    return null;
  }
}

function withDefaultBearerToken(tools: ToolRegistry, bearerToken: string | null): ToolRegistry {
  return Object.fromEntries(
    Object.entries(tools).map(([name, handler]) => [
      name,
      async (input: Record<string, unknown>) =>
        handler({
          ...(bearerToken === null || typeof input["bearerToken"] === "string" ? {} : { bearerToken }),
          ...input
        })
    ])
  );
}

export async function createDefaultMcpTools(input: { apiBaseUrl?: string } = {}): Promise<ToolRegistry> {
  const authState = await readLocalAuthState();
  const baseUrl = input.apiBaseUrl ?? process.env["DEBUGBUNDLE_API_URL"] ?? authState?.base_url ?? DEFAULT_API_BASE_URL;
  const defaultBearerToken = readEnvMemberToken() ?? authState?.bearer_token ?? null;
  const httpClient = createCliHttpClient({ baseUrl });
  const retrievalApi = createRetrievalApi(httpClient);

  return withDefaultBearerToken(
    {
      ...createSetupMcpTools({
        doctorCommand,
        validateCommand,
        verifyLocalCommand,
        verifyCloudCommand,
        smokeCommand
      }),
      ...createAnalyzeMcpTools({
        analyzeCommand
      }),
      ...createRetrievalMcpTools({
        ...retrievalApi,
        getLogs: (requestInput) => retrievalApi.listLogs(requestInput)
      }),
      ...createImprovementMcpTools(retrievalApi),
      ...createServicesMcpTools(retrievalApi),
      ...createTokenMcpTools(createTokenManagementApi(httpClient)),
      ...createWebhookMcpTools(createWebhookApi(httpClient)),
      ...createSlackMcpTools(createSlackApi(httpClient)),
      ...createWeeklyReportMcpTools(createWeeklyReportApi(httpClient)),
      ...createAlertMcpTools(createAlertApi(httpClient)),
      ...createProjectMcpTools(createProjectManagementApi(httpClient)),
      ...createAnalyticsMetricsMcpTools(createAnalyticsMetricsApi(httpClient)),
      ...createAnalyticsSettingsMcpTools(createAnalyticsSettingsApi(httpClient)),
      ...createCaptureRuleMcpTools(createCaptureRuleApi(httpClient)),
      ...createCapturePolicyMcpTools(createCapturePolicyApi(httpClient)),
      ...createImprovementSettingsMcpTools(createImprovementSettingsApi(httpClient)),
      ...createProbeMcpTools(createProbeApi(httpClient)),
      ...createHealthCheckMcpTools(createHealthCheckApi(httpClient)),
      ...createBillingMcpTools(createBillingApi(httpClient)),
      ...createMemberMcpTools(createMemberApi(httpClient)),
      ...createGitHubMcpTools(createGitHubManagementApi(httpClient))
    },
    defaultBearerToken
  );
}

export type { ToolHandler, ToolRegistry };
