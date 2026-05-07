import { createAlertApi } from "../../../packages/alert-client/src/index.js";
import { createBillingApi } from "../../../packages/billing-client/src/index.js";
import { createGitHubManagementApi } from "../../../packages/github-client/src/index.js";
import { createProjectManagementApi } from "../../../packages/project-management-client/src/index.js";
import { createRetrievalApi } from "../../../packages/retrieval-client/src/index.js";
import { createTokenManagementApi } from "../../../packages/token-management/src/index.js";
import { createWebhookApi } from "../../../packages/webhook-client/src/index.js";
import { createWeeklyReportApi } from "../../../packages/weekly-report-client/src/index.js";
import { analyzeCommand } from "../../cli/src/analyze-command.js";
import { createCliHttpClient } from "../../cli/src/auth-context.js";
import { readCliAuthState } from "../../cli/src/auth-state.js";
import { createCapturePolicyApi } from "../../cli/src/capture-policy-commands.js";
import { createMemberApi } from "../../cli/src/member-commands.js";
import { createProbeApi } from "../../cli/src/probe-commands.js";
import { doctorCommand } from "../../cli/src/doctor-command.js";
import { smokeCommand } from "../../cli/src/smoke-command.js";
import { validateCommand } from "../../cli/src/validate-command.js";
import { verifyCloudCommand, verifyLocalCommand } from "../../cli/src/verify-command.js";
import { createAlertMcpTools } from "./alert-tools.js";
import { createAnalyzeMcpTools } from "./analyze-tools.js";
import { createBillingMcpTools } from "./billing-tools.js";
import { createCapturePolicyMcpTools } from "./capture-policy-tools.js";
import { createGitHubMcpTools } from "./github-tools.js";
import { createMemberMcpTools } from "./member-tools.js";
import { createProbeMcpTools } from "./probe-tools.js";
import { createProjectMcpTools } from "./project-tools.js";
import { createRetrievalMcpTools } from "./retrieval-tools.js";
import { createServicesMcpTools } from "./services-tools.js";
import { createSetupMcpTools } from "./setup-tools.js";
import { createTokenMcpTools } from "./token-tools.js";
import { createWebhookMcpTools } from "./webhook-tools.js";
import { createWeeklyReportMcpTools } from "./weekly-report-tools.js";

type ToolHandler = (input: Record<string, unknown>) => Promise<unknown>;
type ToolRegistry = Record<string, ToolHandler>;

const DEFAULT_API_BASE_URL = "https://api.debugbundle.com";

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
  const baseUrl = input.apiBaseUrl ?? authState?.base_url ?? process.env["DEBUGBUNDLE_API_URL"] ?? DEFAULT_API_BASE_URL;
  const defaultBearerToken = authState?.bearer_token ?? null;
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
      ...createServicesMcpTools(retrievalApi),
      ...createTokenMcpTools(createTokenManagementApi(httpClient)),
      ...createWebhookMcpTools(createWebhookApi(httpClient)),
      ...createWeeklyReportMcpTools(createWeeklyReportApi(httpClient)),
      ...createAlertMcpTools(createAlertApi(httpClient)),
      ...createProjectMcpTools(createProjectManagementApi(httpClient)),
      ...createCapturePolicyMcpTools(createCapturePolicyApi(httpClient)),
      ...createProbeMcpTools(createProbeApi(httpClient)),
      ...createBillingMcpTools(createBillingApi(httpClient)),
      ...createMemberMcpTools(createMemberApi(httpClient)),
      ...createGitHubMcpTools(createGitHubManagementApi(httpClient))
    },
    defaultBearerToken
  );
}

export type { ToolHandler, ToolRegistry };
