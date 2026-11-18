import type { ReferralManagement } from "../../../packages/referrals/src/referral-management.js";
import type { OfferManagement } from "../../../packages/referrals/src/offer-management.js";

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
  },
  offers?: OfferManagement
): Promise<string[] | null> {
  if (offers && input.created_user) {
    try {
      if (
        await offers.captureSignup(
          { organization_id: input.organization_id, actor_user_id: input.actor_user_id },
          true
        )
      )
        return offers.clearCookies();
    } catch {
      /* Keep authentication independent of optional referral recovery. */
    }
  }
  if (!manager || !input.created_user) return null;
  try {
    return (await manager.captureSignup(input)) ? [manager.clearPendingCookie()] : null;
  } catch {
    return null;
  }
}
