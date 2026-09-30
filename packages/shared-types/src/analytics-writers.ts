import { z } from "zod";
import { AnalyticsWriterCreateSchema } from "./analytics-protocol.js";

export const MAX_ACTIVE_ANALYTICS_WRITERS = 10;
export const MAX_ANALYTICS_WRITER_CREATION_REVISION = 1000;
const Id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
const Revision = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const InitialRevision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const Timestamp = z.string().datetime({ precision: 3 });
const Kind = z.enum(["server", "relay"]);

export const AnalyticsWriterChangeSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("create"),
      mutation: AnalyticsWriterCreateSchema.extend({ idempotency_key: Id })
    })
    .strict(),
  z
    .object({
      action: z.literal("revoke"),
      mutation: z
        .object({
          writer_id: Id,
          expected_revision: Revision,
          idempotency_key: Id
        })
        .strict()
    })
    .strict()
]);
export type AnalyticsWriterChange = z.infer<typeof AnalyticsWriterChangeSchema>;

export const AnalyticsWriterRecordSchema = z
  .object({
    id: Id,
    project_id: Id,
    kind: Kind,
    display_name: z.string().min(1).max(120),
    created_at: Timestamp,
    expires_at: Timestamp,
    revoked_at: Timestamp.nullable()
  })
  .strict()
  .refine((value) => {
    const duration = Date.parse(value.expires_at) - Date.parse(value.created_at);
    return (
      duration > 0 &&
      duration <= 365 * 86400000 &&
      (value.revoked_at === null || value.revoked_at >= value.created_at)
    );
  });
export type AnalyticsWriterRecord = z.infer<typeof AnalyticsWriterRecordSchema>;

export const AnalyticsWriterPreviewSchema = z
  .object({
    project_id: Id,
    preview_hash: z.string().regex(/^[a-f0-9]{64}$/),
    action: z.enum(["create", "revoke"]),
    expected_revision: InitialRevision,
    resulting_revision: Revision,
    writer_id: Id.nullable(),
    kind: Kind,
    display_name: z.string().min(1).max(120),
    expires_in_days: z.number().int().min(1).max(365).nullable(),
    active_writers: z.number().int().min(0).max(MAX_ACTIVE_ANALYTICS_WRITERS),
    remaining_active_capacity: z.number().int().min(0).max(MAX_ACTIVE_ANALYTICS_WRITERS),
    already_applied: z.boolean()
  })
  .strict()
  .refine((value) =>
    value.action === "create"
      ? value.writer_id === null && value.expires_in_days !== null
      : value.writer_id !== null && value.expires_in_days === null
  );
export type AnalyticsWriterPreview = z.infer<typeof AnalyticsWriterPreviewSchema>;

export const AnalyticsWriterApplyRequestSchema = z
  .object({
    change: AnalyticsWriterChangeSchema,
    preview_hash: z.string().regex(/^[a-f0-9]{64}$/)
  })
  .strict();

const Result = { revision: Revision, writer: AnalyticsWriterRecordSchema };
export const AnalyticsWriterApplyResultSchema = z
  .discriminatedUnion("disposition", [
    z
      .object({
        ...Result,
        disposition: z.literal("issued"),
        replayed: z.literal(false),
        plaintext: z.string().regex(/^dbundle_an[lr]_[A-Za-z0-9_-]{43}$/)
      })
      .strict(),
    z
      .object({
        ...Result,
        disposition: z.literal("secret_unavailable"),
        replayed: z.literal(true)
      })
      .strict(),
    z.object({ ...Result, disposition: z.literal("revoked"), replayed: z.boolean() }).strict()
  ])
  .superRefine((value, ctx) => {
    if (
      value.disposition === "issued" &&
      (value.writer.revoked_at !== null ||
        !value.plaintext.startsWith(
          value.writer.kind === "server" ? "dbundle_anl_" : "dbundle_anr_"
        ))
    ) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Writer credential kind mismatch." });
    }
    if (value.disposition === "revoked" && value.writer.revoked_at === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Revocation requires revoked metadata."
      });
    }
  });
export type AnalyticsWriterApplyResult = z.infer<typeof AnalyticsWriterApplyResultSchema>;

export const AnalyticsWriterListSchema = z
  .object({
    project_id: Id,
    revision: InitialRevision,
    writers: z.array(AnalyticsWriterRecordSchema).max(MAX_ACTIVE_ANALYTICS_WRITERS)
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.writers.map((writer) => writer.id)).size === value.writers.length &&
      value.writers.every(
        (writer) => writer.project_id === value.project_id && writer.revoked_at === null
      )
  );
export type AnalyticsWriterList = z.infer<typeof AnalyticsWriterListSchema>;
