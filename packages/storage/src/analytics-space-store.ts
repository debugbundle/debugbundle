import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  AnalyticsSpaceChangeSchema,
  getTierCapabilities,
  type AnalyticsSpaceChange,
  type AnalyticsSpaceRecord,
  type AnalyticsSpacePreview
} from "../../shared-types/src/index.js";
import { sanitizeTelemetry } from "../../redaction/src/index.js";
import { stableJson } from "../../event-normalizer/src/canonical-json.js";
import { runInTransaction } from "./transaction.js";
import {
  mapAnalyticsSpace,
  readAnalyticsSpaces,
  type AnalyticsSpaceRow
} from "./analytics-space-read.js";
import type { Queryable } from "./types.js";

const Id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
const SnapshotInput = z
  .object({
    actorUserId: Id,
    spaceId: Id,
    revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    sourceProjectIds: z.array(Id).min(1).max(20)
  })
  .strict();

type Failure = {
  kind: "invalid" | "forbidden" | "conflict" | "project_already_linked" | "capacity_exceeded";
};
export type AnalyticsSpaceMutationResult =
  | { kind: "applied"; space: AnalyticsSpaceRecord; replayed: boolean }
  | Failure;
export type AnalyticsSpacePreviewResult =
  | { kind: "preview"; preview: AnalyticsSpacePreview }
  | Failure;
export interface AnalyticsSpaceChangeInput {
  actorUserId: string;
  spaceId: string | null;
  change: AnalyticsSpaceChange;
}
export interface AnalyticsSpaceStore {
  preview(input: AnalyticsSpaceChangeInput): Promise<AnalyticsSpacePreviewResult>;
  apply(
    input: AnalyticsSpaceChangeInput & { previewHash: string }
  ): Promise<AnalyticsSpaceMutationResult>;
  list(input: { actorUserId: string; organizationId: string }): Promise<AnalyticsSpaceRecord[]>;
  read(input: { actorUserId: string; spaceId: string }): Promise<AnalyticsSpaceRecord | null>;
  authorizeSnapshot(input: {
    actorUserId: string;
    spaceId: string;
    revision: number;
    sourceProjectIds: string[];
  }): Promise<boolean>;
}

function prepare(
  input: AnalyticsSpaceChangeInput
): { input: AnalyticsSpaceChangeInput; hash: string } | null {
  const parsed = AnalyticsSpaceChangeSchema.safeParse(input.change);
  const actor = Id.safeParse(input.actorUserId);
  const target = input.spaceId === null ? null : Id.safeParse(input.spaceId);
  if (
    !parsed.success ||
    !actor.success ||
    (target !== null && !target.success) ||
    (parsed.data.action === "archive" && input.spaceId === null)
  )
    return null;
  const change = parsed.data;
  if (change.action === "save") {
    const label = sanitizeTelemetry(change.mutation.display_name);
    if (
      !label.ok ||
      typeof label.value !== "string" ||
      label.value.length < 1 ||
      label.value.length > 120
    )
      return null;
    change.mutation.display_name = label.value;
    change.mutation.project_ids.sort();
  }
  const normalized = {
    actorUserId: actor.data,
    spaceId: target?.data ?? null,
    change
  };
  // The hash binds protected content, target and actor. Current authority/revision are checked again under locks.
  const hash = createHash("sha256")
    .update(stableJson({ actor: normalized.actorUserId, target: normalized.spaceId, change }))
    .digest("hex");
  return { input: normalized, hash };
}

/** Organization, sorted project rows, then space locks are the shared change lock order. */
async function changeSpace(
  db: Queryable,
  input: AnalyticsSpaceChangeInput,
  hash: string,
  previewOnly: boolean
): Promise<AnalyticsSpaceMutationResult | AnalyticsSpacePreviewResult> {
  const { actorUserId, spaceId, change } = input;
  const mutation = change.mutation;
  const owner = await db.query<{ id: string; plan: string }>(
    `SELECT org.id,org.plan FROM organizations org JOIN organization_members om ON om.organization_id=org.id
    WHERE org.id=$1::uuid AND org.suspended_at IS NULL AND om.user_id=$2::uuid AND om.role='owner' AND om.suspended_at IS NULL
    FOR UPDATE OF org,om`,
    [mutation.organization_id, actorUserId]
  );
  if (owner.rows.length !== 1) return { kind: "forbidden" };
  const mutationScope = spaceId ?? "create";
  const prior = await db.query<
    AnalyticsSpaceRow & { mutation_hash: string } & Record<string, unknown>
  >(
    `
    SELECT r.space_id AS id,r.organization_id,r.display_name,r.mode,r.revision,r.project_ids,s.created_at,r.archived,r.mutation_hash
    FROM analytics_space_revisions r JOIN analytics_spaces s ON s.id=r.space_id
    WHERE r.organization_id=$1::uuid AND r.actor_user_id=$2::uuid AND r.mutation_scope=$3 AND r.idempotency_key=$4::uuid`,
    [mutation.organization_id, actorUserId, mutationScope, mutation.idempotency_key]
  );
  const previous = prior.rows[0];
  const old =
    spaceId === null
      ? []
      : (
          await db.query<{ project_id: string }>(
            `
    SELECT sp.project_id FROM analytics_space_projects sp JOIN analytics_spaces s ON s.id=sp.space_id
    WHERE s.id=$1::uuid AND s.organization_id=$2::uuid AND s.archived_at IS NULL ORDER BY sp.project_id`,
            [spaceId, mutation.organization_id]
          )
        ).rows.map((row) => row.project_id);
  if (spaceId !== null && old.length === 0 && previous === undefined) return { kind: "forbidden" };
  const desired = change.action === "save" ? change.mutation.project_ids : [];
  // Replay never bypasses current access to any source in the original result, including archived membership.
  const allProjects = [...new Set([...old, ...desired, ...(previous?.project_ids ?? [])])].sort();
  const projects = await db.query<{ id: string; owner_user_id: string }>(
    `
    SELECT p.id,p.owner_user_id FROM projects p WHERE p.id=ANY($1::uuid[]) AND p.organization_id=$2::uuid ORDER BY p.id FOR UPDATE`,
    [allProjects, mutation.organization_id]
  );
  if (projects.rows.length !== allProjects.length) return { kind: "forbidden" };
  if (
    !getTierCapabilities(owner.rows[0]!.plan).shared_dashboards &&
    projects.rows.some((project) => project.owner_user_id !== actorUserId)
  )
    return { kind: "forbidden" };
  const administered = await db.query<{ project_id: string }>(
    `
    SELECT project_id FROM project_members WHERE project_id=ANY($1::uuid[]) AND user_id=$2::uuid AND role='admin' FOR SHARE`,
    [allProjects, actorUserId]
  );
  const admins = new Set(administered.rows.map((row) => row.project_id));
  if (
    projects.rows.some(
      (project) => project.owner_user_id !== actorUserId && !admins.has(project.id)
    )
  )
    return { kind: "forbidden" };
  let current: AnalyticsSpaceRow | undefined;
  const preview = (
    revision: number,
    alreadyApplied: boolean,
    modeChanged = false
  ): AnalyticsSpacePreviewResult => ({
    kind: "preview",
    preview: {
      preview_hash: hash,
      action: change.action,
      space_id: spaceId,
      expected_revision: mutation.expected_revision,
      resulting_revision: revision,
      added_project_ids: alreadyApplied ? [] : desired.filter((id) => !old.includes(id)),
      removed_project_ids: alreadyApplied ? [] : old.filter((id) => !desired.includes(id)),
      mode_changed: modeChanged,
      display_name:
        change.action === "save"
          ? change.mutation.display_name
          : (previous ?? current)!.display_name,
      mode: change.action === "save" ? change.mutation.mode : (previous ?? current)!.mode,
      already_applied: alreadyApplied
    }
  });
  if (previous !== undefined) {
    if (previous.mutation_hash !== hash) return { kind: "conflict" };
    return previewOnly
      ? preview(Number(previous.revision), true)
      : { kind: "applied", replayed: true, space: mapAnalyticsSpace(previous) };
  }
  let revision = 1;
  if (spaceId === null) {
    if (mutation.expected_revision !== 0) return { kind: "conflict" };
    const count = await db.query<{ count: string }>(
      "SELECT count(*) FROM analytics_spaces WHERE organization_id=$1::uuid AND archived_at IS NULL",
      [mutation.organization_id]
    );
    if (Number(count.rows[0]?.count ?? 0) >= 20) return { kind: "capacity_exceeded" };
  } else {
    current = (
      await db.query<AnalyticsSpaceRow & Record<string, unknown>>(
        `
      SELECT id,organization_id,display_name,mode,revision,created_at,archived_at IS NOT NULL AS archived
      FROM analytics_spaces WHERE id=$1::uuid AND organization_id=$2::uuid FOR UPDATE`,
        [spaceId, mutation.organization_id]
      )
    ).rows[0];
    if (current === undefined || current.archived) return { kind: "forbidden" };
    const currentRevision = Number(current.revision);
    if (currentRevision !== mutation.expected_revision) return { kind: "conflict" };
    if (
      currentRevision >= Number.MAX_SAFE_INTEGER ||
      (change.action === "save" && currentRevision >= 1000)
    )
      return { kind: "capacity_exceeded" };
    revision = currentRevision + 1;
  }
  const linked = await db.query(
    `SELECT project_id FROM analytics_space_projects
    WHERE project_id=ANY($1::uuid[]) AND ($2::uuid IS NULL OR space_id<>$2::uuid)`,
    [desired, spaceId]
  );
  if (linked.rows.length > 0) return { kind: "project_already_linked" };
  if (previewOnly)
    return preview(
      revision,
      false,
      change.action === "save" && current !== undefined && current.mode !== change.mutation.mode
    );
  const id = spaceId ?? randomUUID();
  const displayName =
    change.action === "save" ? change.mutation.display_name : current!.display_name;
  const mode = change.action === "save" ? change.mutation.mode : current!.mode;
  if (spaceId === null)
    await db.query(
      `INSERT INTO analytics_spaces(id,organization_id,display_name,mode,revision)
    VALUES($1::uuid,$2::uuid,$3,$4,$5)`,
      [id, mutation.organization_id, displayName, mode, revision]
    );
  else
    await db.query(
      `UPDATE analytics_spaces SET display_name=$2,mode=$3,revision=$4,updated_at=now(),
    archived_at=CASE WHEN $5 THEN now() ELSE NULL END WHERE id=$1::uuid`,
      [id, displayName, mode, revision, change.action === "archive"]
    );
  await db.query(
    "DELETE FROM analytics_space_projects WHERE space_id=$1::uuid AND NOT(project_id=ANY($2::uuid[]))",
    [id, desired]
  );
  for (const projectId of desired)
    await db.query(
      `INSERT INTO analytics_space_projects(space_id,project_id)
    VALUES($1::uuid,$2::uuid) ON CONFLICT(project_id) DO NOTHING`,
      [id, projectId]
    );
  const auditedProjects = change.action === "archive" ? old : desired;
  await db.query(
    `INSERT INTO analytics_space_revisions(space_id,organization_id,revision,actor_user_id,mutation_scope,
    idempotency_key,mutation_hash,display_name,mode,project_ids,archived) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::uuid[],$11)`,
    [
      id,
      mutation.organization_id,
      revision,
      actorUserId,
      mutationScope,
      mutation.idempotency_key,
      hash,
      displayName,
      mode,
      auditedProjects,
      change.action === "archive"
    ]
  );
  if (change.action === "archive")
    return {
      kind: "applied",
      replayed: false,
      space: mapAnalyticsSpace({
        ...current!,
        revision,
        project_ids: auditedProjects,
        archived: true
      })
    };
  const space = (await readAnalyticsSpaces(db, actorUserId, { spaceId: id }))[0];
  // A visibility failure rolls back membership and audit together; no hidden partial write commits.
  if (space === undefined) throw new Error("analytics_space_write_visibility_failed");
  return { kind: "applied", replayed: false, space };
}

export function createAnalyticsSpaceStore(db: Queryable): AnalyticsSpaceStore {
  const read = async (input: {
    actorUserId: string;
    spaceId: string;
  }): Promise<AnalyticsSpaceRecord | null> => {
    const actor = Id.safeParse(input.actorUserId);
    const space = Id.safeParse(input.spaceId);
    if (!actor.success || !space.success) return null;
    return (await readAnalyticsSpaces(db, actor.data, { spaceId: space.data }))[0] ?? null;
  };
  return {
    async preview(input) {
      const prepared = prepare(input);
      if (prepared === null) return { kind: "invalid" };
      const result = await runInTransaction(db, (tx) =>
        changeSpace(tx, prepared.input, prepared.hash, true)
      );
      if (result.kind === "applied") throw new Error("analytics_space_preview_wrote");
      return result;
    },
    async apply(input) {
      const prepared = prepare(input);
      if (prepared === null) return { kind: "invalid" };
      if (input.previewHash !== prepared.hash) return { kind: "conflict" };
      const result = await runInTransaction(db, (tx) =>
        changeSpace(tx, prepared.input, prepared.hash, false)
      );
      if (result.kind === "preview") throw new Error("analytics_space_apply_not_written");
      return result;
    },
    list: (input) => {
      const actor = Id.safeParse(input.actorUserId);
      const organization = Id.safeParse(input.organizationId);
      return !actor.success || !organization.success
        ? Promise.resolve([])
        : readAnalyticsSpaces(db, actor.data, { organizationId: organization.data });
    },
    read,
    async authorizeSnapshot(input) {
      const parsed = SnapshotInput.safeParse(input);
      if (!parsed.success) return false;
      const current = await read(parsed.data);
      const sources = [...new Set(parsed.data.sourceProjectIds)].sort();
      return (
        current !== null &&
        current.revision === parsed.data.revision &&
        sources.length === parsed.data.sourceProjectIds.length &&
        sources.length === current.project_ids.length &&
        sources.every((id, index) => id === current.project_ids[index])
      );
    }
  };
}
