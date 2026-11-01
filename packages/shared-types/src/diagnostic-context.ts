import { z } from "zod";
import { utf8String, withinUtf8Budget } from "./evidence-bounds.js";

export const EvidenceReferenceIdSchema = z
  .string()
  .guid()
  .refine(
    (value) => value[14] === "4" && /^[89ab]$/i.test(value[19] ?? ""),
    "Fresh RFC UUID v4 required"
  );
export const EvidenceScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("page"), page_id: EvidenceReferenceIdSchema }).strict(),
  z.object({ kind: z.literal("operation"), operation_id: EvidenceReferenceIdSchema }).strict()
]);
export const EvidenceReferenceSchema = z
  .object({
    version: z.literal(1),
    failure_ref: EvidenceReferenceIdSchema,
    scope: EvidenceScopeSchema
  })
  .strict();

export const SanitizedEvidenceUrlSchema = utf8String(2048).refine((value) => {
  if (!value || /[\u0000-\u0020\u007f\\?#]/.test(value) || value.startsWith("//")) return false;
  if (!value.startsWith("/") && !/^https?:\/\//i.test(value)) return false;
  try {
    const url = new URL(value, "https://evidence.invalid");
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}, "Sanitised HTTP(S) or root-relative resource URL required");

const TimingObservationSchema = z
  .object({
    kind: z.literal("timing"),
    observed_at: z.string().datetime(),
    source_url: SanitizedEvidenceUrlSchema.nullable(),
    availability: z.enum([
      "observed",
      "unsupported",
      "no_match",
      "withheld",
      "ambiguous",
      "unknown"
    ]),
    response_status: z.number().int().min(100).max(599).nullable(),
    duration_ms: z.number().finite().nonnegative().nullable(),
    transfer_size_bytes: z.number().int().nonnegative().nullable()
  })
  .strict();
const CspObservationSchema = z
  .object({
    kind: z.literal("csp"),
    observed_at: z.string().datetime(),
    source_url: SanitizedEvidenceUrlSchema.nullable(),
    effective_directive: z.string().regex(/^[a-z-]{1,64}$/),
    disposition: z.enum(["enforce", "report"]),
    document_status_code: z.number().int().min(100).max(599).nullable()
  })
  .strict();
export const ResourceObservationSchema = z.discriminatedUnion("kind", [
  TimingObservationSchema,
  CspObservationSchema
]);
export const ResourceObservationsSchema = z
  .object({
    version: z.literal(1),
    items: z.array(ResourceObservationSchema).min(1).max(5)
  })
  .strict()
  .refine(
    (value) => withinUtf8Budget(JSON.stringify(value), 32 * 1024),
    "Resource observations exceed byte budget"
  );

export const RecoveryStateValues = [
  "attempt_started",
  "attempt_completed",
  "attempt_failed",
  "recovery_observed",
  "failure_persisted"
] as const;
const RecoveryPayloadSchema = z
  .object({
    version: z.literal(1),
    kind: z.literal("recovery"),
    failure_ref: EvidenceReferenceIdSchema,
    scope: EvidenceScopeSchema,
    attempt_id: EvidenceReferenceIdSchema,
    state: z.enum(RecoveryStateValues),
    operation: utf8String(64).optional(),
    status_code: z.number().int().min(100).max(599).optional(),
    duration_ms: z.number().finite().nonnegative().optional()
  })
  .strict();
const ResourceObservationPayloadSchema = z
  .object({
    version: z.literal(1),
    kind: z.literal("resource_observation"),
    failure_ref: EvidenceReferenceIdSchema,
    scope: EvidenceScopeSchema,
    source_event_id: z.string().guid(),
    observations: ResourceObservationsSchema
  })
  .strict();
export const DiagnosticContextPayloadSchema = z.discriminatedUnion("kind", [
  RecoveryPayloadSchema,
  ResourceObservationPayloadSchema
]);

export const ExecutionContextSchema = z
  .object({
    version: z.literal(1),
    kind: z.enum(["request", "command", "job", "unknown"]),
    name: utf8String(128).nullable(),
    elapsed_ms: z.number().finite().nonnegative().nullable(),
    limit_ms: z.number().finite().nonnegative().nullable()
  })
  .strict();

export type EvidenceScope = z.infer<typeof EvidenceScopeSchema>;
export type EvidenceReference = z.infer<typeof EvidenceReferenceSchema>;
export type ResourceObservation = z.infer<typeof ResourceObservationSchema>;
export type ResourceObservations = z.infer<typeof ResourceObservationsSchema>;
export type DiagnosticContextPayload = z.infer<typeof DiagnosticContextPayloadSchema>;
export type RecoveryObservation = Extract<DiagnosticContextPayload, { kind: "recovery" }>;
export type ExecutionContext = z.infer<typeof ExecutionContextSchema>;
