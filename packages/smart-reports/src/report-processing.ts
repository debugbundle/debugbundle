import { z } from "zod";
import { ReportRunRecordSchema } from "./report-run.js";
import { ReportAttemptProfileSchema } from "./model-cost.js";
import { ReportNarrativeSchema } from "./model-narrative.js";
export const ReportArtifactReferenceSchema = z
  .object({ key: z.string().min(1).max(1024), sha256: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict();
export const ReportProcessingStateSchema = z
  .object({
    run: ReportRunRecordSchema,
    profile: ReportAttemptProfileSchema.nullable(),
    paid_attempts: z.number().int().min(0).max(2),
    facts: ReportArtifactReferenceSchema.nullable(),
    ready: ReportArtifactReferenceSchema.nullable(),
    attempt: z
      .object({
        id: z.uuid(),
        state: z.enum(["sending", "uncertain", "succeeded", "rejected"]),
        request_sha256: z.string().regex(/^[a-f0-9]{64}$/),
        narrative: ReportNarrativeSchema.nullable()
      })
      .strict()
      .nullable()
  })
  .strict();
export type ReportProcessingState = z.infer<typeof ReportProcessingStateSchema>;
export type ReportArtifactReference = z.infer<typeof ReportArtifactReferenceSchema>;
