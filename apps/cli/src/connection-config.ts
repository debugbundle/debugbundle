import { join } from "node:path";

import { z } from "zod";

import { CONNECTION_FILE_PATH } from "./local-scaffold.js";

export const ConnectionConfigSchema = z
  .object({
    mode: z.enum(["local-only", "connected"]),
    cloud_project_id: z.string().nullable(),
    cloud_base_url: z.string().nullable(),
    environments: z
      .object({
        local: z.object({ delivery: z.enum(["local-only", "cloud-enabled"]) }).strict(),
        development: z.object({ delivery: z.enum(["local-only", "cloud-enabled"]) }).strict(),
        staging: z.object({ delivery: z.enum(["local-only", "cloud-enabled"]) }).strict(),
        production: z.object({ delivery: z.enum(["local-only", "cloud-enabled"]) }).strict()
      })
      .strict()
  })
  .strict();

export type ConnectionConfig = z.infer<typeof ConnectionConfigSchema>;

export async function readConnectionConfig(rootDirectory: string, readFile: (path: string) => Promise<string>): Promise<ConnectionConfig> {
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
