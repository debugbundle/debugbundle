import { TokenManagementApiError } from "../../../packages/token-management/src/index.js";
import {
  createAuthenticatedTokenManagementApi,
  runAuthenticatedCliCommand
} from "./auth-context.js";

interface ProjectTokenLike {
  token_id: string;
  label: string;
  allowed_origins?: string[] | undefined;
  revoked_at: string | null;
  plaintext?: string | undefined;
}

interface MemberTokenLike {
  token_id: string;
  label: string;
  revoked_at: string | null;
  plaintext?: string | undefined;
}

export interface CliCommandResult {
  exitCode: number;
  output: string;
}

function mapErrorToExitCode(error: unknown): number {
  if (!(error instanceof TokenManagementApiError)) {
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

function formatTokenTable(tokens: Array<{ token_id: string; label: string; revoked_at: string | null }>): string {
  if (tokens.length === 0) {
    return "No tokens found.";
  }

  return tokens
    .map((token) => `${token.token_id} | ${token.label} | ${token.revoked_at === null ? "active" : "revoked"}`)
    .join("\n");
}

function formatAllowedOrigins(allowedOrigins: string[] | undefined): string {
  if (allowedOrigins === undefined || allowedOrigins.length === 0) {
    return "none";
  }

  return allowedOrigins.join(", ");
}

function formatProjectTokenTable(tokens: ProjectTokenLike[]): string {
  if (tokens.length === 0) {
    return "No tokens found.";
  }

  return tokens
    .map(
      (token) =>
        `${token.token_id} | ${token.label} | ${token.revoked_at === null ? "active" : "revoked"} | origins: ${formatAllowedOrigins(token.allowed_origins)}`
    )
    .join("\n");
}

export async function listProjectTokensCommand(
  input: {
    bearerToken: string;
    projectId: string;
    limit?: number;
    json?: boolean;
  },
  api: {
    listProjectTokens(input: { bearerToken: string; projectId: string; limit?: number }): Promise<ProjectTokenLike[]>;
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

    const tokens = await api.listProjectTokens(requestInput);
    if (input.json) {
      return { exitCode: 0, output: JSON.stringify({ tokens }) };
    }

    return {
      exitCode: 0,
      output: formatProjectTokenTable(tokens)
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: error instanceof Error ? error.message : String(error) };
  }
}

export async function listProjectTokensWithAuthCommand(
  input: { authFilePath?: string; projectId: string; limit?: number; json?: boolean },
  dependencies?: Parameters<typeof createAuthenticatedTokenManagementApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedTokenManagementApi,
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

      return listProjectTokensCommand(commandInput, {
        listProjectTokens: (requestInput) => api.listProjectTokens(requestInput)
      });
    }
  });
}

export async function createProjectTokenCommand(
  input: {
    bearerToken: string;
    projectId: string;
    label: string;
    allowedOrigins?: string[];
    json?: boolean;
  },
  api: {
    createProjectToken(input: { bearerToken: string; projectId: string; label: string; allowedOrigins?: string[] }): Promise<ProjectTokenLike>;
  }
): Promise<CliCommandResult> {
  try {
    const requestInput: { bearerToken: string; projectId: string; label: string; allowedOrigins?: string[] } = {
      bearerToken: input.bearerToken,
      projectId: input.projectId,
      label: input.label
    };
    if (input.allowedOrigins !== undefined) {
      requestInput.allowedOrigins = input.allowedOrigins;
    }

    const token = await api.createProjectToken(requestInput);
    if (input.json) {
      return { exitCode: 0, output: JSON.stringify({ token }) };
    }

    return {
      exitCode: 0,
      output: `Project token created: ${token.token_id}\nAllowed origins: ${formatAllowedOrigins(token.allowed_origins)}\nPlaintext: ${token.plaintext ?? "<none>"}`
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: error instanceof Error ? error.message : String(error) };
  }
}

export async function createProjectTokenWithAuthCommand(
  input: { authFilePath?: string; projectId: string; label: string; allowedOrigins?: string[]; json?: boolean },
  dependencies?: Parameters<typeof createAuthenticatedTokenManagementApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedTokenManagementApi,
    dependencies,
    runCommand: (authState, api) => {
      const commandInput: { bearerToken: string; projectId: string; label: string; allowedOrigins?: string[]; json?: boolean } = {
        bearerToken: authState.bearer_token,
        projectId: input.projectId,
        label: input.label
      };

      if (input.allowedOrigins !== undefined) {
        commandInput.allowedOrigins = input.allowedOrigins;
      }
      if (input.json !== undefined) {
        commandInput.json = input.json;
      }

      return createProjectTokenCommand(commandInput, {
        createProjectToken: (requestInput) => api.createProjectToken(requestInput)
      });
    }
  });
}

export async function revokeProjectTokenCommand(
  input: {
    bearerToken: string;
    projectId: string;
    tokenId: string;
    json?: boolean;
  },
  api: {
    revokeProjectToken(input: { bearerToken: string; projectId: string; tokenId: string }): Promise<ProjectTokenLike>;
  }
): Promise<CliCommandResult> {
  try {
    const token = await api.revokeProjectToken({
      bearerToken: input.bearerToken,
      projectId: input.projectId,
      tokenId: input.tokenId
    });
    if (input.json) {
      return { exitCode: 0, output: JSON.stringify({ token }) };
    }

    return {
      exitCode: 0,
      output: `Project token revoked: ${token.token_id}`
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: error instanceof Error ? error.message : String(error) };
  }
}

export async function revokeProjectTokenWithAuthCommand(
  input: { authFilePath?: string; projectId: string; tokenId: string; json?: boolean },
  dependencies?: Parameters<typeof createAuthenticatedTokenManagementApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedTokenManagementApi,
    dependencies,
    runCommand: (authState, api) => {
      const commandInput: { bearerToken: string; projectId: string; tokenId: string; json?: boolean } = {
        bearerToken: authState.bearer_token,
        projectId: input.projectId,
        tokenId: input.tokenId
      };

      if (input.json !== undefined) {
        commandInput.json = input.json;
      }

      return revokeProjectTokenCommand(commandInput, {
        revokeProjectToken: (requestInput) => api.revokeProjectToken(requestInput)
      });
    }
  });
}

export async function listMemberTokensCommand(
  input: {
    bearerToken: string;
    limit?: number;
    json?: boolean;
  },
  api: {
    listMemberTokens(input: { bearerToken: string; limit?: number }): Promise<MemberTokenLike[]>;
  }
): Promise<CliCommandResult> {
  try {
    const requestInput: { bearerToken: string; limit?: number } = {
      bearerToken: input.bearerToken
    };

    if (input.limit !== undefined) {
      requestInput.limit = input.limit;
    }

    const tokens = await api.listMemberTokens(requestInput);
    if (input.json) {
      return { exitCode: 0, output: JSON.stringify({ tokens }) };
    }

    return {
      exitCode: 0,
      output: formatTokenTable(tokens)
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: error instanceof Error ? error.message : String(error) };
  }
}

export async function listMemberTokensWithAuthCommand(
  input: { authFilePath?: string; limit?: number; json?: boolean },
  dependencies?: Parameters<typeof createAuthenticatedTokenManagementApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedTokenManagementApi,
    dependencies,
    runCommand: (authState, api) => {
      const commandInput: { bearerToken: string; limit?: number; json?: boolean } = {
        bearerToken: authState.bearer_token
      };

      if (input.limit !== undefined) {
        commandInput.limit = input.limit;
      }
      if (input.json !== undefined) {
        commandInput.json = input.json;
      }

      return listMemberTokensCommand(commandInput, {
        listMemberTokens: (requestInput) => api.listMemberTokens(requestInput)
      });
    }
  });
}

export async function createMemberTokenCommand(
  input: {
    bearerToken: string;
    label: string;
    json?: boolean;
  },
  api: {
    createMemberToken(input: { bearerToken: string; label: string }): Promise<MemberTokenLike>;
  }
): Promise<CliCommandResult> {
  try {
    const token = await api.createMemberToken({
      bearerToken: input.bearerToken,
      label: input.label
    });
    if (input.json) {
      return { exitCode: 0, output: JSON.stringify({ token }) };
    }

    return {
      exitCode: 0,
      output: `Member token created: ${token.token_id}\nPlaintext: ${token.plaintext ?? "<none>"}`
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: error instanceof Error ? error.message : String(error) };
  }
}

export async function createMemberTokenWithAuthCommand(
  input: { authFilePath?: string; label: string; json?: boolean },
  dependencies?: Parameters<typeof createAuthenticatedTokenManagementApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedTokenManagementApi,
    dependencies,
    runCommand: (authState, api) => {
      const commandInput: { bearerToken: string; label: string; json?: boolean } = {
        bearerToken: authState.bearer_token,
        label: input.label
      };

      if (input.json !== undefined) {
        commandInput.json = input.json;
      }

      return createMemberTokenCommand(commandInput, {
        createMemberToken: (requestInput) => api.createMemberToken(requestInput)
      });
    }
  });
}

export async function revokeMemberTokenCommand(
  input: {
    bearerToken: string;
    tokenId: string;
    json?: boolean;
  },
  api: {
    revokeMemberToken(input: { bearerToken: string; tokenId: string }): Promise<MemberTokenLike>;
  }
): Promise<CliCommandResult> {
  try {
    const token = await api.revokeMemberToken({
      bearerToken: input.bearerToken,
      tokenId: input.tokenId
    });
    if (input.json) {
      return { exitCode: 0, output: JSON.stringify({ token }) };
    }

    return {
      exitCode: 0,
      output: `Member token revoked: ${token.token_id}`
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: error instanceof Error ? error.message : String(error) };
  }
}

export async function revokeMemberTokenWithAuthCommand(
  input: { authFilePath?: string; tokenId: string; json?: boolean },
  dependencies?: Parameters<typeof createAuthenticatedTokenManagementApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedTokenManagementApi,
    dependencies,
    runCommand: (authState, api) => {
      const commandInput: { bearerToken: string; tokenId: string; json?: boolean } = {
        bearerToken: authState.bearer_token,
        tokenId: input.tokenId
      };

      if (input.json !== undefined) {
        commandInput.json = input.json;
      }

      return revokeMemberTokenCommand(commandInput, {
        revokeMemberToken: (requestInput) => api.revokeMemberToken(requestInput)
      });
    }
  });
}
