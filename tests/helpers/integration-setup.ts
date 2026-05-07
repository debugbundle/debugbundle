import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { Pool } from "pg";
import { describe } from "vitest";

import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import { migrateStorageSchema } from "../../packages/storage/src/schema-migrations.js";
import {
  createS3ObjectStoreClient,
  createRedisQueueClient
} from "../../packages/storage/src/index.js";
import type {
  IncidentFrequencyCounter,
  Queryable,
  RedisQueueClient
} from "../../packages/storage/src/index.js";

/* ── Environment ───────────────────────────────────────────── */

export const dbHost = process.env["DB_HOST"] ?? "postgres";
export const dbPort = Number(process.env["DB_PORT"] ?? "5432");
export const dbUser = process.env["DB_USER"] ?? "debugbundle";
export const dbPassword = process.env["DB_PASSWORD"] ?? "debugbundle";
export const dbName = process.env["DB_NAME"] ?? "debugbundle";
export const redisUrl = process.env["REDIS_URL"] ?? "redis://redis:6379";
export const s3Endpoint = process.env["S3_ENDPOINT"] ?? "http://localstack:4566";
export const s3Region = process.env["S3_REGION"] ?? "us-east-1";
export const s3Bucket = process.env["S3_BUCKET"] ?? "debugbundle-raw-events";

/* ── Conditional describe (skipped when RUN_INTEGRATION !== "1") ── */

export const runIntegration =
  process.env["RUN_INTEGRATION"] === "1" ? describe : describe.skip;

/* ── Factory helpers ───────────────────────────────────────── */

export function createIntegrationPool(): Pool {
  return new Pool({
    host: dbHost,
    port: dbPort,
    user: dbUser,
    password: dbPassword,
    database: dbName
  });
}

export function createS3AdminClient(): S3Client {
  return new S3Client({
    endpoint: s3Endpoint,
    region: s3Region,
    forcePathStyle: true,
    credentials: { accessKeyId: "test", secretAccessKey: "test" }
  });
}

export function createQueryable(pool: Pool): Queryable {
  return {
    query: async <Row extends Record<string, unknown>>(
      sql: string,
      params: unknown[]
    ) => pool.query<Row>(sql, params)
  };
}

export function createTestObjectStore(): ReturnType<typeof createS3ObjectStoreClient> {
  return createS3ObjectStoreClient({
    endpoint: s3Endpoint,
    region: s3Region,
    bucket: s3Bucket,
    accessKeyId: "test",
    secretAccessKey: "test",
    forcePathStyle: true
  });
}

export function createTestQueue(): RedisQueueClient {
  return createRedisQueueClient({ redisUrl });
}

export function createNonSpikingFrequencyCounter(): IncidentFrequencyCounter {
  return {
    recordOccurrence: () =>
      Promise.resolve({
        occurrences_1m: 1,
        occurrences_5m: 1,
        occurrences_1h: 1,
        occurrences_24h: 1,
        baseline_1h_per_5m: 1,
        spike_ratio_5m_to_1h: 1,
        has_sufficient_baseline: false,
        is_spiking: false
      })
  };
}

export function createNoopWebhookPublisher(): { publish: () => Promise<void> } {
  return { publish: () => Promise.resolve(undefined) };
}

/* ── Suite lifecycle ───────────────────────────────────────── */

export async function bootstrapStorageAndCreateBucket(
  pool: Pool,
  s3Admin: S3Client
): Promise<void> {
  const db = createQueryable(pool);
  await bootstrapStorageSchema(db);
  await migrateStorageSchema(db);
  await s3Admin.send(new CreateBucketCommand({ Bucket: s3Bucket })).catch(() => undefined);
}
