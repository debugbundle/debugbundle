import { createHash, randomUUID } from "node:crypto";

import type { AnalyticsBundleAnalysisKind } from "../../shared-types/src/index.js";
import { buildAnalyticsBundleObjectKey } from "./helpers.js";
import { runInTransaction } from "./transaction.js";
import type { Queryable } from "./types.js";

export type AnalyticsBundleGenerationStatus = "pending" | "running" | "completed" | "failed";

export interface AnalyticsBundleGenerationRecord {
  generation_id: string;
  project_id: string;
  opportunity_id: string | null;
  requested_by_user_id: string | null;
  analysis_kind: AnalyticsBundleAnalysisKind;
  analysis_spec: Record<string, unknown>;
  input_fingerprint: string;
  status: AnalyticsBundleGenerationStatus;
  object_key: string | null;
  failure_reason: string | null;
  created_at: string;
  claimed_at: string | null;
  completed_at: string | null;
  updated_at: string;
}

export interface ReserveAnalyticsBundleGenerationInput {
  project_id: string;
  opportunity_id?: string | null;
  requested_by_user_id?: string | null;
  analysis_kind: AnalyticsBundleAnalysisKind;
  analysis_spec?: Record<string, unknown> | undefined;
}

export interface AnalyticsBundleGenerationStore {
  reserveAnalyticsBundleGeneration(input: ReserveAnalyticsBundleGenerationInput): Promise<AnalyticsBundleGenerationRecord>;
  getAnalyticsBundleGenerationForProject(input: {
    project_id: string;
    generation_id: string;
  }): Promise<AnalyticsBundleGenerationRecord | null>;
  claimPendingAnalyticsBundleGeneration(input: {
    claimed_at: string;
  }): Promise<AnalyticsBundleGenerationRecord | null>;
  markAnalyticsBundleGenerationCompleted(input: {
    project_id: string;
    generation_id: string;
    completed_at: string;
  }): Promise<AnalyticsBundleGenerationRecord | null>;
  markAnalyticsBundleGenerationFailed(input: {
    project_id: string;
    generation_id: string;
    failed_at: string;
    reason: string | null;
  }): Promise<AnalyticsBundleGenerationRecord | null>;
}

type AnalyticsBundleGenerationRow = {
  generation_id: unknown;
  project_id: unknown;
  opportunity_id: unknown;
  requested_by_user_id: unknown;
  analysis_kind: unknown;
  analysis_spec: unknown;
  input_fingerprint: unknown;
  status: unknown;
  object_key: unknown;
  failure_reason: unknown;
  created_at: unknown;
  claimed_at: unknown;
  completed_at: unknown;
  updated_at: unknown;
};

export function createPostgresAnalyticsBundleGenerationStore(db: Queryable): AnalyticsBundleGenerationStore {
  return {
    async reserveAnalyticsBundleGeneration(input) {
      return runInTransaction(db, async (tx) => {
        const analysisSpec = normalizeAnalysisSpec(input.analysis_spec);
        const inputFingerprint = buildAnalyticsBundleInputFingerprint({
          opportunity_id: input.opportunity_id ?? null,
          analysis_kind: input.analysis_kind,
          analysis_spec: analysisSpec
        });
        const generationId = randomUUID();
        const inserted = await tx.query<AnalyticsBundleGenerationRow>(
          `
            INSERT INTO analytics_bundle_generations (
              id,
              project_id,
              opportunity_id,
              requested_by_user_id,
              analysis_kind,
              analysis_spec,
              input_fingerprint,
              status,
              updated_at
            )
            VALUES (
              $1::uuid,
              $2::uuid,
              $3::uuid,
              $4::uuid,
              $5,
              $6::jsonb,
              $7,
              'pending',
              now()
            )
            ON CONFLICT (project_id, input_fingerprint) DO NOTHING
            RETURNING ${analyticsBundleGenerationSelectColumns()}
          `,
          [
            generationId,
            input.project_id,
            input.opportunity_id ?? null,
            input.requested_by_user_id ?? null,
            input.analysis_kind,
            JSON.stringify(analysisSpec),
            inputFingerprint
          ]
        );
        const insertedRow = inserted.rows[0];
        if (insertedRow !== undefined) {
          await syncOpportunityBundleState(tx, {
            opportunity_id: input.opportunity_id ?? null,
            status: "pending",
            object_key: null,
            failure_reason: null
          });
          return mapAnalyticsBundleGenerationRow(insertedRow);
        }

        const existing = await tx.query<AnalyticsBundleGenerationRow>(
          `
            SELECT ${analyticsBundleGenerationSelectColumns()}
            FROM analytics_bundle_generations
            WHERE project_id = $1::uuid
              AND input_fingerprint = $2
            LIMIT 1
          `,
          [input.project_id, inputFingerprint]
        );
        const existingRow = existing.rows[0];
        if (existingRow === undefined) {
          throw new Error("analytics_bundle_generation_reservation_race");
        }

        return mapAnalyticsBundleGenerationRow(existingRow);
      });
    },

    async getAnalyticsBundleGenerationForProject(input) {
      const result = await db.query<AnalyticsBundleGenerationRow>(
        `
          SELECT ${analyticsBundleGenerationSelectColumns()}
          FROM analytics_bundle_generations
          WHERE project_id = $1::uuid
            AND id = $2::uuid
          LIMIT 1
        `,
        [input.project_id, input.generation_id]
      );
      const row = result.rows[0];
      return row === undefined ? null : mapAnalyticsBundleGenerationRow(row);
    },

    async claimPendingAnalyticsBundleGeneration(input) {
      return runInTransaction(db, async (tx) => {
        const claimed = await tx.query<AnalyticsBundleGenerationRow>(
          `
            WITH next_generation AS (
              SELECT id
              FROM analytics_bundle_generations
              WHERE status = 'pending'
              ORDER BY created_at ASC, id ASC
              FOR UPDATE SKIP LOCKED
              LIMIT 1
            )
            UPDATE analytics_bundle_generations abg
            SET
              status = 'running',
              claimed_at = $1::timestamptz,
              updated_at = $1::timestamptz,
              failure_reason = NULL
            FROM next_generation
            WHERE abg.id = next_generation.id
            RETURNING ${analyticsBundleGenerationSelectColumns("abg")}
          `,
          [input.claimed_at]
        );
        const row = claimed.rows[0];
        if (row === undefined) {
          return null;
        }

        const record = mapAnalyticsBundleGenerationRow(row);
        await syncOpportunityBundleState(tx, {
          opportunity_id: record.opportunity_id,
          status: "running",
          object_key: record.object_key,
          failure_reason: null
        });
        return record;
      });
    },

    async markAnalyticsBundleGenerationCompleted(input) {
      return runInTransaction(db, async (tx) => {
        const objectKey = buildAnalyticsBundleObjectKey(input.project_id, input.generation_id);
        const completed = await tx.query<AnalyticsBundleGenerationRow>(
          `
            UPDATE analytics_bundle_generations
            SET
              status = 'completed',
              object_key = $3,
              failure_reason = NULL,
              completed_at = $4::timestamptz,
              updated_at = $4::timestamptz
            WHERE project_id = $1::uuid
              AND id = $2::uuid
            RETURNING ${analyticsBundleGenerationSelectColumns()}
          `,
          [input.project_id, input.generation_id, objectKey, input.completed_at]
        );
        const row = completed.rows[0];
        if (row === undefined) {
          return null;
        }

        const record = mapAnalyticsBundleGenerationRow(row);
        await syncOpportunityBundleState(tx, {
          opportunity_id: record.opportunity_id,
          status: "completed",
          object_key: record.object_key,
          failure_reason: null
        });
        return record;
      });
    },

    async markAnalyticsBundleGenerationFailed(input) {
      return runInTransaction(db, async (tx) => {
        const failed = await tx.query<AnalyticsBundleGenerationRow>(
          `
            UPDATE analytics_bundle_generations
            SET
              status = 'failed',
              failure_reason = $3,
              completed_at = NULL,
              updated_at = $4::timestamptz
            WHERE project_id = $1::uuid
              AND id = $2::uuid
            RETURNING ${analyticsBundleGenerationSelectColumns()}
          `,
          [input.project_id, input.generation_id, input.reason, input.failed_at]
        );
        const row = failed.rows[0];
        if (row === undefined) {
          return null;
        }

        const record = mapAnalyticsBundleGenerationRow(row);
        await syncOpportunityBundleState(tx, {
          opportunity_id: record.opportunity_id,
          status: "failed",
          object_key: record.object_key,
          failure_reason: record.failure_reason
        });
        return record;
      });
    }
  };
}

export function buildAnalyticsBundleInputFingerprint(input: {
  opportunity_id?: string | null | undefined;
  analysis_kind: AnalyticsBundleAnalysisKind;
  analysis_spec?: Record<string, unknown> | undefined;
}): string {
  const digest = createHash("sha256")
    .update(stableSerialize({
      schema: "analytics_bundle_generation_input.v1",
      opportunity_id: input.opportunity_id ?? null,
      analysis_kind: input.analysis_kind,
      analysis_spec: normalizeAnalysisSpec(input.analysis_spec)
    }))
    .digest("hex");

  return `sha256:${digest}`;
}

function analyticsBundleGenerationSelectColumns(tableAlias?: string): string {
  const prefix = tableAlias === undefined ? "" : `${tableAlias}.`;
  return `
    ${prefix}id::text AS generation_id,
    ${prefix}project_id::text AS project_id,
    ${prefix}opportunity_id::text AS opportunity_id,
    ${prefix}requested_by_user_id::text AS requested_by_user_id,
    ${prefix}analysis_kind,
    ${prefix}analysis_spec,
    ${prefix}input_fingerprint,
    ${prefix}status,
    ${prefix}object_key,
    ${prefix}failure_reason,
    ${prefix}created_at,
    ${prefix}claimed_at,
    ${prefix}completed_at,
    ${prefix}updated_at
  `;
}

async function syncOpportunityBundleState(
  db: Queryable,
  input: {
    opportunity_id: string | null;
    status: Exclude<AnalyticsBundleGenerationStatus, "pending"> | "pending";
    object_key: string | null;
    failure_reason: string | null;
  }
): Promise<void> {
  if (input.opportunity_id === null) {
    return;
  }

  await db.query(
    `
      UPDATE analytics_opportunities
      SET
        bundle_status = $2,
        bundle_object_key = $3,
        bundle_failure_reason = $4,
        updated_at = now()
      WHERE id = $1::uuid
    `,
    [input.opportunity_id, input.status, input.object_key, input.failure_reason]
  );
}

function mapAnalyticsBundleGenerationRow(row: AnalyticsBundleGenerationRow): AnalyticsBundleGenerationRecord {
  return {
    generation_id: toNonEmptyString(row.generation_id, "00000000-0000-0000-0000-000000000000"),
    project_id: toNonEmptyString(row.project_id, "00000000-0000-0000-0000-000000000000"),
    opportunity_id: toNullableString(row.opportunity_id),
    requested_by_user_id: toNullableString(row.requested_by_user_id),
    analysis_kind: toNonEmptyString(row.analysis_kind, "usage_summary") as AnalyticsBundleAnalysisKind,
    analysis_spec: normalizeAnalysisSpec(row.analysis_spec),
    input_fingerprint: toNonEmptyString(row.input_fingerprint, buildAnalyticsBundleInputFingerprint({
      analysis_kind: "usage_summary",
      analysis_spec: {}
    })),
    status: toNonEmptyString(row.status, "pending") as AnalyticsBundleGenerationStatus,
    object_key: toNullableString(row.object_key),
    failure_reason: toNullableString(row.failure_reason),
    created_at: toIsoString(row.created_at),
    claimed_at: toNullableIsoString(row.claimed_at),
    completed_at: toNullableIsoString(row.completed_at),
    updated_at: toIsoString(row.updated_at)
  };
}

function normalizeAnalysisSpec(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }

  return value;
}

function stableSerialize(value: unknown): string {
  if (value === undefined) {
    return "null";
  }

  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }

  const entries = Object.entries(value)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));

  return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableSerialize(entryValue)}`).join(",")}}`;
}

function toNonEmptyString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function toNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function toIsoString(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
  }

  return new Date(0).toISOString();
}

function toNullableIsoString(value: unknown): string | null {
  return value === null || value === undefined ? null : toIsoString(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
