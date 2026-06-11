import { Pool } from "pg";
import { pathToFileURL } from "url";
import { z } from "zod";

import { createPostgresAccountAnalyticsStore, type Queryable } from "../packages/storage/src/index.js";
import { buildPostgresSslConfig } from "../packages/storage/src/postgres-ssl.js";

const AccountAnalyticsBackfillEnvSchema = z.object({
  DB_HOST: z.string().min(1).default("localhost"),
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
  DB_USER: z.string().min(1).default("debugbundle"),
  DB_PASSWORD: z.string().min(1).default("debugbundle"),
  DB_NAME: z.string().min(1).default("debugbundle"),
  DB_SSL_MODE: z.string().optional(),
  ANALYTICS_HASH_SECRET: z.string().min(1),
  ACCOUNT_ANALYTICS_ORGANIZATION_ID: z.string().uuid().optional(),
  ACCOUNT_ANALYTICS_BACKFILL_AT: z.string().datetime().optional()
});

function createQueryable(pool: Pool): Queryable {
  return {
    query: async <Row extends Record<string, unknown>>(sql: string, params: unknown[]) =>
      pool.query<Row>(sql, params),
    transaction: async <Result>(callback: (tx: Queryable) => Promise<Result>) => {
      const client = await pool.connect();
      const tx: Queryable = {
        query: async <Row extends Record<string, unknown>>(sql: string, params: unknown[]) =>
          client.query<Row>(sql, params)
      };

      try {
        await client.query("BEGIN", []);
        const result = await callback(tx);
        await client.query("COMMIT", []);
        return result;
      } catch (error) {
        await client.query("ROLLBACK", []).catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    }
  };
}

export async function runAccountAnalyticsBackfillScript(
  envInput: Record<string, string | undefined> = process.env
): Promise<void> {
  const env = AccountAnalyticsBackfillEnvSchema.parse(envInput);
  const ssl = buildPostgresSslConfig(env.DB_SSL_MODE);
  const backfilledAt = env.ACCOUNT_ANALYTICS_BACKFILL_AT ?? new Date().toISOString();

  const pool = new Pool({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    ...(ssl === undefined ? {} : { ssl })
  });

  try {
    const db = createQueryable(pool);
    const store = createPostgresAccountAnalyticsStore({
      db,
      analyticsHashSecret: env.ANALYTICS_HASH_SECRET
    });

    const organizations = await db.query<{ organization_id: string }>(
      `
        SELECT id::text AS organization_id
        FROM organizations
        WHERE ($1::uuid IS NULL OR id = $1::uuid)
        ORDER BY created_at ASC, id ASC
      `,
      [env.ACCOUNT_ANALYTICS_ORGANIZATION_ID ?? null]
    );

    for (const row of organizations.rows) {
      const result = await store.backfillRetainedRowsForOrganization({
        organization_id: row.organization_id,
        backfilled_at: backfilledAt
      });
      console.log(`account_analytics_backfill:${row.organization_id}:${result}`);
    }

    console.log(`account_analytics_backfill_ok: organizations=${organizations.rows.length}`);
  } finally {
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
  runAccountAnalyticsBackfillScript().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
