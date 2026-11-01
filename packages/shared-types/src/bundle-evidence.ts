import { z } from "zod";
import {
  EvidenceReferenceIdSchema,
  RecoveryStateValues,
  ResourceObservationSchema
} from "./diagnostic-context.js";
import { utf8String } from "./evidence-bounds.js";

export const EvidenceAvailabilitySchema = z.enum([
  "observed",
  "unknown",
  "unsupported",
  "truncated",
  "not_retained"
]);
export const BundleEvidenceSchema = z
  .object({
    version: z.literal(1),
    primary_event_id: z.string().min(1),
    retained_event_count: z.number().int().nonnegative(),
    retained_first_at: z.string().datetime().nullable(),
    retained_last_at: z.string().datetime().nullable(),
    observations: z
      .array(
        z
          .object({
            source_event_id: z.string().min(1),
            occurred_at: z.string().datetime(),
            kind: z.enum(["exception", "resource_observation", "recovery", "probe"]),
            availability: EvidenceAvailabilitySchema
          })
          .strict()
      )
      .max(20)
  })
  .strict();

const RecoveryOutcomeSchema = z.enum(["unknown", "recovered", "persisted", "conflicting"]);
export const BundleRecoverySchema = z
  .object({
    version: z.literal(1),
    outcome: RecoveryOutcomeSchema,
    truncated: z.boolean(),
    attempts: z
      .array(
        z
          .object({
            attempt_id: EvidenceReferenceIdSchema,
            outcome: RecoveryOutcomeSchema,
            observations: z
              .array(
                z
                  .object({
                    source_event_id: z.string().guid(),
                    occurred_at: z.string().datetime(),
                    state: z.enum(RecoveryStateValues),
                    operation: utf8String(64).optional(),
                    status_code: z.number().int().min(100).max(599).optional(),
                    duration_ms: z.number().finite().nonnegative().optional()
                  })
                  .strict()
              )
              .max(20)
          })
          .strict()
      )
      .max(5)
  })
  .strict()
  .refine(
    (value) =>
      value.attempts.reduce((count, attempt) => count + attempt.observations.length, 0) <= 20,
    "At most 20 recovery observations"
  );

export const BundleResourceObservationsSchema = z
  .object({
    version: z.literal(1),
    items: z
      .array(
        z
          .object({ source_event_id: z.string().guid(), observation: ResourceObservationSchema })
          .strict()
      )
      .max(10)
  })
  .strict();
export type BundleEvidence = z.infer<typeof BundleEvidenceSchema>;
export type BundleRecovery = z.infer<typeof BundleRecoverySchema>;
export type BundleResourceObservations = z.infer<typeof BundleResourceObservationsSchema>;
