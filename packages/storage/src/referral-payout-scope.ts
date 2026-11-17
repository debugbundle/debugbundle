// Shared financial admission predicate. Positive entries wait for reconciliation,
// dispute clearance and funds availability; negative reversals offset immediately.
export const REFERRAL_FINANCIAL_HOLD_SQL = `NOT EXISTS(SELECT 1 FROM referral_reconciliation_events r
  WHERE r.status='pending' AND (r.organization_external_id IS NULL OR r.organization_external_id=(SELECT a.organization_external_id FROM referral_attributions a WHERE a.id=i.attribution_id)))`;
export const PAYOUT_PROGRAMME_JOIN_SQL = `LEFT JOIN offer_claims payout_claim ON payout_claim.attribution_id=l.attribution_id
  LEFT JOIN offer_programme_versions payout_version ON payout_version.id=payout_claim.referral_version_id`;
