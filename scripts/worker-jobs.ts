import { Pool } from "pg";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { buildPostgresSslConfig } from "../packages/storage/src/postgres-ssl.js";
import { assertStorageSchemaMigrationsApplied } from "../packages/storage/src/schema-migrations.js";
import { createWorkerJobStore } from "../packages/storage/src/worker-job-store.js";

export const WorkerJobOperatorEnvSchema = z
  .object({
    DB_HOST: z.string().min(1).default("postgres"),
    DB_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
    DB_USER: z.string().min(1).default("debugbundle"),
    DB_PASSWORD: z.string().min(1),
    DB_NAME: z.string().min(1).default("debugbundle"),
    DB_SSL_MODE: z.string().optional(),
    WORKER_JOB_PROJECT_ID: z.union([z.string().uuid(), z.literal("global")]),
    WORKER_JOB_ID: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    WORKER_JOB_RETRY: z.enum(["0", "1"]).default("0")
  })
  .refine((input) => input.WORKER_JOB_RETRY === "0" || input.WORKER_JOB_ID !== undefined, {
    message: "retry_requires_exact_job_id"
  });

/** Internal operator command; never prints payloads, tokens, DB URLs, or raw exception messages. */
export async function runWorkerJobOperator(envInput = process.env): Promise<void> {
  const env = WorkerJobOperatorEnvSchema.parse(envInput);
  const ssl = buildPostgresSslConfig(env.DB_SSL_MODE);
  const pool = new Pool({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    max: 1,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
    ...(ssl === undefined ? {} : { ssl })
  });
  try {
    const db = {
      query: <Row extends Record<string, unknown>>(sql: string, params: unknown[]) =>
        pool.query<Row>(sql, params)
    };
    await assertStorageSchemaMigrationsApplied(db);
    const store = createWorkerJobStore(db);
    const scope = {
      projectId: env.WORKER_JOB_PROJECT_ID === "global" ? null : env.WORKER_JOB_PROJECT_ID,
      ...(env.WORKER_JOB_ID === undefined ? {} : { id: env.WORKER_JOB_ID })
    };
    if (env.WORKER_JOB_RETRY === "1") {
      const retried = await store.retryFailed({
        projectId: scope.projectId,
        id: env.WORKER_JOB_ID!
      });
      console.log(
        JSON.stringify({
          action: "retry",
          project_id: scope.projectId,
          job_id: env.WORKER_JOB_ID,
          retried
        })
      );
      if (!retried) process.exitCode = 1;
    }
    console.log(
      JSON.stringify({
        action: "inspect",
        project_id: scope.projectId,
        jobs: await store.inspect(scope)
      })
    );
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  runWorkerJobOperator().catch(() => {
    console.error(
      "worker_job_operator_failed: check configuration, migration state, and scoped job eligibility"
    );
    process.exitCode = 1;
  });
}
