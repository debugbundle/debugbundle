import { renderCreatorReferralEmail } from "./creator-referral-emails.js";
import type { SystemEmailReviewEntry } from "./system-email-review.js";
const options = {
  appBaseUrl: "https://app.debugbundle.local",
  publicBaseUrl: "https://debugbundle.local",
  brandMarkUrl: "https://app.debugbundle.local/email/debugbundle-mark.png"
};
const first = {
  programme_id: "11111111-1111-4111-8111-111111111111",
  name: "DebugBundle Creators",
  new_referrals: 1,
  pending_commission_minor: 760
};
const window = { window_start: "2026-11-16T00:00:00.000Z", window_end: "2026-11-17T00:00:00.000Z" };
export const CREATOR_EMAIL_REVIEW_ENTRIES: readonly SystemEmailReviewEntry[] = [
  {
    id: "creator-programme-joined",
    title: "Creator programme confirmation",
    category: "operational",
    recipient: "Verified enrolled creator",
    trigger: "First acceptance of an immutable programme revision",
    requiredInV1: true,
    implementationStatus: "implemented",
    get preview() {
      return renderCreatorReferralEmail(
        {
          kind: "joined",
          name: first.name,
          terms_version: "creator-terms-1",
          code: "OWEN20",
          commission_basis_points: 5000,
          discount_basis_points: 2000,
          commission_months: 12
        },
        options
      );
    }
  },
  {
    id: "creator-first-referral-purchase",
    title: "First referral purchase",
    category: "operational",
    recipient: "Verified enrolled creator",
    trigger: "First verified qualifying paying customer in a permanent programme",
    requiredInV1: true,
    implementationStatus: "implemented",
    get preview() {
      return renderCreatorReferralEmail(
        {
          kind: "first_purchase",
          ...window,
          sections: [first],
          total_referrals: 1,
          total_commission_minor: 760,
          other_programmes: 0
        },
        options
      );
    }
  },
  {
    id: "creator-referral-daily-digest",
    title: "Daily referral activity",
    category: "operational",
    recipient: "Verified creator with new paying referrals",
    trigger: "Closed UTC day with subsequent first purchases; quiet days send nothing",
    requiredInV1: true,
    implementationStatus: "implemented",
    get preview() {
      return renderCreatorReferralEmail(
        {
          kind: "daily_digest",
          ...window,
          sections: [
            { ...first, new_referrals: 2, pending_commission_minor: 1520 },
            {
              ...first,
              programme_id: "22222222-2222-4222-8222-222222222222",
              name: "DebugBundle Writers",
              pending_commission_minor: 200
            }
          ],
          total_referrals: 3,
          total_commission_minor: 1720,
          other_programmes: 0
        },
        options
      );
    }
  }
];
