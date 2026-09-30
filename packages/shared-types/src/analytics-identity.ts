import { z } from "zod";
import { AnalyticsSafeHashSchema as Hash } from "./analytics.js";
import { AnalyticsScopeSchema } from "./analytics-definitions.js";

const Id = z.string().uuid();
const Revision = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const Timestamp = z.string().datetime({ precision: 3 });
const Code = z.string().regex(/^dbundle_ah_[A-Za-z0-9_-]{43}$/);
const lifetime = (issued: string, expires: string, maximum: number): boolean => {
  const duration = Date.parse(expires) - Date.parse(issued);
  return duration > 0 && duration <= maximum;
};

/** Routing syntax only. Issuance/exchange must separately enforce the configured project/origin pair. */
export const AnalyticsHandoffOriginSchema = z
  .string()
  .min(1)
  .max(255)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        url.origin === value &&
        url.username === "" &&
        url.password === ""
      );
    } catch {
      return false;
    }
  });
export const AnalyticsHandoffPathSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^\/(?!\/)[A-Za-z0-9/_~.!$&'()*+,;=:@-]*$/)
  .refine((value) => !value.split("/").some((segment) => segment === "." || segment === ".."));

/** A context record is metadata, never a bearer credential or proof of a first-party login. */
export const AnalyticsIdentityContextSchema = z
  .object({
    protocol: z.literal("2026-09-analytics-identity-01"),
    context_id: Id,
    project_id: Id,
    scope: AnalyticsScopeSchema,
    scope_revision: Revision,
    namespace_revision: Revision,
    producer_epoch: Id,
    anonymous_id_hash: Hash.nullable(),
    user_id_hash: Hash.nullable(),
    account_id_hash: Hash.nullable(),
    privacy_mode: z.enum(["standard", "custom"]),
    consent_granted: z.literal(true),
    issued_at: Timestamp,
    expires_at: Timestamp
  })
  .strict()
  .superRefine((value, ctx) => {
    const reject = (message: string): void => {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    };
    if (!lifetime(value.issued_at, value.expires_at, 300000))
      reject("Identity context lifetime must be positive and at most five minutes.");
    if (value.scope.kind === "project" && value.scope.project_id !== value.project_id)
      reject("Identity context project mismatch.");
    if (
      value.anonymous_id_hash === null &&
      value.user_id_hash === null &&
      value.account_id_hash === null
    )
      reject("An identity context needs an eligible subject.");
    if (
      value.privacy_mode === "standard" &&
      (value.user_id_hash !== null || value.account_id_hash !== null)
    )
      reject("Known subjects require custom identity integration.");
    if (value.account_id_hash !== null && value.user_id_hash === null)
      reject("Client account context requires an associated user.");
  });
export type AnalyticsIdentityContext = z.infer<typeof AnalyticsIdentityContextSchema>;

export const AnalyticsIdentityContextCreateSchema = z
  .object({
    producer_epoch: Id,
    binding_hash: Hash,
    namespace_revision: Revision,
    anonymous_id_hash: Hash,
    consent_granted: z.literal(true),
    idempotency_key: Id
  })
  .strict();
export type AnalyticsIdentityContextCreate = z.infer<typeof AnalyticsIdentityContextCreateSchema>;

export const AnalyticsIdentityAssociationSchema = z
  .object({
    context_id: Id,
    producer_epoch: Id,
    binding_hash: Hash,
    namespace_revision: Revision,
    anonymous_id_hash: Hash,
    user_id_hash: Hash,
    account_id_hash: Hash.nullable(),
    consent_granted: z.literal(true),
    idempotency_key: Id
  })
  .strict();
export type AnalyticsIdentityAssociation = z.infer<typeof AnalyticsIdentityAssociationSchema>;

export const AnalyticsIdentityRevokeSchema = z
  .object({
    context_id: Id,
    producer_epoch: Id,
    binding_hash: Hash,
    idempotency_key: Id
  })
  .strict();
export const AnalyticsIdentityRevocationSchema = z
  .object({
    protocol: z.literal("2026-09-analytics-identity-01"),
    context_id: Id,
    producer_epoch: Id,
    revoked_at: Timestamp,
    replayed: z.boolean()
  })
  .strict();
export type AnalyticsIdentityRevoke = z.infer<typeof AnalyticsIdentityRevokeSchema>;
export type AnalyticsIdentityRevocation = z.infer<typeof AnalyticsIdentityRevocationSchema>;

/** A protected subject reference is scoped by the authenticated first-party writer project. */
export const AnalyticsSubjectErasureRequestSchema = z
  .object({
    namespace_revision: Revision,
    subject_kind: z.enum(["anonymous", "user", "account"]),
    subject_ref: Hash,
    idempotency_key: Id
  })
  .strict();
export type AnalyticsSubjectErasureRequest = z.infer<typeof AnalyticsSubjectErasureRequestSchema>;
export const AnalyticsSubjectErasureReceiptSchema = z
  .object({
    protocol: z.literal("2026-09-analytics-erasure-01"),
    task_id: Id,
    cutoff_at: Timestamp,
    status: z.enum(["pending", "complete"]),
    replayed: z.boolean()
  })
  .strict();
export type AnalyticsSubjectErasureReceipt = z.infer<typeof AnalyticsSubjectErasureReceiptSchema>;
export const AnalyticsSubjectErasureTaskStatusSchema = z
  .object({
    protocol: z.literal("2026-09-analytics-erasure-01"),
    task_id: Id,
    project_id: Id,
    cutoff_at: Timestamp,
    status: z.enum(["pending", "complete"]),
    completed_at: Timestamp.nullable()
  })
  .strict()
  .refine((value) => (value.status === "complete") === (value.completed_at !== null));
export type AnalyticsSubjectErasureTaskStatus = z.infer<
  typeof AnalyticsSubjectErasureTaskStatusSchema
>;

/** Backend-owned relay envelope reference; never accept it from browser capture. */
export const AnalyticsRelayIdentityContextReferenceSchema = z
  .object({
    context_id: Id,
    producer_epoch: Id,
    binding_hash: Hash
  })
  .strict();
export type AnalyticsRelayIdentityContextReference = z.infer<
  typeof AnalyticsRelayIdentityContextReferenceSchema
>;

export const AnalyticsHandoffCreateSchema = z
  .object({
    context_id: Id,
    producer_epoch: Id,
    binding_hash: Hash,
    destination_project_id: Id,
    destination_origin: AnalyticsHandoffOriginSchema,
    destination_path: AnalyticsHandoffPathSchema,
    idempotency_key: Id
  })
  .strict();
export const AnalyticsHandoffExchangeSchema = z
  .object({
    code: Code,
    destination_origin: AnalyticsHandoffOriginSchema,
    producer_epoch: Id,
    binding_hash: Hash,
    consent_granted: z.literal(true)
  })
  .strict();
const HandoffMetadata = {
  protocol: z.literal("2026-09-analytics-handoff-01"),
  issued_at: Timestamp,
  expires_at: Timestamp,
  destination_project_id: Id,
  destination_origin: AnalyticsHandoffOriginSchema,
  destination_path: AnalyticsHandoffPathSchema
};
export const AnalyticsHandoffReceiptSchema = z
  .discriminatedUnion("disposition", [
    z.object({ ...HandoffMetadata, disposition: z.literal("issued"), code: Code }).strict(),
    z.object({ ...HandoffMetadata, disposition: z.literal("secret_unavailable") }).strict()
  ])
  .refine((value) => lifetime(value.issued_at, value.expires_at, 60000), {
    message: "Handoff lifetime must be positive and at most sixty seconds."
  });
export type AnalyticsHandoffCreate = z.infer<typeof AnalyticsHandoffCreateSchema>;
export type AnalyticsHandoffExchange = z.infer<typeof AnalyticsHandoffExchangeSchema>;
export type AnalyticsHandoffReceipt = z.infer<typeof AnalyticsHandoffReceiptSchema>;
