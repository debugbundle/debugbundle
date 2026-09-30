import { createHash } from "node:crypto";
import { z } from "zod";
import { stableJson } from "../../event-normalizer/src/canonical-json.js";
import {
  AnalyticsSpaceIdentityNamespacePreviewSchema,
  AnalyticsSpaceIdentityNamespaceRecordSchema,
  getTierCapabilities
} from "../../shared-types/src/index.js";
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
const Hash = z.string().regex(/^[a-f0-9]{64}$/);
const Base = {
  actorUserId: Id,
  spaceId: Id,
  expectedRevision: Revision,
  idempotencyKey: Id,
  previewHash: Hash.optional()
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
export type SpaceAnalyticsIdentityNamespaceChange = z.input<typeof Change>;
type NamespaceRecord = z.infer<typeof AnalyticsSpaceIdentityNamespaceRecordSchema>;
type Preview = z.infer<typeof AnalyticsSpaceIdentityNamespacePreviewSchema>;
type Failure = { kind: "invalid" | "forbidden" | "conflict" };
export type SpaceAnalyticsIdentityNamespacePreviewResult =
  | Failure
  | { kind: "preview"; preview: Preview };
export type SpaceAnalyticsIdentityNamespaceApplyResult =
  | Failure
  | { kind: "applied"; namespace: NamespaceRecord; replayed: boolean };

type NamespaceRow = {
  id: string;
  namespace_revision: string | null;
  namespace_source_project_ids: string[] | null;
  namespace_key_fingerprint: string | null;
  namespace_activated_at: Date | null;
  namespace_revoked_at: Date | null;
};
type LockedSpace = {
  row: NamespaceRow;
  revision: number;
  sourceIds: string[];
};
const digest = (value: unknown): string =>
  createHash("sha256").update(stableJson(value)).digest("hex");

function mapRow(row: NamespaceRow): NamespaceRecord | null {
  if (row.namespace_revision === null) return null;
  return AnalyticsSpaceIdentityNamespaceRecordSchema.parse({
    space_id: row.id,
    namespace_revision: Number(row.namespace_revision),
    source_project_ids: row.namespace_source_project_ids,
    key_fingerprint: row.namespace_key_fingerprint,
    activated_at: row.namespace_activated_at?.toISOString(),
    revoked_at: row.namespace_revoked_at?.toISOString() ?? null
  });
}

/** Organization/member, sorted source projects, then space: same lock order as space mutation. */
async function lockConnectedSpace(
  tx: Queryable,
  actorUserId: string,
  spaceId: string
): Promise<LockedSpace | null> {
  const located = (
    await tx.query<{ organization_id: string }>(
      "SELECT organization_id FROM analytics_spaces WHERE id=$1::uuid",
      [spaceId]
    )
  ).rows[0];
  if (located === undefined) return null;
  const organization = (
    await tx.query<{ id: string; plan: string }>(
      `SELECT org.id,org.plan FROM organizations org
       JOIN organization_members member ON member.organization_id=org.id
         AND member.user_id=$2::uuid AND member.role='owner'
         AND member.suspended_at IS NULL
       WHERE org.id=$1::uuid AND org.suspended_at IS NULL
       FOR UPDATE OF org,member`,
      [located.organization_id, actorUserId]
    )
  ).rows[0];
  if (organization === undefined) return null;
  const sourceIds = (
    await tx.query<{ project_id: string }>(
      "SELECT project_id FROM analytics_space_projects WHERE space_id=$1::uuid ORDER BY project_id",
      [spaceId]
    )
  ).rows.map((row) => row.project_id);
  if (sourceIds.length < 1 || sourceIds.length > 20) return null;
  const projects = (
    await tx.query<{ id: string; owner_user_id: string }>(
      `SELECT id,owner_user_id FROM projects
       WHERE id=ANY($1::uuid[]) AND organization_id=$2::uuid
       ORDER BY id FOR UPDATE`,
      [sourceIds, organization.id]
    )
  ).rows;
  if (
    projects.length !== sourceIds.length ||
    (!getTierCapabilities(organization.plan).shared_dashboards &&
      projects.some((project) => project.owner_user_id !== actorUserId))
  )
    return null;
  const admins = new Set(
    (
      await tx.query<{ project_id: string }>(
        `SELECT project_id FROM project_members
         WHERE project_id=ANY($1::uuid[]) AND user_id=$2::uuid AND role='admin' FOR SHARE`,
        [sourceIds, actorUserId]
      )
    ).rows.map((row) => row.project_id)
  );
  if (projects.some((project) => project.owner_user_id !== actorUserId && !admins.has(project.id)))
    return null;
  const space = (
    await tx.query<NamespaceRow & { revision: string; mode: string } & Record<string, unknown>>(
      `SELECT id,revision,mode,namespace_revision,namespace_source_project_ids,
              namespace_key_fingerprint,namespace_activated_at,namespace_revoked_at
       FROM analytics_spaces WHERE id=$1::uuid AND organization_id=$2::uuid
         AND archived_at IS NULL FOR UPDATE`,
      [spaceId, organization.id]
    )
  ).rows[0];
  if (space === undefined || space.mode !== "connected") return null;
  const currentIds = (
    await tx.query<{ project_id: string }>(
      "SELECT project_id FROM analytics_space_projects WHERE space_id=$1::uuid ORDER BY project_id",
      [spaceId]
    )
  ).rows.map((row) => row.project_id);
  if (stableJson(currentIds) !== stableJson(sourceIds)) return null;
  return { row: space, revision: Number(space.revision), sourceIds };
}

function available(change: z.output<typeof Change>, current: LockedSpace): boolean {
  const prior = mapRow(current.row);
  if ((prior?.namespace_revision ?? 0) !== change.expectedRevision) return false;
  if (change.action === "revoke") return prior !== null && prior.revoked_at === null;
  return (
    prior === null ||
    prior.revoked_at !== null ||
    prior.key_fingerprint !== change.keyFingerprint ||
    stableJson(prior.source_project_ids) !== stableJson(current.sourceIds)
  );
}

function preview(change: z.output<typeof Change>, current: LockedSpace): Preview {
  const prior = mapRow(current.row);
  return AnalyticsSpaceIdentityNamespacePreviewSchema.parse({
    space_id: change.spaceId,
    space_revision: current.revision,
    source_project_ids: current.sourceIds,
    action: change.action,
    expected_revision: change.expectedRevision,
    resulting_revision: change.expectedRevision + 1,
    current_key_fingerprint: prior?.key_fingerprint ?? null,
    proposed_key_fingerprint: change.action === "configure" ? change.keyFingerprint : null,
    contexts_fenced: prior !== null,
    preview_hash: digest({
      actor_user_id: change.actorUserId,
      space_id: change.spaceId,
      space_revision: current.revision,
      source_project_ids: current.sourceIds,
      action: change.action,
      expected_revision: change.expectedRevision,
      idempotency_key: change.idempotencyKey,
      current: prior,
      proposed_key_fingerprint: change.action === "configure" ? change.keyFingerprint : null
    })
  });
}

export async function readSpaceAnalyticsIdentityNamespace(
  db: Queryable,
  actorUserId: string,
  spaceId: string
): Promise<NamespaceRecord | null> {
  const actor = Id.safeParse(actorUserId);
  const space = Id.safeParse(spaceId);
  if (!actor.success || !space.success) return null;
  return runInTransaction(db, async (tx) => {
    const current = await lockConnectedSpace(tx, actor.data, space.data);
    return current === null ? null : mapRow(current.row);
  });
}

export async function previewSpaceAnalyticsIdentityNamespaceChange(
  db: Queryable,
  change: SpaceAnalyticsIdentityNamespaceChange
): Promise<SpaceAnalyticsIdentityNamespacePreviewResult> {
  const parsed = Change.safeParse(change);
  if (!parsed.success) return { kind: "invalid" };
  return runInTransaction<SpaceAnalyticsIdentityNamespacePreviewResult>(db, async (tx) => {
    const current = await lockConnectedSpace(tx, parsed.data.actorUserId, parsed.data.spaceId);
    if (current === null) return { kind: "forbidden" };
    if (!available(parsed.data, current)) return { kind: "conflict" };
    return { kind: "preview", preview: preview(parsed.data, current) };
  });
}

/** The reviewed change records no key, and replay requires current space/source authority. */
export async function applySpaceAnalyticsIdentityNamespaceChange(
  db: Queryable,
  change: SpaceAnalyticsIdentityNamespaceChange & { previewHash: string }
): Promise<SpaceAnalyticsIdentityNamespaceApplyResult> {
  const parsed = Change.safeParse(change);
  if (!parsed.success || parsed.data.previewHash === undefined) return { kind: "invalid" };
  const mutationHash = digest({
    actorUserId: parsed.data.actorUserId,
    spaceId: parsed.data.spaceId,
    action: parsed.data.action,
    expectedRevision: parsed.data.expectedRevision,
    idempotencyKey: parsed.data.idempotencyKey,
    keyFingerprint: parsed.data.action === "configure" ? parsed.data.keyFingerprint : null
  });
  return runInTransaction<SpaceAnalyticsIdentityNamespaceApplyResult>(db, async (tx) => {
    const current = await lockConnectedSpace(tx, parsed.data.actorUserId, parsed.data.spaceId);
    if (current === null) return { kind: "forbidden" };
    const previous = (
      await tx.query<{ mutation_hash: string; result: unknown }>(
        `SELECT mutation_hash,result FROM analytics_space_identity_namespace_mutations
         WHERE space_id=$1::uuid AND actor_user_id=$2::uuid AND idempotency_key=$3::uuid`,
        [parsed.data.spaceId, parsed.data.actorUserId, parsed.data.idempotencyKey]
      )
    ).rows[0];
    if (previous !== undefined)
      return previous.mutation_hash === mutationHash
        ? {
            kind: "applied",
            namespace: AnalyticsSpaceIdentityNamespaceRecordSchema.parse(previous.result),
            replayed: true
          }
        : { kind: "conflict" };
    if (
      !available(parsed.data, current) ||
      preview(parsed.data, current).preview_hash !== parsed.data.previewHash
    )
      return { kind: "conflict" };
    const nextRevision = parsed.data.expectedRevision + 1;
    const updated =
      parsed.data.action === "configure"
        ? await tx.query<NamespaceRow & Record<string, unknown>>(
            `UPDATE analytics_spaces SET namespace_revision=$2,
               namespace_source_project_ids=$3::uuid[],namespace_key_fingerprint=$4,
               namespace_activated_at=clock_timestamp(),namespace_revoked_at=NULL
             WHERE id=$1::uuid
             RETURNING id,namespace_revision,namespace_source_project_ids,
                       namespace_key_fingerprint,namespace_activated_at,namespace_revoked_at`,
            [parsed.data.spaceId, nextRevision, current.sourceIds, parsed.data.keyFingerprint]
          )
        : await tx.query<NamespaceRow & Record<string, unknown>>(
            `UPDATE analytics_spaces SET namespace_revision=$2,
               namespace_revoked_at=clock_timestamp()
             WHERE id=$1::uuid
             RETURNING id,namespace_revision,namespace_source_project_ids,
                       namespace_key_fingerprint,namespace_activated_at,namespace_revoked_at`,
            [parsed.data.spaceId, nextRevision]
          );
    const row = updated.rows[0];
    if (row === undefined) throw new Error("analytics_space_identity_namespace_change_unavailable");
    const namespace = mapRow(row);
    if (namespace === null)
      throw new Error("analytics_space_identity_namespace_change_unavailable");
    await tx.query(
      `INSERT INTO analytics_space_identity_namespace_mutations(
         space_id,actor_user_id,idempotency_key,mutation_hash,result)
       VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5::jsonb)`,
      [
        parsed.data.spaceId,
        parsed.data.actorUserId,
        parsed.data.idempotencyKey,
        mutationHash,
        JSON.stringify(namespace)
      ]
    );
    return { kind: "applied", namespace, replayed: false };
  });
}
