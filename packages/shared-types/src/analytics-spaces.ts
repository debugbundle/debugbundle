import { z } from "zod";
import { AnalyticsSpaceMutationSchema } from "./analytics-definitions.js";

const Id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
const Revision = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const ExpectedRevision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const Hash = z.string().regex(/^[a-f0-9]{64}$/);
const Projects = z
  .array(Id)
  .max(20)
  .refine((values) => new Set(values).size === values.length);

export const AnalyticsSpaceRecordSchema = z
  .object({
    id: Id,
    organization_id: Id,
    display_name: z.string().min(1).max(120),
    mode: z.enum(["portfolio", "connected"]),
    revision: Revision,
    project_ids: Projects,
    created_at: z.string().datetime({ precision: 3 }),
    archived: z.boolean()
  })
  .strict()
  .refine((value) => value.archived || value.project_ids.length > 0);
export type AnalyticsSpaceRecord = z.infer<typeof AnalyticsSpaceRecordSchema>;

export const AnalyticsSpaceChangeSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), mutation: AnalyticsSpaceMutationSchema }).strict(),
  z
    .object({
      action: z.literal("archive"),
      mutation: z
        .object({
          organization_id: Id,
          expected_revision: Revision,
          idempotency_key: Id
        })
        .strict()
    })
    .strict()
]);
export type AnalyticsSpaceChange = z.infer<typeof AnalyticsSpaceChangeSchema>;
export const AnalyticsSpaceApplySchema = z
  .object({
    change: AnalyticsSpaceChangeSchema,
    preview_hash: Hash
  })
  .strict();
export const AnalyticsSpacePreviewSchema = z
  .object({
    preview_hash: Hash,
    action: z.enum(["save", "archive"]),
    space_id: Id.nullable(),
    expected_revision: ExpectedRevision,
    resulting_revision: Revision,
    added_project_ids: Projects,
    removed_project_ids: Projects,
    mode_changed: z.boolean(),
    display_name: z.string().min(1).max(120),
    mode: z.enum(["portfolio", "connected"]),
    already_applied: z.boolean()
  })
  .strict();
export type AnalyticsSpacePreview = z.infer<typeof AnalyticsSpacePreviewSchema>;
export const AnalyticsSpacesResponseSchema = z
  .object({ spaces: z.array(AnalyticsSpaceRecordSchema).max(20) })
  .strict();
export const AnalyticsSpaceResponseSchema = z
  .object({ space: AnalyticsSpaceRecordSchema, replayed: z.boolean() })
  .strict();
