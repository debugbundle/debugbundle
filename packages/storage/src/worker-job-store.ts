import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Queryable } from "./types.js";

export const WORKER_JOB_PROTOCOL = "postgres-v1";

export const WorkerJobNameSchema = z.enum([
  "normalize-events",
  "aggregate-analytics-events",
  "group-incident",
  "build-bundle",
  "build-analytics-bundle",
  "evaluate-analytics-opportunities",
  "build-improvement-bundle",
  "build-reproduction",
  "evaluate-alerts",
  "deliver-alert-email-digest",
  "deliver-webhook",
  "deliver-github-dispatch",
  "generate-weekly-report",
  "cleanup-retention",
  "evaluate-event-improvement",
  "evaluate-incident-improvement",
  "publish-incident-lifecycle",
  "delete-retained-object"
]);
export type WorkerJobName = z.infer<typeof WorkerJobNameSchema>;
export interface WorkerJobOptions {
  dependsOn?: string;
  dedupeKey?: string;
}
export interface WorkerJobClaim {
  id: string;
  token: string;
  name: WorkerJobName;
  payload: Record<string, unknown>;
  attempts: number;
}
const MAX_ATTEMPTS = 8;
export const WORKER_JOB_LEASE_SECONDS = 300;

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.entries(value)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
    .join(",")}}`;
}

export function createWorkerJobStore(db: Queryable): WorkerJobStore {
  return {
    async enqueue(name: string, input: unknown, options: WorkerJobOptions = {}): Promise<string> {
      const jobName = WorkerJobNameSchema.parse(name);
      if (options.dedupeKey !== undefined) z.string().min(1).max(256).parse(options.dedupeKey);
      const payload = z.record(z.string(), z.unknown()).parse(input);
      // JSON round-trip matches the persisted identity, including omitted optional fields.
      const serialized = JSON.stringify(payload);
      if (Buffer.byteLength(serialized) > 2 * 1024 * 1024)
        throw new Error("worker_job_payload_too_large");
      const id = createHash("sha256")
        .update(
          `${jobName}\n${stableJson(JSON.parse(serialized))}\n${options.dependsOn ?? ""}\n${options.dedupeKey ?? ""}`
        )
        .digest("hex");
      const projectId =
        payload["project_id"] === undefined ? null : z.string().uuid().parse(payload["project_id"]);
      if (options.dependsOn !== undefined) {
        z.string()
          .regex(/^[a-f0-9]{64}$/)
          .parse(options.dependsOn);
        const parent = await db.query(
          "SELECT id FROM worker_jobs WHERE id = $1 AND project_id IS NOT DISTINCT FROM $2::uuid",
          [options.dependsOn, projectId]
        );
        if (parent.rows.length !== 1) throw new Error("worker_dependency_scope_invalid");
      }
      await db.query(
        `INSERT INTO worker_jobs(id, job_name, project_id, payload, depends_on) SELECT $1, $2, $3::uuid, $4::jsonb, $5 WHERE $3::uuid IS NULL OR EXISTS (SELECT 1 FROM projects WHERE id = $3::uuid) ON CONFLICT (id) DO NOTHING`,
        [id, jobName, projectId, serialized, options.dependsOn ?? null]
      );
      return id;
    },
    async claim(name: string): Promise<WorkerJobClaim | null> {
      const jobName = WorkerJobNameSchema.parse(name);
      const token = randomUUID();
      const result = await db.query<{
        id: string;
        payload: Record<string, unknown>;
        attempts: number;
      }>(
        `
        WITH candidate AS (
          SELECT id FROM worker_jobs
          WHERE job_name = $1 AND attempts < $3 AND expires_at > now()
            AND (depends_on IS NULL OR EXISTS (SELECT 1 FROM worker_jobs parent WHERE parent.id = worker_jobs.depends_on AND parent.status = 'completed'))
            AND ((status = 'pending' AND available_at <= now()) OR (status = 'running' AND lease_expires_at <= now()))
          ORDER BY available_at, created_at, id FOR UPDATE SKIP LOCKED LIMIT 1
        ) UPDATE worker_jobs j SET status = 'running', attempts = attempts + 1,
          lease_token = $2, lease_expires_at = now() + $4 * interval '1 second', updated_at = now()
          FROM candidate c WHERE j.id = c.id RETURNING j.id, j.payload, j.attempts`,
        [jobName, token, MAX_ATTEMPTS, WORKER_JOB_LEASE_SECONDS]
      );
      const row = result.rows[0];
      return row === undefined
        ? null
        : { id: row.id, token, name: jobName, payload: row.payload, attempts: row.attempts };
    },
    async lock(claim: WorkerJobClaim): Promise<void> {
      const result = await db.query(
        `SELECT id FROM worker_jobs WHERE id = $1 AND lease_token = $2 AND status = 'running' AND lease_expires_at > now() FOR UPDATE`,
        [claim.id, claim.token]
      );
      if (result.rows.length !== 1) throw new Error("worker_job_lease_lost");
    },
    async renew(claim: WorkerJobClaim): Promise<void> {
      const result = await db.query(
        `UPDATE worker_jobs SET lease_expires_at = now() + $3 * interval '1 second' WHERE id = $1 AND lease_token = $2 AND status = 'running' AND lease_expires_at > now() RETURNING id`,
        [claim.id, claim.token, WORKER_JOB_LEASE_SECONDS]
      );
      if (result.rows.length !== 1) throw new Error("worker_job_lease_lost");
    },
    async complete(claim: WorkerJobClaim, skippedReason?: string): Promise<void> {
      const reason =
        skippedReason === undefined
          ? null
          : z
              .enum([
                "monthly_quota_exceeded",
                "incident_missing",
                "invalid_event",
                "bundle_generation_disabled"
              ])
              .parse(skippedReason);
      const result = await db.query(
        `UPDATE worker_jobs SET status = CASE WHEN $3::text IS NULL THEN 'completed' ELSE 'skipped' END, last_error_code = $3, payload = NULL, lease_token = NULL, lease_expires_at = NULL, updated_at = now(), expires_at = now() + interval '7 days' WHERE id = $1 AND lease_token = $2 AND status = 'running' RETURNING id`,
        [claim.id, claim.token, reason]
      );
      if (result.rows.length !== 1) throw new Error("worker_job_lease_lost");
    },
    async fail(claim: WorkerJobClaim): Promise<void> {
      await db.query(
        `UPDATE worker_jobs SET status = CASE WHEN attempts >= $3 THEN 'failed' ELSE 'pending' END,
        last_error_code = CASE WHEN attempts >= $3 THEN 'attempts_exhausted' ELSE 'processing_error' END,
        available_at = now() + least(300, power(2, least(attempts, 8))) * interval '1 second',
        lease_token = NULL, lease_expires_at = NULL, updated_at = now()
        WHERE id = $1 AND lease_token = $2 AND status = 'running'`,
        [claim.id, claim.token, MAX_ATTEMPTS]
      );
    },
    async maintain(): Promise<boolean> {
      // Bound both retry exhaustion and retention work; never delete active leases.
      const blocked = await db.query(
        `WITH blocked AS (SELECT child.id, parent.status AS parent_status FROM worker_jobs child JOIN worker_jobs parent ON parent.id = child.depends_on WHERE child.status = 'pending' AND parent.status IN ('failed', 'skipped') ORDER BY child.created_at FOR UPDATE OF child SKIP LOCKED LIMIT 500)
        UPDATE worker_jobs child SET status = CASE WHEN blocked.parent_status = 'skipped' THEN 'skipped' ELSE 'failed' END,
          payload = CASE WHEN blocked.parent_status = 'skipped' THEN NULL ELSE child.payload END,
          last_error_code = 'upstream_unavailable', updated_at = now() FROM blocked WHERE child.id = blocked.id RETURNING child.id`,
        []
      );
      const expired = await db.query(
        `WITH expired AS (
        SELECT id FROM worker_jobs WHERE
          (status = 'running' AND lease_expires_at <= now() AND attempts >= $1)
          OR (status IN ('pending', 'running', 'failed') AND payload IS NOT NULL AND expires_at <= now() AND (lease_expires_at IS NULL OR lease_expires_at <= now()))
        ORDER BY expires_at FOR UPDATE SKIP LOCKED LIMIT 500
      ) UPDATE worker_jobs j SET status = 'failed', payload = CASE WHEN j.expires_at <= now() THEN NULL ELSE j.payload END,
        last_error_code = CASE WHEN j.expires_at <= now() THEN 'evidence_expired' ELSE 'attempts_exhausted' END,
        lease_token = NULL, lease_expires_at = NULL, updated_at = now(), expires_at = CASE WHEN j.expires_at <= now() THEN now() + interval '7 days' ELSE j.expires_at END
        FROM expired e WHERE j.id = e.id RETURNING j.id`,
        [MAX_ATTEMPTS]
      );
      const removed = await db.query(
        `WITH expired AS (SELECT id FROM worker_jobs WHERE NOT EXISTS (SELECT 1 FROM worker_jobs child WHERE child.depends_on = worker_jobs.id) AND expires_at <= now() AND (status IN ('completed', 'skipped') OR (status = 'failed' AND payload IS NULL)) ORDER BY expires_at FOR UPDATE SKIP LOCKED LIMIT 500) DELETE FROM worker_jobs j USING expired e WHERE j.id = e.id RETURNING j.id`,
        []
      );
      return [blocked, expired, removed].some((result) => result.rows.length >= 500);
    },
    /** Operator-only, bounded metadata projection. Payloads and lease tokens never leave storage. */
    async inspect(input: { projectId: string | null; id?: string; limit?: number }) {
      const scope = z
        .object({
          projectId: z.string().uuid().nullable(),
          id: z
            .string()
            .regex(/^[a-f0-9]{64}$/)
            .optional(),
          limit: z.number().int().min(1).max(100).default(25)
        })
        .parse(input);
      const result = await db.query<WorkerJobInspection>(
        `SELECT id, job_name, status, attempts, operator_retries, last_error_code, depends_on, created_at, updated_at, available_at, expires_at,
          (status = 'failed' AND payload IS NOT NULL AND expires_at > now() AND (depends_on IS NULL OR EXISTS (SELECT 1 FROM worker_jobs parent WHERE parent.id = worker_jobs.depends_on AND parent.status = 'completed'))) AS can_retry
         FROM worker_jobs WHERE project_id IS NOT DISTINCT FROM $1::uuid AND ($2::text IS NULL OR id = $2)
         ORDER BY created_at DESC, id LIMIT $3`,
        [scope.projectId, scope.id ?? null, scope.limit]
      );
      return result.rows;
    },
    async retryFailed(input: { projectId: string | null; id: string }): Promise<boolean> {
      const scope = z
        .object({ projectId: z.string().uuid().nullable(), id: z.string().regex(/^[a-f0-9]{64}$/) })
        .parse(input);
      const result = await db.query(
        `UPDATE worker_jobs SET status = 'pending', attempts = 0, operator_retries = operator_retries + 1, available_at = now(), updated_at = now(), last_error_code = 'operator_retry_requested'
         WHERE project_id IS NOT DISTINCT FROM $1::uuid AND id = $2 AND status = 'failed' AND payload IS NOT NULL AND expires_at > now()
          AND (depends_on IS NULL OR EXISTS (SELECT 1 FROM worker_jobs parent WHERE parent.id = worker_jobs.depends_on AND parent.status = 'completed')) RETURNING id`,
        [scope.projectId, scope.id]
      );
      return result.rows.length === 1;
    },
    async summary(): Promise<{
      pending: number;
      running: number;
      failed: number;
      oldestPendingSeconds: number;
    }> {
      const result = await db.query<{
        pending: string;
        running: string;
        failed: string;
        oldest: number | null;
      }>(
        `SELECT count(*) FILTER (WHERE status = 'pending') AS pending, count(*) FILTER (WHERE status = 'running') AS running, count(*) FILTER (WHERE status = 'failed') AS failed, extract(epoch FROM now() - min(created_at) FILTER (WHERE status = 'pending'))::double precision AS oldest FROM worker_jobs WHERE status IN ('pending', 'running', 'failed')`,
        []
      );
      const row = result.rows[0];
      return {
        pending: Number(row?.pending ?? 0),
        running: Number(row?.running ?? 0),
        failed: Number(row?.failed ?? 0),
        oldestPendingSeconds: row?.oldest ?? 0
      };
    }
  };
}

export interface WorkerJobStore {
  enqueue(name: string, input: unknown, options?: WorkerJobOptions): Promise<string>;
  claim(name: string): Promise<WorkerJobClaim | null>;
  lock(claim: WorkerJobClaim): Promise<void>;
  renew(claim: WorkerJobClaim): Promise<void>;
  complete(claim: WorkerJobClaim, skippedReason?: string): Promise<void>;
  fail(claim: WorkerJobClaim): Promise<void>;
  maintain(): Promise<boolean>;
  inspect(input: {
    projectId: string | null;
    id?: string;
    limit?: number;
  }): Promise<WorkerJobInspection[]>;
  retryFailed(input: { projectId: string | null; id: string }): Promise<boolean>;
  summary(): Promise<{
    pending: number;
    running: number;
    failed: number;
    oldestPendingSeconds: number;
  }>;
}

export interface WorkerJobInspection extends Record<string, unknown> {
  id: string;
  job_name: WorkerJobName;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  attempts: number;
  operator_retries: number;
  last_error_code: string | null;
  depends_on: string | null;
  created_at: Date;
  updated_at: Date;
  available_at: Date;
  expires_at: Date;
  can_retry: boolean;
}
