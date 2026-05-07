import { Pool } from "pg";
import { pathToFileURL } from "url";
import { z } from "zod";

import { migrateStorageSchema } from "../packages/storage/src/schema-migrations.js";
import { buildPostgresSslConfig } from "../packages/storage/src/postgres-ssl.js";

const StorageMigrationEnvSchema = z.object({
  DB_HOST: z.string().min(1).default("localhost"),
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
  DB_USER: z.string().min(1).default("debugbundle"),
  DB_PASSWORD: z.string().min(1).default("debugbundle"),
  DB_NAME: z.string().min(1).default("debugbundle"),
  DB_SSL_MODE: z.string().optional()
});

export async function runStorageMigrationScript(
  envInput: Record<string, string | undefined> = process.env
): Promise<void> {
  const env = StorageMigrationEnvSchema.parse(envInput);
  const ssl = buildPostgresSslConfig(env.DB_SSL_MODE);

  const pool = new Pool({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    ...(ssl === undefined ? {} : { ssl })
  });

  const client = await pool.connect();

  try {
    const result = await migrateStorageSchema({
      query: async <Row extends Record<string, unknown>>(sql: string, params: unknown[]) => client.query<Row>(sql, params)
    });

    console.log(
      `db_migrate_ok: applied=${result.applied.length}; already_applied=${result.already_applied.length}`
    );
  } finally {
    client.release();
    await pool.end();
  }
}

export function isDirectExecution(argvPath: string | undefined = process.argv[1]): boolean {
  if (typeof argvPath !== "string" || argvPath.length === 0) {
    return false;
  }

  return pathToFileURL(argvPath).href === import.meta.url;
}

if (isDirectExecution()) {
  runStorageMigrationScript().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}