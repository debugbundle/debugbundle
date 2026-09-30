import { createHash } from "node:crypto";
import { z } from "zod";
import { sanitizeTelemetry } from "../../redaction/src/index.js";
import { stableJson } from "../../event-normalizer/src/canonical-json.js";
import {
  AnalyticsCatalogEntrySchema,
  getTierCapabilities,
  type AnalyticsCatalogEntry
} from "../../shared-types/src/index.js";
import { lockAnalyticsWriterProject } from "./analytics-writer-access.js";
import { runInTransaction } from "./transaction.js";
import type { Queryable } from "./types.js";

const Id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
const Entries = z
  .array(AnalyticsCatalogEntrySchema)
  .max(100)
  .refine((entries) => new Set(entries.map((entry) => entry.name)).size === entries.length);
const Change = z
  .object({
    actorUserId: Id,
    projectId: Id,
    expectedRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    idempotencyKey: Id,
    entries: Entries
  })
  .strict();
const Read = z.object({ actorUserId: Id, projectId: Id }).strict();

export interface AnalyticsProjectCatalogRecord {
  project_id: string;
  revision: number;
  catalog_revision: number;
  entries: AnalyticsCatalogEntry[];
}
export interface AnalyticsProjectCatalogChange {
  actorUserId: string;
  projectId: string;
  expectedRevision: number;
  idempotencyKey: string;
  entries: AnalyticsCatalogEntry[];
}
export interface AnalyticsProjectCatalogPreview {
  project_id: string;
  preview_hash: string;
  expected_revision: number;
  resulting_revision: number;
  catalog_revision: number;
  added_names: string[];
  removed_names: string[];
  changed_names: string[];
  already_applied: boolean;
}
type Failure = { kind: "invalid" | "forbidden" | "conflict" | "capacity_exceeded" };
export type AnalyticsProjectCatalogPreviewResult =
  | Failure
  | { kind: "preview"; preview: AnalyticsProjectCatalogPreview };
export type AnalyticsProjectCatalogApplyResult =
  | Failure
  | { kind: "applied"; catalog: AnalyticsProjectCatalogRecord; replayed: boolean };
export interface AnalyticsProjectCatalogStore {
  preview(input: AnalyticsProjectCatalogChange): Promise<AnalyticsProjectCatalogPreviewResult>;
  apply(
    input: AnalyticsProjectCatalogChange & { previewHash: string }
  ): Promise<AnalyticsProjectCatalogApplyResult>;
  read(input: {
    actorUserId: string;
    projectId: string;
  }): Promise<AnalyticsProjectCatalogRecord | null>;
}

/** Internal composition hook; caller owns the surrounding transaction. */
export async function previewProjectCatalogInTransaction(
  tx: Queryable,
  input: AnalyticsProjectCatalogChange
): Promise<AnalyticsProjectCatalogPreviewResult> {
  const prepared = prepare(input);
  if (prepared === null) return { kind: "invalid" };
  return changeCatalog(tx, prepared, true) as Promise<AnalyticsProjectCatalogPreviewResult>;
}

/** Internal composition hook; caller owns the surrounding transaction. */
export async function applyProjectCatalogInTransaction(
  tx: Queryable,
  input: AnalyticsProjectCatalogChange & { previewHash: string }
): Promise<AnalyticsProjectCatalogApplyResult> {
  const prepared = prepare({
    actorUserId: input.actorUserId,
    projectId: input.projectId,
    expectedRevision: input.expectedRevision,
    idempotencyKey: input.idempotencyKey,
    entries: input.entries
  });
  if (prepared === null) return { kind: "invalid" };
  if (input.previewHash !== prepared.mutationHash) return { kind: "conflict" };
  return changeCatalog(tx, prepared, false) as Promise<AnalyticsProjectCatalogApplyResult>;
}

type Prepared = { change: z.infer<typeof Change>; mutationHash: string; contentHash: string };
type CatalogRow = {
  project_id: string;
  revision: string | number;
  catalog_revision: string | number;
  content_hash: string;
  entries: unknown;
};
type RevisionRow = CatalogRow & { mutation_hash: string };
const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");

function prepare(input: AnalyticsProjectCatalogChange): Prepared | null {
  const parsed = Change.safeParse(input);
  if (!parsed.success) return null;
  const change = {
    ...parsed.data,
    entries: [...parsed.data.entries].sort((a, b) => a.name.localeCompare(b.name))
  };
  const protectedEntries = sanitizeTelemetry(change.entries);
  const content = stableJson(change.entries);
  if (
    !protectedEntries.ok ||
    stableJson(protectedEntries.value) !== content ||
    Buffer.byteLength(content, "utf8") > 240 * 1024
  )
    return null;
  return {
    change,
    mutationHash: sha256(stableJson(change)),
    contentHash: sha256(content)
  };
}

function record(row: CatalogRow): AnalyticsProjectCatalogRecord {
  return {
    project_id: row.project_id,
    revision: Number(row.revision),
    catalog_revision: Number(row.catalog_revision),
    entries: Entries.parse(row.entries)
  };
}

async function currentCatalog(db: Queryable, projectId: string): Promise<CatalogRow | undefined> {
  return (
    await db.query<CatalogRow & Record<string, unknown>>(
      `SELECT project_id,revision,catalog_revision,content_hash,entries
       FROM analytics_project_catalogs WHERE project_id=$1::uuid FOR UPDATE`,
      [projectId]
    )
  ).rows[0];
}

async function changeCatalog(
  db: Queryable,
  prepared: Prepared,
  previewOnly: boolean
): Promise<AnalyticsProjectCatalogPreviewResult | AnalyticsProjectCatalogApplyResult> {
  const { change, mutationHash, contentHash } = prepared;
  const { projectId, actorUserId } = change;
  const access = await lockAnalyticsWriterProject(db, projectId, actorUserId);
  if (access === null) return { kind: "forbidden" };
  const previous = (
    await db.query<RevisionRow & Record<string, unknown>>(
      `SELECT project_id,revision,catalog_revision,content_hash,entries,mutation_hash
       FROM analytics_project_catalog_revisions
       WHERE project_id=$1::uuid AND actor_user_id=$2::uuid AND idempotency_key=$3::uuid`,
      [projectId, actorUserId, change.idempotencyKey]
    )
  ).rows[0];
  if (previous !== undefined) {
    if (previous.mutation_hash !== mutationHash) return { kind: "conflict" };
    const catalog = record(previous);
    return previewOnly
      ? {
          kind: "preview",
          preview: {
            project_id: projectId,
            preview_hash: mutationHash,
            expected_revision: change.expectedRevision,
            resulting_revision: catalog.revision,
            catalog_revision: catalog.catalog_revision,
            added_names: [],
            removed_names: [],
            changed_names: [],
            already_applied: true
          }
        }
      : { kind: "applied", catalog, replayed: true };
  }
  const current = await currentCatalog(db, projectId);
  const currentRevision = current === undefined ? 0 : Number(current.revision);
  if (currentRevision !== change.expectedRevision) return { kind: "conflict" };
  if (currentRevision >= 1000) return { kind: "capacity_exceeded" };
  const limits = (
    await db.query<{ plan: string }>(
      `SELECT org.plan
       FROM projects p JOIN organizations org ON org.id=p.organization_id
       WHERE p.id=$1::uuid AND org.id=$2::uuid`,
      [projectId, access.organizationId]
    )
  ).rows[0];
  if (limits === undefined) return { kind: "forbidden" };
  const settings = (
    await db.query<{ max_custom_dimensions: string | number }>(
      `SELECT max_custom_dimensions FROM project_analytics_settings
       WHERE project_id=$1::uuid FOR SHARE`,
      [projectId]
    )
  ).rows[0];
  const tierLimit = getTierCapabilities(limits.plan).max_analytics_custom_dimensions;
  const settingsLimit = settings === undefined ? tierLimit : Number(settings.max_custom_dimensions);
  const effectiveLimit = Math.min(tierLimit, settingsLimit);
  if (change.entries.some((entry) => Object.keys(entry.properties).length > effectiveLimit))
    return { kind: "capacity_exceeded" };

  const latestVersions = (
    await db.query<{ name: string; revision: string | number; content_hash: string }>(
      `SELECT DISTINCT ON (name) name,revision,content_hash
       FROM analytics_project_catalog_entry_revisions
       WHERE project_id=$1::uuid AND name=ANY($2::text[])
       ORDER BY name,revision DESC`,
      [projectId, change.entries.map((entry) => entry.name)]
    )
  ).rows;
  const latest = new Map(latestVersions.map((row) => [row.name, row]));
  const introduced: Array<{ entry: AnalyticsCatalogEntry; hash: string }> = [];
  for (const entry of change.entries) {
    const hash = sha256(stableJson(entry));
    const prior = latest.get(entry.name);
    if (prior !== undefined) {
      if (entry.revision < Number(prior.revision)) return { kind: "conflict" };
      if (entry.revision === Number(prior.revision) && hash !== prior.content_hash)
        return { kind: "conflict" };
    }
    if (prior === undefined || entry.revision > Number(prior.revision))
      introduced.push({ entry, hash });
  }

  const oldEntries = current === undefined ? [] : Entries.parse(current.entries);
  const oldByName = new Map(oldEntries.map((entry) => [entry.name, entry]));
  const newByName = new Map(change.entries.map((entry) => [entry.name, entry]));
  const catalogRevision =
    current === undefined
      ? change.entries.length === 0
        ? 0
        : 1
      : Number(current.catalog_revision) + (current.content_hash === contentHash ? 0 : 1);
  const preview: AnalyticsProjectCatalogPreview = {
    project_id: projectId,
    preview_hash: mutationHash,
    expected_revision: change.expectedRevision,
    resulting_revision: currentRevision + 1,
    catalog_revision: catalogRevision,
    added_names: change.entries
      .filter((entry) => !oldByName.has(entry.name))
      .map((entry) => entry.name),
    removed_names: oldEntries
      .filter((entry) => !newByName.has(entry.name))
      .map((entry) => entry.name),
    changed_names: change.entries
      .filter((entry) => {
        const old = oldByName.get(entry.name);
        return old !== undefined && stableJson(old) !== stableJson(entry);
      })
      .map((entry) => entry.name),
    already_applied: false
  };
  if (previewOnly) return { kind: "preview", preview };
  await db.query(
    `INSERT INTO analytics_project_catalogs(project_id,revision,catalog_revision,content_hash,entries)
     VALUES($1::uuid,$2,$3,$4,$5::jsonb)
     ON CONFLICT(project_id) DO UPDATE SET revision=EXCLUDED.revision,
       catalog_revision=EXCLUDED.catalog_revision,content_hash=EXCLUDED.content_hash,
       entries=EXCLUDED.entries,updated_at=now()`,
    [projectId, currentRevision + 1, catalogRevision, contentHash, JSON.stringify(change.entries)]
  );
  for (const { entry, hash } of introduced) {
    await db.query(
      `INSERT INTO analytics_project_catalog_entry_revisions(project_id,name,revision,content_hash,entry)
       VALUES($1::uuid,$2,$3,$4,$5::jsonb)`,
      [projectId, entry.name, entry.revision, hash, JSON.stringify(entry)]
    );
  }
  await db.query(
    `INSERT INTO analytics_project_catalog_revisions(project_id,revision,catalog_revision,actor_user_id,
      idempotency_key,mutation_hash,content_hash,entries)
     VALUES($1::uuid,$2,$3,$4::uuid,$5::uuid,$6,$7,$8::jsonb)`,
    [
      projectId,
      currentRevision + 1,
      catalogRevision,
      actorUserId,
      change.idempotencyKey,
      mutationHash,
      contentHash,
      JSON.stringify(change.entries)
    ]
  );
  return {
    kind: "applied",
    replayed: false,
    catalog: {
      project_id: projectId,
      revision: currentRevision + 1,
      catalog_revision: catalogRevision,
      entries: change.entries
    }
  };
}

export function createAnalyticsProjectCatalogStore(db: Queryable): AnalyticsProjectCatalogStore {
  return {
    preview: (input) => runInTransaction(db, (tx) => previewProjectCatalogInTransaction(tx, input)),
    apply: (input) => runInTransaction(db, (tx) => applyProjectCatalogInTransaction(tx, input)),
    async read(input) {
      const parsed = Read.safeParse(input);
      if (!parsed.success) return null;
      return runInTransaction(db, async (tx) => {
        const access = await lockAnalyticsWriterProject(
          tx,
          parsed.data.projectId,
          parsed.data.actorUserId
        );
        if (access === null) return null;
        const current = await currentCatalog(tx, parsed.data.projectId);
        return current === undefined ? null : record(current);
      });
    }
  };
}
