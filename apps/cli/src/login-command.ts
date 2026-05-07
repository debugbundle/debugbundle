import { z } from "zod";

import {
  buildTokenPreview,
  persistCliAuthState
} from "./auth-state.js";
import type { CliAuthState } from "./auth-state.js";
import type { CliCommandResult } from "./token-commands.js";

const LoginCommandInputSchema = z.object({
  bearerToken: z.string().trim().min(1),
  baseUrl: z.string().url().default("https://api.debugbundle.com")
});

function formatLoginOutput(authState: CliAuthState, authFilePath: string): string {
  return [
    "Authenticated: yes",
    `Base URL: ${authState.base_url}`,
    `Auth File: ${authFilePath}`,
    `Token: ${buildTokenPreview(authState.bearer_token)}`
  ].join("\n");
}

function validateMemberToken(token: string): boolean {
  return token.startsWith("dbundle_mem_");
}

export { persistCliAuthState } from "./auth-state.js";

export async function loginCommand(
  input: { authFilePath?: string; bearerToken: string; baseUrl?: string; json?: boolean },
  dependencies?: {
    writeAuthState?: (input: { authFilePath?: string; authState: CliAuthState }) => Promise<string | void>;
  }
): Promise<CliCommandResult> {
  const parsedInput = LoginCommandInputSchema.safeParse({
    bearerToken: input.bearerToken,
    baseUrl: input.baseUrl ?? "https://api.debugbundle.com"
  });

  if (!parsedInput.success || !validateMemberToken(parsedInput.data.bearerToken)) {
    return {
      exitCode: 4,
      output: "Invalid member token."
    };
  }

  const authState: CliAuthState = {
    bearer_token: parsedInput.data.bearerToken,
    base_url: parsedInput.data.baseUrl
  };

  const writeAuthState = dependencies?.writeAuthState ?? (persistCliAuthState as (input: { authFilePath?: string; authState: CliAuthState }) => Promise<string | void>);

  try {
    const writeInput: { authFilePath?: string; authState: CliAuthState } = {
      authState
    };
    if (input.authFilePath !== undefined) {
      writeInput.authFilePath = input.authFilePath;
    }

    const persistedPath = (await writeAuthState(writeInput)) ?? (input.authFilePath ?? "");
    const payload = {
      authenticated: true,
      auth: {
        base_url: authState.base_url,
        token_preview: buildTokenPreview(authState.bearer_token)
      },
      auth_file_path: persistedPath
    };

    return {
      exitCode: 0,
      output: input.json ? JSON.stringify(payload) : formatLoginOutput(authState, payload.auth_file_path)
    };
  } catch (error) {
    return {
      exitCode: 1,
      output: error instanceof Error ? error.message : String(error)
    };
  }
}