/** Database time governs trial expiry even before the lifecycle cleanup runs.
 * Only repository-owned queries interpolate this fixed expression. */
export const REPORT_TRIAL_ENTITLEMENT_SQL =
  "(billing_state IS DISTINCT FROM 'trialing' OR trial_ends_at>clock_timestamp())";
