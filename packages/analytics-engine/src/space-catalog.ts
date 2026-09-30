import { z } from "zod";
import { sanitizeTelemetry } from "../../redaction/src/index.js";
import { stableJson } from "../../event-normalizer/src/canonical-json.js";
import {
  AnalyticsCatalogEntrySchema,
  AnalyticsMeasurementPlanSchema
} from "../../shared-types/src/index.js";
import { validateAnalyticsMeasurementPlan } from "./measurement-plan.js";
import { catalogEntryMeaning } from "./catalog-meaning.js";

const Id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
const SourceCatalog = z
  .object({
    project_id: Id,
    catalog_revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    entries: z
      .array(AnalyticsCatalogEntrySchema)
      .max(100)
      .refine((entries) => new Set(entries.map((entry) => entry.name)).size === entries.length)
  })
  .strict();
const Snapshot = z
  .object({
    plan: AnalyticsMeasurementPlanSchema,
    expected_project_ids: z
      .array(Id)
      .min(1)
      .max(20)
      .refine((ids) => new Set(ids).size === ids.length),
    sources: z
      .array(SourceCatalog)
      .min(1)
      .max(20)
      .refine(
        (sources) => new Set(sources.map((source) => source.project_id)).size === sources.length
      )
  })
  .strict();

export type SpaceCatalogSnapshotValidation =
  | {
      valid: true;
      source_catalog_revisions: Array<{ project_id: string; catalog_revision: number }>;
      coverage: Array<{
        name: string;
        project_ids: string[];
        source_entry_revisions: Array<{ project_id: string; entry_revision: number }>;
      }>;
    }
  | {
      valid: false;
      reason:
        | "invalid_snapshot"
        | "incomplete_sources"
        | "catalog_entry_unavailable"
        | "catalog_semantic_conflict";
    };

/**
 * Checks a complete, already authorized space source snapshot before plan activation.
 * The caller must fetch current source revisions, retain per-source entry revisions,
 * and recheck authority and revisions at execution/retrieval.
 */
export function validateSpaceCatalogSnapshot(input: unknown): SpaceCatalogSnapshotValidation {
  try {
    const parsed = Snapshot.safeParse(input);
    if (!parsed.success || parsed.data.plan.scope.kind !== "space")
      return { valid: false, reason: "invalid_snapshot" };
    const { plan, expected_project_ids, sources } = parsed.data;
    if (!validateAnalyticsMeasurementPlan(plan).valid)
      return { valid: false, reason: "invalid_snapshot" };
    const requested = [...expected_project_ids].sort();
    const orderedSources = [...sources].sort((left, right) =>
      left.project_id.localeCompare(right.project_id)
    );
    if (
      orderedSources.length !== requested.length ||
      orderedSources.some((source, index) => source.project_id !== requested[index])
    )
      return { valid: false, reason: "incomplete_sources" };
    if (
      orderedSources.some((source) => {
        const protectedValue = sanitizeTelemetry(source.entries);
        return (
          !protectedValue.ok || stableJson(protectedValue.value) !== stableJson(source.entries)
        );
      })
    )
      return { valid: false, reason: "invalid_snapshot" };
    const coverage = [];
    for (const declared of [...plan.catalog].sort((left, right) =>
      left.name.localeCompare(right.name)
    )) {
      const sourceEntries = orderedSources.flatMap((source) => {
        const entry = source.entries.find((candidate) => candidate.name === declared.name);
        return entry === undefined ? [] : [{ project_id: source.project_id, entry }];
      });
      if (sourceEntries.length === 0) return { valid: false, reason: "catalog_entry_unavailable" };
      const declaredMeaning = catalogEntryMeaning(declared);
      if (sourceEntries.some((source) => catalogEntryMeaning(source.entry) !== declaredMeaning))
        return { valid: false, reason: "catalog_semantic_conflict" };
      coverage.push({
        name: declared.name,
        project_ids: sourceEntries.map((source) => source.project_id),
        source_entry_revisions: sourceEntries.map((source) => ({
          project_id: source.project_id,
          entry_revision: source.entry.revision
        }))
      });
    }
    return {
      valid: true,
      source_catalog_revisions: orderedSources.map((source) => ({
        project_id: source.project_id,
        catalog_revision: source.catalog_revision
      })),
      coverage
    };
  } catch {
    return { valid: false, reason: "invalid_snapshot" };
  }
}
