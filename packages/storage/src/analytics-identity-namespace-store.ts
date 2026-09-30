import { createHash } from "node:crypto";
import { z } from "zod";
import { stableJson } from "../../event-normalizer/src/canonical-json.js";
import { AnalyticsIdentityNamespacePreviewSchema } from "../../shared-types/src/analytics-identity-namespace.js";
import { runInTransaction } from "./transaction.js";
import type { Queryable } from "./types.js";

const Id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
const Revision = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER - 1);
const Base = {
  actorUserId: Id,
  projectId: Id,
  expectedRevision: Revision,
  idempotencyKey: Id,
  previewHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional()
};
const Change = z.discriminatedUnion("action", [
  z
    .object({
      ...Base,
      action: z.literal("configure"),
      keyFingerprint: z.string().regex(/^sha256:[a-f0-9]{64}$/)
    })
    .strict(),
  z.object({ ...Base, action: z.literal("revoke") }).strict()
]);
const RecordSchema = z
  .object({
    project_id: Id,
    namespace_revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    key_fingerprint: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    activated_at: z.string().datetime({ precision: 3 }),
    revoked_at: z.string().datetime({ precision: 3 }).nullable()
  })
  .strict();
export type ProjectAnalyticsIdentityNamespace = z.infer<typeof RecordSchema>;
export type ProjectAnalyticsIdentityNamespaceChange = z.input<typeof Change>;
export type ProjectAnalyticsIdentityNamespaceChangeResult =
  | { kind: "invalid" | "forbidden" | "conflict" }
  | { kind: "applied"; namespace: ProjectAnalyticsIdentityNamespace; replayed: boolean };
export type ProjectAnalyticsIdentityNamespacePreviewResult =
  | { kind: "invalid" | "forbidden" | "conflict" }
  | { kind: "preview"; preview: z.infer<typeof AnalyticsIdentityNamespacePreviewSchema> };

type NamespaceRow = {
  project_id: string;
  namespace_revision: string;
  key_fingerprint: string;
  activated_at: Date;
  revoked_at: Date | null;
};
const mapRow = (row: NamespaceRow): ProjectAnalyticsIdentityNamespace =>
  RecordSchema.parse({
    project_id: row.project_id,
    namespace_revision: Number(row.namespace_revision),
    key_fingerprint: row.key_fingerprint,
    activated_at: row.activated_at.toISOString(),
    revoked_at: row.revoked_at?.toISOString() ?? null
  });

function preview(
  change: z.output<typeof Change>,
  current: NamespaceRow | undefined
): z.infer<typeof AnalyticsIdentityNamespacePreviewSchema> {
  const currentRecord = current === undefined ? null : mapRow(current);
  const proposed = change.action === "configure" ? change.keyFingerprint : null;
  const content = {
    project_id: change.projectId,
    actor_user_id: change.actorUserId,
    action: change.action,
    expected_revision: change.expectedRevision,
    idempotency_key: change.idempotencyKey,
    current: currentRecord,
    proposed_key_fingerprint: proposed
  };
  return AnalyticsIdentityNamespacePreviewSchema.parse({
    project_id: change.projectId,
    action: change.action,
    expected_revision: change.expectedRevision,
    resulting_revision: change.expectedRevision + 1,
    current_key_fingerprint: currentRecord?.key_fingerprint ?? null,
    proposed_key_fingerprint: proposed,
    contexts_fenced: currentRecord !== null,
    preview_hash: createHash("sha256").update(stableJson(content)).digest("hex")
  });
}

function changeAvailable(
  change: z.output<typeof Change>,
  current: NamespaceRow | undefined
): boolean {
  if (Number(current?.namespace_revision ?? 0) !== change.expectedRevision) return false;
  if (change.action === "revoke") return current !== undefined && current.revoked_at === null;
  return (
    current === undefined ||
    current.revoked_at !== null ||
    current.key_fingerprint !== change.keyFingerprint
  );
}

export async function previewProjectAnalyticsIdentityNamespaceChange(
  db: Queryable,
  change: ProjectAnalyticsIdentityNamespaceChange
): Promise<ProjectAnalyticsIdentityNamespacePreviewResult> {
  const parsed = Change.safeParse(change);
  if (!parsed.success) return { kind: "invalid" };
  return runInTransaction<ProjectAnalyticsIdentityNamespacePreviewResult>(db, async (tx) => {
    if (!(await lockOwner(tx, parsed.data.projectId, parsed.data.actorUserId)))
      return { kind: "forbidden" };
    const current = (
      await tx.query<NamespaceRow & Record<string, unknown>>(
        `SELECT project_id,namespace_revision,key_fingerprint,activated_at,revoked_at
         FROM analytics_project_identity_namespaces WHERE project_id=$1::uuid FOR SHARE`,
        [parsed.data.projectId]
      )
    ).rows[0];
    if (!changeAvailable(parsed.data, current)) return { kind: "conflict" };
    return { kind: "preview", preview: preview(parsed.data, current) };
  });
}

/** Only the project's active organization owner selects the namespace policy. */
async function lockOwner(tx: Queryable, projectId: string, actorUserId: string): Promise<boolean> {
  const located = (
    await tx.query<{ organization_id: string }>(
      "SELECT organization_id FROM projects WHERE id=$1::uuid",
      [projectId]
    )
  ).rows[0];
  if (located === undefined) return false;
  const organization = (
    await tx.query<{ id: string }>(
      "SELECT id FROM organizations WHERE id=$1::uuid AND suspended_at IS NULL FOR UPDATE",
      [located.organization_id]
    )
  ).rows[0];
  if (organization === undefined) return false;
  const project = (
    await tx.query<{ owner_user_id: string }>(
      "SELECT owner_user_id FROM projects WHERE id=$1::uuid AND organization_id=$2::uuid FOR UPDATE",
      [projectId, organization.id]
    )
  ).rows[0];
  if (project?.owner_user_id !== actorUserId) return false;
  const member = (
    await tx.query<{ role: string }>(
      `SELECT role FROM organization_members
       WHERE organization_id=$1::uuid AND user_id=$2::uuid AND suspended_at IS NULL FOR SHARE`,
      [organization.id, actorUserId]
    )
  ).rows[0];
  return member?.role === "owner";
}

export async function readProjectAnalyticsIdentityNamespace(
  db: Queryable,
  actorUserId: string,
  projectId: string
): Promise<ProjectAnalyticsIdentityNamespace | null> {
  const actor = Id.safeParse(actorUserId);
  const project = Id.safeParse(projectId);
  if (!actor.success || !project.success) return null;
  return runInTransaction(db, async (tx) => {
    if (!(await lockOwner(tx, project.data, actor.data))) return null;
    const row = (
      await tx.query<NamespaceRow & Record<string, unknown>>(
        `SELECT project_id,namespace_revision,key_fingerprint,activated_at,revoked_at
         FROM analytics_project_identity_namespaces WHERE project_id=$1::uuid`,
        [project.data]
      )
    ).rows[0];
    return row === undefined ? null : mapRow(row);
  });
}

/** Internal reviewed-state primitive; a later management adapter must bind actor session/CSRF. */
export async function applyProjectAnalyticsIdentityNamespaceChange(
  db: Queryable,
  change: ProjectAnalyticsIdentityNamespaceChange
): Promise<ProjectAnalyticsIdentityNamespaceChangeResult> {
  const parsed = Change.safeParse(change);
  if (!parsed.success) return { kind: "invalid" };
  const { actorUserId, projectId, expectedRevision, idempotencyKey } = parsed.data;
  const mutationHash = createHash("sha256").update(stableJson(parsed.data)).digest("hex");
  return runInTransaction<ProjectAnalyticsIdentityNamespaceChangeResult>(db, async (tx) => {
    if (!(await lockOwner(tx, projectId, actorUserId))) return { kind: "forbidden" };
    const previous = (
      await tx.query<{ mutation_hash: string; result: unknown }>(
        `SELECT mutation_hash,result FROM analytics_project_identity_namespace_mutations
         WHERE project_id=$1::uuid AND actor_user_id=$2::uuid AND idempotency_key=$3::uuid`,
        [projectId, actorUserId, idempotencyKey]
      )
    ).rows[0];
    if (previous !== undefined)
      return previous.mutation_hash === mutationHash
        ? { kind: "applied", namespace: RecordSchema.parse(previous.result), replayed: true }
        : { kind: "conflict" };

    const current = (
      await tx.query<NamespaceRow & Record<string, unknown>>(
        `SELECT project_id,namespace_revision,key_fingerprint,activated_at,revoked_at
         FROM analytics_project_identity_namespaces WHERE project_id=$1::uuid FOR UPDATE`,
        [projectId]
      )
    ).rows[0];
    if (!changeAvailable(parsed.data, current)) return { kind: "conflict" };
    if (
      parsed.data.previewHash !== undefined &&
      parsed.data.previewHash !== preview(parsed.data, current).preview_hash
    )
      return { kind: "conflict" };
    const nextRevision = expectedRevision + 1;
    const row =
      parsed.data.action === "configure"
        ? (
            await tx.query<NamespaceRow & Record<string, unknown>>(
              `INSERT INTO analytics_project_identity_namespaces(
                 project_id,namespace_revision,key_fingerprint,activated_at,revoked_at)
               VALUES($1::uuid,$2,$3,clock_timestamp(),NULL)
               ON CONFLICT(project_id) DO UPDATE
                 SET namespace_revision=EXCLUDED.namespace_revision,
                     key_fingerprint=EXCLUDED.key_fingerprint,
                     activated_at=EXCLUDED.activated_at,revoked_at=NULL
               RETURNING project_id,namespace_revision,key_fingerprint,activated_at,revoked_at`,
              [projectId, nextRevision, parsed.data.keyFingerprint]
            )
          ).rows[0]
        : (
            await tx.query<NamespaceRow & Record<string, unknown>>(
              `UPDATE analytics_project_identity_namespaces
               SET namespace_revision=$2,revoked_at=clock_timestamp()
               WHERE project_id=$1::uuid
               RETURNING project_id,namespace_revision,key_fingerprint,activated_at,revoked_at`,
              [projectId, nextRevision]
            )
          ).rows[0];
    if (row === undefined) throw new Error("analytics_identity_namespace_change_unavailable");
    const namespace = mapRow(row);
    await tx.query(
      `INSERT INTO analytics_project_identity_namespace_mutations(
         project_id,actor_user_id,idempotency_key,mutation_hash,result)
       VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5::jsonb)`,
      [projectId, actorUserId, idempotencyKey, mutationHash, JSON.stringify(namespace)]
    );
    return { kind: "applied", namespace, replayed: false };
  });
}
