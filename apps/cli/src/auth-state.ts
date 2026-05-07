import { mkdir as mkdirFromFs, readFile as readFileFromFs, writeFile as writeFileFromFs } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { z } from "zod";

export const CliAuthStateSchema = z
  .object({
    bearer_token: z.string().min(1),
    base_url: z.string().url().default("https://api.debugbundle.com")
  })
  .strict();

export type CliAuthState = z.infer<typeof CliAuthStateSchema>;

type CliAuthStateErrorCode = "auth_state_missing" | "invalid_auth_state";

export class CliAuthStateError extends Error {
  readonly code: CliAuthStateErrorCode;

  constructor(code: CliAuthStateErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export function getDefaultAuthFilePath(): string {
  return join(homedir(), ".debugbundle", "auth.json");
}

export function buildTokenPreview(token: string): string {
  if (token.length <= 16) {
    return token;
  }

  return `${token.slice(0, 16)}...`;
}

export async function readCliAuthState(
  input: { authFilePath?: string },
  dependencies?: { readFile?: (filePath: string) => Promise<string> }
): Promise<CliAuthState> {
  const authFilePath = input.authFilePath ?? getDefaultAuthFilePath();
  const readFile = dependencies?.readFile ?? ((filePath: string) => readFileFromFs(filePath, "utf8"));

  let rawAuthState: string;
  try {
    rawAuthState = await readFile(authFilePath);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      throw new CliAuthStateError("auth_state_missing", "Not logged in.");
    }

    throw error;
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawAuthState);
  } catch {
    throw new CliAuthStateError("invalid_auth_state", "Invalid auth state.");
  }

  const parsedAuthState = CliAuthStateSchema.safeParse(parsedJson);
  if (!parsedAuthState.success) {
    throw new CliAuthStateError("invalid_auth_state", "Invalid auth state.");
  }

  return parsedAuthState.data;
}

export async function persistCliAuthState(
  input: { authFilePath?: string; authState: CliAuthState },
  dependencies?: {
    mkdir?: (path: string, options: { recursive: true }) => Promise<void>;
    writeFile?: (filePath: string, content: string, encoding: "utf8") => Promise<void>;
  }
): Promise<string> {
  const authFilePath = input.authFilePath ?? getDefaultAuthFilePath();
  const mkdir = dependencies?.mkdir ?? mkdirFromFs;
  const writeFile = dependencies?.writeFile ?? writeFileFromFs;

  await mkdir(dirname(authFilePath), { recursive: true });
  await writeFile(`${authFilePath}`, `${JSON.stringify(input.authState, null, 2)}\n`, "utf8");

  return authFilePath;
}