import { isSafeProjectMetadataText } from "./project-service-metadata-privacy.js";
import { buildProjectAdoptionManifest } from "./project-adoption-manifest.js";
import { z } from "zod";
import { convergeProjectWeeklyReports } from "./project-weekly-report-convergence.js";
import { randomUUID, timingSafeEqual } from "node:crypto";
import {
  ProjectMergeApplySchema,
  ProjectMergeRequestSchema,
  type ProjectMergeApply,
  type ProjectMergeRequest,
  type ProjectMergeState
} from "../../shared-types/src/project-consolidation.js";
import {
  buildProjectMergePlan,
  projectMergeRevision,
  type ProjectMergePlan
} from "./project-merge-plan.js";
import { readProjectMergeSnapshot } from "./project-merge-snapshot.js";
import type { Queryable } from "./types.js";

export class ProjectMergeError extends Error {
  constructor(
    readonly code: string,
    readonly operation_id: string | null = null
  ) {
    super(code);
  }
}
interface Receipt {
  canonical_project_id: string;
  origin_ids: string[];
  legacy_project_ids: string[];
  service_mappings: ProjectMergeRequest["service_mappings"];
  adoption_manifest?: import("../../shared-types/src/project-consolidation.js").ProjectAdoptionManifest;
}
interface StoredOperation extends Record<string, unknown> {
  id: string;
  actor_user_id: string;
  target_project_id: string;
  canonical_project_id: string;
  state: ProjectMergeState;
  request: ProjectMergeRequest;
  plan_digest: string;
  receipt: Receipt | null;
  error_code: string | null;
  lease_token: string | null;
  lease_expires_at: string | null;
  committed_at: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
}
export interface ProjectMergeOperation {
  operation_id: string;
  canonical_project_id: string;
  state: ProjectMergeState;
  request: ProjectMergeRequest;
  plan_digest: string;
  receipt: Receipt | null;
  error_code: string | null;
  committed_at: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
  local_adoption: "pending";
  deployed_runtime: "pending";
}
type Identity = { user_id: string; operation_id: string };
export interface ProjectMergeVerification {
  operation_id: string;
  canonical_project_id: string;
  verified: boolean;
  failures: string[];
}
export interface ProjectMergeStore {
  preview(input: { user_id: string; request: unknown }): Promise<ProjectMergePlan>;
  apply(input: { user_id: string } & ProjectMergeApply): Promise<ProjectMergeOperation>;
  status(
    input: Identity | { user_id: string; idempotency_key: string }
  ): Promise<ProjectMergeOperation>;
  verify(input: Identity): Promise<ProjectMergeVerification>;
  resume(input: Identity): Promise<ProjectMergeOperation>;
  cancel(input: Identity): Promise<ProjectMergeOperation>;
}

function sameDigest(left: string, right: string): boolean {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === 32 && b.length === 32 && timingSafeEqual(a, b);
}
function publicOperation(row: StoredOperation): ProjectMergeOperation {
  const timestamp = (value: string | null): string | null =>
    value === null ? null : new Date(value).toISOString();
  return {
    operation_id: row.id,
    canonical_project_id: row.canonical_project_id,
    state: row.state,
    request: row.request,
    plan_digest: row.plan_digest,
    receipt: row.receipt,
    error_code: row.error_code,
    committed_at: timestamp(row.committed_at),
    verified_at: timestamp(row.verified_at),
    created_at: timestamp(row.created_at)!,
    updated_at: timestamp(row.updated_at)!,
    local_adoption: "pending",
    deployed_runtime: "pending"
  };
}
const operationProjection = `SELECT op.id,op.actor_user_id,op.target_project_id,
 debugbundle_canonical_project(op.target_project_id) AS canonical_project_id,op.state,op.request,op.plan_digest,
 op.receipt,op.error_code,op.lease_token,op.lease_expires_at::text,op.committed_at::text,op.verified_at::text,
 op.created_at::text,op.updated_at::text FROM project_merge_operations op
 JOIN projects p ON p.id=debugbundle_canonical_project(op.target_project_id)
 JOIN organizations o ON o.id=p.organization_id
 WHERE op.actor_user_id=$1 AND p.owner_user_id=$1 AND o.suspended_at IS NULL
 AND EXISTS(SELECT 1 FROM organization_members actor WHERE actor.organization_id=p.organization_id
   AND actor.user_id=$1 AND actor.suspended_at IS NULL)`;

export function createProjectMergeStore(
  db: Queryable,
  options: { enabled?: boolean } = {}
): ProjectMergeStore {
  async function transaction<Result>(
    callback: (tx: Queryable) => Promise<Result>,
    readOnly = false
  ): Promise<Result> {
    if (!db.transaction) throw new ProjectMergeError("project_merge_transaction_unavailable");
    return db.transaction(async (tx) => {
      const deadline = Date.now() + 10000;
      if (readOnly) await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY", []);
      await tx.query("SET LOCAL statement_timeout='5s'", []);
      await tx.query("SET LOCAL lock_timeout='1s'", []);
      const bounded: Queryable = {
        async query<Row extends Record<string, unknown>>(sql: string, parameters: unknown[]) {
          const remaining = deadline - Date.now();
          if (remaining <= 0) throw new ProjectMergeError("project_merge_deadline_exceeded");
          await tx.query("SELECT set_config('statement_timeout',$1,true)", [
            `${Math.min(5000, remaining)}ms`
          ]);
          return tx.query<Row>(sql, parameters);
        }
      };
      const result = await callback(bounded);
      if (Date.now() > deadline) throw new ProjectMergeError("project_merge_deadline_exceeded");
      return result;
    });
  }
  async function owned(
    tx: Queryable,
    userId: string,
    identity: { operation_id: string } | { idempotency_key: string },
    lock = false
  ): Promise<StoredOperation> {
    const byId = "operation_id" in identity;
    if (
      byId
        ? !z.string().guid().safeParse(identity.operation_id).success ||
          "idempotency_key" in identity
        : !ProjectMergeApplySchema.shape.idempotency_key.safeParse(identity.idempotency_key)
            .success || !isSafeProjectMetadataText(identity.idempotency_key)
    )
      throw new ProjectMergeError("invalid_merge_request");
    const rows = await tx.query<StoredOperation>(
      `${operationProjection} AND ${byId ? "op.id=$2::uuid" : "op.idempotency_key=$2"}${lock ? " FOR UPDATE OF op" : ""}`,
      [userId, byId ? identity.operation_id : identity.idempotency_key]
    );
    if (!rows.rows[0]) throw new ProjectMergeError("project_merge_not_found");
    return rows.rows[0];
  }
  async function checkedPlan(
    tx: Queryable,
    userId: string,
    request: ProjectMergeRequest,
    operationId?: string
  ): Promise<ProjectMergePlan> {
    return buildProjectMergePlan(
      request,
      await readProjectMergeSnapshot(tx, request, userId, operationId),
      userId
    );
  }
  async function verifyIn(tx: Queryable, row: StoredOperation): Promise<ProjectMergeVerification> {
    const failures: string[] = [];
    if (!row.committed_at || !row.receipt) failures.push("not_committed");
    else {
      const target = row.canonical_project_id;
      const origins = await tx.query<{ ids: string[] }>(
        "SELECT debugbundle_project_origins($1) AS ids",
        [target]
      );
      if (!row.receipt.origin_ids.every((id) => origins.rows[0]?.ids.includes(id)))
        failures.push("origin_ownership_mismatch");
      for (const mapping of row.receipt.service_mappings) {
        const service = await tx.query<{ retained: boolean; project_id: string }>(
          `SELECT d.project_id,EXISTS(SELECT 1 FROM service_project_aliases a
            WHERE a.project_id=$2 AND a.name=$3 AND a.service_definition_id=d.id) AS retained
           FROM service_definitions d WHERE d.id=$1`,
          [mapping.service_definition_id, row.target_project_id, mapping.name]
        );
        if (service.rows[0]?.project_id !== target || !service.rows[0]?.retained)
          failures.push("service_mapping_mismatch");
      }
    }
    return {
      operation_id: row.id,
      canonical_project_id: row.canonical_project_id,
      verified: failures.length === 0,
      failures: [...new Set(failures)]
    };
  }
  async function finish(userId: string, operationId: string): Promise<ProjectMergeOperation> {
    const verification = await transaction(
      async (tx) => verifyIn(tx, await owned(tx, userId, { operation_id: operationId })),
      true
    );
    await transaction(async (tx) => {
      const row = await owned(tx, userId, { operation_id: operationId }, true);
      if (!row.committed_at)
        throw new ProjectMergeError("project_merge_not_committed", operationId);
      await tx.query(
        `UPDATE project_merge_operations SET state=$2,verified_at=CASE WHEN $3 THEN now() ELSE verified_at END,
        error_code=$4,lease_token=NULL,lease_expires_at=NULL,updated_at=now() WHERE id=$1`,
        [
          operationId,
          verification.verified ? "completed" : "verification_failed_after_commit",
          verification.verified,
          verification.verified ? null : "merge_verification_failed"
        ]
      );
      if (verification.verified)
        await tx.query("DELETE FROM project_merge_participants WHERE operation_id=$1", [
          operationId
        ]);
    });
    return publicOperation(await owned(db, userId, { operation_id: operationId }));
  }
  async function run(userId: string, operationId: string): Promise<ProjectMergeOperation> {
    const initial = await owned(db, userId, { operation_id: operationId });
    if (["completed", "cancelled"].includes(initial.state)) return publicOperation(initial);
    if (initial.committed_at) return finish(userId, operationId);
    const token = randomUUID();
    const claimed = await transaction(async (tx) => {
      const row = await owned(tx, userId, { operation_id: operationId }, true);
      if (row.committed_at || ["completed", "cancelled"].includes(row.state)) return false;
      const claim = await tx.query<{ id: string }>(
        `UPDATE project_merge_operations SET state='checking',lease_token=$2,
        lease_expires_at=now()+interval '30 seconds',error_code=NULL,updated_at=now()
        WHERE id=$1 AND (lease_token IS NULL OR lease_expires_at<=now()) RETURNING id`,
        [operationId, token]
      );
      if (!claim.rows.length) return false;
      const ids = [row.request.target_project_id, ...row.request.source_project_ids].sort();
      const participants = await tx.query<{ project_id: string }>(
        `INSERT INTO project_merge_participants(project_id,operation_id)
        SELECT id,$2::uuid FROM unnest($1::uuid[]) id ORDER BY id
        ON CONFLICT(project_id) DO UPDATE SET operation_id=EXCLUDED.operation_id
        WHERE project_merge_participants.operation_id=EXCLUDED.operation_id RETURNING project_id`,
        [ids, operationId]
      );
      if (participants.rows.length !== ids.length)
        throw new ProjectMergeError("operation_conflict", operationId);
      return true;
    });
    if (!claimed) return publicOperation(await owned(db, userId, { operation_id: operationId }));
    try {
      await transaction(async (tx) => {
        const row = await owned(tx, userId, { operation_id: operationId }, true);
        if (row.lease_token !== token || row.state !== "checking")
          throw new ProjectMergeError("operation_conflict", operationId);
        const selected = [row.request.target_project_id, ...row.request.source_project_ids];
        // Account policy precedes project locks. Billing changes and account
        // suspension must not invalidate checked limits or owner access mid-cutover.
        await tx.query(
          `SELECT o.id FROM organizations o WHERE EXISTS(
          SELECT 1 FROM projects p WHERE p.organization_id=o.id AND p.id=ANY($1::uuid[]) AND p.owner_user_id=$2)
          ORDER BY o.id FOR SHARE`,
          [selected, userId]
        );
        await tx.query(
          `SELECT actor.user_id FROM organization_members actor WHERE actor.user_id=$2 AND EXISTS(
          SELECT 1 FROM projects p WHERE p.organization_id=actor.organization_id AND p.id=ANY($1::uuid[]) AND p.owner_user_id=$2)
          ORDER BY actor.organization_id FOR SHARE`,
          [selected, userId]
        );
        const origins = await tx.query<{ id: string }>(
          `SELECT id FROM projects
          WHERE id=ANY(ARRAY(SELECT unnest(debugbundle_project_origins(id)) FROM projects WHERE id=ANY($1::uuid[])))
          ORDER BY id FOR UPDATE`,
          [[row.request.target_project_id, ...row.request.source_project_ids]]
        );
        if (origins.rows.length > 1000)
          throw new ProjectMergeError("supported_size_exceeded", operationId);
        const snapshot = await readProjectMergeSnapshot(tx, row.request, userId, operationId);
        const plan = buildProjectMergePlan(row.request, snapshot, userId);
        if (!plan.ready) throw new ProjectMergeError("merge_conflict", operationId);
        if (!sameDigest(plan.plan_digest, row.plan_digest))
          throw new ProjectMergeError("stale_merge_plan", operationId);
        await tx.query(
          "UPDATE project_merge_operations SET state='applying',updated_at=now() WHERE id=$1",
          [operationId]
        );
        const target = row.request.target_project_id;
        await convergeProjectWeeklyReports(tx, {
          target_project_id: target,
          source_project_ids: row.request.source_project_ids,
          operation_id: row.id
        });
        // Repository defaults become service context before their owner changes.
        await tx.query(
          `UPDATE service_definitions d SET repository_url=COALESCE(d.repository_url,
          'https://github.com/' || r.repo_owner || '/' || r.repo_name)
          FROM project_github_repos r WHERE d.project_id=ANY($1::uuid[]) AND r.project_id=d.repository_default_project_id`,
          [row.request.source_project_ids]
        );
        for (const mapping of row.request.service_mappings) {
          const moved = await tx.query<{ id: string }>(
            `UPDATE service_definitions SET project_id=$1,name=$2,updated_at=now()
            WHERE id=$3 AND project_id=$4 RETURNING id`,
            [target, mapping.name, mapping.service_definition_id, mapping.source_project_id]
          );
          if (moved.rows.length !== 1)
            throw new ProjectMergeError("service_mapping_conflict", operationId);
        }
        await tx.query(
          "UPDATE project_legacy_bindings SET canonical_project_id=$1 WHERE canonical_project_id=ANY($2::uuid[])",
          [target, row.request.source_project_ids]
        );
        for (const sourceId of row.request.source_project_ids) {
          const source = snapshot.projects.find((project) => project.project_id === sourceId);
          if (!source) throw new ProjectMergeError("project_merge_not_found", operationId);
          await tx.query(
            `INSERT INTO project_legacy_bindings(legacy_project_id,canonical_project_id,scope_origin_ids,operation_id)
            VALUES($1,$2,$3,$4)`,
            [sourceId, target, source.origin_ids, operationId]
          );
        }
        const receipt: Receipt = {
          canonical_project_id: target,
          origin_ids: plan.origin_ids,
          legacy_project_ids: plan.origin_ids.filter((id) => id !== target),
          service_mappings: row.request.service_mappings,
          adoption_manifest: await buildProjectAdoptionManifest(tx, userId, target, plan.origin_ids)
        };
        await tx.query(
          `UPDATE project_merge_operations SET state='verifying',receipt=$2::jsonb,committed_at=now(),
          lease_token=NULL,lease_expires_at=NULL,error_code=NULL,updated_at=now() WHERE id=$1`,
          [operationId, JSON.stringify(receipt)]
        );
      });
    } catch (error) {
      const current = await owned(db, userId, { operation_id: operationId }).catch(() => null);
      if (current?.committed_at) return publicOperation(current);
      if (!current) throw new ProjectMergeError("merge_outcome_unconfirmed", operationId);
      const code = error instanceof ProjectMergeError ? error.code : "project_merge_failed";
      await transaction(async (tx) => {
        const failed = await tx.query<{ id: string }>(
          `UPDATE project_merge_operations SET state='failed_before_commit',
          error_code=$2,lease_token=NULL,lease_expires_at=NULL,updated_at=now()
          WHERE id=$1 AND committed_at IS NULL AND lease_token=$3 RETURNING id`,
          [operationId, code, token]
        );
        if (failed.rows.length)
          await tx.query("DELETE FROM project_merge_participants WHERE operation_id=$1", [
            operationId
          ]);
      });
      throw new ProjectMergeError(code, operationId);
    }
    try {
      return await finish(userId, operationId);
    } catch {
      await db.query(
        `UPDATE project_merge_operations SET state='verification_failed_after_commit',error_code='merge_verification_failed',
        lease_token=NULL,lease_expires_at=NULL,updated_at=now() WHERE id=$1 AND committed_at IS NOT NULL AND state<>'completed'`,
        [operationId]
      );
      return publicOperation(await owned(db, userId, { operation_id: operationId }));
    }
  }
  return {
    async preview(input) {
      const parsed = ProjectMergeRequestSchema.safeParse(input.request);
      if (
        !parsed.success ||
        parsed.data.service_mappings.some((mapping) => !isSafeProjectMetadataText(mapping.name))
      )
        throw new ProjectMergeError("invalid_merge_request");
      return transaction((tx) => checkedPlan(tx, input.user_id, parsed.data), true);
    },
    async apply(input) {
      if (!options.enabled) throw new ProjectMergeError("project_merge_not_enabled");
      const parsed = ProjectMergeApplySchema.safeParse({
        request: input.request,
        plan_digest: input.plan_digest,
        idempotency_key: input.idempotency_key
      });
      if (!parsed.success) throw new ProjectMergeError("invalid_merge_request");
      const data = parsed.data;
      if (
        !isSafeProjectMetadataText(data.idempotency_key) ||
        data.request.service_mappings.some((mapping) => !isSafeProjectMetadataText(mapping.name))
      )
        throw new ProjectMergeError("invalid_merge_request");
      const id = await transaction(async (tx) => {
        await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
          `project-merge:${input.user_id}:${data.idempotency_key}`
        ]);
        const prior = await owned(tx, input.user_id, {
          idempotency_key: data.idempotency_key
        }).catch((error: unknown) => {
          if (error instanceof ProjectMergeError && error.code === "project_merge_not_found")
            return null;
          throw error;
        });
        if (prior) {
          if (
            !sameDigest(projectMergeRevision(prior.request), projectMergeRevision(data.request)) ||
            !sameDigest(prior.plan_digest, data.plan_digest)
          )
            throw new ProjectMergeError("idempotency_conflict", prior.id);
          return prior.id;
        }
        const plan = await checkedPlan(tx, input.user_id, data.request);
        if (!plan.ready) throw new ProjectMergeError("merge_conflict");
        if (!sameDigest(plan.plan_digest, data.plan_digest))
          throw new ProjectMergeError("stale_merge_plan");
        const id = randomUUID();
        await tx.query(
          `INSERT INTO project_merge_operations(id,organization_id,actor_user_id,target_project_id,idempotency_key,request,plan_digest,state)
          SELECT $1,organization_id,$2,id,$4,$5::jsonb,$6,'queued' FROM projects WHERE id=$3 AND owner_user_id=$2`,
          [
            id,
            input.user_id,
            data.request.target_project_id,
            data.idempotency_key,
            JSON.stringify(data.request),
            data.plan_digest
          ]
        );
        const reserved = await tx.query<{ project_id: string }>(
          `INSERT INTO project_merge_participants(project_id,operation_id)
          SELECT origin,$2::uuid FROM unnest($1::uuid[]) origin ORDER BY origin ON CONFLICT DO NOTHING RETURNING project_id`,
          [plan.origin_ids, id]
        );
        if (reserved.rows.length !== plan.origin_ids.length)
          throw new ProjectMergeError("operation_conflict");
        return id;
      });
      return run(input.user_id, id);
    },
    async status(input) {
      return publicOperation(await owned(db, input.user_id, input));
    },
    async verify(input) {
      return transaction(async (tx) => verifyIn(tx, await owned(tx, input.user_id, input)), true);
    },
    async resume(input) {
      if (!options.enabled) throw new ProjectMergeError("project_merge_not_enabled");
      return run(input.user_id, input.operation_id);
    },
    async cancel(input) {
      await transaction(async (tx) => {
        const row = await owned(tx, input.user_id, input, true);
        if (row.committed_at || ["applying", "verifying", "completed"].includes(row.state))
          throw new ProjectMergeError("project_merge_cannot_cancel", row.id);
        await tx.query(
          "UPDATE project_merge_operations SET state='cancelled',lease_token=NULL,lease_expires_at=NULL,updated_at=now() WHERE id=$1",
          [row.id]
        );
        await tx.query("DELETE FROM project_merge_participants WHERE operation_id=$1", [row.id]);
      });
      return publicOperation(await owned(db, input.user_id, input));
    }
  };
}
