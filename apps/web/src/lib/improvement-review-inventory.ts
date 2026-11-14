import type { ReviewRecord } from "../../../../packages/smart-improvements/src/review-contract.js";
import { improvementReviewApi } from "./improvement-review-api.js";
import { reportScope } from "./report-api.js";

/** Count only metadata returned by the existing per-review authority/privacy checks.
 * Bound the history read and stop between pages when its view is no longer current. */
export async function loadImprovementReviewInventory(
  organizationId: string,
  projectId: string | undefined,
  isCurrent: () => boolean
): Promise<ReviewRecord[]> {
  const reviews = new Map<string, ReviewRecord>();
  const cursors = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < 100; page += 1) {
    if (!isCurrent()) throw new Error("review_inventory_cancelled");
    const result = await improvementReviewApi.list({
      ...reportScope(organizationId),
      query: {
        limit: 50,
        ...(projectId ? { project_id: projectId } : {}),
        ...(cursor ? { cursor } : {})
      }
    });
    if (!isCurrent()) throw new Error("review_inventory_cancelled");
    for (const review of result.reviews) {
      if (!reviews.has(review.id)) reviews.set(review.id, review);
    }
    if (result.next_cursor === null) return [...reviews.values()];
    if (cursors.has(result.next_cursor)) throw new Error("review_inventory_invalid_cursor");
    cursors.add(result.next_cursor);
    cursor = result.next_cursor;
  }
  throw new Error("review_inventory_read_limit");
}
