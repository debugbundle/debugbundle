import {
  CaptureRuleCreateSchema,
  CaptureRuleResponseSchema,
  CaptureRuleSuggestionsResponseSchema,
  CaptureRulesResponseSchema,
  CaptureRuleUpdateSchema,
  CreateCaptureRuleFromSuggestionSchema,
  type CaptureRule,
  type CaptureRuleCreate,
  type CaptureRuleResponse,
  type CaptureRuleSuggestionsResponse,
  type CaptureRulesResponse,
  type CaptureRuleUpdate,
  type CreateCaptureRuleFromSuggestion
} from "../../../packages/shared-types/src/index.js";
import { createCliHttpClient, runAuthenticatedCliCommand } from "./auth-context.js";
import { readCliAuthState } from "./auth-state.js";
import type { CliAuthState } from "./auth-state.js";
import type { CliCommandResult } from "./token-commands.js";

type CaptureRuleHttpRequest = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  bearerToken: string;
  body?: unknown;
};

type CaptureRuleHttpResponse = {
  status: number;
  body: unknown;
};

export class CaptureRuleApiError extends Error {
  public readonly status: number;

  public constructor(status: number, message: string) {
    super(message);
    this.name = "CaptureRuleApiError";
    this.status = status;
  }
}

function toApiError(status: number, body: unknown, fallback: string): CaptureRuleApiError {
  if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "string") {
    return new CaptureRuleApiError(status, body.error);
  }

  return new CaptureRuleApiError(status, fallback);
}

export function createCaptureRuleApi(httpClient: {
  request(request: CaptureRuleHttpRequest): Promise<CaptureRuleHttpResponse>;
}): {
  listCaptureRules(input: { bearerToken: string; projectId: string }): Promise<CaptureRulesResponse>;
  createCaptureRule(input: { bearerToken: string; projectId: string; create: CaptureRuleCreate }): Promise<CaptureRuleResponse>;
  suggestCaptureRulesFromIncident(input: { bearerToken: string; incidentId: string }): Promise<CaptureRuleSuggestionsResponse>;
  createCaptureRuleFromIncidentSuggestion(input: {
    bearerToken: string;
    incidentId: string;
    create: CreateCaptureRuleFromSuggestion;
  }): Promise<CaptureRuleResponse>;
  updateCaptureRule(input: {
    bearerToken: string;
    projectId: string;
    ruleId: string;
    update: CaptureRuleUpdate;
  }): Promise<CaptureRuleResponse>;
  deleteCaptureRule(input: { bearerToken: string; projectId: string; ruleId: string }): Promise<{ success: true }>;
} {
  return {
    async listCaptureRules(input): Promise<CaptureRulesResponse> {
      const response = await httpClient.request({
        method: "GET",
        path: `/v1/projects/${encodeURIComponent(input.projectId)}/capture-rules`,
        bearerToken: input.bearerToken
      });

      if (response.status !== 200) {
        throw toApiError(response.status, response.body, "Failed to list capture rules.");
      }

      const parsed = CaptureRulesResponseSchema.safeParse(response.body);
      if (!parsed.success) {
        throw new CaptureRuleApiError(500, "Invalid capture rule list response.");
      }

      return parsed.data;
    },

    async createCaptureRule(input): Promise<CaptureRuleResponse> {
      const response = await httpClient.request({
        method: "POST",
        path: `/v1/projects/${encodeURIComponent(input.projectId)}/capture-rules`,
        bearerToken: input.bearerToken,
        body: input.create
      });

      if (response.status !== 201) {
        throw toApiError(response.status, response.body, "Failed to create capture rule.");
      }

      const parsed = CaptureRuleResponseSchema.safeParse(response.body);
      if (!parsed.success) {
        throw new CaptureRuleApiError(500, "Invalid capture rule create response.");
      }

      return parsed.data;
    },

    async suggestCaptureRulesFromIncident(input): Promise<CaptureRuleSuggestionsResponse> {
      const response = await httpClient.request({
        method: "POST",
        path: `/v1/incidents/${encodeURIComponent(input.incidentId)}/capture-rule-suggestion`,
        bearerToken: input.bearerToken
      });

      if (response.status !== 200) {
        throw toApiError(response.status, response.body, "Failed to suggest capture rules.");
      }

      const parsed = CaptureRuleSuggestionsResponseSchema.safeParse(response.body);
      if (!parsed.success) {
        throw new CaptureRuleApiError(500, "Invalid capture rule suggestion response.");
      }

      return parsed.data;
    },

    async createCaptureRuleFromIncidentSuggestion(input): Promise<CaptureRuleResponse> {
      const response = await httpClient.request({
        method: "POST",
        path: `/v1/incidents/${encodeURIComponent(input.incidentId)}/capture-rules`,
        bearerToken: input.bearerToken,
        body: input.create
      });

      if (response.status !== 200 && response.status !== 201) {
        throw toApiError(response.status, response.body, "Failed to create capture rule from suggestion.");
      }

      const parsed = CaptureRuleResponseSchema.safeParse(response.body);
      if (!parsed.success) {
        throw new CaptureRuleApiError(500, "Invalid capture rule create-from-suggestion response.");
      }

      return parsed.data;
    },

    async updateCaptureRule(input): Promise<CaptureRuleResponse> {
      const response = await httpClient.request({
        method: "PATCH",
        path: `/v1/projects/${encodeURIComponent(input.projectId)}/capture-rules/${encodeURIComponent(input.ruleId)}`,
        bearerToken: input.bearerToken,
        body: input.update
      });

      if (response.status !== 200) {
        throw toApiError(response.status, response.body, "Failed to update capture rule.");
      }

      const parsed = CaptureRuleResponseSchema.safeParse(response.body);
      if (!parsed.success) {
        throw new CaptureRuleApiError(500, "Invalid capture rule update response.");
      }

      return parsed.data;
    },

    async deleteCaptureRule(input): Promise<{ success: true }> {
      const response = await httpClient.request({
        method: "DELETE",
        path: `/v1/projects/${encodeURIComponent(input.projectId)}/capture-rules/${encodeURIComponent(input.ruleId)}`,
        bearerToken: input.bearerToken
      });

      if (response.status !== 200) {
        throw toApiError(response.status, response.body, "Failed to delete capture rule.");
      }

      if (
        typeof response.body !== "object" ||
        response.body === null ||
        !("success" in response.body) ||
        response.body.success !== true
      ) {
        throw new CaptureRuleApiError(500, "Invalid capture rule delete response.");
      }

      return { success: true };
    }
  };
}

function mapErrorToExitCode(error: unknown): number {
  if (!(error instanceof CaptureRuleApiError)) {
    return 1;
  }

  if (error.status === 401) {
    return 2;
  }
  if (error.status === 403) {
    return 3;
  }
  if (error.status === 404) {
    return 4;
  }
  if (error.status === 400) {
    return 5;
  }
  if (error.status === 409) {
    return 6;
  }

  return 1;
}

function formatMatcherFromValue(matcher: CaptureRuleCreate["matcher"]): string {
  const parts: string[] = [];

  if (matcher.event_types !== undefined) {
    parts.push(`event_types=${matcher.event_types.join(",")}`);
  }
  if (matcher.browser_event_kind !== undefined) {
    parts.push(`browser_event_kind=${matcher.browser_event_kind}`);
  }
  if (matcher.browser_event_opaque !== undefined) {
    parts.push(`browser_event_opaque=${String(matcher.browser_event_opaque)}`);
  }
  if (matcher.client_kind !== undefined) {
    parts.push(`client_kind=${matcher.client_kind}`);
  }
  if (matcher.bot_family !== undefined) {
    parts.push(`bot_family=${matcher.bot_family}`);
  }
  if (matcher.services !== undefined) {
    parts.push(`services=${matcher.services.join(",")}`);
  }
  if (matcher.environments !== undefined) {
    parts.push(`environments=${matcher.environments.join(",")}`);
  }
  if (matcher.message_equals !== undefined) {
    parts.push(`message_equals=${JSON.stringify(matcher.message_equals)}`);
  }
  if (matcher.message_contains !== undefined) {
    parts.push(`message_contains=${JSON.stringify(matcher.message_contains)}`);
  }
  if (matcher.error_name !== undefined) {
    parts.push(`error_name=${matcher.error_name}`);
  }
  if (matcher.resource_url?.host !== undefined) {
    parts.push(`resource_host=${matcher.resource_url.host}`);
  }
  if (matcher.resource_url?.path_equals !== undefined) {
    parts.push(`resource_path=${matcher.resource_url.path_equals}`);
  }
  if (matcher.request_url?.path_equals !== undefined) {
    parts.push(`request_path=${matcher.request_url.path_equals}`);
  }
  if (matcher.status_codes !== undefined) {
    parts.push(`status_codes=${matcher.status_codes.join(",")}`);
  }
  if (matcher.first_party !== undefined) {
    parts.push(`first_party=${String(matcher.first_party)}`);
  }

  return parts.length > 0 ? parts.join(" ") : "matcher=custom";
}

function formatMatcher(rule: CaptureRule): string {
  return formatMatcherFromValue(rule.matcher);
}

function formatRule(rule: CaptureRule): string {
  const action =
    rule.action === "sample"
      ? `${rule.action}:${rule.sample_rate ?? "?"}:${rule.sample_event_class ?? "?"}`
      : rule.action;

  return [
    `${rule.enabled ? "enabled" : "disabled"} ${rule.id} ${action} ${rule.name}`,
    formatMatcher(rule)
  ].join("\n");
}

function formatSuggestionResponse(response: CaptureRuleSuggestionsResponse): string {
  if (response.bundle_status === "pending") {
    return "Capture rule suggestions are pending bundle generation.";
  }

  if (response.bundle_status === "failed") {
    return `Capture rule suggestions unavailable: ${response.bundle_reason ?? "bundle_unavailable"}`;
  }

  if (response.suggestions.length === 0) {
    return "No capture rule suggestions available.";
  }

  return response.suggestions
    .map((suggestion) =>
      [
        `${suggestion.suggestion_id} ${suggestion.recommended_action} ${suggestion.confidence} ${suggestion.label}`,
        suggestion.reason,
        `matcher: ${formatMatcherFromValue(suggestion.rule.matcher)}`,
        `requires_confirmation: ${String(suggestion.requires_confirmation)}`,
        suggestion.created_rule_id == null
          ? "existing_rule: none"
          : `existing_rule: ${suggestion.created_rule_id} (${suggestion.created_rule_enabled === false ? "disabled" : "enabled"})`,
        `apply: debugbundle capture-rule create-from-suggestion <incident-id> --suggestion-id ${suggestion.suggestion_id}`
      ].join("\n")
    )
    .join("\n\n");
}

export async function listCaptureRulesCommand(
  input: {
    bearerToken: string;
    projectId: string;
    json?: boolean;
  },
  api: {
    listCaptureRules(input: { bearerToken: string; projectId: string }): Promise<CaptureRulesResponse>;
  }
): Promise<CliCommandResult> {
  try {
    const response = await api.listCaptureRules({
      bearerToken: input.bearerToken,
      projectId: input.projectId
    });

    if (input.json) {
      return {
        exitCode: 0,
        output: JSON.stringify(response)
      };
    }

    if (response.rules.length === 0) {
      return {
        exitCode: 0,
        output: "No capture rules found."
      };
    }

    return {
      exitCode: 0,
      output: response.rules.map((rule) => formatRule(rule)).join("\n\n")
    };
  } catch (error) {
    return {
      exitCode: mapErrorToExitCode(error),
      output: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function createCaptureRuleCommand(
  input: {
    bearerToken: string;
    projectId: string;
    create: CaptureRuleCreate;
    json?: boolean;
  },
  api: {
    createCaptureRule(input: { bearerToken: string; projectId: string; create: CaptureRuleCreate }): Promise<CaptureRuleResponse>;
  }
): Promise<CliCommandResult> {
  try {
    const parsedCreate = CaptureRuleCreateSchema.safeParse(input.create);
    if (!parsedCreate.success) {
      return {
        exitCode: 5,
        output: "Invalid capture rule create payload."
      };
    }

    const response = await api.createCaptureRule({
      bearerToken: input.bearerToken,
      projectId: input.projectId,
      create: parsedCreate.data
    });

    return {
      exitCode: 0,
      output: input.json ? JSON.stringify(response) : `Capture rule created.\n${formatRule(response.rule)}`
    };
  } catch (error) {
    return {
      exitCode: mapErrorToExitCode(error),
      output: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function suggestCaptureRulesFromIncidentCommand(
  input: {
    bearerToken: string;
    incidentId: string;
    json?: boolean;
  },
  api: {
    suggestCaptureRulesFromIncident(input: {
      bearerToken: string;
      incidentId: string;
    }): Promise<CaptureRuleSuggestionsResponse>;
  }
): Promise<CliCommandResult> {
  try {
    const response = await api.suggestCaptureRulesFromIncident({
      bearerToken: input.bearerToken,
      incidentId: input.incidentId
    });

    return {
      exitCode: 0,
      output: input.json ? JSON.stringify(response) : formatSuggestionResponse(response)
    };
  } catch (error) {
    return {
      exitCode: mapErrorToExitCode(error),
      output: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function createCaptureRuleFromIncidentSuggestionCommand(
  input: {
    bearerToken: string;
    incidentId: string;
    create: CreateCaptureRuleFromSuggestion;
    json?: boolean;
  },
  api: {
    createCaptureRuleFromIncidentSuggestion(input: {
      bearerToken: string;
      incidentId: string;
      create: CreateCaptureRuleFromSuggestion;
    }): Promise<CaptureRuleResponse>;
  }
): Promise<CliCommandResult> {
  try {
    const parsedCreate = CreateCaptureRuleFromSuggestionSchema.safeParse(input.create);
    if (!parsedCreate.success) {
      return {
        exitCode: 5,
        output: "Invalid capture rule create-from-suggestion payload."
      };
    }

    const response = await api.createCaptureRuleFromIncidentSuggestion({
      bearerToken: input.bearerToken,
      incidentId: input.incidentId,
      create: parsedCreate.data
    });

    return {
      exitCode: 0,
      output: input.json ? JSON.stringify(response) : `Capture rule applied.\n${formatRule(response.rule)}`
    };
  } catch (error) {
    return {
      exitCode: mapErrorToExitCode(error),
      output: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function updateCaptureRuleCommand(
  input: {
    bearerToken: string;
    projectId: string;
    ruleId: string;
    update: CaptureRuleUpdate;
    json?: boolean;
  },
  api: {
    updateCaptureRule(input: {
      bearerToken: string;
      projectId: string;
      ruleId: string;
      update: CaptureRuleUpdate;
    }): Promise<CaptureRuleResponse>;
  }
): Promise<CliCommandResult> {
  try {
    const parsedUpdate = CaptureRuleUpdateSchema.safeParse(input.update);
    if (!parsedUpdate.success) {
      return {
        exitCode: 5,
        output: "Invalid capture rule update payload."
      };
    }

    const response = await api.updateCaptureRule({
      bearerToken: input.bearerToken,
      projectId: input.projectId,
      ruleId: input.ruleId,
      update: parsedUpdate.data
    });

    return {
      exitCode: 0,
      output: input.json ? JSON.stringify(response) : `Capture rule updated.\n${formatRule(response.rule)}`
    };
  } catch (error) {
    return {
      exitCode: mapErrorToExitCode(error),
      output: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function deleteCaptureRuleCommand(
  input: {
    bearerToken: string;
    projectId: string;
    ruleId: string;
    json?: boolean;
  },
  api: {
    deleteCaptureRule(input: { bearerToken: string; projectId: string; ruleId: string }): Promise<{ success: true }>;
  }
): Promise<CliCommandResult> {
  try {
    await api.deleteCaptureRule({
      bearerToken: input.bearerToken,
      projectId: input.projectId,
      ruleId: input.ruleId
    });

    return {
      exitCode: 0,
      output: input.json ? JSON.stringify({ success: true }) : "Capture rule deleted."
    };
  } catch (error) {
    return {
      exitCode: mapErrorToExitCode(error),
      output: error instanceof Error ? error.message : String(error)
    };
  }
}

async function createAuthenticatedCaptureRuleApi(
  input: { authFilePath?: string },
  dependencies?: {
    readAuthState?: (input: { authFilePath?: string }) => Promise<CliAuthState>;
    createHttpClient?: (input: { baseUrl: string }) => { request(request: CaptureRuleHttpRequest): Promise<CaptureRuleHttpResponse> };
    createApi?: typeof createCaptureRuleApi;
    fetchImpl?: typeof fetch;
  }
): Promise<{ authState: CliAuthState; api: ReturnType<typeof createCaptureRuleApi> }> {
  const readAuthState = dependencies?.readAuthState ?? readCliAuthState;
  const authStateInput: { authFilePath?: string } = {};
  if (input.authFilePath !== undefined) {
    authStateInput.authFilePath = input.authFilePath;
  }

  const authState = await readAuthState(authStateInput);
  const createHttpClient = dependencies?.createHttpClient ?? ((clientInput: { baseUrl: string }) => {
    const httpClientDependencies: { fetchImpl?: typeof fetch } = {};
    if (dependencies?.fetchImpl !== undefined) {
      httpClientDependencies.fetchImpl = dependencies.fetchImpl;
    }

    return createCliHttpClient(clientInput, httpClientDependencies);
  });
  const httpClient = createHttpClient({ baseUrl: authState.base_url });
  const createApi = dependencies?.createApi ?? createCaptureRuleApi;

  return {
    authState,
    api: createApi(httpClient)
  };
}

export async function listCaptureRulesWithAuthCommand(
  input: { authFilePath?: string; projectId: string; json?: boolean },
  dependencies?: Parameters<typeof createAuthenticatedCaptureRuleApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedCaptureRuleApi,
    dependencies,
    runCommand: (authState, api) =>
      listCaptureRulesCommand(
        {
          bearerToken: authState.bearer_token,
          projectId: input.projectId,
          ...(input.json === true ? { json: true } : {})
        },
        api
      )
  });
}

export async function createCaptureRuleWithAuthCommand(
  input: { authFilePath?: string; projectId: string; create: CaptureRuleCreate; json?: boolean },
  dependencies?: Parameters<typeof createAuthenticatedCaptureRuleApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedCaptureRuleApi,
    dependencies,
    runCommand: (authState, api) =>
      createCaptureRuleCommand(
        {
          bearerToken: authState.bearer_token,
          projectId: input.projectId,
          create: input.create,
          ...(input.json === true ? { json: true } : {})
        },
        api
      )
  });
}

export async function suggestCaptureRulesFromIncidentWithAuthCommand(
  input: { authFilePath?: string; incidentId: string; json?: boolean },
  dependencies?: Parameters<typeof createAuthenticatedCaptureRuleApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedCaptureRuleApi,
    dependencies,
    runCommand: (authState, api) =>
      suggestCaptureRulesFromIncidentCommand(
        {
          bearerToken: authState.bearer_token,
          incidentId: input.incidentId,
          ...(input.json === true ? { json: true } : {})
        },
        api
      )
  });
}

export async function createCaptureRuleFromIncidentSuggestionWithAuthCommand(
  input: { authFilePath?: string; incidentId: string; create: CreateCaptureRuleFromSuggestion; json?: boolean },
  dependencies?: Parameters<typeof createAuthenticatedCaptureRuleApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedCaptureRuleApi,
    dependencies,
    runCommand: (authState, api) =>
      createCaptureRuleFromIncidentSuggestionCommand(
        {
          bearerToken: authState.bearer_token,
          incidentId: input.incidentId,
          create: input.create,
          ...(input.json === true ? { json: true } : {})
        },
        api
      )
  });
}

export async function updateCaptureRuleWithAuthCommand(
  input: { authFilePath?: string; projectId: string; ruleId: string; update: CaptureRuleUpdate; json?: boolean },
  dependencies?: Parameters<typeof createAuthenticatedCaptureRuleApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedCaptureRuleApi,
    dependencies,
    runCommand: (authState, api) =>
      updateCaptureRuleCommand(
        {
          bearerToken: authState.bearer_token,
          projectId: input.projectId,
          ruleId: input.ruleId,
          update: input.update,
          ...(input.json === true ? { json: true } : {})
        },
        api
      )
  });
}

export async function deleteCaptureRuleWithAuthCommand(
  input: { authFilePath?: string; projectId: string; ruleId: string; json?: boolean },
  dependencies?: Parameters<typeof createAuthenticatedCaptureRuleApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedCaptureRuleApi,
    dependencies,
    runCommand: (authState, api) =>
      deleteCaptureRuleCommand(
        {
          bearerToken: authState.bearer_token,
          projectId: input.projectId,
          ruleId: input.ruleId,
          ...(input.json === true ? { json: true } : {})
        },
        api
      )
  });
}
