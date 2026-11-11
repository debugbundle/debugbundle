import { z } from "zod";
import { ReviewFactsSchema, type ReviewFacts } from "../../smart-improvements/src/review.js";
import {
  ReviewContextSchema,
  type ReviewContext
} from "../../smart-improvements/src/review-planning-contract.js";
import {
  validatePlannedGuidance,
  planningDigest
} from "../../smart-improvements/src/review-planning.js";
import {
  validateReviewGuidance,
  type ReviewGuidance
} from "../../smart-improvements/src/review.js";
import type { ReviewRow } from "./improvement-review-access.js";
const snapshotSchema = z
  .object({ context: ReviewContextSchema, digest: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict();
/** Keep the released facts checksum unchanged for old worker recovery. The
 * additional snapshot owns its own integrity and unchanged-evidence checksum. */
export function reviewContextSnapshot(
  facts: ReviewFacts,
  context: ReviewContext
): z.infer<typeof snapshotSchema> {
  return snapshotSchema.parse({ context, digest: planningDigest(facts, context) });
}
export function reviewContext(row: ReviewRow): ReviewContext | null {
  if (row["review_context"] == null) return null;
  const snapshot = snapshotSchema.parse(row["review_context"]);
  if (planningDigest(ReviewFactsSchema.parse(row["facts"]), snapshot.context) !== snapshot.digest)
    throw new Error("review_context_integrity_failed");
  return snapshot.context;
}
export function validateRowReviewGuidance(
  row: ReviewRow,
  raw: unknown,
  identities: readonly string[]
): ReviewGuidance {
  const facts = ReviewFactsSchema.parse(row["facts"]),
    context = reviewContext(row);
  return context
    ? validatePlannedGuidance(facts, context, raw, identities)
    : validateReviewGuidance(facts, raw, identities);
}
