import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { Pool } from "pg";
import { Redis } from "ioredis";
import { z } from "zod";

import { createRuntimeLoggerFromEnv } from "../../../packages/runtime-logger/src/index.js";
import { buildPostgresSslConfig, parsePostgresSslMode, type PostgresSslMode } from "../../../packages/storage/src/postgres-ssl.js";
import { REQUIRED_API_TABLES } from "../../../packages/storage/src/migrations.js";
import { assertStorageSchemaMigrationsApplied } from "../../../packages/storage/src/schema-migrations.js";
import { createPostgresBillingSyncStore } from "../../../packages/storage/src/index.js";
import { createApiDependenciesFromEnv } from "./default-dependencies.ts";
import { createApiServer, type ApiServerOptions } from "./server.js";
import { createStripeConfig } from "./stripe-config.js";

const ApiRuntimeEnvSchema = z.object({
  API_HOST: z.string().min(1).default("0.0.0.0"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DEBUGBUNDLE_PROBE_TRIGGER_SECRET: z.string().min(1),
  DB_HOST: z.string().min(1).default("localhost"),
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
  DB_USER: z.string().min(1).default("debugbundle"),
  DB_PASSWORD: z.string().min(1).default("debugbundle"),
  DB_NAME: z.string().min(1).default("debugbundle"),
  DB_SSL_MODE: z.string().optional(),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  S3_ENDPOINT: z.string().min(1).default("http://localhost:4566"),
  S3_REGION: z.string().min(1).default("us-east-1"),
  S3_BUCKET: z.string().min(1).default("debugbundle-raw-events"),
  AWS_ACCESS_KEY_ID: z.string().min(1).default("test"),
  AWS_SECRET_ACCESS_KEY: z.string().min(1).default("test")
});

export type ApiRuntimeEnv = Omit<z.infer<typeof ApiRuntimeEnvSchema>, "DB_SSL_MODE"> & {
  DB_SSL_MODE: PostgresSslMode;
};

export interface Queryable {
  query<Row extends Record<string, unknown>>(sql: string, params: unknown[]): Promise<{ rows: Row[] }>;
}

export function parseApiRuntimeEnv(env: Record<string, string | undefined>): ApiRuntimeEnv {
  const result = ApiRuntimeEnvSchema.safeParse({
    API_HOST: env["API_HOST"],
    API_PORT: env["API_PORT"],
    DEBUGBUNDLE_PROBE_TRIGGER_SECRET: env["DEBUGBUNDLE_PROBE_TRIGGER_SECRET"],
    DB_HOST: env["DB_HOST"],
    DB_PORT: env["DB_PORT"],
    DB_USER: env["DB_USER"],
    DB_PASSWORD: env["DB_PASSWORD"],
    DB_NAME: env["DB_NAME"],
    DB_SSL_MODE: env["DB_SSL_MODE"],
    REDIS_URL: env["REDIS_URL"],
    S3_ENDPOINT: env["S3_ENDPOINT"],
    S3_REGION: env["S3_REGION"],
    S3_BUCKET: env["S3_BUCKET"],
    AWS_ACCESS_KEY_ID: env["AWS_ACCESS_KEY_ID"],
    AWS_SECRET_ACCESS_KEY: env["AWS_SECRET_ACCESS_KEY"]
  });

  if (!result.success) {
    const details = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`api_runtime_env_invalid: ${details}`);
  }

  let dbSslMode: PostgresSslMode;
  try {
    dbSslMode = parsePostgresSslMode(result.data.DB_SSL_MODE);
  } catch {
    throw new Error("api_runtime_env_invalid: DB_SSL_MODE: expected disable or require");
  }

  return {
    ...result.data,
    DB_SSL_MODE: dbSslMode
  };
}

export async function assertDatabaseSchema(queryable: Queryable): Promise<void> {
  const rows = await queryable.query<{ table_name: string }>(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
    `,
    [REQUIRED_API_TABLES]
  );

  const existing = new Set(rows.rows.map((row) => row.table_name));
  const missing = REQUIRED_API_TABLES.filter((table) => !existing.has(table));

  if (missing.length > 0) {
    throw new Error(`db_schema_missing_tables: ${missing.join(",")}`);
  }

  await assertStorageSchemaMigrationsApplied(queryable);
}

export async function assertRedisReady(redisUrl: string): Promise<void> {
  const redis = new Redis(redisUrl);
  try {
    const response = await redis.ping();
    if (response !== "PONG") {
      throw new Error("api_redis_not_ready");
    }
  } finally {
    await redis.quit();
  }
}

export async function assertS3BucketReady(env: ApiRuntimeEnv): Promise<void> {
  const s3 = new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY
    }
  });

  await s3.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }));
}

function createApiPool(env: ApiRuntimeEnv): Pool {
  const ssl = buildPostgresSslConfig(env.DB_SSL_MODE);

  return new Pool({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    ...(ssl === undefined ? {} : { ssl })
  });
}

export function buildApiReadinessCheck(env: ApiRuntimeEnv): () => Promise<void> {
  return async () => {
    const pool = createApiPool(env);

    try {
      await assertDatabaseSchema({
        query: async <Row extends Record<string, unknown>>(sql: string, params: unknown[]) => pool.query<Row>(sql, params)
      });
    } catch (error) {
      if (error instanceof Error && (error.message.startsWith("db_schema_missing_tables:") || error.message.startsWith("storage_schema_missing_migrations:") || error.message.startsWith("storage_migration_checksum_mismatch:"))) {
        throw error;
      }

      throw new Error(`api_database_unreachable: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      await pool.end();
    }

    try {
      await assertRedisReady(env.REDIS_URL);
    } catch (error) {
      if (error instanceof Error && error.message === "api_redis_not_ready") {
        throw error;
      }

      throw new Error(`api_redis_unreachable: ${error instanceof Error ? error.message : String(error)}`);
    }

    try {
      await assertS3BucketReady(env);
    } catch (error) {
      throw new Error(`api_s3_bucket_unreachable: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
}

export async function startApiServerFromEnv(envInput: Record<string, string | undefined>): Promise<void> {
  const env = parseApiRuntimeEnv(envInput);
  const logger = createRuntimeLoggerFromEnv({
    app: "api",
    defaultService: "debugbundle-api",
    env: envInput,
    ...(process.env["npm_package_version"] === undefined ? {} : { version: process.env["npm_package_version"] })
  });
  const readinessCheck = buildApiReadinessCheck(env);

  await readinessCheck();

  const dependencies = createApiDependenciesFromEnv({
    ...envInput,
    API_HOST: env.API_HOST,
    API_PORT: String(env.API_PORT),
    DEBUGBUNDLE_PROBE_TRIGGER_SECRET: env.DEBUGBUNDLE_PROBE_TRIGGER_SECRET,
    DB_HOST: env.DB_HOST,
    DB_PORT: String(env.DB_PORT),
    DB_USER: env.DB_USER,
    DB_PASSWORD: env.DB_PASSWORD,
    DB_NAME: env.DB_NAME,
    DB_SSL_MODE: env.DB_SSL_MODE,
    REDIS_URL: env.REDIS_URL,
    S3_ENDPOINT: env.S3_ENDPOINT,
    S3_REGION: env.S3_REGION,
    S3_BUCKET: env.S3_BUCKET,
    AWS_ACCESS_KEY_ID: env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: env.AWS_SECRET_ACCESS_KEY
  });

  const serverOptions: ApiServerOptions = {};
  const stripeConfig = createStripeConfig(envInput);
  if (stripeConfig) {
    const syncPool = createApiPool(env);
    const billingSyncStore = createPostgresBillingSyncStore({
      query: async <Row extends Record<string, unknown>>(sql: string, params: unknown[]) =>
        syncPool.query<Row>(sql, params)
    });
    serverOptions.stripeWebhook = {
      stripeConfig,
      billingSyncStore,
      ...(dependencies.auditLogging === undefined
        ? {}
        : { auditLogging: dependencies.auditLogging }),
      ...(dependencies.billingManagement === undefined
        ? {}
        : { billingSummaryReader: dependencies.billingManagement }),
      ...(dependencies.billingEmails === undefined
        ? {}
        : { billingEmails: dependencies.billingEmails })
    };
  }

  const app = createApiServer(dependencies, {
    ...serverOptions,
    logger,
    readinessCheck
  });
  logger.info({ host: env.API_HOST, port: env.API_PORT }, "api_server_starting");
  await app.listen({ host: env.API_HOST, port: env.API_PORT });
  logger.info({ host: env.API_HOST, port: env.API_PORT }, "api_server_listening");
}
