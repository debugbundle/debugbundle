import { Pool } from "pg";
import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { createHmac, createPrivateKey, createSign } from "node:crypto";
import { createServer, type Server } from "node:http";
import { Redis } from "ioredis";
import { z } from "zod";

import { createRuntimeLoggerFromEnv, getErrorMessage, type RuntimeLogger } from "../../../packages/runtime-logger/src/index.js";
import { buildPostgresSslConfig, parsePostgresSslMode, type PostgresSslMode } from "../../../packages/storage/src/postgres-ssl.js";
import { assertStorageSchemaMigrationsApplied } from "../../../packages/storage/src/schema-migrations.js";
import {
  createSesEmailTransport,
  formatProductFromEmail,
  renderAlertEmail,
  renderWeeklyReportEmail,
  type EmailTransport
} from "../../../packages/email/src/index.js";
import { REQUIRED_WORKER_TABLES } from "../../../packages/storage/src/migrations.js";
import {
  createPostgresAlertDeliveryStore,
  createPostgresBillingStore,
  createPostgresGitHubStore,
  createPostgresWebhookDeliveryStore,
  createPostgresMetadataStore,
  createPostgresRetentionStore,
  createRetentionCleanupService,
  createPostgresWeeklyReportChannelStore,
  createPostgresWeeklyReportDeliveryStore,
  createRedisIncidentFrequencyCounter,
  createRedisQueueClient,
  createS3ObjectStoreClient,
  type WeeklyReportChannelRecord,
  type GitHubStore,
  type WebhookDeliveryStore,
  type WeeklyReportingStore,
  type Queryable
} from "../../../packages/storage/src/index.js";
import {
  processNextGroupIncidentJob,
  processNextBuildBundleJob,
  processNextBuildReproductionJob,
  processNextEvaluateAlertsJob,
  processNextCleanupRetentionJob,
  processNextDeliverGitHubDispatchJob,
  processNextDeliverWebhookJob,
  processNextGenerateWeeklyReportJob,
  AlertDeliveryError,
  GitHubDispatchDeliveryError,
  LifecycleWebhookDeliveryError,
  processNextNormalizeEventsJob,
  type AlertDeliveryTransport,
  type GitHubDispatchTransport,
  type IncidentLifecycleGitHubDispatchPublisher,
  type LifecycleWebhookTransport,
  type IncidentLifecycleWebhookPublisher,
  type ProcessedEventStore,
  type WeeklyReportTransport
} from "./processor.js";

const RETENTION_CLEANUP_LEASE_KEY = "leases:cleanup-retention:schedule";

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
  RETENTION_CLEANUP_INTERVAL_MS: z.coerce.number().int().min(60_000).max(24 * 60 * 60 * 1000).default(6 * 60 * 60 * 1000),
  WEBHOOK_DELIVERY_SCHEDULER_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(25),
  WEBHOOK_DELIVERY_TIMEOUT_MS: z.coerce.number().int().min(100).max(30000).default(5000),
  GITHUB_APP_ID: z.string().min(1).optional(),
  GITHUB_APP_PRIVATE_KEY: z.string().min(1).optional(),
  WEEKLY_REPORT_SCHEDULER_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(25),
  WEEKLY_REPORT_EMAIL_TIMEOUT_MS: z.coerce.number().int().min(100).max(30000).default(5000),
  SES_REGION: z.string().min(1).optional(),
  SES_FROM_EMAIL: z.string().email().optional(),
  LIFECYCLE_WEBHOOK_TARGET_URL: z.string().url().optional(),
  LIFECYCLE_WEBHOOK_SECRET: z.string().min(1).optional(),
  WORKER_HEALTH_PORT: z.coerce.number().int().min(0).max(65535).default(0),
  WORKER_RUN_ONCE: z.enum(["0", "1"]).default("0")
});

export type WorkerEnv = Omit<z.infer<typeof WorkerEnvSchema>, "DB_SSL_MODE"> & {
  DB_SSL_MODE: PostgresSslMode;
};

function readOptionalEnv(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function normalizeWorkerBaseUrl(value: string | undefined): string | null {
  const trimmed = readOptionalEnv(value);
  if (trimmed === undefined) {
    return null;
  }

  return trimmed.replace(/\/+$/, "");
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
    RETENTION_CLEANUP_INTERVAL_MS: env["RETENTION_CLEANUP_INTERVAL_MS"],
    WEBHOOK_DELIVERY_SCHEDULER_BATCH_SIZE: env["WEBHOOK_DELIVERY_SCHEDULER_BATCH_SIZE"],
    WEBHOOK_DELIVERY_TIMEOUT_MS: env["WEBHOOK_DELIVERY_TIMEOUT_MS"],
    GITHUB_APP_ID: readOptionalEnv(env["GITHUB_APP_ID"]),
    GITHUB_APP_PRIVATE_KEY: readOptionalEnv(env["GITHUB_APP_PRIVATE_KEY"]),
    WEEKLY_REPORT_SCHEDULER_BATCH_SIZE: env["WEEKLY_REPORT_SCHEDULER_BATCH_SIZE"],
    WEEKLY_REPORT_EMAIL_TIMEOUT_MS: env["WEEKLY_REPORT_EMAIL_TIMEOUT_MS"],
    SES_REGION: readOptionalEnv(env["SES_REGION"]),
    SES_FROM_EMAIL: readOptionalEnv(env["SES_FROM_EMAIL"]),
    LIFECYCLE_WEBHOOK_TARGET_URL: readOptionalEnv(env["LIFECYCLE_WEBHOOK_TARGET_URL"]),
    LIFECYCLE_WEBHOOK_SECRET: readOptionalEnv(env["LIFECYCLE_WEBHOOK_SECRET"]),
    WORKER_HEALTH_PORT: env["WORKER_HEALTH_PORT"],
    WORKER_RUN_ONCE: env["WORKER_RUN_ONCE"]
  });

  if (!parsed.success) {
    const detail = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`worker_env_invalid: ${detail}`);
  }

  let dbSslMode: PostgresSslMode;
  try {
    dbSslMode = parsePostgresSslMode(parsed.data.DB_SSL_MODE);
  } catch {
    throw new Error("worker_env_invalid: DB_SSL_MODE: expected disable or require");
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

function buildWorkerReadinessCheck(input: {
  env: WorkerEnv;
  queryable: Queryable;
}): () => Promise<void> {
  return async () => {
    try {
      await assertWorkerSchema(input.queryable);
    } catch (error) {
      if (error instanceof Error && (error.message.startsWith("worker_schema_missing_tables:") || error.message.startsWith("storage_schema_missing_migrations:") || error.message.startsWith("storage_migration_checksum_mismatch:"))) {
        throw error;
      }

      throw new Error(`worker_database_unreachable: ${error instanceof Error ? error.message : String(error)}`);
    }

    try {
      await assertWorkerRedisReady(input.env.REDIS_URL);
    } catch (error) {
      if (error instanceof Error && error.message === "worker_redis_not_ready") {
        throw error;
      }

      throw new Error(`worker_redis_unreachable: ${error instanceof Error ? error.message : String(error)}`);
    }

    try {
      await assertWorkerS3BucketReady(input.env);
    } catch (error) {
      throw new Error(`worker_s3_bucket_unreachable: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
}

export function createProcessedEventStore(db: Queryable): ProcessedEventStore {
  return {
    async upsertProcessedEvent(input): Promise<{ inserted: boolean }> {
      const result = await db.query<{ event_id: string }>(
        `
          INSERT INTO processed_events (event_id, project_id, event_type, fingerprint, normalized_message, processed_at)
          VALUES ($1, $2, $3, $4, $5, now())
          ON CONFLICT (event_id) DO NOTHING
          RETURNING event_id::text AS event_id
        `,
        [input.event_id, input.project_id, input.event_type, input.fingerprint, input.normalized_message]
      );

      return {
        inserted: result.rows.length > 0
      };
    }
  };
}

interface CreateLifecycleWebhookPublisherInput {
  fallbackTargetUrl: string | null;
  fallbackSigningSecret: string | null;
  webhookDeliveryStore: Pick<WebhookDeliveryStore, "listMatchingWebhooks" | "createDeliveryIntent">;
}

interface GitHubDispatchTokenCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

interface CreateGitHubDispatchPublisherInput {
  githubStore: Pick<
    GitHubStore,
    | "listMatchingGitHubDispatchRules"
    | "hasRecentGitHubDispatch"
    | "countProjectGitHubDispatchesSince"
    | "countInstallationGitHubDispatchesSince"
    | "createGitHubDispatchDeliveryIntent"
  >;
}

export function getIncidentStatusForDispatchEvent(
  eventType: "bundle.created" | "bundle.updated" | "bundle.reopened" | "incident.spike_detected"
): "new_only" | "reopened_only" | "new_or_reopened" {
  if (eventType === "bundle.created") {
    return "new_or_reopened";
  }

  if (eventType === "bundle.reopened") {
    return "new_or_reopened";
  }

  return "new_or_reopened";
}

function getGitHubDispatchDedupeKey(event: {
  event_type: "bundle.created" | "bundle.updated" | "bundle.reopened" | "incident.spike_detected";
  occurred_at: string;
  bundle_version?: number;
}): string {
  return `${event.event_type}:${event.bundle_version ?? event.occurred_at}`;
}

export function createGitHubDispatchPublisher(input: CreateGitHubDispatchPublisherInput): IncidentLifecycleGitHubDispatchPublisher {
  return {
    async publish(event): Promise<void> {
      const matching = await input.githubStore.listMatchingGitHubDispatchRules({
        project_id: event.project_id,
        event_type: event.event_type,
        environment: event.environment,
        service_name: event.service_name,
        severity: event.severity,
        bundle_type: event.bundle_type ?? "failure",
        incident_status: getIncidentStatusForDispatchEvent(event.event_type)
      });

      const since = new Date(Date.parse(event.occurred_at) - 60 * 60 * 1000).toISOString();

      for (const rule of matching) {
        const withinCooldown = await input.githubStore.hasRecentGitHubDispatch({
          rule_id: rule.rule_id,
          incident_fingerprint: `${event.incident_id}:${event.event_type}`,
          cooldown_seconds: rule.cooldown_seconds
        });
        if (withinCooldown) {
          continue;
        }

        const projectCount = await input.githubStore.countProjectGitHubDispatchesSince({
          project_id: event.project_id,
          since
        });
        if (projectCount >= 100) {
          continue;
        }

        const installationCount = await input.githubStore.countInstallationGitHubDispatchesSince({
          installation_id: rule.installation_id,
          since
        });
        if (installationCount >= 4000) {
          continue;
        }

        await input.githubStore.createGitHubDispatchDeliveryIntent({
          rule_id: rule.rule_id,
          project_id: event.project_id,
          incident_id: event.incident_id,
          incident_fingerprint: `${event.incident_id}:${event.event_type}`,
          dedupe_key: getGitHubDispatchDedupeKey(event),
          installation_id: rule.installation_id,
          repo_owner: rule.repo_owner,
          repo_name: rule.repo_name,
          dispatch_payload: {
            debugbundle_event: event.event_type,
            incident_id: event.incident_id,
            bundle_type: event.bundle_type ?? "failure",
            bundle_version: event.bundle_version ?? 1,
            severity: event.severity,
            service: event.service_name,
            environment: event.environment,
            title: event.title ?? null,
            links: {
              bundle: `/v1/incidents/${event.incident_id}/bundle`,
              reproduction: `/v1/incidents/${event.incident_id}/reproduction`,
              dashboard: `/incidents/${event.incident_id}`
            },
            debugbundle: {
              project_id: event.project_id,
              occurrence_count: event.occurrence_count ?? 1,
              first_seen_at: event.first_seen_at ?? event.occurred_at
            }
          }
        });
      }
    }
  };
}

export function createLifecycleWebhookPublisher(input: CreateLifecycleWebhookPublisherInput): IncidentLifecycleWebhookPublisher {
  return {
    async publish(event): Promise<void> {
      const matchInput: Parameters<typeof input.webhookDeliveryStore.listMatchingWebhooks>[0] = {
        project_id: event.project_id,
        event_type: event.event_type,
        environment: event.environment,
        service_name: event.service_name,
        severity: event.severity
      };

      if (event.bundle_type !== undefined) {
        matchInput.bundle_type = event.bundle_type;
      }
      if (event.is_verification !== undefined) {
        matchInput.is_verification = event.is_verification;
      }

      const matching = await input.webhookDeliveryStore.listMatchingWebhooks(matchInput);

      const fallback =
        input.fallbackTargetUrl !== null && input.fallbackSigningSecret !== null
          ? [
              {
                webhook_id: `fallback-${event.project_id}`,
                target_url: input.fallbackTargetUrl,
                signing_secret: input.fallbackSigningSecret
              }
            ]
          : [];

      const targets = matching.length > 0 ? matching : fallback;

      for (const target of targets) {
        await input.webhookDeliveryStore.createDeliveryIntent({
          webhook_id: target.webhook_id,
          project_id: event.project_id,
          incident_id: event.incident_id,
          event_type: event.event_type,
          occurred_at: event.occurred_at,
          target_url: target.target_url,
          signing_secret: target.signing_secret,
          payload: {
            event: event.event_type,
            event_type: event.event_type,
            incident_id: event.incident_id,
            project_id: event.project_id,
            occurred_at: event.occurred_at,
            service: event.service_name,
            environment: event.environment,
            severity: event.severity,
            bundle_type: event.bundle_type ?? "failure",
            verification: event.is_verification ?? false,
            summary: event.title ?? null,
            links: {
              bundle: `/v1/incidents/${event.incident_id}/bundle`,
              reproduction: `/v1/incidents/${event.incident_id}/reproduction`
            },
            regression_after_deploy: event.regression_deploy !== undefined && event.regression_deploy !== null,
            deploy_version: event.regression_deploy?.version ?? null,
            deploy_commit_sha: event.regression_deploy?.commit_sha ?? null,
            deploy_branch: event.regression_deploy?.branch ?? null,
            deploy_deployed_at: event.regression_deploy?.deployed_at ?? null,
            minutes_since_deploy: event.regression_deploy?.minutes_since_deploy ?? null
          }
        });
      }
    }
  };
}

export function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

export function buildGitHubAppJwt(appId: string, privateKeyPem: string, now: Date): string {
  const issuedAtSeconds = Math.floor(now.getTime() / 1000);
  const payload = {
    iat: issuedAtSeconds - 30,
    exp: issuedAtSeconds + 9 * 60,
    iss: appId
  };
  const encodedHeader = encodeBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(createPrivateKey(privateKeyPem));
  return `${signingInput}.${signature.toString("base64url")}`;
}

export function normalizeGitHubPrivateKey(value: string): string {
  return value.includes("\\n") ? value.replace(/\\n/g, "\n") : value;
}

export function createGitHubDispatchTransport(input: {
  appId: string;
  privateKey: string;
  tokenCache: GitHubDispatchTokenCache;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  createAppJwt?: (appId: string, privateKey: string, now: Date) => string;
}): GitHubDispatchTransport {
  const fetchImpl = input.fetchImpl ?? fetch;
  const now = input.now ?? (() => new Date());
  const createAppJwt = input.createAppJwt ?? buildGitHubAppJwt;
  const normalizedPrivateKey = normalizeGitHubPrivateKey(input.privateKey);

  async function getInstallationToken(installationId: number): Promise<string> {
    const cacheKey = `github-installation-token:${installationId}`;
    const cached = await input.tokenCache.get(cacheKey);
    if (cached !== null) {
      return cached;
    }

    const response = await fetchImpl(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
      method: "POST",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${createAppJwt(input.appId, normalizedPrivateKey, now())}`,
        "x-github-api-version": "2022-11-28",
        "user-agent": "DebugBundle/0.1"
      }
    });
    if (!response.ok) {
      throw new GitHubDispatchDeliveryError(`github_dispatch_token_error_${response.status}`, response.status, null);
    }

    const body = (await response.json()) as { token?: unknown };
    if (typeof body.token !== "string" || body.token.length === 0) {
      throw new GitHubDispatchDeliveryError("github_dispatch_token_invalid_response", null, null);
    }

    await input.tokenCache.set(cacheKey, body.token, 50 * 60);
    return body.token;
  }

  return {
    async deliver(event): Promise<void> {
      const token = await getInstallationToken(event.installation_id);
      const response = await fetchImpl(`https://api.github.com/repos/${event.repo_owner}/${event.repo_name}/dispatches`, {
        method: "POST",
        headers: {
          accept: "application/vnd.github+json",
          authorization: `token ${token}`,
          "content-type": "application/json",
          "x-github-api-version": "2022-11-28",
          "user-agent": "DebugBundle/0.1"
        },
        body: JSON.stringify({
          event_type: "debugbundle.incident",
          client_payload: {
            ...event.dispatch_payload,
            debugbundle: {
              ...(typeof event.dispatch_payload["debugbundle"] === "object" &&
              event.dispatch_payload["debugbundle"] !== null
                ? event.dispatch_payload["debugbundle"]
                : {}),
              dispatch_id: event.delivery_id,
              dispatched_at: now().toISOString()
            }
          }
        })
      });

      if (!response.ok) {
        const retryAfterHeader = response.headers.get("retry-after");
        const retryAfterSeconds = retryAfterHeader === null ? null : Number.parseInt(retryAfterHeader, 10);
        throw new GitHubDispatchDeliveryError(
          `github_dispatch_http_error_${response.status}`,
          response.status,
          Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : null
        );
      }
    }
  };
}

export function createWorkerHealthServer(input: { port: number; readinessCheck?: () => Promise<void> }): Server {
  const startedAtMs = Date.now();

  const server = createServer((req, res) => {
    const url = req.url ?? "";

    if (url === "/health") {
      const uptime = (Date.now() - startedAtMs) / 1000;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok", uptime }));
      return;
    }

    if (url === "/ready") {
      if (input.readinessCheck === undefined) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ status: "ready" }));
        return;
      }

      void input.readinessCheck().then(
        () => {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ status: "ready" }));
        },
        (error: unknown) => {
          res.writeHead(503, { "content-type": "application/json" });
          res.end(
            JSON.stringify({
              status: "not_ready",
              reason: error instanceof Error ? error.message : String(error)
            })
          );
        }
      );
      return;
    }

    if (url === "/live") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "live" }));
      return;
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not_found" }));
  });

  server.listen(input.port);
  return server;
}

interface CreateLifecycleWebhookTransportInput {
  timeoutMs: number;
}

function computeWebhookSignature(payload: string, secret: string): string {
  const digest = createHmac("sha256", secret).update(payload, "utf8").digest("hex");
  return `sha256=${digest}`;
}

export function createLifecycleWebhookTransport(input: CreateLifecycleWebhookTransportInput): LifecycleWebhookTransport {
  return {
    async deliver(event): Promise<void> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

      try {
        const serializedPayload = JSON.stringify(event.payload);
        const response = await fetch(event.target_url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-debugbundle-signature": computeWebhookSignature(serializedPayload, event.signing_secret)
          },
          body: serializedPayload,
          signal: controller.signal
        });

        if (!response.ok) {
          throw new LifecycleWebhookDeliveryError(`webhook_http_error_${response.status}`, response.status);
        }
      } catch (error) {
        if (error instanceof LifecycleWebhookDeliveryError) {
          throw error;
        }

        if (error instanceof Error && error.name === "AbortError") {
          throw new LifecycleWebhookDeliveryError("webhook_timeout", null);
        }

        const message = error instanceof Error ? error.message : String(error);
        throw new LifecycleWebhookDeliveryError(`webhook_transport_error:${message}`, null);
      } finally {
        clearTimeout(timeout);
      }
    }
  };
}

interface CreateAlertTransportInput {
  timeoutMs: number;
  emailTransport: EmailTransport | null;
  appBaseUrl?: string | null;
  apiBaseUrl?: string | null;
}

export function createAlertTransport(input: CreateAlertTransportInput): AlertDeliveryTransport {
  async function deliverViaWebhook(targetUrl: string, payload: Record<string, unknown>): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

    try {
      const response = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new AlertDeliveryError(`alert_http_error_${response.status}`);
      }
    } catch (error) {
      if (error instanceof AlertDeliveryError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new AlertDeliveryError("alert_timeout");
      }

      const message = error instanceof Error ? error.message : String(error);
      throw new AlertDeliveryError(`alert_transport_error:${message}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    async deliver(event): Promise<void> {
      if (event.channel === "email") {
        if (input.emailTransport === null) {
          throw new AlertDeliveryError("alert_email_not_configured");
        }

        const toField = event.config["to"];
        const recipient = typeof toField === "string" ? toField.trim().toLowerCase() : "";

        if (recipient.length === 0) {
          throw new AlertDeliveryError("alert_email_recipients_missing");
        }
        const conditionType = typeof event.payload["condition_type"] === "string" ? event.payload["condition_type"] : "alert";
        const incidentId =
          typeof event.payload["incident_id"] === "string"
            ? event.payload["incident_id"]
            : typeof event.incident_id === "string"
              ? event.incident_id
              : "unknown";
        const occurredAt = typeof event.payload["occurred_at"] === "string" ? event.payload["occurred_at"] : "unknown";
        const serviceName = typeof event.payload["service_name"] === "string" ? event.payload["service_name"] : "unknown";
        const environment = typeof event.payload["environment"] === "string" ? event.payload["environment"] : "unknown";
        const severity =
          event.payload["severity"] === "low" ||
          event.payload["severity"] === "medium" ||
          event.payload["severity"] === "high" ||
          event.payload["severity"] === "critical"
            ? event.payload["severity"]
            : "high";
        const incidentUrl = input.appBaseUrl === undefined || input.appBaseUrl === null ? null : `${input.appBaseUrl}/incidents/${incidentId}`;
        const bundleUrl = input.apiBaseUrl === undefined || input.apiBaseUrl === null ? null : `${input.apiBaseUrl}/v1/incidents/${incidentId}/bundle`;
        const rendered = renderAlertEmail({
          conditionType,
          incidentId,
          occurredAt,
          serviceName,
          environment,
          severity,
          incidentUrl,
          bundleUrl
        });

        try {
          await input.emailTransport.send({
            to: [recipient],
            subject: rendered.subject,
            text: rendered.text,
            html: rendered.html
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new AlertDeliveryError(`alert_email_error:${message}`);
        }
        return;
      }

      if (event.channel === "slack") {
        const webhookUrl = event.config["webhook_url"] ?? event.config["url"];
        if (typeof webhookUrl !== "string" || webhookUrl.length === 0) {
          throw new AlertDeliveryError("alert_slack_webhook_url_missing");
        }

        const summary = typeof event.payload["summary"] === "string" ? event.payload["summary"] : "Alert triggered";
        const eventType = typeof event.payload["event_type"] === "string" ? event.payload["event_type"] : "alert";
        const slackPayload = {
          text: `[DebugBundle] ${eventType}: ${summary}`,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*${eventType}*: ${summary}`
              }
            }
          ]
        };

        await deliverViaWebhook(webhookUrl, slackPayload);
        return;
      }

      if (event.channel === "discord") {
        const webhookUrl = event.config["webhook_url"] ?? event.config["url"];
        if (typeof webhookUrl !== "string" || webhookUrl.length === 0) {
          throw new AlertDeliveryError("alert_discord_webhook_url_missing");
        }

        const summary = typeof event.payload["summary"] === "string" ? event.payload["summary"] : "Alert triggered";
        const eventType = typeof event.payload["event_type"] === "string" ? event.payload["event_type"] : "alert";
        const discordPayload = {
          content: `**[DebugBundle]** ${eventType}: ${summary}`,
          embeds: [
            {
              title: eventType,
              description: summary,
              color: 0xff4444
            }
          ]
        };

        await deliverViaWebhook(webhookUrl, discordPayload);
        return;
      }

      if (event.channel === "webhook") {
        const targetUrlValue = event.config["target_url"] ?? event.config["url"];
        if (typeof targetUrlValue !== "string" || targetUrlValue.length === 0) {
          throw new AlertDeliveryError("alert_target_url_missing");
        }

        await deliverViaWebhook(targetUrlValue, event.payload);
        return;
      }

      throw new AlertDeliveryError(`alert_channel_not_supported:${event.channel as string}`);
    }
  };
}

export async function scheduleDueWebhookDeliveries(input: {
  queue: { enqueue(jobName: "deliver-webhook", payload: { delivery_id: string; attempt: number }): Promise<void> };
  webhookDeliveryStore: Pick<WebhookDeliveryStore, "claimDueDeliveries">;
  batchSize: number;
}): Promise<number> {
  const dueDeliveries = await input.webhookDeliveryStore.claimDueDeliveries(input.batchSize);

  for (const job of dueDeliveries) {
    await input.queue.enqueue("deliver-webhook", job);
  }

  return dueDeliveries.length;
}

export async function scheduleDueGitHubDispatches(input: {
  queue: { enqueue(jobName: "deliver-github-dispatch", payload: { delivery_id: string; attempt: number }): Promise<void> };
  githubStore: Pick<GitHubStore, "claimDueGitHubDispatchDeliveries">;
  batchSize: number;
}): Promise<number> {
  const dueDeliveries = await input.githubStore.claimDueGitHubDispatchDeliveries(input.batchSize);

  for (const job of dueDeliveries) {
    await input.queue.enqueue("deliver-github-dispatch", job);
  }

  return dueDeliveries.length;
}

export async function scheduleWeeklyReports(input: {
  queue: {
    enqueue(jobName: "generate-weekly-report", payload: {
      delivery_id: string;
      weekly_report_channel_id: string;
      project_id: string;
      window_start: string;
      window_end: string;
    }): Promise<void>;
  };
  weeklyReportingStore: Pick<WeeklyReportingStore, "listProjectsWithWeeklyActivity">;
  weeklyReportChannelStore: {
    listEnabledWeeklyReportChannels(input: { limit: number }): Promise<WeeklyReportChannelRecord[]>;
  };
  weeklyReportDeliveryStore: {
    claimWeeklyReportDelivery(input: {
      weekly_report_channel_id: string;
      project_id: string;
      window_start: string;
      window_end: string;
      channel: "email" | "slack";
    }): Promise<{ delivery_id: string; created: boolean }>;
  };
  batchSize: number;
  now?: Date;
}): Promise<number> {
  const channels = await input.weeklyReportChannelStore.listEnabledWeeklyReportChannels({
    limit: input.batchSize
  });
  const now = input.now ?? new Date();
  let scheduledCount = 0;

  for (const channel of channels) {
    const weeklyWindow = getWeeklyWindowForChannel(channel, now);
    if (weeklyWindow === null) {
      continue;
    }

    const projectIds = await input.weeklyReportingStore.listProjectsWithWeeklyActivity({
      window_start: weeklyWindow.window_start,
      window_end: weeklyWindow.window_end,
      limit: input.batchSize
    });
    if (!projectIds.includes(channel.project_id)) {
      continue;
    }

    const delivery = await input.weeklyReportDeliveryStore.claimWeeklyReportDelivery({
      weekly_report_channel_id: channel.channel_id,
      project_id: channel.project_id,
      window_start: weeklyWindow.window_start,
      window_end: weeklyWindow.window_end,
      channel: channel.channel
    });
    if (!delivery.created) {
      continue;
    }

    await input.queue.enqueue("generate-weekly-report", {
      delivery_id: delivery.delivery_id,
      weekly_report_channel_id: channel.channel_id,
      project_id: channel.project_id,
      window_start: weeklyWindow.window_start,
      window_end: weeklyWindow.window_end
    });
    scheduledCount += 1;
  }

  return scheduledCount;
}

export async function scheduleRetentionCleanup(input: {
  queue: {
    enqueue(jobName: "cleanup-retention", payload: { scheduled_at: string }): Promise<void>;
    acquireLease?(key: string, ttlSeconds: number): Promise<boolean>;
  };
  intervalMs: number;
  now?: Date;
}): Promise<boolean> {
  const now = input.now ?? new Date();
  const ttlSeconds = Math.max(60, Math.ceil(input.intervalMs / 1000));

  if (input.queue.acquireLease !== undefined) {
    const acquired = await input.queue.acquireLease(RETENTION_CLEANUP_LEASE_KEY, ttlSeconds);
    if (!acquired) {
      return false;
    }
  }

  await input.queue.enqueue("cleanup-retention", {
    scheduled_at: now.toISOString()
  });
  return true;
}

function getTimeZoneParts(now: Date, timeZone: string): { year: number; month: number; day: number; hour: number; weekday: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    weekday: "long",
    hour12: false
  }).formatToParts(now);

  const read = (type: Intl.DateTimeFormatPartTypes): string => parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: Number.parseInt(read("year"), 10),
    month: Number.parseInt(read("month"), 10),
    day: Number.parseInt(read("day"), 10),
    hour: Number.parseInt(read("hour"), 10),
    weekday: read("weekday").toLowerCase()
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(date);

  const read = (type: Intl.DateTimeFormatPartTypes): string => parts.find((part) => part.type === type)?.value ?? "0";
  const zonedAsUtc = Date.UTC(
    Number.parseInt(read("year"), 10),
    Number.parseInt(read("month"), 10) - 1,
    Number.parseInt(read("day"), 10),
    Number.parseInt(read("hour"), 10),
    Number.parseInt(read("minute"), 10),
    Number.parseInt(read("second"), 10)
  );

  return zonedAsUtc - date.getTime();
}

function zonedLocalMidnightToUtc(year: number, month: number, day: number, timeZone: string): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const offset = getTimeZoneOffsetMs(guess, timeZone);
  return new Date(guess.getTime() - offset);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function getWeeklyWindowForChannel(
  channel: Pick<WeeklyReportChannelRecord, "schedule" | "channel_id">,
  now: Date
): { window_start: string; window_end: string } | null {
  const local = getTimeZoneParts(now, channel.schedule.timezone);
  if (local.weekday !== channel.schedule.day_of_week || local.hour < channel.schedule.hour_of_day) {
    return null;
  }

  const windowEnd = zonedLocalMidnightToUtc(local.year, local.month, local.day, channel.schedule.timezone);
  const previousDate = new Date(Date.UTC(local.year, local.month - 1, local.day));
  previousDate.setUTCDate(previousDate.getUTCDate() - 7);
  const windowStart = zonedLocalMidnightToUtc(
    previousDate.getUTCFullYear(),
    previousDate.getUTCMonth() + 1,
    previousDate.getUTCDate(),
    channel.schedule.timezone
  );

  return {
    window_start: windowStart.toISOString(),
    window_end: windowEnd.toISOString()
  };
}

export function createWeeklyReportTransport(input: {
  emailTransport: EmailTransport | null;
}): WeeklyReportTransport {
  return {
    async deliver(event): Promise<void> {
      const rendered = renderWeeklyReportEmail({
        projectId: event.report.project_id,
        windowStart: event.report.window_start,
        windowEnd: event.report.window_end,
        bundleCounts: event.report.bundle_counts,
        newIncidents: event.report.new_incidents,
        regressions: event.report.regressions,
        topSpikingIncidents: event.report.top_spiking_incidents
      });

      if (event.channel.channel === "email") {
        if (input.emailTransport === null) {
          throw new Error("weekly_report_email_not_configured");
        }

        const recipients = event.channel.config["to"];
        if (!isStringArray(recipients)) {
          throw new Error("weekly_report_email_config_invalid");
        }

        await input.emailTransport.send({
          to: recipients,
          subject: rendered.subject,
          text: rendered.text,
          html: rendered.html
        });

        return;
      }

      const webhookUrl = event.channel.config["webhook_url"];
      if (typeof webhookUrl !== "string" || webhookUrl.length === 0) {
        throw new Error("weekly_report_slack_config_invalid");
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      try {
        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            text: rendered.text
          }),
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error(`weekly_report_slack_http_error_${response.status}`);
        }
      } finally {
        clearTimeout(timeout);
      }
    }
  };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function runWorkerStep(
  logger: RuntimeLogger,
  jobName: string,
  work: () => Promise<void>
): Promise<boolean> {
  try {
    await work();
    return true;
  } catch (error) {
    logger.error({ error_message: getErrorMessage(error, "unknown_worker_step_error"), job_name: jobName }, "worker_step_failed");
    return false;
  }
}

async function runWorkerProcessStep<Result extends { processed: boolean; reason?: string }>(
  logger: RuntimeLogger,
  jobName: string,
  work: () => Promise<Result>
): Promise<Result> {
  try {
    return await work();
  } catch (error) {
    logger.error({ error_message: getErrorMessage(error, "unknown_worker_step_error"), job_name: jobName }, "worker_step_failed");
    return {
      processed: false,
      reason: "step_error"
    } as Result;
  }
}

export async function runWorkerFromEnv(envInput: Record<string, string | undefined>): Promise<void> {
  const env = parseWorkerEnv(envInput);
  const logger = createRuntimeLoggerFromEnv({
    app: "worker",
    defaultService: "debugbundle-worker",
    env: envInput,
    ...(process.env["npm_package_version"] === undefined ? {} : { version: process.env["npm_package_version"] })
  });
  const dbSsl = buildPostgresSslConfig(env.DB_SSL_MODE);

  const startupPool = new Pool({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    ...(dbSsl === undefined ? {} : { ssl: dbSsl })
  });

  try {
    await buildWorkerReadinessCheck({
      env,
      queryable: {
        query: async <Row extends Record<string, unknown>>(sql: string, params: unknown[]) => startupPool.query<Row>(sql, params)
      }
    })();
  } finally {
    await startupPool.end();
  }

  const pool = new Pool({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    ...(dbSsl === undefined ? {} : { ssl: dbSsl })
  });

  const queryable: Queryable = {
    query: async <Row extends Record<string, unknown>>(sql: string, params: unknown[]) => pool.query<Row>(sql, params)
  };
  const readinessCheck = buildWorkerReadinessCheck({ env, queryable });
  const healthServer = env.WORKER_HEALTH_PORT > 0
    ? createWorkerHealthServer({
        port: env.WORKER_HEALTH_PORT,
        readinessCheck
      })
    : null;

  const queue = createRedisQueueClient({
    redisUrl: env.REDIS_URL
  });

  const objectStore = createS3ObjectStoreClient({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    bucket: env.S3_BUCKET,
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    forcePathStyle: true
  });

  const processedEventStore = createProcessedEventStore(queryable);
  const incidentStore = createPostgresMetadataStore(queryable);
  const billingStore = createPostgresBillingStore(queryable);
  const alertDeliveryStore = createPostgresAlertDeliveryStore(queryable);
  const webhookDeliveryStore = createPostgresWebhookDeliveryStore(queryable);
  const githubStore = createPostgresGitHubStore(queryable);
  const retentionStore = createPostgresRetentionStore(queryable);
  const weeklyReportChannelStore = createPostgresWeeklyReportChannelStore(queryable);
  const weeklyReportDeliveryStore = createPostgresWeeklyReportDeliveryStore(queryable);
  const frequencyCounter = createRedisIncidentFrequencyCounter({
    redisUrl: env.REDIS_URL,
    snapshotStore: queryable
  });
  const lifecycleWebhookPublisher = createLifecycleWebhookPublisher({
    fallbackTargetUrl: env.LIFECYCLE_WEBHOOK_TARGET_URL ?? null,
    fallbackSigningSecret: env.LIFECYCLE_WEBHOOK_SECRET ?? null,
    webhookDeliveryStore
  });
  const githubDispatchPublisher = createGitHubDispatchPublisher({
    githubStore
  });
  const lifecycleWebhookTransport = createLifecycleWebhookTransport({
    timeoutMs: env.WEBHOOK_DELIVERY_TIMEOUT_MS
  });
  const githubTokenRedis =
    env.GITHUB_APP_ID !== undefined && env.GITHUB_APP_PRIVATE_KEY !== undefined ? new Redis(env.REDIS_URL) : null;
  const githubDispatchTransport =
    env.GITHUB_APP_ID !== undefined && env.GITHUB_APP_PRIVATE_KEY !== undefined && githubTokenRedis !== null
      ? createGitHubDispatchTransport({
          appId: env.GITHUB_APP_ID,
          privateKey: env.GITHUB_APP_PRIVATE_KEY,
          tokenCache: {
            async get(key) {
              const value = await githubTokenRedis.get(key);
              return value;
            },
            async set(key, value, ttlSeconds) {
              await githubTokenRedis.set(key, value, "EX", ttlSeconds);
            }
          }
        })
      : null;
  const emailTransport =
    env.SES_FROM_EMAIL !== undefined
      ? createSesEmailTransport({
          region: env.SES_REGION ?? env.S3_REGION,
          fromEmail: formatProductFromEmail(env.SES_FROM_EMAIL),
          timeoutMs: env.WEEKLY_REPORT_EMAIL_TIMEOUT_MS,
          accessKeyId: env.AWS_ACCESS_KEY_ID,
          secretAccessKey: env.AWS_SECRET_ACCESS_KEY
        })
      : null;
  const alertTransport = createAlertTransport({
    timeoutMs: env.WEBHOOK_DELIVERY_TIMEOUT_MS,
    emailTransport,
    appBaseUrl: normalizeWorkerBaseUrl(envInput["APP_BASE_URL"]),
    apiBaseUrl: normalizeWorkerBaseUrl(envInput["DEBUGBUNDLE_API_URL"] ?? envInput["API_BASE_URL"] ?? envInput["VITE_API_URL"])
  });
  const weeklyReportTransport = createWeeklyReportTransport({
    emailTransport
  });
  const retentionCleanupRunner = createRetentionCleanupService({
    retentionStore,
    objectStore
  });

  logger.info(
    {
      poll_interval_ms: env.WORKER_POLL_INTERVAL_MS,
      run_once: env.WORKER_RUN_ONCE === "1"
    },
    "worker_started"
  );

  try {
    do {
      const normalizeResult = await runWorkerProcessStep(logger, "normalize-events", async () =>
        processNextNormalizeEventsJob({
          queue,
          objectStore,
          processedEventStore
        })
      );

      if (!normalizeResult.processed) {
        const groupResult = await runWorkerProcessStep(logger, "group-incident", async () =>
          processNextGroupIncidentJob({
            queue,
            alertEvaluationQueue: queue,
            logger,
            incidentStore,
            frequencyCounter,
            lifecycleWebhookPublisher,
            githubDispatchPublisher,
            objectStore
          })
        );

        if (!groupResult.processed) {
          const buildBundleResult = await runWorkerProcessStep(logger, "build-bundle", async () =>
            processNextBuildBundleJob({
              queue,
              logger,
              env: envInput,
              incidentStore,
              objectStore,
              billingStore
            })
          );

          if (!buildBundleResult.processed) {
            const buildReproductionResult = await runWorkerProcessStep(logger, "build-reproduction", async () =>
              processNextBuildReproductionJob({
                queue,
                objectStore
              })
            );

            if (!buildReproductionResult.processed) {
              const evaluateAlertsResult = await runWorkerProcessStep(logger, "evaluate-alerts", async () =>
                processNextEvaluateAlertsJob({
                  queue,
                  alertStore: alertDeliveryStore,
                  alertTransport,
                  billingStore
                })
              );

              if (!evaluateAlertsResult.processed) {
                const webhookSchedulingOk = await runWorkerStep(logger, "schedule-webhook-deliveries", async () => {
                  await scheduleDueWebhookDeliveries({
                    queue,
                    webhookDeliveryStore,
                    batchSize: env.WEBHOOK_DELIVERY_SCHEDULER_BATCH_SIZE
                  });
                });
                const githubSchedulingOk = await runWorkerStep(logger, "schedule-github-dispatches", async () => {
                  await scheduleDueGitHubDispatches({
                    queue,
                    githubStore,
                    batchSize: env.WEBHOOK_DELIVERY_SCHEDULER_BATCH_SIZE
                  });
                });
                const weeklySchedulingOk = await runWorkerStep(logger, "schedule-weekly-reports", async () => {
                  await scheduleWeeklyReports({
                    queue,
                    weeklyReportingStore: incidentStore,
                    weeklyReportChannelStore,
                    weeklyReportDeliveryStore,
                    batchSize: env.WEEKLY_REPORT_SCHEDULER_BATCH_SIZE
                  });
                });
                const retentionSchedulingOk = await runWorkerStep(logger, "schedule-retention-cleanup", async () => {
                  await scheduleRetentionCleanup({
                    queue,
                    intervalMs: env.RETENTION_CLEANUP_INTERVAL_MS
                  });
                });

                if (webhookSchedulingOk && githubSchedulingOk && weeklySchedulingOk && retentionSchedulingOk) {
                  await runWorkerStep(logger, "deliver-webhook", async () => {
                    await processNextDeliverWebhookJob({
                      queue,
                      logger,
                      webhookDeliveryStore,
                      lifecycleWebhookTransport,
                      async onWebhookDisabled({ webhook_id, target_url }) {
                        if (emailTransport === null || env.SES_FROM_EMAIL === undefined) {
                          return;
                        }
                        try {
                          const subject = `Webhook auto-disabled: ${target_url}`;
                          const body = `Webhook ${webhook_id} targeting ${target_url} was automatically disabled after 50 consecutive delivery failures. Re-enable it from the dashboard or API once the endpoint is healthy.`;
                          await emailTransport.send({
                            to: [env.SES_FROM_EMAIL],
                            subject,
                            text: body,
                            html: `<p>${body}</p>`
                          });
                        } catch {
                          // Best-effort notification — failure must not block delivery processing.
                        }
                      }
                    });
                  });

                  if (githubDispatchTransport !== null) {
                    await runWorkerStep(logger, "deliver-github-dispatch", async () => {
                      await processNextDeliverGitHubDispatchJob({
                        queue,
                        logger,
                        githubStore,
                        githubDispatchTransport
                      });
                    });
                  }

                  const weeklyReportResult = await runWorkerProcessStep(logger, "generate-weekly-report", async () =>
                    processNextGenerateWeeklyReportJob({
                      queue,
                      logger,
                      weeklyReportingStore: incidentStore,
                      weeklyReportChannelStore,
                      weeklyReportDeliveryStore,
                      weeklyReportTransport
                    })
                  );

                  if (!weeklyReportResult.processed) {
                    await runWorkerStep(logger, "cleanup-retention", async () => {
                      await processNextCleanupRetentionJob({
                        queue,
                        retentionCleanupRunner
                      });
                    });
                  }
                }
              }
            }
          }
        }
      }

      if (env.WORKER_RUN_ONCE === "1") {
        break;
      }

      await delay(env.WORKER_POLL_INTERVAL_MS);
    } while (true);
  } finally {
    if (healthServer !== null) {
      healthServer.close();
    }
    if (githubTokenRedis !== null) {
      await githubTokenRedis.quit();
    }
    await frequencyCounter.close();
    await queue.close();
    await pool.end();
  }
}
