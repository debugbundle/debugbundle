import { SlackApiError } from "../../../packages/slack-client/src/index.js";
import type { SlackDestinationRecord } from "../../../packages/slack-client/src/index.js";
import { createAuthenticatedSlackApi, runAuthenticatedCliCommand } from "./auth-context.js";
import type { CliCommandResult } from "./token-commands.js";

function mapErrorToExitCode(error: unknown): number {
  if (!(error instanceof SlackApiError)) {
    return 1;
  }

  if (error.status === 401) {
    return 2;
  }
  if (error.status === 404) {
    return 3;
  }
  if (error.status === 400 || error.status === 403) {
    return 4;
  }

  return 1;
}

function formatSlackDestinationTable(destinations: SlackDestinationRecord[]): string {
  if (destinations.length === 0) {
    return "No Slack destinations found.";
  }

  return destinations
    .map((destination) => {
      const workspace = destination.slack_team_name ?? destination.slack_team_id;
      const channel = destination.slack_channel_name ?? destination.slack_channel_id;
      return `${destination.slack_destination_id} | ${destination.is_active ? "active" : "inactive"} | ${workspace} | ${channel}`;
    })
    .join("\n");
}

export async function listSlackDestinationsCommand(
  input: { bearerToken: string; projectId: string; json?: boolean },
  api: { listSlackDestinations(input: { bearerToken: string; projectId: string }): Promise<SlackDestinationRecord[]> }
): Promise<CliCommandResult> {
  try {
    const destinations = await api.listSlackDestinations({
      bearerToken: input.bearerToken,
      projectId: input.projectId
    });

    return {
      exitCode: 0,
      output: input.json ? JSON.stringify({ destinations }) : formatSlackDestinationTable(destinations)
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: error instanceof Error ? error.message : String(error) };
  }
}

export async function listSlackDestinationsWithAuthCommand(
  input: { authFilePath?: string; projectId: string; json?: boolean },
  dependencies?: Parameters<typeof createAuthenticatedSlackApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedSlackApi,
    dependencies,
    runCommand: (authState, api) =>
      listSlackDestinationsCommand(
        {
          bearerToken: authState.bearer_token,
          projectId: input.projectId,
          ...(input.json !== undefined ? { json: input.json } : {})
        },
        api
      )
  });
}

export async function getSlackConnectUrlCommand(
  input: { bearerToken: string; projectId: string; returnTo?: string; json?: boolean },
  api: { getSlackInstallUrl(input: { bearerToken: string; projectId: string; returnTo?: string }): Promise<string> }
): Promise<CliCommandResult> {
  try {
    const installUrl = await api.getSlackInstallUrl({
      bearerToken: input.bearerToken,
      projectId: input.projectId,
      ...(input.returnTo !== undefined ? { returnTo: input.returnTo } : {})
    });

    return {
      exitCode: 0,
      output: input.json ? JSON.stringify({ install_url: installUrl }) : installUrl
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: error instanceof Error ? error.message : String(error) };
  }
}

export async function getSlackConnectUrlWithAuthCommand(
  input: { authFilePath?: string; projectId: string; returnTo?: string; json?: boolean },
  dependencies?: Parameters<typeof createAuthenticatedSlackApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedSlackApi,
    dependencies,
    runCommand: (authState, api) =>
      getSlackConnectUrlCommand(
        {
          bearerToken: authState.bearer_token,
          projectId: input.projectId,
          ...(input.returnTo !== undefined ? { returnTo: input.returnTo } : {}),
          ...(input.json !== undefined ? { json: input.json } : {})
        },
        api
      )
  });
}

export async function testSlackDestinationCommand(
  input: { bearerToken: string; projectId: string; destinationId: string; json?: boolean },
  api: { testSlackDestination(input: { bearerToken: string; projectId: string; destinationId: string }): Promise<{ delivered: true }> }
): Promise<CliCommandResult> {
  try {
    const delivery = await api.testSlackDestination({
      bearerToken: input.bearerToken,
      projectId: input.projectId,
      destinationId: input.destinationId
    });

    return {
      exitCode: 0,
      output: input.json
        ? JSON.stringify({ delivery })
        : `Slack test message delivered for destination: ${input.destinationId}`
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: error instanceof Error ? error.message : String(error) };
  }
}

export async function testSlackDestinationWithAuthCommand(
  input: { authFilePath?: string; projectId: string; destinationId: string; json?: boolean },
  dependencies?: Parameters<typeof createAuthenticatedSlackApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedSlackApi,
    dependencies,
    runCommand: (authState, api) =>
      testSlackDestinationCommand(
        {
          bearerToken: authState.bearer_token,
          projectId: input.projectId,
          destinationId: input.destinationId,
          ...(input.json !== undefined ? { json: input.json } : {})
        },
        api
      )
  });
}

export async function deleteSlackDestinationCommand(
  input: { bearerToken: string; projectId: string; destinationId: string; json?: boolean },
  api: { deleteSlackDestination(input: { bearerToken: string; projectId: string; destinationId: string }): Promise<{ slack_destination_id: string }> }
): Promise<CliCommandResult> {
  try {
    const deleted = await api.deleteSlackDestination({
      bearerToken: input.bearerToken,
      projectId: input.projectId,
      destinationId: input.destinationId
    });

    return {
      exitCode: 0,
      output: input.json
        ? JSON.stringify({ destination: deleted })
        : `Slack destination deleted: ${deleted.slack_destination_id}`
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: error instanceof Error ? error.message : String(error) };
  }
}

export async function deleteSlackDestinationWithAuthCommand(
  input: { authFilePath?: string; projectId: string; destinationId: string; json?: boolean },
  dependencies?: Parameters<typeof createAuthenticatedSlackApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedSlackApi,
    dependencies,
    runCommand: (authState, api) =>
      deleteSlackDestinationCommand(
        {
          bearerToken: authState.bearer_token,
          projectId: input.projectId,
          destinationId: input.destinationId,
          ...(input.json !== undefined ? { json: input.json } : {})
        },
        api
      )
  });
}
