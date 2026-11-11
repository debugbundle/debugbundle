import {
  createReviewModelClient,
  REVIEW_PROFILE_VERSION,
  type ReviewModelClient
} from "./model-client.js";
/** Qualification is a separate operator action after the offline rubric and an
 * explicitly authorised paid evaluation. Missing configuration makes no call. */
export function configureImprovementReviews(env: NodeJS.ProcessEnv): {
  enabled: boolean;
  model: ReviewModelClient | null;
} {
  const enabled = env["SMART_IMPROVEMENTS_ENABLED"] === "true";
  let model: ReviewModelClient | null = null;
  if (
    enabled &&
    env["SMART_IMPROVEMENTS_AI_ENABLED"] === "true" &&
    env["SMART_IMPROVEMENTS_AI_QUALIFIED_PROFILE"] === REVIEW_PROFILE_VERSION
  ) {
    try {
      model = createReviewModelClient({ apiKey: env["SMART_IMPROVEMENTS_AI_API_KEY"] ?? "" });
    } catch {
      /* Optional AI does not affect factual review delivery or debugging. */
    }
  }
  return { enabled, model };
}
