import { createCliHttpClient, runAuthenticatedCliCommand } from "./auth-context.js";
import { readCliAuthState, type CliAuthState } from "./auth-state.js";
import {
  AnalyticsIdentityNamespaceApiError,
  AnalyticsIdentityNamespaceOperationSchema,
  createAnalyticsIdentityNamespaceApi,
  type AnalyticsIdentityNamespaceApiResponse,
  type AnalyticsIdentityNamespaceOperation
} from "./analytics-identity-namespace-api.js";
import type { CliCommandResult } from "./token-commands.js";

type Input = {
  operation: AnalyticsIdentityNamespaceOperation;
  authFilePath?: string;
  json?: boolean;
};
type Dependencies = {
  readAuthState?: (input: { authFilePath?: string }) => Promise<CliAuthState>;
  fetchImpl?: typeof fetch;
};

function format(value: AnalyticsIdentityNamespaceApiResponse): string {
  if ("preview_hash" in value)
    return `action: ${value.action}\nrevision: ${value.expected_revision} -> ${value.resulting_revision}\ncurrent_key_fingerprint: ${value.current_key_fingerprint ?? "none"}\nproposed_key_fingerprint: ${value.proposed_key_fingerprint ?? "none"}\ncontexts_fenced: ${value.contexts_fenced}\npreview_hash: ${value.preview_hash}`;
  if ("namespace" in value)
    return `revision: ${value.namespace.namespace_revision}\nreplayed: ${value.replayed}\nkey_fingerprint: ${value.namespace.key_fingerprint}\nrevoked_at: ${value.namespace.revoked_at ?? "none"}`;
  return `revision: ${value.namespace_revision}\nkey_fingerprint: ${value.key_fingerprint}\nrevoked_at: ${value.revoked_at ?? "none"}`;
}

export function analyticsIdentityNamespaceWithAuthCommand(
  input: Input,
  dependencies?: Dependencies
): Promise<CliCommandResult> {
  const parsed = AnalyticsIdentityNamespaceOperationSchema.safeParse(input.operation);
  if (!parsed.success)
    return Promise.resolve({ exitCode: 4, output: "invalid_analytics_identity_namespace_request" });
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
      return { authState, api: createAnalyticsIdentityNamespaceApi(http) };
    },
    runCommand: async (auth, api) => {
      try {
        const response = await api.execute({
          bearerToken: auth.bearer_token,
          operation: parsed.data
        });
        return { exitCode: 0, output: input.json ? JSON.stringify(response) : format(response) };
      } catch (error) {
        if (!(error instanceof AnalyticsIdentityNamespaceApiError))
          return { exitCode: 1, output: "analytics_identity_namespace_request_failed" };
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
