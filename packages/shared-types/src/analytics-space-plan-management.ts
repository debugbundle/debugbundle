import { z } from "zod";
import {
  AnalyticsCatalogEntrySchema,
  AnalyticsMeasurementPlanSchema,
  AnalyticsReportDefinitionSchema
} from "./analytics-definitions.js";
import { SemanticAnalyticsKeySchema } from "./analytics-semantic-primitives.js";

const Id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
const Revision = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const Hash = z.string().regex(/^[a-f0-9]{64}$/);
const SourceCatalogRevision = z.object({ project_id: Id, catalog_revision: Revision }).strict();
const Coverage = z
  .object({
    name: SemanticAnalyticsKeySchema,
    project_ids: z.array(Id).min(1).max(20),
    source_entry_revisions: z
      .array(z.object({ project_id: Id, entry_revision: Revision }).strict())
      .min(1)
      .max(20)
  })
  .strict();

export const AnalyticsSpacePlanReportStateSchema = z
  .object({
    definition: AnalyticsReportDefinitionSchema,
    available_from: z.string().datetime()
  })
  .strict();

export const AnalyticsSpacePlanRecordSchema = z
  .object({
    space_id: Id,
    revision: Revision,
    space_revision: Revision,
    catalog: z.array(AnalyticsCatalogEntrySchema).max(100),
    reports: z.array(AnalyticsSpacePlanReportStateSchema).max(100),
    source_catalog_revisions: z.array(SourceCatalogRevision).min(1).max(20),
    coverage: z.array(Coverage).max(100)
  })
  .strict();
export const AnalyticsSpacePlanPreviewSchema = z
  .object({
    space_id: Id,
    preview_hash: Hash,
    expected_revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    resulting_revision: Revision,
    space_revision: Revision,
    source_catalog_revisions: z.array(SourceCatalogRevision).min(1).max(20),
    coverage: z.array(Coverage).max(100),
    already_applied: z.boolean()
  })
  .strict();
export const AnalyticsSpacePlanApplyRequestSchema = z
  .object({ plan: AnalyticsMeasurementPlanSchema, preview_hash: Hash })
  .strict();
export const AnalyticsSpacePlanApplyResponseSchema = z
  .object({ plan: AnalyticsSpacePlanRecordSchema, replayed: z.boolean() })
  .strict();
