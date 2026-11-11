import { expect, it } from "vitest";
import { improvementReviewError } from "../../../apps/web/src/lib/improvement-review-api.js";
import { ImprovementReviewApiError } from "../../../packages/improvement-review-client/src/index.js";
it.each([
  ["report_version_conflict", "draft is still here"],
  ["improvement_reviews_disabled", "Saved reviews remain readable"],
  ["upgrade_required", "Team or Business"],
  ["forbidden", "Owner"],
  ["improvement_review_not_found", "expired"],
  ["unknown", "Try again"]
])("presents the safe %s review error", (code, expected) => {
  expect(improvementReviewError(new ImprovementReviewApiError(403, code))).toContain(expected);
});
it("does not display raw internal exceptions", () => {
  expect(improvementReviewError(new Error("private-token-secret"))).not.toContain(
    "private-token-secret"
  );
});
