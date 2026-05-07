import { RetrievalApiError } from "../../../packages/retrieval-client/src/index.js";
import {
  createAuthenticatedRetrievalApi,
  runAuthenticatedCliCommand
} from "./auth-context.js";
import type { CliCommandResult } from "./token-commands.js";

interface ServiceLike {
  service_id: string;
  project_id: string;
  name: string;
  runtime: string | null;
  framework: string | null;
  environment: string;
}

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

function formatServiceTable(services: ServiceLike[]): string {
  if (services.length === 0) {
    return "No services found.";
  }

  return services
    .map((service) => `${service.name} | ${service.environment} | ${service.runtime ?? "unknown"} | ${service.framework ?? "unknown"}`)
    .join("\n");
}

export async function listServicesCommand(
  input: {
    bearerToken: string;
    projectId: string;
    limit?: number;
    json?: boolean;
  },
  api: {
    listServices(input: { bearerToken: string; projectId: string; limit?: number }): Promise<ServiceLike[]>;
  }
): Promise<CliCommandResult> {
  try {
    const requestInput: { bearerToken: string; projectId: string; limit?: number } = {
      bearerToken: input.bearerToken,
      projectId: input.projectId
    };

    if (input.limit !== undefined) {
      requestInput.limit = input.limit;
    }

    const services = await api.listServices(requestInput);
    if (input.json) {
      return {
        exitCode: 0,
        output: JSON.stringify({ services })
      };
    }

    return {
      exitCode: 0,
      output: formatServiceTable(services)
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: error instanceof Error ? error.message : String(error) };
  }
}

export async function listServicesWithAuthCommand(
  input: {
    authFilePath?: string;
    projectId: string;
    limit?: number;
    json?: boolean;
  },
  dependencies?: Parameters<typeof createAuthenticatedRetrievalApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedRetrievalApi,
    dependencies,
    runCommand: (authState, api) => {
      const commandInput: { bearerToken: string; projectId: string; limit?: number; json?: boolean } = {
        bearerToken: authState.bearer_token,
        projectId: input.projectId
      };

      if (input.limit !== undefined) {
        commandInput.limit = input.limit;
      }
      if (input.json !== undefined) {
        commandInput.json = input.json;
      }

      return listServicesCommand(commandInput, {
        listServices: (requestInput) => api.listServices(requestInput)
      });
    }
  });
}