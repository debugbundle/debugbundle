import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { generateAnalyticsWriterToken, type AnalyticsWriterContext } from "../../auth/src/index.js";
import {
  AnalyticsWriterChangeSchema,
  AnalyticsWriterRecordSchema,
  getTierCapabilities,
  MAX_ACTIVE_ANALYTICS_WRITERS,
  MAX_ANALYTICS_WRITER_CREATION_REVISION,
  type AnalyticsWriterChange,
  type AnalyticsWriterRecord,
  type AnalyticsWriterList,
  type AnalyticsWriterPreview,
  type AnalyticsWriterApplyResult
} from "../../shared-types/src/index.js";
import { sanitizeTelemetry } from "../../redaction/src/index.js";
import { stableJson } from "../../event-normalizer/src/canonical-json.js";
import { runInTransaction } from "./transaction.js";
import { lockAnalyticsWriterProject } from "./analytics-writer-access.js";
import type { Queryable } from "./types.js";

const Id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
const Access = z.object({ projectId: Id, actorUserId: Id }).strict();
const ChangeInput = Access.extend({ change: AnalyticsWriterChangeSchema });
export interface AnalyticsWriterChangeInput {
  projectId: string;
  actorUserId: string;
  change: AnalyticsWriterChange;
}
type Failure = { kind: "invalid" | "forbidden" | "conflict" | "capacity_exceeded" };
export type AnalyticsWriterMutationResult =
  | Failure
  | { kind: "applied"; result: AnalyticsWriterApplyResult };
export type AnalyticsWriterPreviewResult =
  | Failure
  | { kind: "preview"; preview: AnalyticsWriterPreview };
export interface AnalyticsWriterStore {
  preview(input: AnalyticsWriterChangeInput): Promise<AnalyticsWriterPreviewResult>;
  apply(
    input: AnalyticsWriterChangeInput & { previewHash: string }
  ): Promise<AnalyticsWriterMutationResult>;
  list(input: { projectId: string; actorUserId: string }): Promise<AnalyticsWriterList | null>;
  resolveByTokenHash(hash: string): Promise<AnalyticsWriterContext | null>;
}
type WriterRow = Omit<AnalyticsWriterRecord, "created_at" | "expires_at" | "revoked_at"> & {
  created_at: Date | string;
  expires_at: Date | string;
  revoked_at: Date | string | null;
};
const COLUMNS = "id,project_id,kind,display_name,created_at,expires_at,revoked_at";
function mapWriter(row: WriterRow): AnalyticsWriterRecord {
  return AnalyticsWriterRecordSchema.parse({
    ...row,
    created_at: new Date(row.created_at).toISOString(),
    expires_at: new Date(row.expires_at).toISOString(),
    revoked_at: row.revoked_at === null ? null : new Date(row.revoked_at).toISOString()
  });
}
async function currentRevision(db: Queryable, projectId: string): Promise<number> {
  const row = (
    await db.query<{ revision: string }>(
      "SELECT revision FROM analytics_writer_state WHERE project_id=$1::uuid",
      [projectId]
    )
  ).rows[0];
  return row === undefined ? 0 : Number(row.revision);
}
async function activeWriters(
  db: Queryable,
  projectId: string,
  organizationId: string
): Promise<AnalyticsWriterRecord[]> {
  return (
    await db.query<WriterRow & Record<string, unknown>>(
      `SELECT ${COLUMNS} FROM analytics_writers WHERE project_id=$1::uuid AND organization_id=$2::uuid
      AND revoked_at IS NULL AND expires_at>now() ORDER BY created_at,id LIMIT 11`,
      [projectId, organizationId]
    )
  ).rows.map(mapWriter);
}
function prepare(
  input: AnalyticsWriterChangeInput
): { input: AnalyticsWriterChangeInput; hash: string } | null {
  const parsed = ChangeInput.safeParse(input);
  if (!parsed.success) return null;
  const normalized = parsed.data;
  if (normalized.change.action === "create") {
    const label = sanitizeTelemetry(normalized.change.mutation.display_name);
    if (
      !label.ok ||
      typeof label.value !== "string" ||
      label.value.length === 0 ||
      label.value.length > 120
    )
      return null;
    normalized.change.mutation.display_name = label.value;
  }
  return {
    input: normalized,
    hash: createHash("sha256").update(stableJson(normalized)).digest("hex")
  };
}

async function changeWriter(
  db: Queryable,
  input: AnalyticsWriterChangeInput,
  hash: string,
  previewOnly: boolean
): Promise<AnalyticsWriterMutationResult | AnalyticsWriterPreviewResult> {
  const { projectId, actorUserId, change } = input;
  const access = await lockAnalyticsWriterProject(db, projectId, actorUserId);
  if (access === null) return { kind: "forbidden" };
  const active = await activeWriters(db, projectId, access.organizationId);
  if (active.length > MAX_ACTIVE_ANALYTICS_WRITERS) return { kind: "capacity_exceeded" };
  const prior = (
    await db.query<{
      revision: string;
      mutation_hash: string;
      action: "create" | "revoke";
      result: unknown;
    }>(
      `SELECT revision,mutation_hash,action,result FROM analytics_writer_mutations
     WHERE project_id=$1::uuid AND actor_user_id=$2::uuid AND idempotency_key=$3::uuid`,
      [projectId, actorUserId, change.mutation.idempotency_key]
    )
  ).rows[0];
  const preview = (
    revision: number,
    writer: AnalyticsWriterRecord | null,
    replayed: boolean
  ): AnalyticsWriterPreviewResult => ({
    kind: "preview",
    preview: {
      project_id: projectId,
      preview_hash: hash,
      action: change.action,
      expected_revision: change.mutation.expected_revision,
      resulting_revision: revision,
      writer_id: change.action === "create" ? null : change.mutation.writer_id,
      kind: change.action === "create" ? change.mutation.kind : writer!.kind,
      display_name:
        change.action === "create" ? change.mutation.display_name : writer!.display_name,
      expires_in_days: change.action === "create" ? change.mutation.expires_in_days : null,
      active_writers: active.length,
      remaining_active_capacity:
        MAX_ACTIVE_ANALYTICS_WRITERS -
        active.length +
        (replayed
          ? 0
          : change.action === "create"
            ? -1
            : active.some((item) => item.id === writer!.id)
              ? 1
              : 0),
      already_applied: replayed
    }
  });
  if (prior !== undefined) {
    if (prior.mutation_hash !== hash || prior.action !== change.action) return { kind: "conflict" };
    const writer = AnalyticsWriterRecordSchema.parse(prior.result),
      revision = Number(prior.revision);
    return previewOnly
      ? preview(revision, writer, true)
      : {
          kind: "applied",
          result: {
            disposition: change.action === "create" ? "secret_unavailable" : "revoked",
            revision,
            replayed: true,
            writer
          }
        };
  }
  const revision = await currentRevision(db, projectId);
  if (revision !== change.mutation.expected_revision) return { kind: "conflict" };
  if (
    revision >= Number.MAX_SAFE_INTEGER ||
    (change.action === "create" &&
      (revision >= MAX_ANALYTICS_WRITER_CREATION_REVISION ||
        active.length >= MAX_ACTIVE_ANALYTICS_WRITERS))
  )
    return { kind: "capacity_exceeded" };
  let target: AnalyticsWriterRecord | null = null;
  if (change.action === "revoke") {
    const row = (
      await db.query<WriterRow & Record<string, unknown>>(
        `SELECT ${COLUMNS} FROM analytics_writers WHERE id=$1::uuid AND project_id=$2::uuid AND organization_id=$3::uuid FOR UPDATE`,
        [change.mutation.writer_id, projectId, access.organizationId]
      )
    ).rows[0];
    if (row === undefined || row.revoked_at !== null) return { kind: "conflict" };
    target = mapWriter(row);
  }
  if (previewOnly) return preview(revision + 1, target, false);
  await db.query(
    `INSERT INTO analytics_writer_state(project_id,revision) VALUES($1::uuid,$2)
    ON CONFLICT(project_id) DO UPDATE SET revision=EXCLUDED.revision`,
    [projectId, revision + 1]
  );
  let plaintext: string | null = null;
  let writer: AnalyticsWriterRecord;
  if (change.action === "create") {
    const generated = generateAnalyticsWriterToken(change.mutation.kind);
    const row = (
      await db.query<WriterRow & Record<string, unknown>>(
        `INSERT INTO analytics_writers(id,project_id,organization_id,issuer_user_id,kind,display_name,token_hash,created_at,expires_at)
       VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6,$7,now(),now()+$8*interval '1 second') RETURNING ${COLUMNS}`,
        [
          randomUUID(),
          projectId,
          access.organizationId,
          actorUserId,
          change.mutation.kind,
          change.mutation.display_name,
          generated.hash,
          change.mutation.expires_in_days * 86400
        ]
      )
    ).rows[0]!;
    writer = mapWriter(row);
    plaintext = generated.plaintext;
  } else {
    writer = mapWriter(
      (
        await db.query<WriterRow & Record<string, unknown>>(
          `UPDATE analytics_writers SET revoked_at=now() WHERE id=$1::uuid AND project_id=$2::uuid RETURNING ${COLUMNS}`,
          [change.mutation.writer_id, projectId]
        )
      ).rows[0]!
    );
  }
  // Store only immutable public metadata. Replaying a create can never recover the original plaintext.
  await db.query(
    `INSERT INTO analytics_writer_mutations(project_id,revision,actor_user_id,idempotency_key,mutation_hash,action,writer_id,result)
    VALUES($1::uuid,$2,$3::uuid,$4::uuid,$5,$6,$7::uuid,$8::jsonb)`,
    [
      projectId,
      revision + 1,
      actorUserId,
      change.mutation.idempotency_key,
      hash,
      change.action,
      writer.id,
      JSON.stringify(writer)
    ]
  );
  return {
    kind: "applied",
    result:
      plaintext === null
        ? { disposition: "revoked", revision: revision + 1, replayed: false, writer }
        : { disposition: "issued", revision: revision + 1, replayed: false, writer, plaintext }
  };
}

export function createAnalyticsWriterStore(db: Queryable): AnalyticsWriterStore {
  return {
    async preview(input) {
      const prepared = prepare(input);
      if (prepared === null) return { kind: "invalid" };
      return runInTransaction(db, (tx) =>
        changeWriter(tx, prepared.input, prepared.hash, true)
      ) as Promise<AnalyticsWriterPreviewResult>;
    },
    async apply(input) {
      const prepared = prepare({
        projectId: input.projectId,
        actorUserId: input.actorUserId,
        change: input.change
      });
      if (prepared === null) return { kind: "invalid" };
      if (input.previewHash !== prepared.hash) return { kind: "conflict" };
      return runInTransaction(db, (tx) =>
        changeWriter(tx, prepared.input, prepared.hash, false)
      ) as Promise<AnalyticsWriterMutationResult>;
    },
    async list(input) {
      const parsed = Access.safeParse(input);
      if (!parsed.success) return null;
      return runInTransaction(db, async (tx) => {
        const access = await lockAnalyticsWriterProject(
          tx,
          parsed.data.projectId,
          parsed.data.actorUserId
        );
        if (access === null) return null;
        const writers = await activeWriters(tx, parsed.data.projectId, access.organizationId);
        if (writers.length > MAX_ACTIVE_ANALYTICS_WRITERS) return null;
        return {
          project_id: parsed.data.projectId,
          revision: await currentRevision(tx, parsed.data.projectId),
          writers
        };
      });
    },
    async resolveByTokenHash(hash) {
      if (!/^[a-f0-9]{64}$/.test(hash)) return null;
      const row = (
        await db.query<
          AnalyticsWriterContext & { organization_plan: string; owned: boolean } & Record<
              string,
              unknown
            >
        >(
          `SELECT w.id AS writer_id,w.project_id,w.organization_id,w.issuer_user_id,w.kind,w.expires_at,w.revoked_at,
          org.plan AS organization_plan,p.owner_user_id=w.issuer_user_id AS owned
         FROM analytics_writers w JOIN projects p ON p.id=w.project_id AND p.organization_id=w.organization_id
         JOIN organizations org ON org.id=w.organization_id AND org.suspended_at IS NULL
         LEFT JOIN organization_members om ON om.organization_id=org.id AND om.user_id=w.issuer_user_id
         LEFT JOIN project_members pm ON pm.project_id=p.id AND pm.user_id=w.issuer_user_id
         WHERE w.token_hash=$1 AND w.issuer_user_id IS NOT NULL AND (om.user_id IS NULL OR om.suspended_at IS NULL)
           AND ((p.owner_user_id=w.issuer_user_id AND om.user_id IS NOT NULL)
             OR (p.owner_user_id<>w.issuer_user_id AND pm.role='admin')) LIMIT 1`,
          [hash]
        )
      ).rows[0];
      if (
        row === undefined ||
        (!row.owned && !getTierCapabilities(row.organization_plan).shared_dashboards)
      )
        return null;
      return {
        writer_id: row.writer_id,
        project_id: row.project_id,
        organization_id: row.organization_id,
        issuer_user_id: row.issuer_user_id,
        kind: row.kind,
        expires_at: new Date(row.expires_at).toISOString(),
        revoked_at: row.revoked_at === null ? null : new Date(row.revoked_at).toISOString()
      };
    }
  };
}
