import { Pool } from "pg";

import {
  createRedisAuthRateLimiter,
  createRedisIngestionRateLimiter,
  createRedisIncidentFrequencyCounter,
  createRedisQueueClient,
  createS3ObjectStoreClient,
  type Queryable
} from "../../../packages/storage/src/index.js";
import { buildPostgresSslConfig } from "../../../packages/storage/src/postgres-ssl.js";
import {
  createSesEmailTransport,
  formatProductFromEmail
} from "../../../packages/email/src/index.js";

import { createApiDependencies } from "./default-dependencies.js";
import type { DefaultApiDependencies } from "./default-dependency-types.js";
import {
  createAuthEmailSender,
  createBillingEmailService,
  createGithubOAuthConfigFromEnv,
  readAdminAnalyticsEmailsFromEnv,
  readBillingAdminEmailsFromEnv,
  readNonEmptyEnv,
  resolveEmailAssetBaseUrl
} from "./default-dependency-helpers.js";
import { createGitHubAppClientFromEnv } from "./github-app.js";
import { createStripeConfig } from "./stripe-config.js";

function createPoolQueryable(pool: Pool): Queryable {
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

export function createApiDependenciesFromEnv(
  env: Record<string, string | undefined>
): DefaultApiDependencies & { close(): Promise<void> } {
  const githubOAuth = createGithubOAuthConfigFromEnv(env);
  const dbSsl = buildPostgresSslConfig(env["DB_SSL_MODE"]);
  const dbPool = new Pool({
    host: env["DB_HOST"] ?? "localhost",
    port: Number(env["DB_PORT"] ?? "5432"),
    user: env["DB_USER"] ?? "debugbundle",
    password: env["DB_PASSWORD"] ?? "debugbundle",
    database: env["DB_NAME"] ?? "debugbundle",
    ...(dbSsl === undefined ? {} : { ssl: dbSsl })
  });
  const db = createPoolQueryable(dbPool);

  const queue = createRedisQueueClient({
    redisUrl: env["REDIS_URL"] ?? "redis://localhost:6379"
  });

  const frequencyCounter = createRedisIncidentFrequencyCounter({
    redisUrl: env["REDIS_URL"] ?? "redis://localhost:6379",
    snapshotStore: {
      query: async <Row extends Record<string, unknown>>(sql: string, params: unknown[]) =>
        dbPool.query<Row>(sql, params)
    }
  });

  const objectStore = createS3ObjectStoreClient({
    endpoint: env["S3_ENDPOINT"] ?? "http://localhost:4566",
    region: env["S3_REGION"] ?? "us-east-1",
    bucket: env["S3_BUCKET"] ?? "debugbundle-raw-events",
    accessKeyId: env["AWS_ACCESS_KEY_ID"] ?? "test",
    secretAccessKey: env["AWS_SECRET_ACCESS_KEY"] ?? "test",
    forcePathStyle: true
  });
  const authEmails =
    env["SES_FROM_EMAIL"] !== undefined
      ? createSesEmailTransport({
          region: env["SES_REGION"] ?? env["S3_REGION"] ?? "us-east-1",
          fromEmail: formatProductFromEmail(env["SES_FROM_EMAIL"]),
          ...(env["AWS_ACCESS_KEY_ID"] === undefined || env["AWS_SECRET_ACCESS_KEY"] === undefined
            ? {}
            : {
                accessKeyId: env["AWS_ACCESS_KEY_ID"],
                secretAccessKey: env["AWS_SECRET_ACCESS_KEY"]
              }),
          timeoutMs: Number(env["AUTH_EMAIL_TIMEOUT_MS"] ?? env["WEEKLY_REPORT_EMAIL_TIMEOUT_MS"] ?? "10000")
        })
      : undefined;

  const appBaseUrl = env["APP_BASE_URL"] ?? "http://localhost:3000";
  const emailAssetBaseUrl = resolveEmailAssetBaseUrl(env);
  const authEmailSender =
    authEmails === undefined
      ? undefined
      : createAuthEmailSender({
          emailTransport: authEmails,
          appBaseUrl,
          ...(emailAssetBaseUrl === undefined ? {} : { emailAssetBaseUrl })
        });
  const billingEmails =
    authEmails === undefined
      ? undefined
      : createBillingEmailService({
          db: {
            query: async <Row extends Record<string, unknown>>(sql: string, params: unknown[]) =>
              dbPool.query<Row>(sql, params)
          },
          emailTransport: authEmails,
          appBaseUrl
        });

  const stripeConfig = createStripeConfig(env) ?? undefined;
  const githubAppClient = createGitHubAppClientFromEnv(env);
  const lifecycleWebhookFallbackTargetUrl = readNonEmptyEnv(env, "LIFECYCLE_WEBHOOK_TARGET_URL");
  const lifecycleWebhookFallbackSigningSecret = readNonEmptyEnv(env, "LIFECYCLE_WEBHOOK_SECRET");
  const adminAnalyticsAccessEmails = readAdminAnalyticsEmailsFromEnv(env);
  const billingAdminEmails = readBillingAdminEmailsFromEnv(env);
  const reviewAccessSecret = readNonEmptyEnv(env, "REVIEW_ACCESS_SECRET");

  const authRateLimiter = createRedisAuthRateLimiter({
    redisUrl: env["REDIS_URL"] ?? "redis://localhost:6379"
  });
  const ingestionRateLimiter = createRedisIngestionRateLimiter({
    redisUrl: env["REDIS_URL"] ?? "redis://localhost:6379"
  });

  const dependencies = createApiDependencies({
    db,
    queue,
    objectStore,
    frequencyCounter,
    ...(env["ANALYTICS_HASH_SECRET"] === undefined
      ? {}
      : { analyticsHashSecret: env["ANALYTICS_HASH_SECRET"] }),
    appBaseUrl,
    ...(adminAnalyticsAccessEmails === undefined ? {} : { adminAnalyticsAccessEmails }),
    ...(authEmailSender === undefined ? {} : { authEmails: authEmailSender }),
    ...(billingEmails === undefined ? {} : { billingEmails }),
    ...(githubOAuth === undefined ? {} : { githubOAuth }),
    ...(githubAppClient === undefined ? {} : { githubAppClient }),
    ...(billingAdminEmails === undefined && reviewAccessSecret === undefined
      ? {}
      : { billingAdminEmails: billingAdminEmails ?? [] }),
    ...(stripeConfig === undefined ? {} : { stripeConfig }),
    ...(lifecycleWebhookFallbackTargetUrl === undefined ? {} : { lifecycleWebhookFallbackTargetUrl }),
    ...(lifecycleWebhookFallbackSigningSecret === undefined ? {} : { lifecycleWebhookFallbackSigningSecret }),
    authRateLimiter,
    ingestionRateLimiter
  });

  return {
    ...dependencies,
    async close(): Promise<void> {
      await authRateLimiter.close();
      await ingestionRateLimiter.close();
      await frequencyCounter.close();
      await queue.close();
      await dbPool.end();
    }
  };
}
