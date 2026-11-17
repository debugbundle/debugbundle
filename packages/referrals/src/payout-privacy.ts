/** Product telemetry policy. Keep the SDK's standard keys and also conceal
 * recipient fields in failed request bodies, breadcrumbs and nested context. */
export const REFERRAL_PAYOUT_REDACT_FIELDS = [
  "password",
  "secret",
  "token",
  "authorization",
  "cookie",
  "ssn",
  "credit_card",
  "holder",
  "destination",
  "iban",
  "wisetag",
  "revtag",
  "encrypted_details"
] as const;
