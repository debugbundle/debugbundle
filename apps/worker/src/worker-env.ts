import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { Redis } from "ioredis";
import type { Pool } from "pg";
import { z } from "zod";

import {
  parsePostgresSslMode,
  type PostgresSslMode
} from "../../../packages/storage/src/postgres-ssl.js";
import { assertStorageSchemaMigrationsApplied } from "../../../packages/storage/src/schema-migrations.js";
import { REQUIRED_WORKER_TABLES } from "../../../packages/storage/src/migrations.js";
import {
  assertIntegrationSecretEncryptionKey,
  type Queryable
} from "../../../packages/storage/src/index.js";
import { delay } from "./worker-steps.js";

const WorkerEnvSchema = z.object({
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
  AWS_SECRET_ACCESS_KEY: z.string().min(1).default("test"),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().min(100).default(1000),
  AVAILABILITY_CHECK_LOOP_INTERVAL_MS: z.coerce.number().int().min(100).default(250),
  AVAILABILITY_CHECK_CLAIM_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(20),
  AVAILABILITY_CHECK_CONCURRENCY: z.coerce.number().int().min(1).max(50).default(8),
  RETENTION_CLEANUP_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(60_000)
    .max(24 * 60 * 60 * 1000)
    .default(6 * 60 * 60 * 1000),
  ANALYTICS_OPPORTUNITY_EVALUATION_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(60_000)
    .max(24 * 60 * 60 * 1000)
    .default(6 * 60 * 60 * 1000),
  WEBHOOK_DELIVERY_SCHEDULER_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(25),
  WEBHOOK_DELIVERY_TIMEOUT_MS: z.coerce.number().int().min(100).max(30000).default(5000),
  GITHUB_APP_ID: z.string().min(1).optional(),
  GITHUB_APP_PRIVATE_KEY: z.string().min(1).optional(),
  INTEGRATION_SECRET_ENCRYPTION_KEY: z.string().min(1).optional(),
  WEEKLY_REPORT_SCHEDULER_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(25),
  WEEKLY_REPORT_EMAIL_TIMEOUT_MS: z.coerce.number().int().min(100).max(30000).default(5000),
  SES_REGION: z.string().min(1).optional(),
  SES_FROM_EMAIL: z.string().email().optional(),
  LIFECYCLE_WEBHOOK_TARGET_URL: z.string().url().optional(),
  LIFECYCLE_WEBHOOK_SECRET: z.string().min(1).optional(),
  WORKER_HEALTH_PORT: z.coerce.number().int().min(0).max(65535).default(0),
  WORKER_RUN_ONCE: z.enum(["0", "1"]).default("0"),
  ANALYTICS_HASH_SECRET: z.string().min(1)
});

export type WorkerEnv = Omit<z.infer<typeof WorkerEnvSchema>, "DB_SSL_MODE"> & {
  DB_SSL_MODE: PostgresSslMode;
};

export function readOptionalEnv(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

export interface WorkerShutdownState {
  isShuttingDown(): boolean;
  requestShutdown(): void;
  waitForShutdown(): Promise<void>;
  readinessCheck(readinessCheck: () => Promise<void>): Promise<void>;
}

export function createWorkerShutdownState(): WorkerShutdownState {
  let shuttingDown = false;
  let resolveShutdown: (() => void) | null = null;
  const shutdownPromise = new Promise<void>((resolve) => {
    resolveShutdown = resolve;
  });

  return {
    isShuttingDown() {
      return shuttingDown;
    },
    requestShutdown() {
      if (shuttingDown) {
        return;
      }

      shuttingDown = true;
      resolveShutdown?.();
    },
    async waitForShutdown() {
      await shutdownPromise;
    },
    async readinessCheck(readinessCheck: () => Promise<void>) {
      if (shuttingDown) {
        throw new Error("worker_draining");
      }

      await readinessCheck();
    }
  };
}

export function createPoolQueryable(pool: Pool): Queryable {
  return {
    query: async <Row extends Record<string, unknown>>(sql: string, params: unknown[]) =>
      pool.query<Row>(sql, params),
    transaction: async <Result>(callback: (db: Queryable) => Promise<Result>) => {
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

export async function delayUntilNextPollOrShutdown(
  ms: number,
  shutdownState: WorkerShutdownState
): Promise<void> {
  if (shutdownState.isShuttingDown()) {
    return;
  }

  await Promise.race([delay(ms), shutdownState.waitForShutdown()]);
}

export function normalizeWorkerBaseUrl(value: string | undefined): string | null {
  const trimmed = readOptionalEnv(value);
  if (trimmed === undefined) {
    return null;
  }

  return trimmed.replace(/\/+$/, "");
}

export function resolveWorkerEmailAssetBaseUrl(
  env: Record<string, string | undefined>
): string | null {
  return normalizeWorkerBaseUrl(
    env["EMAIL_ASSET_BASE_URL"] ?? env["APP_BASE_URL"] ?? env["PUBLIC_SITE_URL"]
  );
}

interface WebhookOwnerNotificationRecipient {
  organizationName: string;
  projectId: string;
  projectName: string;
  recipientEmail: string;
}

export async function getProjectName(
  queryable: Queryable,
  projectId: string
): Promise<string | null> {
  const result = await queryable.query<{ name: string }>(
    `
      SELECT name
      FROM projects
      WHERE id = $1::uuid
      LIMIT 1
    `,
    [projectId]
  );

  return result.rows[0]?.name ?? null;
}

export async function getProjectOrganizationId(
  queryable: Queryable,
  projectId: string
): Promise<string | null> {
  const result = await queryable.query<{ organization_id: string }>(
    `
      SELECT organization_id::text AS organization_id
      FROM projects
      WHERE id = $1::uuid
      LIMIT 1
    `,
    [projectId]
  );

  return result.rows[0]?.organization_id ?? null;
}

export async function getWebhookOwnerNotificationRecipient(
  queryable: Queryable,
  webhookId: string
): Promise<WebhookOwnerNotificationRecipient | null> {
  const result = await queryable.query<{
    organization_name: string;
    project_id: string;
    project_name: string;
    recipient_email: string;
  }>(
    `
      SELECT
        o.name AS organization_name,
        p.id::text AS project_id,
        p.name AS project_name,
        u.email AS recipient_email
      FROM agent_webhooks aw
      JOIN projects p
        ON p.id = aw.project_id
      JOIN organizations o
        ON o.id = p.organization_id
      JOIN organization_members om
        ON om.organization_id = o.id
       AND om.role = 'owner'
      JOIN users u
        ON u.id = om.user_id
      WHERE aw.id = $1
      ORDER BY om.created_at ASC, om.user_id ASC
      LIMIT 1
    `,
    [webhookId]
  );

  const row = result.rows[0];
  if (row === undefined) {
    return null;
  }

  return {
    organizationName: row.organization_name,
    projectId: row.project_id,
    projectName: row.project_name,
    recipientEmail: row.recipient_email
  };
}

export function parseWorkerEnv(env: Record<string, string | undefined>): WorkerEnv {
  const parsed = WorkerEnvSchema.safeParse({
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
    AWS_SECRET_ACCESS_KEY: env["AWS_SECRET_ACCESS_KEY"],
    WORKER_POLL_INTERVAL_MS: env["WORKER_POLL_INTERVAL_MS"],
    AVAILABILITY_CHECK_LOOP_INTERVAL_MS: env["AVAILABILITY_CHECK_LOOP_INTERVAL_MS"],
    AVAILABILITY_CHECK_CLAIM_BATCH_SIZE: env["AVAILABILITY_CHECK_CLAIM_BATCH_SIZE"],
    AVAILABILITY_CHECK_CONCURRENCY: env["AVAILABILITY_CHECK_CONCURRENCY"],
    RETENTION_CLEANUP_INTERVAL_MS: env["RETENTION_CLEANUP_INTERVAL_MS"],
    ANALYTICS_OPPORTUNITY_EVALUATION_INTERVAL_MS:
      env["ANALYTICS_OPPORTUNITY_EVALUATION_INTERVAL_MS"],
    WEBHOOK_DELIVERY_SCHEDULER_BATCH_SIZE: env["WEBHOOK_DELIVERY_SCHEDULER_BATCH_SIZE"],
    WEBHOOK_DELIVERY_TIMEOUT_MS: env["WEBHOOK_DELIVERY_TIMEOUT_MS"],
    GITHUB_APP_ID: readOptionalEnv(env["GITHUB_APP_ID"]),
    GITHUB_APP_PRIVATE_KEY: readOptionalEnv(env["GITHUB_APP_PRIVATE_KEY"]),
    INTEGRATION_SECRET_ENCRYPTION_KEY: readOptionalEnv(env["INTEGRATION_SECRET_ENCRYPTION_KEY"]),
    WEEKLY_REPORT_SCHEDULER_BATCH_SIZE: env["WEEKLY_REPORT_SCHEDULER_BATCH_SIZE"],
    WEEKLY_REPORT_EMAIL_TIMEOUT_MS: env["WEEKLY_REPORT_EMAIL_TIMEOUT_MS"],
    SES_REGION: readOptionalEnv(env["SES_REGION"]),
    SES_FROM_EMAIL: readOptionalEnv(env["SES_FROM_EMAIL"]),
    LIFECYCLE_WEBHOOK_TARGET_URL: readOptionalEnv(env["LIFECYCLE_WEBHOOK_TARGET_URL"]),
    LIFECYCLE_WEBHOOK_SECRET: readOptionalEnv(env["LIFECYCLE_WEBHOOK_SECRET"]),
    WORKER_HEALTH_PORT: env["WORKER_HEALTH_PORT"],
    WORKER_RUN_ONCE: env["WORKER_RUN_ONCE"],
    ANALYTICS_HASH_SECRET: env["ANALYTICS_HASH_SECRET"]
  });

  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`worker_env_invalid: ${detail}`);
  }

  let dbSslMode: PostgresSslMode;
  try {
    dbSslMode = parsePostgresSslMode(parsed.data.DB_SSL_MODE);
  } catch {
    throw new Error("worker_env_invalid: DB_SSL_MODE: expected disable or require");
  }

  if (parsed.data.INTEGRATION_SECRET_ENCRYPTION_KEY !== undefined) {
    try {
      assertIntegrationSecretEncryptionKey(parsed.data.INTEGRATION_SECRET_ENCRYPTION_KEY);
    } catch {
      throw new Error(
        "worker_env_invalid: INTEGRATION_SECRET_ENCRYPTION_KEY: expected 32-byte base64url secret"
      );
    }
  }

  return {
    ...parsed.data,
    DB_SSL_MODE: dbSslMode
  };
}

export async function assertWorkerSchema(queryable: Queryable): Promise<void> {
  const rows = await queryable.query<{ table_name: string }>(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
    `,
    [REQUIRED_WORKER_TABLES]
  );

  const existing = new Set(rows.rows.map((row) => row.table_name));
  const missing = REQUIRED_WORKER_TABLES.filter((table) => !existing.has(table));
  if (missing.length > 0) {
    throw new Error(`worker_schema_missing_tables: ${missing.join(",")}`);
  }

  await assertStorageSchemaMigrationsApplied(queryable);
}

export async function assertWorkerRedisReady(redisUrl: string): Promise<void> {
  const redis = new Redis(redisUrl);

  try {
    const response = await redis.ping();
    if (response !== "PONG") {
      throw new Error("worker_redis_not_ready");
    }
  } finally {
    await redis.quit();
  }
}

export async function assertWorkerS3BucketReady(env: WorkerEnv): Promise<void> {
  const s3Config = {
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY
    }
  };
  const s3 = new S3Client(s3Config);

  await s3.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }));
}

export function buildWorkerReadinessCheck(input: {
  env: WorkerEnv;
  queryable: Queryable;
}): () => Promise<void> {
  return async () => {
    try {
      await assertWorkerSchema(input.queryable);
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.startsWith("worker_schema_missing_tables:") ||
          error.message.startsWith("storage_schema_missing_migrations:") ||
          error.message.startsWith("storage_migration_checksum_mismatch:"))
      ) {
        throw error;
      }

      throw new Error(
        `worker_database_unreachable: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    try {
      await assertWorkerRedisReady(input.env.REDIS_URL);
    } catch (error) {
      if (error instanceof Error && error.message === "worker_redis_not_ready") {
        throw error;
      }

      throw new Error(
        `worker_redis_unreachable: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    try {
      await assertWorkerS3BucketReady(input.env);
    } catch (error) {
      throw new Error(
        `worker_s3_bucket_unreachable: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };
}
