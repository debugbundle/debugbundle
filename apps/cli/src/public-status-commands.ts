import { z } from "zod";
import {
  PublicStatusManagementSchema,
  PublicStatusOptionsSchema,
  PublicStatusOptionsQuerySchema,
  type PublicStatusOptionsQuery,
  type PublicStatusOptions,
  type PublicStatusManagement,
  type PublicStatusPage,
  PublicStatusPageSchema,
  PublicStatusSettingsSchema,
  type PublicStatusSettings
} from "../../../packages/shared-types/src/public-status.js";
import { createCliHttpClient, runAuthenticatedCliCommand } from "./auth-context.js";
import { readCliAuthState, type CliAuthState } from "./auth-state.js";
import type { CliCommandResult } from "./token-commands.js";
export type PublicStatusHttpClient = {
  request(input: {
    method: "GET" | "PUT";
    path: string;
    bearerToken: string;
    body?: unknown;
  }): Promise<{ status: number; body: unknown }>;
};
type Scope = { bearerToken: string; projectId: string };
export class PublicStatusApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}
export type PublicStatusApi = {
  get(scope: Scope): Promise<PublicStatusManagement>;
  save(scope: Scope & { settings: PublicStatusSettings }): Promise<PublicStatusManagement>;
  options(scope: Scope & PublicStatusOptionsQuery): Promise<PublicStatusOptions>;
  preview(scope: Scope): Promise<PublicStatusPage>;
};
export function createPublicStatusApi(http: PublicStatusHttpClient): PublicStatusApi {
  const path = (scope: Scope): string =>
    `/v1/projects/${encodeURIComponent(z.string().uuid().parse(scope.projectId))}/status-page`;
  async function request<T>(
    input: Parameters<PublicStatusHttpClient["request"]>[0],
    schema: z.ZodType<T, z.ZodTypeDef, unknown>
  ): Promise<T> {
    const result = await http.request(input);
    if (result.status !== 200) {
      const error = z.object({ error: z.string() }).safeParse(result.body);
      throw new PublicStatusApiError(
        result.status,
        error.success ? error.data.error : "Status request failed."
      );
    }
    return schema.parse(result.body);
  }
  return {
    get: (scope: Scope) =>
      request(
        { method: "GET", path: path(scope), bearerToken: scope.bearerToken },
        PublicStatusManagementSchema
      ),
    save: (scope: Scope & { settings: PublicStatusSettings }) =>
      request(
        {
          method: "PUT",
          path: path(scope),
          bearerToken: scope.bearerToken,
          body: PublicStatusSettingsSchema.parse(scope.settings)
        },
        PublicStatusManagementSchema
      ),
    options: (scope: Scope & PublicStatusOptionsQuery) => {
      const query = PublicStatusOptionsQuerySchema.parse({
        ...(scope.cursor ? { cursor: scope.cursor } : {}),
        ...(scope.check_project_id ? { check_project_id: scope.check_project_id } : {}),
        ...(scope.check_cursor ? { check_cursor: scope.check_cursor } : {})
      });
      const params = new URLSearchParams(
        Object.entries(query).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string"
        )
      ).toString();
      return request(
        {
          method: "GET",
          path: `${path(scope)}/options${params ? `?${params}` : ""}`,
          bearerToken: scope.bearerToken
        },
        PublicStatusOptionsSchema
      );
    },
    preview: (scope: Scope) =>
      request(
        { method: "GET", path: `${path(scope)}/preview`, bearerToken: scope.bearerToken },
        PublicStatusPageSchema
      )
  };
}
export type PublicStatusCommandInput = {
  action: "get" | "save" | "options" | "preview";
  projectId: string;
  settings?: PublicStatusSettings;
  cursor?: string;
  check_project_id?: string;
  check_cursor?: string;
  authFilePath?: string;
  json?: boolean;
};
export async function publicStatusWithAuthCommand(
  input: PublicStatusCommandInput,
  dependencies?: {
    readAuthState?: (input: { authFilePath?: string }) => Promise<CliAuthState>;
    createHttpClient?: (input: { baseUrl: string }) => PublicStatusHttpClient;
  }
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    dependencies,
    async createApi(authInput, deps) {
      const authState = await (deps?.readAuthState ?? readCliAuthState)(authInput);
      return {
        authState,
        api: createPublicStatusApi(
          (deps?.createHttpClient ?? createCliHttpClient)({ baseUrl: authState.base_url })
        )
      };
    },
    async runCommand(auth, api) {
      try {
        const scope = { projectId: input.projectId, bearerToken: auth.bearer_token };
        const result =
          input.action === "save"
            ? await api.save({
                ...scope,
                settings: PublicStatusSettingsSchema.parse(input.settings)
              })
            : input.action === "options"
              ? await api.options({
                  ...scope,
                  ...(input.cursor ? { cursor: input.cursor } : {}),
                  ...(input.check_project_id ? { check_project_id: input.check_project_id } : {}),
                  ...(input.check_cursor ? { check_cursor: input.check_cursor } : {})
                })
              : input.action === "preview"
                ? await api.preview(scope)
                : await api.get(scope);
        return { exitCode: 0, output: JSON.stringify(result, null, input.json ? undefined : 2) };
      } catch (error) {
        return {
          exitCode:
            error instanceof PublicStatusApiError
              ? error.status === 401
                ? 2
                : error.status === 404
                  ? 3
                  : [400, 403, 409].includes(error.status)
                    ? 4
                    : 1
              : error instanceof z.ZodError
                ? 4
                : 1,
          output: error instanceof Error ? error.message : "Status request failed."
        };
      }
    }
  });
}
