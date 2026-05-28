export {
  SYSTEM_EMAIL_REVIEW_ENTRIES,
  type RenderedSystemEmailPreview,
  type SystemEmailReviewEntry
} from "../../../../packages/email/src/system-email-review.js";

export interface InternalReviewEnv {
  DEV?: boolean;
  MODE?: string;
}

export function isSystemEmailReviewEnabled(env: InternalReviewEnv = import.meta.env): boolean {
  return env.DEV === true || env.MODE === "test";
}
