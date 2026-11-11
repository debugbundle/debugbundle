import {
  createImprovementReviewApi,
  ImprovementReviewApiError
} from "../../../../packages/improvement-review-client/src/index.js";
import { reportHttpClient } from "./report-api.js";
export const improvementReviewApi = createImprovementReviewApi(reportHttpClient);
export function improvementReviewError(error: unknown): string {
  const code = error instanceof ImprovementReviewApiError ? error.code : "";
  return code === "report_version_conflict"
    ? "Weekly review settings changed. Reload before saving; your draft is still here."
    : code === "improvement_reviews_disabled"
      ? "Weekly review generation is currently unavailable. Saved reviews remain readable."
      : code === "upgrade_required"
        ? "Weekly reviews require Team or Business and a selection within the plan limit."
        : code === "forbidden"
          ? "The workspace Owner must have current administration of every selected project. Projects with automatic improvements disabled cannot be selected."
          : code === "improvement_review_not_found"
            ? "This review is unavailable, expired or no longer permitted."
            : "Weekly reviews could not be loaded. Try again.";
}
