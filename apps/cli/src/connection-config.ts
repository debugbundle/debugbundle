import { join } from "node:path";

import { z } from "zod";

import { CONNECTION_FILE_PATH } from "./local-scaffold.js";

export { ConnectionConfigSchema } from "../../../packages/shared-types/src/project-connection.js";
import { ConnectionConfigSchema } from "../../../packages/shared-types/src/project-connection.js";

export type ConnectionConfig = z.infer<typeof ConnectionConfigSchema>;

export async function readConnectionConfig(
  rootDirectory: string,
  readFile: (path: string) => Promise<string>
): Promise<ConnectionConfig> {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(await readFile(join(rootDirectory, CONNECTION_FILE_PATH)));
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      throw new Error(`Missing ${CONNECTION_FILE_PATH}`);
    }

    throw new Error(`Invalid ${CONNECTION_FILE_PATH}`);
  }

  const parsed = ConnectionConfigSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new Error(`Invalid ${CONNECTION_FILE_PATH}`);
  }

  return parsed.data;
}
