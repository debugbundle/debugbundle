import type { CliCommandResult } from "./token-commands.js";
import {
  buildTokenPreview,
  CliAuthStateError,
  readCliAuthState
} from "./auth-state.js";
import type { CliAuthState } from "./auth-state.js";

function formatWhoamiOutput(authState: CliAuthState): string {
  return [
    "Authenticated: yes",
    `Base URL: ${authState.base_url}`,
    `Token: ${buildTokenPreview(authState.bearer_token)}`
  ].join("\n");
}

export { CliAuthStateError, readCliAuthState } from "./auth-state.js";

export async function whoamiCommand(
  input: { authFilePath?: string; json?: boolean },
  dependencies?: { readAuthState?: (input: { authFilePath?: string }) => Promise<CliAuthState> }
): Promise<CliCommandResult> {
  const readAuthState = dependencies?.readAuthState ?? ((commandInput: { authFilePath?: string }) => readCliAuthState(commandInput));

  try {
    const authStateInput: { authFilePath?: string } = {};
    if (input.authFilePath !== undefined) {
      authStateInput.authFilePath = input.authFilePath;
    }

    const authState = await readAuthState(authStateInput);
    const payload = {
      authenticated: true,
      auth: {
        base_url: authState.base_url,
        token_preview: buildTokenPreview(authState.bearer_token)
      }
    };

    return {
      exitCode: 0,
      output: input.json ? JSON.stringify(payload) : formatWhoamiOutput(authState)
    };
  } catch (error) {
    if (error instanceof CliAuthStateError) {
      return {
        exitCode: 2,
        output: error.message
      };
    }

    return {
      exitCode: 1,
      output: error instanceof Error ? error.message : String(error)
    };
  }
}