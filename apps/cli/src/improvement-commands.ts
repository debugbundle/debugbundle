import { RetrievalApiError } from "../../../packages/retrieval-client/src/index.js";
import { createAuthenticatedRetrievalApi, runAuthenticatedCliCommand } from "./auth-context.js";
import type { CliCommandResult } from "./token-commands.js";

function mapErrorToExitCode(error: unknown): number {
  if (!(error instanceof RetrievalApiError)) {
    return 1;
  }

  if (error.status === 401) {
    return 2;
  }
  if (error.status === 404) {
    return 3;
  }
  if (error.status === 400) {
    return 4;
  }

  return 1;
}

function formatImprovementTable(
  improvements: Array<{
    improvement_id: string;
    severity: string;
    status: string;
    title: string;
  }>
): string {
  if (improvements.length === 0) {
    return "No improvements found.";
  }

  return improvements
    .map((improvement) => `${improvement.improvement_id} | ${improvement.severity} | ${improvement.status} | ${improvement.title}`)
    .join("\n");
}

function formatImprovementDetail(improvement: {
  improvement_id: string;
  title: string;
  severity: string;
  status: string;
  kind: string;
  environment: string;
  confidence: number;
  service_name: string;
  occurrence_count: number;
  summary: string;
  project_name: string;
  last_detected_at: string;
  resolved_at: string | null;
}): string {
  return [
    `Improvement: ${improvement.improvement_id}`,
    `Project: ${improvement.project_name}`,
    `Title: ${improvement.title}`,
    `Kind: ${improvement.kind}`,
    `Severity: ${improvement.severity}`,
    `Status: ${improvement.status}`,
    `Environment: ${improvement.environment}`,
    `Service: ${improvement.service_name}`,
    `Confidence: ${improvement.confidence}`,
    `Occurrences: ${improvement.occurrence_count}`,
    `Last detected: ${improvement.last_detected_at}`,
    ...(improvement.resolved_at === null ? [] : [`Resolved at: ${improvement.resolved_at}`]),
    `Summary: ${improvement.summary}`
  ].join("\n");
}

function formatObjectOutput(payload: unknown): string {
  return JSON.stringify(payload, null, 2);
}

export async function listImprovementsCommand(
  input: {
    bearerToken: string;
    projectId?: string;
    environment?: string;
    service?: string;
    status?: string;
    severity?: string;
    kind?: string;
    cursor?: string;
    limit?: number;
    json?: boolean;
  },
  api: {
    listImprovements(input: {
      bearerToken: string;
      projectId?: string;
      environment?: string;
      service?: string;
      status?: string;
      severity?: string;
      kind?: string;
      cursor?: string;
      limit?: number;
    }): Promise<{ improvements: Array<Record<string, unknown>>; next_cursor: string | null }>;
  }
): Promise<CliCommandResult> {
  try {
    const response = await api.listImprovements(input);
    return {
      exitCode: 0,
      output: input.json
        ? JSON.stringify(response)
        : `${formatImprovementTable(
            response.improvements as Array<{ improvement_id: string; severity: string; status: string; title: string }>
          )}${response.next_cursor === null ? "" : `\nnext_cursor: ${response.next_cursor}`}`
    };
  } catch (error) {
    return {
      exitCode: mapErrorToExitCode(error),
      output: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function getImprovementCommand(
  input: { bearerToken: string; improvementId: string; json?: boolean },
  api: { getImprovement(input: { bearerToken: string; improvementId: string }): Promise<Record<string, unknown>> }
): Promise<CliCommandResult> {
  try {
    const improvement = await api.getImprovement(input);
    return {
      exitCode: 0,
      output: input.json
        ? JSON.stringify(improvement)
        : formatImprovementDetail(improvement as Parameters<typeof formatImprovementDetail>[0])
    };
  } catch (error) {
    return {
      exitCode: mapErrorToExitCode(error),
      output: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function resolveImprovementCommand(
  input: { bearerToken: string; improvementId: string; json?: boolean },
  api: { resolveImprovement(input: { bearerToken: string; improvementId: string }): Promise<Record<string, unknown>> }
): Promise<CliCommandResult> {
  try {
    const improvement = await api.resolveImprovement(input);
    return {
      exitCode: 0,
      output: input.json
        ? JSON.stringify(improvement)
        : `Improvement resolved.\n${formatImprovementDetail(improvement as Parameters<typeof formatImprovementDetail>[0])}`
    };
  } catch (error) {
    return {
      exitCode: mapErrorToExitCode(error),
      output: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function reopenImprovementCommand(
  input: { bearerToken: string; improvementId: string; json?: boolean },
  api: { reopenImprovement(input: { bearerToken: string; improvementId: string }): Promise<Record<string, unknown>> }
): Promise<CliCommandResult> {
  try {
    const improvement = await api.reopenImprovement(input);
    return {
      exitCode: 0,
      output: input.json
        ? JSON.stringify(improvement)
        : `Improvement reopened.\n${formatImprovementDetail(improvement as Parameters<typeof formatImprovementDetail>[0])}`
    };
  } catch (error) {
    return {
      exitCode: mapErrorToExitCode(error),
      output: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function snoozeImprovementCommand(
  input: { bearerToken: string; improvementId: string; snoozedUntil: string; json?: boolean },
  api: {
    snoozeImprovement(input: {
      bearerToken: string;
      improvementId: string;
      snoozedUntil: string;
    }): Promise<Record<string, unknown>>;
  }
): Promise<CliCommandResult> {
  try {
    const improvement = await api.snoozeImprovement(input);
    return {
      exitCode: 0,
      output: input.json
        ? JSON.stringify(improvement)
        : `Improvement snoozed.\n${formatImprovementDetail(improvement as Parameters<typeof formatImprovementDetail>[0])}`
    };
  } catch (error) {
    return {
      exitCode: mapErrorToExitCode(error),
      output: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function getImprovementBundleCommand(
  input: { bearerToken: string; projectId: string; improvementId: string; json?: boolean },
  api: {
    getImprovementBundle(input: {
      bearerToken: string;
      projectId: string;
      improvementId: string;
    }): Promise<unknown>;
  }
): Promise<CliCommandResult> {
  try {
    const bundle = await api.getImprovementBundle(input);
    return {
      exitCode: 0,
      output: input.json ? JSON.stringify(bundle) : formatObjectOutput(bundle)
    };
  } catch (error) {
    return {
      exitCode: mapErrorToExitCode(error),
      output: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function listImprovementsWithAuthCommand(
  input: {
    authFilePath?: string;
    projectId?: string;
    environment?: string;
    service?: string;
    status?: string;
    severity?: string;
    kind?: string;
    cursor?: string;
    limit?: number;
    json?: boolean;
  },
  dependencies?: Parameters<typeof createAuthenticatedRetrievalApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedRetrievalApi,
    dependencies,
    runCommand: (authState, api) =>
      listImprovementsCommand(
        {
          bearerToken: authState.bearer_token,
          ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
          ...(input.environment === undefined ? {} : { environment: input.environment }),
          ...(input.service === undefined ? {} : { service: input.service }),
          ...(input.status === undefined ? {} : { status: input.status }),
          ...(input.severity === undefined ? {} : { severity: input.severity }),
          ...(input.kind === undefined ? {} : { kind: input.kind }),
          ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
          ...(input.limit === undefined ? {} : { limit: input.limit }),
          ...(input.json === undefined ? {} : { json: input.json })
        },
        api
      )
  });
}

export async function getImprovementWithAuthCommand(
  input: { authFilePath?: string; improvementId: string; json?: boolean },
  dependencies?: Parameters<typeof createAuthenticatedRetrievalApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedRetrievalApi,
    dependencies,
    runCommand: (authState, api) =>
      getImprovementCommand(
        {
          bearerToken: authState.bearer_token,
          improvementId: input.improvementId,
          ...(input.json === undefined ? {} : { json: input.json })
        },
        api
      )
  });
}

export async function resolveImprovementWithAuthCommand(
  input: { authFilePath?: string; improvementId: string; json?: boolean },
  dependencies?: Parameters<typeof createAuthenticatedRetrievalApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedRetrievalApi,
    dependencies,
    runCommand: (authState, api) =>
      resolveImprovementCommand(
        {
          bearerToken: authState.bearer_token,
          improvementId: input.improvementId,
          ...(input.json === undefined ? {} : { json: input.json })
        },
        api
      )
  });
}

export async function reopenImprovementWithAuthCommand(
  input: { authFilePath?: string; improvementId: string; json?: boolean },
  dependencies?: Parameters<typeof createAuthenticatedRetrievalApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedRetrievalApi,
    dependencies,
    runCommand: (authState, api) =>
      reopenImprovementCommand(
        {
          bearerToken: authState.bearer_token,
          improvementId: input.improvementId,
          ...(input.json === undefined ? {} : { json: input.json })
        },
        api
      )
  });
}

export async function snoozeImprovementWithAuthCommand(
  input: { authFilePath?: string; improvementId: string; snoozedUntil: string; json?: boolean },
  dependencies?: Parameters<typeof createAuthenticatedRetrievalApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedRetrievalApi,
    dependencies,
    runCommand: (authState, api) =>
      snoozeImprovementCommand(
        {
          bearerToken: authState.bearer_token,
          improvementId: input.improvementId,
          snoozedUntil: input.snoozedUntil,
          ...(input.json === undefined ? {} : { json: input.json })
        },
        api
      )
  });
}

export async function getImprovementBundleWithAuthCommand(
  input: { authFilePath?: string; projectId: string; improvementId: string; json?: boolean },
  dependencies?: Parameters<typeof createAuthenticatedRetrievalApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedRetrievalApi,
    dependencies,
    runCommand: (authState, api) =>
      getImprovementBundleCommand(
        {
          bearerToken: authState.bearer_token,
          projectId: input.projectId,
          improvementId: input.improvementId,
          ...(input.json === undefined ? {} : { json: input.json })
        },
        api
      )
  });
}
