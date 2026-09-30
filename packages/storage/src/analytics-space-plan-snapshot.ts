import { z } from "zod";
import { validateSpaceCatalogSnapshot } from "../../analytics-engine/src/index.js";
import {
  AnalyticsMeasurementPlanSchema,
  AnalyticsSpaceRecordSchema
} from "../../shared-types/src/index.js";
import type { AnalyticsSpaceStore } from "./analytics-space-store.js";
import type { AnalyticsProjectCatalogStore } from "./analytics-project-catalog-store.js";

const Id = z.string().uuid();

export type SpacePlanCatalogSnapshot =
  | {
      ok: true;
      space_revision: number;
      source_catalog_revisions: Array<{ project_id: string; catalog_revision: number }>;
      coverage: Array<{
        name: string;
        project_ids: string[];
        source_entry_revisions: Array<{ project_id: string; entry_revision: number }>;
      }>;
    }
  | {
      ok: false;
      reason:
        | "invalid_plan"
        | "space_unavailable"
        | "source_unavailable"
        | "stale_space"
        | "invalid_snapshot"
        | "incomplete_sources"
        | "catalog_entry_unavailable"
        | "catalog_semantic_conflict";
    };

/**
 * Read-only preview evidence. Activation must lock and recheck space membership,
 * every source catalog revision and current authority in its own transaction.
 */
export async function loadSpacePlanCatalogSnapshot(input: {
  actorUserId: string;
  spaceId: string;
  plan: unknown;
  spaces: Pick<AnalyticsSpaceStore, "read" | "authorizeSnapshot">;
  catalogs: Pick<AnalyticsProjectCatalogStore, "read">;
}): Promise<SpacePlanCatalogSnapshot> {
  const actor = Id.safeParse(input.actorUserId);
  const id = Id.safeParse(input.spaceId);
  const parsedPlan = AnalyticsMeasurementPlanSchema.safeParse(input.plan);
  if (
    !actor.success ||
    !id.success ||
    !parsedPlan.success ||
    parsedPlan.data.scope.kind !== "space" ||
    parsedPlan.data.scope.space_id !== id.data
  )
    return { ok: false, reason: "invalid_plan" };

  const current = AnalyticsSpaceRecordSchema.safeParse(
    await input.spaces.read({ actorUserId: actor.data, spaceId: id.data })
  );
  if (!current.success || current.data.archived) return { ok: false, reason: "space_unavailable" };

  const sourceIds = current.data.project_ids;
  const catalogs = await Promise.all(
    sourceIds.map((projectId) => input.catalogs.read({ actorUserId: actor.data, projectId }))
  );
  if (
    catalogs.some(
      (catalog, index) =>
        catalog === null || catalog.project_id !== sourceIds[index] || catalog.catalog_revision < 1
    )
  )
    return { ok: false, reason: "source_unavailable" };
  const completeCatalogs = catalogs.filter(
    (catalog): catalog is NonNullable<typeof catalog> => catalog !== null
  );

  if (
    !(await input.spaces.authorizeSnapshot({
      actorUserId: actor.data,
      spaceId: id.data,
      revision: current.data.revision,
      sourceProjectIds: sourceIds
    }))
  )
    return { ok: false, reason: "stale_space" };

  const validated = validateSpaceCatalogSnapshot({
    plan: parsedPlan.data,
    expected_project_ids: sourceIds,
    sources: completeCatalogs.map((catalog) => ({
      project_id: catalog.project_id,
      catalog_revision: catalog.catalog_revision,
      entries: catalog.entries
    }))
  });
  if (!validated.valid) return { ok: false, reason: validated.reason };
  return {
    ok: true,
    space_revision: current.data.revision,
    source_catalog_revisions: validated.source_catalog_revisions,
    coverage: validated.coverage
  };
}
