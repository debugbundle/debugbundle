import { createHash } from "node:crypto";
import { z } from "zod";
import { stableJson } from "../../event-normalizer/src/canonical-json.js";
import {
  reportCatalogMeaningChanged,
  validateAnalyticsMeasurementPlan
} from "../../analytics-engine/src/measurement-plan.js";
import {
  AnalyticsCatalogEntrySchema,
  AnalyticsReportDefinitionSchema,
  getTierCapabilities,
  type AnalyticsMeasurementPlan,
  type AnalyticsCatalogEntry
} from "../../shared-types/src/index.js";
import {
  applyProjectCatalogInTransaction,
  previewProjectCatalogInTransaction,
  type AnalyticsProjectCatalogChange
} from "./analytics-project-catalog-store.js";
import { lockAnalyticsWriterProject } from "./analytics-writer-access.js";
import { readActiveSpaceReportSlotsInTransaction } from "./analytics-report-slot-capacity.js";
import { runInTransaction } from "./transaction.js";
import type { Queryable } from "./types.js";

const Id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
const ReportStateSchema = z
  .object({ definition: AnalyticsReportDefinitionSchema, available_from: z.string().datetime() })
  .strict();
type ReportState = z.infer<typeof ReportStateSchema>;
const ReportStates = z.array(ReportStateSchema).max(100);
const Catalog = z.array(AnalyticsCatalogEntrySchema).max(100);
const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");

export interface AnalyticsProjectMeasurementPlanRecord {
  project_id: string;
  revision: number;
  catalog_revision: number;
  business_measurement_enabled: boolean;
  catalog: AnalyticsCatalogEntry[];
  reports: ReportState[];
  observations?: Array<{
    event_name: string;
    event_revision: number;
    producer_kind: "browser" | "mobile" | "server";
    observed_count: string;
    first_observed_on: string;
    last_observed_on: string;
  }>;
  producer_observations?: Array<{
    event_name: string;
    event_revision: number;
    producer_kind: "browser" | "mobile" | "server";
    sdk_name: string;
    sdk_version: string;
    observed_count: string;
    first_observed_on: string;
    last_observed_on: string;
  }>;
  producer_observations_truncated?: boolean;
}
export interface AnalyticsProjectMeasurementPlanPreview {
  project_id: string;
  preview_hash: string;
  expected_revision: number;
  resulting_revision: number;
  catalog_revision: number;
  business_measurement_enabled_after: boolean;
  capacity_limit: number;
  legacy_saved_funnels: number;
  report_slots_after: number;
  added_reports: string[];
  removed_reports: string[];
  changed_reports: string[];
  already_applied: boolean;
}
type Failure = { kind: "invalid" | "forbidden" | "conflict" | "capacity_exceeded" };
export type AnalyticsProjectMeasurementPlanPreviewResult =
  | Failure
  | { kind: "preview"; preview: AnalyticsProjectMeasurementPlanPreview };
export type AnalyticsProjectMeasurementPlanApplyResult =
  | Failure
  | { kind: "applied"; plan: AnalyticsProjectMeasurementPlanRecord; replayed: boolean };
export interface AnalyticsMeasurementPlanStore {
  preview(input: {
    actorUserId: string;
    plan: AnalyticsMeasurementPlan;
  }): Promise<AnalyticsProjectMeasurementPlanPreviewResult>;
  apply(input: {
    actorUserId: string;
    plan: AnalyticsMeasurementPlan;
    previewHash: string;
  }): Promise<AnalyticsProjectMeasurementPlanApplyResult>;
  read(input: {
    actorUserId: string;
    projectId: string;
  }): Promise<AnalyticsProjectMeasurementPlanRecord | null>;
}

type Prepared = {
  actorUserId: string;
  plan: AnalyticsMeasurementPlan & { business_measurement_enabled: boolean };
  projectId: string;
  mutationHash: string;
  legacyMutationHash: string | null;
  contentHash: string;
};
type PlanRow = {
  project_id: string;
  revision: string | number;
  catalog_revision: string | number;
  business_measurement_enabled: boolean;
  content_hash: string;
  catalog: unknown;
  reports: unknown;
};
type RevisionRow = PlanRow & {
  mutation_hash: string;
  review_hash: string;
  capacity_limit: number;
  legacy_saved_funnels: number;
};
type LatestReportRow = {
  report_key: string;
  revision: string | number;
  content_hash: string;
  available_from: Date;
};

function prepare(input: { actorUserId: string; plan: AnalyticsMeasurementPlan }): Prepared | null {
  const actor = Id.safeParse(input.actorUserId);
  const validated = validateAnalyticsMeasurementPlan(input.plan);
  if (!actor.success || !validated.valid || validated.plan.scope.kind !== "project") return null;
  const projectId = validated.plan.scope.project_id.toLowerCase();
  const legacyPlan = {
    ...validated.plan,
    catalog: [...validated.plan.catalog].sort((a, b) => a.name.localeCompare(b.name)),
    reports: [...validated.plan.reports].sort((a, b) => a.key.localeCompare(b.key))
  };
  const plan = {
    ...legacyPlan,
    business_measurement_enabled: validated.plan.business_measurement_enabled === true
  };
  const content = stableJson({
    enforcement: plan.enforcement,
    business_measurement_enabled: plan.business_measurement_enabled,
    catalog: plan.catalog,
    reports: plan.reports
  });
  if (Buffer.byteLength(content, "utf8") > 240 * 1024) return null;
  return {
    actorUserId: actor.data,
    plan,
    projectId,
    mutationHash: sha256(stableJson({ actorUserId: actor.data, plan })),
    // Plans applied before the purpose field existed must still replay with their old review hash.
    legacyMutationHash:
      validated.plan.business_measurement_enabled === undefined
        ? sha256(stableJson({ actorUserId: actor.data, plan: legacyPlan }))
        : null,
    contentHash: sha256(content)
  };
}

function record(row: PlanRow): AnalyticsProjectMeasurementPlanRecord {
  return {
    project_id: row.project_id,
    revision: Number(row.revision),
    catalog_revision: Number(row.catalog_revision),
    business_measurement_enabled: row.business_measurement_enabled,
    catalog: Catalog.parse(row.catalog),
    reports: ReportStates.parse(row.reports)
  };
}

function catalogChange(
  prepared: Prepared,
  expectedRevision: number
): AnalyticsProjectCatalogChange {
  return {
    actorUserId: prepared.actorUserId,
    projectId: prepared.projectId,
    expectedRevision,
    idempotencyKey: prepared.plan.idempotency_key,
    entries: prepared.plan.catalog
  };
}

async function changePlan(
  tx: Queryable,
  prepared: Prepared,
  previewOnly: boolean,
  suppliedHash?: string
): Promise<
  AnalyticsProjectMeasurementPlanPreviewResult | AnalyticsProjectMeasurementPlanApplyResult
> {
  const { projectId, actorUserId, plan, mutationHash } = prepared;
  const access = await lockAnalyticsWriterProject(tx, projectId, actorUserId);
  if (access === null) return { kind: "forbidden" };
  const previous = (
    await tx.query<RevisionRow & Record<string, unknown>>(
      `SELECT project_id,revision,catalog_revision,business_measurement_enabled,content_hash,catalog,reports,mutation_hash,review_hash,
              capacity_limit,legacy_saved_funnels
       FROM analytics_project_plan_revisions
       WHERE project_id=$1::uuid AND actor_user_id=$2::uuid AND idempotency_key=$3::uuid`,
      [projectId, actorUserId, plan.idempotency_key]
    )
  ).rows[0];
  if (previous !== undefined) {
    if (
      previous.mutation_hash !== mutationHash &&
      !(
        previous.business_measurement_enabled === false &&
        prepared.legacyMutationHash !== null &&
        previous.mutation_hash === prepared.legacyMutationHash
      )
    )
      return { kind: "conflict" };
    if (!previewOnly && suppliedHash !== previous.review_hash) return { kind: "conflict" };
    const saved = record(previous);
    return previewOnly
      ? {
          kind: "preview",
          preview: {
            project_id: projectId,
            preview_hash: previous.review_hash,
            expected_revision: plan.expected_revision,
            resulting_revision: saved.revision,
            catalog_revision: saved.catalog_revision,
            business_measurement_enabled_after: saved.business_measurement_enabled,
            capacity_limit: previous.capacity_limit,
            legacy_saved_funnels: previous.legacy_saved_funnels,
            report_slots_after: saved.reports.length + previous.legacy_saved_funnels,
            added_reports: [],
            removed_reports: [],
            changed_reports: [],
            already_applied: true
          }
        }
      : { kind: "applied", plan: saved, replayed: true };
  }
  const current = (
    await tx.query<PlanRow & Record<string, unknown>>(
      `SELECT project_id,revision,catalog_revision,business_measurement_enabled,content_hash,catalog,reports
       FROM analytics_project_plans WHERE project_id=$1::uuid FOR UPDATE`,
      [projectId]
    )
  ).rows[0];
  const currentRevision = current === undefined ? 0 : Number(current.revision);
  if (currentRevision !== plan.expected_revision) return { kind: "conflict" };
  if (currentRevision >= 1000) return { kind: "capacity_exceeded" };

  const capacity = (
    await tx.query<{
      plan: string;
      legacy_count: number | string;
    }>(
      `SELECT org.plan,
         (SELECT count(*) FROM analytics_funnel_definitions f
          WHERE f.project_id=p.id AND f.archived_at IS NULL) AS legacy_count
       FROM projects p JOIN organizations org ON org.id=p.organization_id
       WHERE p.id=$1::uuid AND org.id=$2::uuid`,
      [projectId, access.organizationId]
    )
  ).rows[0];
  if (capacity === undefined) return { kind: "forbidden" };
  // Settings edits take a row lock too; hold this value through the reviewed apply.
  const settings = (
    await tx.query<{ max_saved_funnels: number | string }>(
      `SELECT max_saved_funnels FROM project_analytics_settings
       WHERE project_id=$1::uuid FOR SHARE`,
      [projectId]
    )
  ).rows[0];
  const tierLimit = getTierCapabilities(capacity.plan).max_analytics_saved_funnels;
  const projectLimit = settings === undefined ? tierLimit : Number(settings.max_saved_funnels);
  const capacityLimit = Math.min(tierLimit, projectLimit);
  const legacyCount = Number(capacity.legacy_count);
  const spaceReportSlots = await readActiveSpaceReportSlotsInTransaction(tx, projectId);
  if (plan.reports.length + legacyCount + spaceReportSlots > capacityLimit)
    return { kind: "capacity_exceeded" };

  const oldStates = current === undefined ? [] : ReportStates.parse(current.reports);
  const oldCatalog = current === undefined ? [] : Catalog.parse(current.catalog);
  const oldByKey = new Map(oldStates.map((state) => [state.definition.key, state]));
  const newByKey = new Map(plan.reports.map((report) => [report.key, report]));
  const latest = (
    await tx.query<LatestReportRow & Record<string, unknown>>(
      `SELECT DISTINCT ON (report_key) report_key,revision,content_hash,available_from
       FROM analytics_project_report_revisions
       WHERE project_id=$1::uuid AND report_key=ANY($2::text[])
       ORDER BY report_key,revision DESC`,
      [projectId, plan.reports.map((report) => report.key)]
    )
  ).rows;
  const latestByKey = new Map(latest.map((row) => [row.report_key, row]));
  const introduced = [] as (typeof plan.reports)[number][];
  for (const report of plan.reports) {
    const prior = latestByKey.get(report.key);
    if (prior !== undefined) {
      if (report.revision < Number(prior.revision)) return { kind: "conflict" };
      if (report.revision === Number(prior.revision)) {
        if (sha256(stableJson(report)) !== prior.content_hash || !oldByKey.has(report.key))
          return { kind: "conflict" };
        if (reportCatalogMeaningChanged(report, oldCatalog, plan.catalog))
          return { kind: "conflict" };
      }
    }
    if (prior === undefined || report.revision > Number(prior.revision)) introduced.push(report);
  }
  const catalogCurrent = (
    await tx.query<{ revision: string | number }>(
      "SELECT revision FROM analytics_project_catalogs WHERE project_id=$1::uuid",
      [projectId]
    )
  ).rows[0];
  const catalogInput = catalogChange(prepared, Number(catalogCurrent?.revision ?? 0));
  const catalogPreview = await previewProjectCatalogInTransaction(tx, catalogInput);
  if (catalogPreview.kind !== "preview") return { kind: catalogPreview.kind };
  const reviewHash = sha256(
    stableJson({
      mutationHash,
      catalogRevision: Number(catalogCurrent?.revision ?? 0),
      catalogPreviewHash: catalogPreview.preview.preview_hash,
      capacityLimit,
      legacyCount,
      spaceReportSlots
    })
  );
  const preview: AnalyticsProjectMeasurementPlanPreview = {
    project_id: projectId,
    preview_hash: reviewHash,
    expected_revision: plan.expected_revision,
    resulting_revision: currentRevision + 1,
    catalog_revision: catalogPreview.preview.catalog_revision,
    business_measurement_enabled_after: plan.business_measurement_enabled,
    capacity_limit: capacityLimit,
    legacy_saved_funnels: legacyCount,
    report_slots_after: plan.reports.length + legacyCount + spaceReportSlots,
    added_reports: plan.reports
      .filter((report) => !oldByKey.has(report.key))
      .map((report) => report.key),
    removed_reports: oldStates
      .filter((state) => !newByKey.has(state.definition.key))
      .map((state) => state.definition.key),
    changed_reports: plan.reports
      .filter((report) => {
        const old = oldByKey.get(report.key);
        return old !== undefined && stableJson(old.definition) !== stableJson(report);
      })
      .map((report) => report.key),
    already_applied: false
  };
  if (previewOnly) return { kind: "preview", preview };
  if (suppliedHash !== reviewHash) return { kind: "conflict" };
  const catalogApplied = await applyProjectCatalogInTransaction(tx, {
    ...catalogInput,
    previewHash: catalogPreview.preview.preview_hash
  });
  if (catalogApplied.kind !== "applied") return { kind: catalogApplied.kind };
  const at = (await tx.query<{ at: Date }>("SELECT transaction_timestamp() AS at", [])).rows[0]?.at;
  if (at === undefined) throw new Error("analytics_plan_transaction_time_missing");
  const reports = plan.reports.map((definition) => ({
    definition,
    available_from:
      oldByKey.get(definition.key)?.definition.revision === definition.revision
        ? oldByKey.get(definition.key)!.available_from
        : at.toISOString()
  }));
  await tx.query(
    `INSERT INTO analytics_project_plans(project_id,revision,catalog_revision,business_measurement_enabled,content_hash,catalog,reports)
     VALUES($1::uuid,$2,$3,$4,$5,$6::jsonb,$7::jsonb)
     ON CONFLICT(project_id) DO UPDATE SET revision=EXCLUDED.revision,
       catalog_revision=EXCLUDED.catalog_revision,business_measurement_enabled=EXCLUDED.business_measurement_enabled,content_hash=EXCLUDED.content_hash,
       catalog=EXCLUDED.catalog,reports=EXCLUDED.reports,updated_at=now()`,
    [
      projectId,
      currentRevision + 1,
      catalogApplied.catalog.catalog_revision,
      plan.business_measurement_enabled,
      prepared.contentHash,
      JSON.stringify(plan.catalog),
      JSON.stringify(reports)
    ]
  );
  for (const report of introduced) {
    await tx.query(
      `INSERT INTO analytics_project_report_revisions(project_id,report_key,revision,content_hash,definition,available_from)
       VALUES($1::uuid,$2,$3,$4,$5::jsonb,$6::timestamptz)`,
      [
        projectId,
        report.key,
        report.revision,
        sha256(stableJson(report)),
        JSON.stringify(report),
        at
      ]
    );
  }
  await tx.query(
    `INSERT INTO analytics_project_plan_revisions(project_id,revision,catalog_revision,business_measurement_enabled,actor_user_id,
      idempotency_key,mutation_hash,review_hash,content_hash,capacity_limit,
      legacy_saved_funnels,catalog,reports)
     VALUES($1::uuid,$2,$3,$4,$5::uuid,$6::uuid,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb)`,
    [
      projectId,
      currentRevision + 1,
      catalogApplied.catalog.catalog_revision,
      plan.business_measurement_enabled,
      actorUserId,
      plan.idempotency_key,
      mutationHash,
      reviewHash,
      prepared.contentHash,
      capacityLimit,
      legacyCount,
      JSON.stringify(plan.catalog),
      JSON.stringify(reports)
    ]
  );
  return {
    kind: "applied",
    replayed: false,
    plan: {
      project_id: projectId,
      revision: currentRevision + 1,
      catalog_revision: catalogApplied.catalog.catalog_revision,
      business_measurement_enabled: plan.business_measurement_enabled,
      catalog: plan.catalog,
      reports
    }
  };
}

export function createAnalyticsMeasurementPlanStore(db: Queryable): AnalyticsMeasurementPlanStore {
  return {
    preview(input) {
      const prepared = prepare(input);
      return prepared === null
        ? Promise.resolve({ kind: "invalid" })
        : (runInTransaction(db, (tx) =>
            changePlan(tx, prepared, true)
          ) as Promise<AnalyticsProjectMeasurementPlanPreviewResult>);
    },
    apply(input) {
      const prepared = prepare(input);
      if (prepared === null) return Promise.resolve({ kind: "invalid" });
      return runInTransaction(db, (tx) =>
        changePlan(tx, prepared, false, input.previewHash)
      ) as Promise<AnalyticsProjectMeasurementPlanApplyResult>;
    },
    async read(input) {
      const actor = Id.safeParse(input.actorUserId);
      const project = Id.safeParse(input.projectId);
      if (!actor.success || !project.success) return null;
      return runInTransaction(db, async (tx) => {
        if ((await lockAnalyticsWriterProject(tx, project.data, actor.data)) === null) return null;
        const row = (
          await tx.query<PlanRow & Record<string, unknown>>(
            `SELECT project_id,revision,catalog_revision,business_measurement_enabled,content_hash,catalog,reports
             FROM analytics_project_plans WHERE project_id=$1::uuid`,
            [project.data]
          )
        ).rows[0];
        if (row === undefined) return null;
        const current = record(row);
        const observed = await tx.query<{
          event_name: string;
          event_revision: string;
          producer_kind: "browser" | "mobile" | "server";
          observed_count: string;
          first_observed_on: string;
          last_observed_on: string;
        }>(
          `WITH expected AS (
             SELECT * FROM unnest($2::text[],$3::bigint[]) AS entry(event_name,event_revision)
           )
           SELECT o.event_name,o.event_revision,o.producer_kind,
                  sum(o.accepted_count)::text AS observed_count,
                  min(o.observed_on)::text AS first_observed_on,
                  max(o.observed_on)::text AS last_observed_on
           FROM semantic_analytics_catalog_observations o
           JOIN expected e ON e.event_name=o.event_name AND e.event_revision=o.event_revision
           WHERE o.project_id=$1::uuid
           GROUP BY o.event_name,o.event_revision,o.producer_kind
           ORDER BY o.event_name,o.event_revision,o.producer_kind`,
          [
            project.data,
            current.catalog.map((entry) => entry.name),
            current.catalog.map((entry) => entry.revision)
          ]
        );
        const producerObserved = await tx.query<{
          event_name: string;
          event_revision: string;
          producer_kind: "browser" | "mobile" | "server";
          sdk_name: string;
          sdk_version: string;
          observed_count: string;
          first_observed_on: string;
          last_observed_on: string;
        }>(
          `WITH expected AS (
             SELECT * FROM unnest($2::text[],$3::bigint[]) AS entry(event_name,event_revision)
           )
           SELECT o.event_name,o.event_revision,o.producer_kind,o.sdk_name,o.sdk_version,
                  sum(o.accepted_count)::text AS observed_count,
                  min(o.observed_on)::text AS first_observed_on,
                  max(o.observed_on)::text AS last_observed_on
           FROM semantic_analytics_producer_observations o
           JOIN expected e ON e.event_name=o.event_name AND e.event_revision=o.event_revision
           WHERE o.project_id=$1::uuid
           GROUP BY o.event_name,o.event_revision,o.producer_kind,o.sdk_name,o.sdk_version
           ORDER BY o.event_name,o.event_revision,o.producer_kind,o.sdk_name,o.sdk_version
           LIMIT 301`,
          [
            project.data,
            current.catalog.map((entry) => entry.name),
            current.catalog.map((entry) => entry.revision)
          ]
        );
        return {
          ...current,
          observations: observed.rows.map((entry) => ({
            ...entry,
            event_revision: Number(entry.event_revision)
          })),
          producer_observations: producerObserved.rows.slice(0, 300).map((entry) => ({
            ...entry,
            event_revision: Number(entry.event_revision)
          })),
          producer_observations_truncated: producerObserved.rows.length > 300
        };
      });
    }
  };
}
