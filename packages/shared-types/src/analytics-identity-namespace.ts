import { z } from "zod";

const Id = z.string().uuid();
const Revision = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER - 1);
const Fingerprint = z.string().regex(/^sha256:[a-f0-9]{64}$/);

/** The customer's HMAC key never enters the management API. */
export const AnalyticsIdentityNamespaceChangeSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("configure"),
      expected_revision: Revision,
      idempotency_key: Id,
      key_fingerprint: Fingerprint
    })
    .strict(),
  z
    .object({
      action: z.literal("revoke"),
      expected_revision: Revision,
      idempotency_key: Id
    })
    .strict()
]);
export const AnalyticsIdentityNamespaceRecordSchema = z
  .object({
    project_id: Id,
    namespace_revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    key_fingerprint: Fingerprint,
    activated_at: z.string().datetime({ precision: 3 }),
    revoked_at: z.string().datetime({ precision: 3 }).nullable()
  })
  .strict();
export const AnalyticsIdentityNamespaceApplySchema = z
  .object({
    namespace: AnalyticsIdentityNamespaceRecordSchema,
    replayed: z.boolean()
  })
  .strict();
export const AnalyticsIdentityNamespacePreviewSchema = z
  .object({
    project_id: Id,
    action: z.enum(["configure", "revoke"]),
    expected_revision: Revision,
    resulting_revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    current_key_fingerprint: Fingerprint.nullable(),
    proposed_key_fingerprint: Fingerprint.nullable(),
    contexts_fenced: z.boolean(),
    preview_hash: z.string().regex(/^[a-f0-9]{64}$/)
  })
  .strict();
export const AnalyticsIdentityNamespaceApplyRequestSchema = z
  .object({
    change: AnalyticsIdentityNamespaceChangeSchema,
    preview_hash: z.string().regex(/^[a-f0-9]{64}$/)
  })
  .strict();

export type AnalyticsIdentityNamespaceChange = z.infer<
  typeof AnalyticsIdentityNamespaceChangeSchema
>;
