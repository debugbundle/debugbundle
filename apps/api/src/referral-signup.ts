import type { ReferralManagement } from "../../../packages/referrals/src/referral-management.js";

/** Referral availability cannot turn successful authentication into a failure.
 * Clear the pending link only after durable attribution; callers append this
 * cookie alongside their existing session/OAuth cookies. */
export async function captureSignupReferral(
  manager: ReferralManagement | undefined,
  input: {
    organization_id: string;
    actor_user_id: string;
    created_user: boolean;
    cookie_header: string | undefined;
  }
): Promise<string | null> {
  if (!manager || !input.created_user) return null;
  try {
    return (await manager.captureSignup(input)) ? manager.clearPendingCookie() : null;
  } catch {
    return null;
  }
}
