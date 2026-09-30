import { createHash } from "node:crypto";
import { z } from "zod";
import {
  reportCatalogMeaningChanged,
  validateAnalyticsMeasurementPlan,
  validateSpaceCatalogSnapshot
} from "../../analytics-engine/src/index.js";
import { stableJson } from "../../event-normalizer/src/canonical-json.js";
import {
  AnalyticsCatalogEntrySchema,
  AnalyticsSpacePlanReportStateSchema,
  getTierCapabilities,
  type AnalyticsCatalogEntry,
  type AnalyticsMeasurementPlan
} from "../../shared-types/src/index.js";
import { readActiveSpaceReportSlotsInTransaction } from "./analytics-report-slot-capacity.js";
import { runInTransaction } from "./transaction.js";
import type { Queryable } from "./types.js";

const Id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
const Catalog = z.array(AnalyticsCatalogEntrySchema).max(100);
const ReportStates = z.array(AnalyticsSpacePlanReportStateSchema).max(100);
export const AnalyticsSpacePlanSourceRevisionsSchema = z
  .array(z.object({ project_id: Id, catalog_revision: z.number().int().min(1) }).strict())
  .min(1)
  .max(20);
export const AnalyticsSpacePlanCoverageSchema = z
  .array(
    z
      .object({
        name: z.string().min(1).max(120),
        project_ids: z.array(Id).min(1).max(20),
        source_entry_revisions: z
          .array(z.object({ project_id: Id, entry_revision: z.number().int().min(1) }).strict())
          .min(1)
          .max(20)
      })
      .strict()
  )
  .max(100);
const SourceRevisions = AnalyticsSpacePlanSourceRevisionsSchema;
const Coverage = AnalyticsSpacePlanCoverageSchema;
const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");

export interface AnalyticsSpacePlanRecord {
  space_id: string;
  revision: number;
  space_revision: number;
  catalog: AnalyticsCatalogEntry[];
  reports: z.infer<typeof ReportStates>;
  source_catalog_revisions: z.infer<typeof SourceRevisions>;
  coverage: z.infer<typeof Coverage>;
}
export interface AnalyticsSpacePlanPreview {
  space_id: string;
  preview_hash: string;
  expected_revision: number;
  resulting_revision: number;
  space_revision: number;
  source_catalog_revisions: z.infer<typeof SourceRevisions>;
  coverage: z.infer<typeof Coverage>;
  already_applied: boolean;
}
type Failure = {
  kind: "invalid" | "forbidden" | "conflict" | "mode_unavailable" | "capacity_exceeded";
};
export type AnalyticsSpacePlanPreviewResult =
  | Failure
  | { kind: "preview"; preview: AnalyticsSpacePlanPreview };
export type AnalyticsSpacePlanApplyResult =
  | Failure
  | { kind: "applied"; plan: AnalyticsSpacePlanRecord; replayed: boolean };
export interface AnalyticsSpacePlanStore {
  preview(input: {
    actorUserId: string;
    plan: AnalyticsMeasurementPlan;
  }): Promise<AnalyticsSpacePlanPreviewResult>;
  apply(input: {
    actorUserId: string;
    plan: AnalyticsMeasurementPlan;
    previewHash: string;
  }): Promise<AnalyticsSpacePlanApplyResult>;
  read(input: { actorUserId: string; spaceId: string }): Promise<AnalyticsSpacePlanRecord | null>;
}

type Prepared = {
  actorUserId: string;
  spaceId: string;
  plan: AnalyticsMeasurementPlan;
  mutationHash: string;
  contentHash: string;
};
type PlanRow = {
  space_id: string;
  revision: string | number;
  space_revision: string | number;
  catalog: unknown;
  reports: unknown;
  source_catalog_revisions: unknown;
  coverage: unknown;
};
type RevisionRow = PlanRow & { mutation_hash: string; review_hash: string };
type SourceCatalogRow = {
  project_id: string;
  catalog_revision: string | number;
  entries: unknown;
};
export type AnalyticsSpacePlanSourceSnapshot = {
  spaceRevision: number;
  mode: "portfolio" | "connected";
  tierPlan: string;
  projectIds: string[];
  catalogs: Array<{
    project_id: string;
    catalog_revision: number;
    entries: AnalyticsCatalogEntry[];
  }>;
};

function prepare(input: { actorUserId: string; plan: AnalyticsMeasurementPlan }): Prepared | null {
  const actor = Id.safeParse(input.actorUserId);
  const validated = validateAnalyticsMeasurementPlan(input.plan);
  if (!actor.success || !validated.valid || validated.plan.scope.kind !== "space") return null;
  const spaceId = validated.plan.scope.space_id.toLowerCase();
  const plan = {
    ...validated.plan,
    scope: { kind: "space" as const, space_id: spaceId },
    idempotency_key: validated.plan.idempotency_key.toLowerCase(),
    catalog: [...validated.plan.catalog].sort((a, b) => a.name.localeCompare(b.name)),
    reports: validated.plan.reports
      .map((report) => ({ ...report, scope: { kind: "space" as const, space_id: spaceId } }))
      .sort((a, b) => a.key.localeCompare(b.key))
  };
  const content = stableJson({
    enforcement: plan.enforcement,
    catalog: plan.catalog,
    reports: plan.reports
  });
  if (Buffer.byteLength(content, "utf8") > 240 * 1024) return null;
  return {
    actorUserId: actor.data,
    spaceId,
    plan,
    mutationHash: sha256(stableJson({ actorUserId: actor.data, plan })),
    contentHash: sha256(content)
  };
}

function record(row: PlanRow): AnalyticsSpacePlanRecord {
  const reports = ReportStates.parse(row.reports);
  return {
    space_id: row.space_id,
    revision: Number(row.revision),
    space_revision: Number(row.space_revision),
    catalog: Catalog.parse(row.catalog),
    reports,
    source_catalog_revisions: SourceRevisions.parse(row.source_catalog_revisions),
    coverage: Coverage.parse(row.coverage)
  };
}

/** Organization/member, sorted project rows, space, sorted catalog rows, then plan. */
async function lockSources(
  tx: Queryable,
  actorUserId: string,
  spaceId: string
): Promise<AnalyticsSpacePlanSourceSnapshot | null> {
  const owner = (
    await tx.query<{ organization_id: string; plan: string }>(
      `SELECT s.organization_id,org.plan FROM analytics_spaces s
       JOIN organizations org ON org.id=s.organization_id AND org.suspended_at IS NULL
       JOIN organization_members om ON om.organization_id=org.id AND om.user_id=$2::uuid
         AND om.role='owner' AND om.suspended_at IS NULL
       WHERE s.id=$1::uuid AND s.archived_at IS NULL FOR UPDATE OF org,om`,
      [spaceId, actorUserId]
    )
  ).rows[0];
  if (owner === undefined) return null;
  const sourceIds = (
    await tx.query<{ project_id: string }>(
      "SELECT project_id FROM analytics_space_projects WHERE space_id=$1::uuid ORDER BY project_id",
      [spaceId]
    )
  ).rows.map((row) => row.project_id);
  if (sourceIds.length < 1 || sourceIds.length > 20) return null;
  const projects = (
    await tx.query<{ id: string; owner_user_id: string }>(
      `SELECT p.id,p.owner_user_id FROM projects p WHERE p.id=ANY($1::uuid[])
         AND p.organization_id=$2::uuid ORDER BY p.id FOR UPDATE`,
      [sourceIds, owner.organization_id]
    )
  ).rows;
  if (projects.length !== sourceIds.length) return null;
  if (
    !getTierCapabilities(owner.plan).shared_dashboards &&
    projects.some((project) => project.owner_user_id !== actorUserId)
  )
    return null;
  const admins = new Set(
    (
      await tx.query<{ project_id: string }>(
        `SELECT project_id FROM project_members WHERE project_id=ANY($1::uuid[])
         AND user_id=$2::uuid AND role='admin' FOR SHARE`,
        [sourceIds, actorUserId]
      )
    ).rows.map((row) => row.project_id)
  );
  if (projects.some((project) => project.owner_user_id !== actorUserId && !admins.has(project.id)))
    return null;
  const space = (
    await tx.query<{ revision: string | number; mode: "portfolio" | "connected" }>(
      `SELECT revision,mode FROM analytics_spaces WHERE id=$1::uuid
       AND organization_id=$2::uuid AND archived_at IS NULL FOR UPDATE`,
      [spaceId, owner.organization_id]
    )
  ).rows[0];
  if (space === undefined) return null;
  const currentIds = (
    await tx.query<{ project_id: string }>(
      "SELECT project_id FROM analytics_space_projects WHERE space_id=$1::uuid ORDER BY project_id",
      [spaceId]
    )
  ).rows.map((row) => row.project_id);
  if (stableJson(currentIds) !== stableJson(sourceIds)) return null;
  const rows = (
    await tx.query<SourceCatalogRow & Record<string, unknown>>(
      `SELECT project_id,catalog_revision,entries FROM analytics_project_catalogs
       WHERE project_id=ANY($1::uuid[]) ORDER BY project_id FOR SHARE`,
      [sourceIds]
    )
  ).rows;
  if (
    rows.length !== sourceIds.length ||
    rows.some((row, index) => row.project_id !== sourceIds[index])
  )
    return null;
  return {
    spaceRevision: Number(space.revision),
    mode: space.mode,
    tierPlan: owner.plan,
    projectIds: sourceIds,
    catalogs: rows.map((row) => ({
      project_id: row.project_id,
      catalog_revision: Number(row.catalog_revision),
      entries: Catalog.parse(row.entries)
    }))
  };
}

async function changePlan(
  tx: Queryable,
  prepared: Prepared,
  previewOnly: boolean,
  suppliedHash?: string
): Promise<AnalyticsSpacePlanPreviewResult | AnalyticsSpacePlanApplyResult> {
  const { actorUserId, spaceId, plan, mutationHash } = prepared;
  const sources = await lockSources(tx, actorUserId, spaceId);
  if (sources === null) return { kind: "forbidden" };
  if (plan.reports.length > 0 && sources.mode === "connected") return { kind: "mode_unavailable" };
  const prior = (
    await tx.query<RevisionRow & Record<string, unknown>>(
      `SELECT space_id,revision,space_revision,catalog,reports,source_catalog_revisions,
              coverage,mutation_hash,review_hash FROM analytics_space_plan_revisions
       WHERE space_id=$1::uuid AND actor_user_id=$2::uuid AND idempotency_key=$3::uuid`,
      [spaceId, actorUserId, plan.idempotency_key]
    )
  ).rows[0];
  if (prior !== undefined) {
    if (prior.mutation_hash !== mutationHash) return { kind: "conflict" };
    if (!previewOnly && prior.review_hash !== suppliedHash) return { kind: "conflict" };
    const saved = record(prior);
    if (
      saved.source_catalog_revisions.map((entry) => entry.project_id).join(",") !==
      sources.projectIds.join(",")
    )
      return { kind: "conflict" };
    return previewOnly
      ? {
          kind: "preview",
          preview: {
            space_id: spaceId,
            preview_hash: prior.review_hash,
            expected_revision: plan.expected_revision,
            resulting_revision: saved.revision,
            space_revision: saved.space_revision,
            source_catalog_revisions: saved.source_catalog_revisions,
            coverage: saved.coverage,
            already_applied: true
          }
        }
      : { kind: "applied", plan: saved, replayed: true };
  }
  const current = (
    await tx.query<PlanRow & Record<string, unknown>>(
      `SELECT space_id,revision,space_revision,catalog,reports,source_catalog_revisions,coverage
       FROM analytics_space_plans WHERE space_id=$1::uuid FOR UPDATE`,
      [spaceId]
    )
  ).rows[0];
  const currentRevision = Number(current?.revision ?? 0);
  if (currentRevision !== plan.expected_revision) return { kind: "conflict" };
  if (currentRevision >= 1000) return { kind: "capacity_exceeded" };
  const validated = validateSpaceCatalogSnapshot({
    plan,
    expected_project_ids: sources.projectIds,
    sources: sources.catalogs
  });
  if (!validated.valid) return { kind: "conflict" };
  const capacitySnapshot: Array<{ project_id: string; limit: number; used: number }> = [];
  if (plan.reports.length > 0) {
    const tierLimit = getTierCapabilities(sources.tierPlan).max_analytics_saved_funnels;
    for (const projectId of sources.projectIds) {
      const counts = (
        await tx.query<{ project_reports: number; legacy_reports: number }>(
          `SELECT COALESCE((SELECT jsonb_array_length(reports) FROM analytics_project_plans
             WHERE project_id=$1::uuid),0)::int AS project_reports,
             (SELECT count(*)::int FROM analytics_funnel_definitions
             WHERE project_id=$1::uuid AND archived_at IS NULL) AS legacy_reports`,
          [projectId]
        )
      ).rows[0];
      const setting = (
        await tx.query<{ max_saved_funnels: number }>(
          `SELECT max_saved_funnels FROM project_analytics_settings
           WHERE project_id=$1::uuid FOR SHARE`,
          [projectId]
        )
      ).rows[0];
      if (counts === undefined) return { kind: "capacity_exceeded" };
      const limit = Math.min(tierLimit, setting?.max_saved_funnels ?? tierLimit);
      const used =
        counts.project_reports +
        counts.legacy_reports +
        (await readActiveSpaceReportSlotsInTransaction(tx, projectId, spaceId));
      if (
        !Number.isSafeInteger(limit) ||
        !Number.isSafeInteger(used) ||
        used + plan.reports.length > limit
      )
        return { kind: "capacity_exceeded" };
      capacitySnapshot.push({ project_id: projectId, limit, used });
    }
    // Persist only the definition kind for which the project calculation kernel exists.
    if (plan.reports.some((report) => report.kind !== "ordered_funnel"))
      return { kind: "mode_unavailable" };
  }
  const oldStates = current === undefined ? [] : ReportStates.parse(current.reports);
  const oldByKey = new Map(oldStates.map((state) => [state.definition.key, state]));
  const priorSourceMeaningChanged =
    current !== undefined &&
    (Number(current.space_revision) !== sources.spaceRevision ||
      stableJson(current.source_catalog_revisions) !==
        stableJson(validated.source_catalog_revisions) ||
      stableJson(current.coverage) !== stableJson(validated.coverage));
  const latest = (
    await tx.query<{ report_key: string; revision: string | number; content_hash: string }>(
      `SELECT DISTINCT ON (report_key) report_key,revision,content_hash
       FROM analytics_space_report_revisions
       WHERE space_id=$1::uuid AND report_key=ANY($2::text[])
       ORDER BY report_key,revision DESC`,
      [spaceId, plan.reports.map((report) => report.key)]
    )
  ).rows;
  const latestByKey = new Map(latest.map((row) => [row.report_key, row]));
  const introduced: typeof plan.reports = [];
  for (const report of plan.reports) {
    const saved = latestByKey.get(report.key);
    if (saved !== undefined) {
      if (report.revision < Number(saved.revision)) return { kind: "conflict" };
      if (
        report.revision === Number(saved.revision) &&
        (sha256(stableJson(report)) !== saved.content_hash ||
          !oldByKey.has(report.key) ||
          priorSourceMeaningChanged ||
          reportCatalogMeaningChanged(report, Catalog.parse(current?.catalog), plan.catalog))
      )
        return { kind: "conflict" };
    }
    if (saved === undefined || report.revision > Number(saved.revision)) introduced.push(report);
  }
  const reviewHash = sha256(
    stableJson({
      mutationHash,
      currentRevision,
      spaceRevision: sources.spaceRevision,
      mode: sources.mode,
      sourceCatalogRevisions: validated.source_catalog_revisions,
      coverage: validated.coverage,
      capacitySnapshot
    })
  );
  const preview: AnalyticsSpacePlanPreview = {
    space_id: spaceId,
    preview_hash: reviewHash,
    expected_revision: plan.expected_revision,
    resulting_revision: currentRevision + 1,
    space_revision: sources.spaceRevision,
    source_catalog_revisions: validated.source_catalog_revisions,
    coverage: validated.coverage,
    already_applied: false
  };
  if (previewOnly) return { kind: "preview", preview };
  if (suppliedHash !== reviewHash) return { kind: "conflict" };
  const at = (await tx.query<{ at: Date }>("SELECT transaction_timestamp() AS at", [])).rows[0]?.at;
  if (at === undefined) throw new Error("analytics_space_plan_transaction_time_missing");
  const reportStates = plan.reports.map((definition) => ({
    definition,
    available_from:
      oldByKey.get(definition.key)?.definition.revision === definition.revision
        ? oldByKey.get(definition.key)!.available_from
        : at.toISOString()
  }));
  const params = [
    spaceId,
    currentRevision + 1,
    sources.spaceRevision,
    prepared.contentHash,
    JSON.stringify(plan.catalog),
    JSON.stringify(reportStates),
    JSON.stringify(validated.source_catalog_revisions),
    JSON.stringify(validated.coverage)
  ];
  await tx.query(
    `INSERT INTO analytics_space_plans(space_id,revision,space_revision,content_hash,catalog,reports,source_catalog_revisions,coverage)
     VALUES($1::uuid,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb)
     ON CONFLICT(space_id) DO UPDATE SET revision=EXCLUDED.revision,
       space_revision=EXCLUDED.space_revision,content_hash=EXCLUDED.content_hash,
       catalog=EXCLUDED.catalog,reports=EXCLUDED.reports,
       source_catalog_revisions=EXCLUDED.source_catalog_revisions,
       coverage=EXCLUDED.coverage,updated_at=now()`,
    params
  );
  for (const report of introduced) {
    await tx.query(
      `INSERT INTO analytics_space_report_revisions(
         space_id,report_key,revision,content_hash,definition,available_from)
       VALUES($1::uuid,$2,$3,$4,$5::jsonb,$6::timestamptz)`,
      [
        spaceId,
        report.key,
        report.revision,
        sha256(stableJson(report)),
        JSON.stringify(report),
        at.toISOString()
      ]
    );
  }
  await tx.query(
    `INSERT INTO analytics_space_plan_revisions(space_id,revision,space_revision,actor_user_id,
       idempotency_key,mutation_hash,review_hash,content_hash,catalog,reports,source_catalog_revisions,coverage)
     VALUES($1::uuid,$2,$3,$4::uuid,$5::uuid,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb)`,
    [
      spaceId,
      currentRevision + 1,
      sources.spaceRevision,
      actorUserId,
      plan.idempotency_key,
      mutationHash,
      reviewHash,
      prepared.contentHash,
      ...params.slice(4)
    ]
  );
  return {
    kind: "applied",
    replayed: false,
    plan: {
      space_id: spaceId,
      revision: currentRevision + 1,
      space_revision: sources.spaceRevision,
      catalog: plan.catalog,
      reports: reportStates,
      source_catalog_revisions: validated.source_catalog_revisions,
      coverage: validated.coverage
    }
  };
}

export function createAnalyticsSpacePlanStore(db: Queryable): AnalyticsSpacePlanStore {
  return {
    preview(input) {
      const prepared = prepare(input);
      return prepared === null
        ? Promise.resolve({ kind: "invalid" })
        : (runInTransaction(db, (tx) =>
            changePlan(tx, prepared, true)
          ) as Promise<AnalyticsSpacePlanPreviewResult>);
    },
    apply(input) {
      const prepared = prepare(input);
      return prepared === null
        ? Promise.resolve({ kind: "invalid" })
        : (runInTransaction(db, (tx) =>
            changePlan(tx, prepared, false, input.previewHash)
          ) as Promise<AnalyticsSpacePlanApplyResult>);
    },
    async read(input) {
      const actor = Id.safeParse(input.actorUserId);
      const space = Id.safeParse(input.spaceId);
      if (!actor.success || !space.success) return null;
      return runInTransaction(db, async (tx) => {
        const current = await readAuthorizedAnalyticsSpacePlanInTransaction(
          tx,
          actor.data,
          space.data
        );
        return current?.plan ?? null;
      });
    }
  };
}

/** Share the all-source authorization snapshot with internal report readers. */
export async function readAuthorizedAnalyticsSpacePlanInTransaction(
  tx: Queryable,
  actorUserId: string,
  spaceId: string
): Promise<{ plan: AnalyticsSpacePlanRecord; sources: AnalyticsSpacePlanSourceSnapshot } | null> {
  const sources = await lockSources(tx, actorUserId, spaceId);
  if (sources === null) return null;
  const row = (
    await tx.query<PlanRow & Record<string, unknown>>(
      `SELECT space_id,revision,space_revision,catalog,reports,source_catalog_revisions,coverage
       FROM analytics_space_plans WHERE space_id=$1::uuid FOR SHARE`,
      [spaceId]
    )
  ).rows[0];
  if (row === undefined || Number(row.space_revision) !== sources.spaceRevision) return null;
  const saved = record(row);
  if (
    stableJson(saved.source_catalog_revisions) !==
    stableJson(
      sources.catalogs.map((source) => ({
        project_id: source.project_id,
        catalog_revision: source.catalog_revision
      }))
    )
  )
    return null;
  return { plan: saved, sources };
}
