import type { CliCommandResult } from "./token-commands.js";
import { validateProfile } from "./profile-validation.js";

type ProfileValidateDependencies = {
  cwd?: () => string;
};

function formatProfileValidationErrors(errors: Array<{ path: string; message: string; suggestion?: string; example?: string }>): string {
  return [
    "DebugBundle profile validation failed.",
    "Errors:",
    ...errors.flatMap((error) => {
      const lines = [`- ${error.path}: ${error.message}`];

      if (error.suggestion !== undefined) {
        lines.push(`  Suggestion: ${error.suggestion}`);
      }

      if (error.example !== undefined) {
        lines.push(`  Example: ${error.example}`);
      }

      return lines;
    })
  ].join("\n");
}

export async function profileValidateCommand(
  input: { json?: boolean },
  dependencies: ProfileValidateDependencies = {}
): Promise<CliCommandResult> {
  const cwd = dependencies.cwd ?? (() => process.cwd());
  const validation = await validateProfile(cwd());

  if (validation.valid) {
    return {
      exitCode: 0,
      output: input.json ? JSON.stringify({ valid: true, errors: [] }) : "DebugBundle profile validation passed."
    };
  }

  return {
    exitCode: 4,
    output: input.json ? JSON.stringify({ valid: false, errors: validation.errors }) : formatProfileValidationErrors(validation.errors)
  };
}