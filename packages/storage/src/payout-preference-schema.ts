import { defineStorageSchemaMigration } from "./schema-migration-definition.js";
import type { Queryable } from "./types.js";

export const PAYOUT_PREFERENCE_TABLES = [
  "referral_payout_preferences",
  "referral_payout_instructions"
] as const;
const statements = [
  `CREATE TABLE referral_payout_preferences (
    partner_id uuid NOT NULL REFERENCES referral_partners(id),
    programme_id uuid NOT NULL REFERENCES offer_programmes(id), revision uuid NOT NULL,
    method text NOT NULL CHECK(method IN ('iban','wise','revolut')),
    country text NOT NULL CHECK(country ~ '^[A-Z]{2}$'),
    currency text NOT NULL CHECK(currency IN ('usd','eur','gbp','cad','aud')),
    masked_destination text NOT NULL CHECK(length(masked_destination) BETWEEN 5 AND 12),
    encrypted_details text NOT NULL CHECK(encrypted_details LIKE 'encv1.%' AND length(encrypted_details)<4096),
    updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(partner_id,programme_id)
  )`,
  `CREATE TABLE referral_payout_instructions (
    batch_id uuid PRIMARY KEY REFERENCES referral_payout_batches(id),
    programme_id uuid NOT NULL REFERENCES offer_programmes(id), preference_revision uuid NOT NULL,
    method text NOT NULL CHECK(method IN ('iban','wise','revolut')),
    country text NOT NULL CHECK(country ~ '^[A-Z]{2}$'),
    currency text NOT NULL CHECK(currency IN ('usd','eur','gbp','cad','aud')),
    masked_destination text NOT NULL CHECK(length(masked_destination) BETWEEN 5 AND 12),
    encrypted_details text NOT NULL CHECK(encrypted_details LIKE 'encv1.%' AND length(encrypted_details)<4096),
    captured_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX referral_payout_instructions_programme_idx ON referral_payout_instructions(programme_id,batch_id)`,
  `CREATE FUNCTION preserve_referral_payout_instructions() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'referral_payout_instructions_immutable'; END $$`,
  `CREATE TRIGGER referral_payout_instructions_immutable BEFORE UPDATE OR DELETE ON referral_payout_instructions
    FOR EACH ROW EXECUTE FUNCTION preserve_referral_payout_instructions()`,
  // Older writers cannot combine versioned earnings or bypass destination snapshots.
  // Legacy-only payouts remain compatible with the original external-detail workflow.
  `CREATE FUNCTION guard_referral_payout_programme() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE earned_programme uuid; captured_programme uuid; earned_partner uuid; batch_partner uuid; earned_amount bigint;
    BEGIN
      SELECT l.partner_id,v.programme_id,l.amount_minor INTO earned_partner,earned_programme,earned_amount
      FROM referral_commission_ledger l LEFT JOIN offer_claims c ON c.attribution_id=l.attribution_id
      LEFT JOIN offer_programme_versions v ON v.id=c.referral_version_id WHERE l.id=NEW.ledger_entry_id;
      SELECT b.partner_id,s.programme_id INTO batch_partner,captured_programme
      FROM referral_payout_batches b LEFT JOIN referral_payout_instructions s ON s.batch_id=b.id WHERE b.id=NEW.batch_id;
      IF earned_partner IS DISTINCT FROM batch_partner OR (earned_programme IS DISTINCT FROM captured_programme AND earned_amount>=0)
      THEN RAISE EXCEPTION 'referral_payout_programme_snapshot_required'; END IF;
      RETURN NEW;
    END $$`,
  `CREATE TRIGGER referral_payout_programme_guard BEFORE INSERT ON referral_payout_entries
    FOR EACH ROW EXECUTE FUNCTION guard_referral_payout_programme()`
];
const readySql = `
  (SELECT count(*)=2 FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('referral_payout_preferences','referral_payout_instructions'))
  AND NOT EXISTS(SELECT 1 FROM (VALUES
    ('referral_payout_preferences','partner_id','uuid'),('referral_payout_preferences','programme_id','uuid'),
    ('referral_payout_preferences','revision','uuid'),('referral_payout_preferences','encrypted_details','text'),
    ('referral_payout_preferences','method','text'),('referral_payout_preferences','country','text'),
    ('referral_payout_preferences','currency','text'),('referral_payout_preferences','masked_destination','text'),
    ('referral_payout_preferences','updated_at','timestamp with time zone'),
    ('referral_payout_instructions','batch_id','uuid'),('referral_payout_instructions','programme_id','uuid'),
    ('referral_payout_instructions','preference_revision','uuid'),('referral_payout_instructions','encrypted_details','text'),
    ('referral_payout_instructions','method','text'),('referral_payout_instructions','country','text'),
    ('referral_payout_instructions','currency','text'),('referral_payout_instructions','masked_destination','text'),
    ('referral_payout_instructions','captured_at','timestamp with time zone')
  ) expected(t,c,d) WHERE NOT EXISTS(SELECT 1 FROM information_schema.columns a
    WHERE a.table_schema='public' AND a.table_name=t AND a.column_name=c AND a.data_type=d AND a.is_nullable='NO'))
  AND EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='referral_payout_preferences_pkey' AND indexdef LIKE '%(partner_id, programme_id)%')
  AND EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='referral_payout_instructions_pkey' AND indexdef LIKE '%(batch_id)%')
  AND (SELECT count(*)=2 FROM pg_constraint WHERE contype='f' AND conrelid=to_regclass('public.referral_payout_preferences'))
  AND (SELECT count(*)=2 FROM pg_constraint WHERE contype='f' AND conrelid=to_regclass('public.referral_payout_instructions'))
  AND (SELECT count(*)=5 FROM pg_constraint WHERE contype='c' AND conrelid=to_regclass('public.referral_payout_preferences'))
  AND (SELECT count(*)=5 FROM pg_constraint WHERE contype='c' AND conrelid=to_regclass('public.referral_payout_instructions'))
  AND EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='referral_payout_instructions_immutable' AND tgrelid=to_regclass('public.referral_payout_instructions') AND tgenabled='O' AND tgtype=27 AND tgfoid=to_regprocedure('public.preserve_referral_payout_instructions()') AND NOT tgisinternal)
  AND EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='referral_payout_programme_guard' AND tgrelid=to_regclass('public.referral_payout_entries') AND tgenabled='O' AND tgtype=7 AND tgfoid=to_regprocedure('public.guard_referral_payout_programme()') AND NOT tgisinternal)
`;
export const PAYOUT_PREFERENCE_MIGRATION = defineStorageSchemaMigration({
  id: "202611160002_add_referral_payout_preferences",
  description:
    "Encrypt per-programme creator payout preferences and freeze manual payout instructions without rewriting existing batches.",
  statements: [
    ...statements,
    `DO $$ BEGIN IF NOT (${readySql}) THEN RAISE EXCEPTION 'payout_preference_schema_incomplete'; END IF; END $$`
  ]
});
export async function payoutPreferenceSchemaAvailable(db: Queryable): Promise<boolean> {
  return (
    (await db.query<{ available: boolean }>(`SELECT (${readySql}) AS available`, [])).rows[0]
      ?.available === true
  );
}
