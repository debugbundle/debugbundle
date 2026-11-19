import type { OfferPolicy } from "../../referrals/src/programme-policy.js";
import type { OfferPriceSelection } from "../../referrals/src/offer-choice.js";
import type { Queryable } from "./types.js";
import { resolveOfferCode } from "./offer-code-resolver.js";

export interface PromotionSelection {
  selection?: OfferPriceSelection;
  scope?: OfferPolicy;
  require_early_purchase?: boolean;
}
/** Only current unblocked promotions can be newly promised. Percentage order is
 * monotonic in rounded price; the shared comparator gives referral money ties priority. */
export async function readPublicPromotion(
  db: Queryable,
  input: PromotionSelection = {}
): ReturnType<typeof resolveOfferCode> {
  const plans = input.selection
    ? [input.selection.target_plan]
    : (input.scope?.eligible_plans ?? []);
  const intervals = input.selection
    ? [input.selection.interval]
    : (input.scope?.eligible_intervals ?? []);
  const row = (
    await db.query<{ code: string }>(
      `SELECT c.code FROM offer_programmes p
    JOIN offer_programme_versions v ON v.id=p.current_version_id
    JOIN offer_codes c ON c.version_id=v.id AND c.kind='promotion' AND NOT c.blocked
    WHERE v.policy->>'kind'='promotion' AND v.state IN ('active','scheduled')
      AND (v.policy->>'claims_start_at')::timestamptz<=clock_timestamp()
      AND (v.policy->>'claims_end_at' IS NULL OR (v.policy->>'claims_end_at')::timestamptz>clock_timestamp())
      AND (v.policy->>'max_claims' IS NULL OR v.claims_count<(v.policy->>'max_claims')::integer)
      AND $1::text[] <@ ARRAY(SELECT jsonb_array_elements_text(v.policy->'eligible_plans'))
      AND $2::text[] <@ ARRAY(SELECT jsonb_array_elements_text(v.policy->'eligible_intervals'))
      AND (NOT $3::boolean OR (v.policy->>'allow_early_purchase_grants')::boolean)
    ORDER BY (v.policy->>'discount_basis_points')::integer DESC,(v.policy->>'claims_start_at')::timestamptz DESC,v.created_at DESC,v.id DESC,c.created_at DESC,c.id DESC LIMIT 1`,
      [plans, intervals, input.require_early_purchase === true]
    )
  ).rows[0];
  return row ? resolveOfferCode(db, row.code) : null;
}
