import { z } from "zod";
import {
  AnalyticsFlowDefinitionInputSchema,
  AnalyticsFlowKeySchema,
  AnalyticsFlowReportSchema,
  AnalyticsFlowsResponseSchema,
  AnalyticsFlowResponseSchema,
  type AnalyticsFlowDefinitionInput
} from "../../../packages/shared-types/src/index.js";
import { createCliHttpClient, runAuthenticatedCliCommand } from "./auth-context.js";
import { readCliAuthState, type CliAuthState } from "./auth-state.js";
import type { CliCommandResult } from "./token-commands.js";
export type AnalyticsFlowHttpClient = {
  request(input: {
    method: "GET" | "PUT" | "DELETE";
    path: string;
    bearerToken: string;
    body?: unknown;
  }): Promise<{ status: number; body: unknown }>;
};
type Scope = { bearerToken: string; projectId: string };
type Item = Scope & { flowKey: string };
export class AnalyticsFlowApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}
export function createAnalyticsFlowApi(http: AnalyticsFlowHttpClient): AnalyticsFlowApi {
  const path = (input: Scope): string =>
    `/v1/projects/${encodeURIComponent(input.projectId)}/analytics/flows`;
  async function request<T>(
    input: Parameters<AnalyticsFlowHttpClient["request"]>[0],
    schema: z.ZodType<T, z.ZodTypeDef, unknown>
  ): Promise<T> {
    const response = await http.request(input);
    if (response.status !== 200) {
      const error = z.object({ error: z.string() }).safeParse(response.body);
      throw new AnalyticsFlowApiError(
        response.status,
        error.success ? error.data.error : "Flow request failed."
      );
    }
    const parsed = schema.safeParse(response.body);
    if (!parsed.success) throw new AnalyticsFlowApiError(500, "Invalid flow response.");
    return parsed.data;
  }
  return {
    list: (input: Scope) =>
      request(
        { method: "GET", path: path(input), bearerToken: input.bearerToken },
        AnalyticsFlowsResponseSchema
      ),
    save: (input: Scope & { definition: AnalyticsFlowDefinitionInput }) => {
      const definition = AnalyticsFlowDefinitionInputSchema.parse(input.definition);
      return request(
        {
          method: "PUT",
          path: `${path(input)}/${definition.flow_key}`,
          bearerToken: input.bearerToken,
          body: definition
        },
        AnalyticsFlowResponseSchema
      );
    },
    archive: (input: Item) =>
      request(
        {
          method: "DELETE",
          path: `${path(input)}/${encodeURIComponent(AnalyticsFlowKeySchema.parse(input.flowKey))}`,
          bearerToken: input.bearerToken
        },
        z.object({ archived: z.literal(true) })
      ),
    report: (input: Item & { window?: "7d" | "30d" | "90d" }) =>
      request(
        {
          method: "GET",
          path: `${path(input)}/${encodeURIComponent(input.flowKey)}/report?window=${input.window ?? "30d"}`,
          bearerToken: input.bearerToken
        },
        AnalyticsFlowReportSchema
      )
  };
}
export type AnalyticsFlowApi = {
  list(input: Scope): Promise<z.infer<typeof AnalyticsFlowsResponseSchema>>;
  save(
    input: Scope & { definition: AnalyticsFlowDefinitionInput }
  ): Promise<z.infer<typeof AnalyticsFlowResponseSchema>>;
  archive(input: Item): Promise<{ archived: true }>;
  report(
    input: Item & { window?: "7d" | "30d" | "90d" }
  ): Promise<z.infer<typeof AnalyticsFlowReportSchema>>;
};
export type AnalyticsFlowCommandInput = {
  action: "list" | "save" | "archive" | "report";
  projectId: string;
  flowKey?: string;
  definition?: AnalyticsFlowDefinitionInput;
  window?: "7d" | "30d" | "90d";
  authFilePath?: string;
  json?: boolean;
};
export async function analyticsFlowWithAuthCommand(
  input: AnalyticsFlowCommandInput,
  dependencies?: {
    readAuthState?: (input: { authFilePath?: string }) => Promise<CliAuthState>;
    createHttpClient?: (input: { baseUrl: string }) => AnalyticsFlowHttpClient;
  }
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    dependencies,
    async createApi(authInput, deps) {
      const authState = await (deps?.readAuthState ?? readCliAuthState)(authInput);
      return {
        authState,
        api: createAnalyticsFlowApi(
          (deps?.createHttpClient ?? createCliHttpClient)({ baseUrl: authState.base_url })
        )
      };
    },
    async runCommand(auth, api) {
      try {
        const scope = { projectId: input.projectId, bearerToken: auth.bearer_token };
        let result: unknown;
        if (input.action === "list") result = await api.list(scope);
        else if (input.action === "save")
          result = await api.save({
            ...scope,
            definition: AnalyticsFlowDefinitionInputSchema.parse(input.definition)
          });
        else {
          const item = { ...scope, flowKey: AnalyticsFlowKeySchema.parse(input.flowKey) };
          result =
            input.action === "archive"
              ? await api.archive(item)
              : await api.report({
                  ...item,
                  ...(input.window === undefined ? {} : { window: input.window })
                });
        }
        return { exitCode: 0, output: JSON.stringify(result, null, input.json ? undefined : 2) };
      } catch (error) {
        return {
          exitCode:
            error instanceof AnalyticsFlowApiError
              ? error.status === 401
                ? 2
                : error.status === 404
                  ? 3
                  : [400, 403, 409].includes(error.status)
                    ? 4
                    : 1
              : 1,
          output: error instanceof Error ? error.message : "Flow request failed."
        };
      }
    }
  });
}
