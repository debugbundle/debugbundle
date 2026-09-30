import { z } from "zod";

const Id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
const Revision = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const ExpectedRevision = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER - 1);
const Fingerprint = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const Sources = z
  .array(Id)
  .min(1)
  .max(20)
  .refine((values) => new Set(values).size === values.length);

/** Only the fingerprint and a source snapshot enter DebugBundle; the HMAC key stays customer-owned. */
export const AnalyticsSpaceIdentityNamespaceChangeSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("configure"),
      expected_revision: ExpectedRevision,
      idempotency_key: Id,
      key_fingerprint: Fingerprint
    })
    .strict(),
  z
    .object({
      action: z.literal("revoke"),
      expected_revision: ExpectedRevision,
      idempotency_key: Id
    })
    .strict()
]);
export const AnalyticsSpaceIdentityNamespaceRecordSchema = z
  .object({
    space_id: Id,
    namespace_revision: Revision,
    source_project_ids: Sources,
    key_fingerprint: Fingerprint,
    activated_at: z.string().datetime({ precision: 3 }),
    revoked_at: z.string().datetime({ precision: 3 }).nullable()
  })
  .strict();
export const AnalyticsSpaceIdentityNamespacePreviewSchema = z
  .object({
    space_id: Id,
    space_revision: Revision,
    source_project_ids: Sources,
    action: z.enum(["configure", "revoke"]),
    expected_revision: ExpectedRevision,
    resulting_revision: Revision,
    current_key_fingerprint: Fingerprint.nullable(),
    proposed_key_fingerprint: Fingerprint.nullable(),
    contexts_fenced: z.boolean(),
    preview_hash: z.string().regex(/^[a-f0-9]{64}$/)
  })
  .strict();
export const AnalyticsSpaceIdentityNamespaceApplyRequestSchema = z
  .object({
    change: AnalyticsSpaceIdentityNamespaceChangeSchema,
    preview_hash: z.string().regex(/^[a-f0-9]{64}$/)
  })
  .strict();
export const AnalyticsSpaceIdentityNamespaceApplySchema = z
  .object({
    namespace: AnalyticsSpaceIdentityNamespaceRecordSchema,
    replayed: z.boolean()
  })
  .strict();

export type AnalyticsSpaceIdentityNamespaceChange = z.infer<
  typeof AnalyticsSpaceIdentityNamespaceChangeSchema
>;
