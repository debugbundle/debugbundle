import { defineStorageSchemaMigration } from "./schema-migration-definition.js";
import type { Queryable } from "./types.js";

export const REFERRAL_LEDGER_TABLES = [
  "referral_commission_periods",
  "referral_receipt_snapshots",
  "referral_invoice_balances",
  "referral_commission_ledger",
  "referral_payout_batches",
  "referral_payout_entries"
] as const;
const immutable = `CREATE OR REPLACE FUNCTION debugbundle_referral_financial_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'referral_financial_record_immutable'; END $$`;
export const REFERRAL_LEDGER_BOOTSTRAP = [
  `CREATE TABLE referral_commission_periods (
    attribution_id uuid PRIMARY KEY REFERENCES referral_attributions(id),
    first_paid_service_starts_at timestamptz NOT NULL, first_payment_id text NOT NULL,
    status text NOT NULL CHECK(status IN ('eligible','ineligible')),
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE referral_receipt_snapshots (
    id uuid PRIMARY KEY, organization_external_id uuid NOT NULL,
    provider_customer_id text NOT NULL, owner_identity_hash text NOT NULL CHECK(owner_identity_hash ~ '^[a-f0-9]{64}$'),
    digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'), facts jsonb NOT NULL CHECK(jsonb_typeof(facts)='array' AND pg_column_size(facts)<=2097152),
    observed_at timestamptz NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(organization_external_id,digest)
  )`,
  `CREATE INDEX referral_receipt_snapshots_organization_idx ON referral_receipt_snapshots(organization_external_id,observed_at DESC)`,
  `CREATE TABLE referral_invoice_balances (
    invoice_id text PRIMARY KEY, attribution_id uuid NOT NULL REFERENCES referral_attributions(id),
    target_minor bigint NOT NULL CHECK(target_minor BETWEEN 0 AND 1000000000000), payout_held boolean NOT NULL,
    snapshot_id uuid NOT NULL REFERENCES referral_receipt_snapshots(id)
  )`,
  `CREATE TABLE referral_commission_ledger (
    id uuid PRIMARY KEY, partner_id uuid NOT NULL REFERENCES referral_partners(id),
    attribution_id uuid NOT NULL REFERENCES referral_attributions(id), invoice_id text NOT NULL REFERENCES referral_invoice_balances(invoice_id),
    snapshot_id uuid NOT NULL REFERENCES referral_receipt_snapshots(id), currency text NOT NULL CHECK(currency='usd'),
    amount_minor bigint NOT NULL CHECK(amount_minor BETWEEN -1000000000000 AND 1000000000000 AND amount_minor<>0),
    available_at timestamptz NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(invoice_id,snapshot_id)
  )`,
  `CREATE INDEX referral_commission_ledger_partner_idx ON referral_commission_ledger(partner_id,currency,available_at,id)`,
  `CREATE TABLE referral_payout_batches (
    id uuid PRIMARY KEY, partner_id uuid NOT NULL REFERENCES referral_partners(id), currency text NOT NULL CHECK(currency='usd'),
    amount_minor bigint NOT NULL CHECK(amount_minor BETWEEN 1 AND 1000000000000),
    status text NOT NULL CHECK(status IN ('claimed','uncertain','paid')),
    external_reference text UNIQUE CHECK(length(external_reference) BETWEEN 1 AND 200),
    claimed_by uuid NOT NULL, updated_by uuid NOT NULL, claimed_at timestamptz NOT NULL,
    paid_at timestamptz, CHECK((status='paid' AND paid_at IS NOT NULL AND external_reference IS NOT NULL)
      OR (status IN ('claimed','uncertain') AND paid_at IS NULL AND external_reference IS NULL))
  )`,
  `CREATE UNIQUE INDEX referral_payout_one_active_idx ON referral_payout_batches(partner_id,currency) WHERE status IN ('claimed','uncertain')`,
  `CREATE TABLE referral_payout_entries (
    batch_id uuid NOT NULL REFERENCES referral_payout_batches(id), ledger_entry_id uuid PRIMARY KEY REFERENCES referral_commission_ledger(id)
  )`,
  immutable,
  ...[
    "referral_commission_periods",
    "referral_receipt_snapshots",
    "referral_commission_ledger",
    "referral_payout_entries"
  ].map(
    (table) =>
      `CREATE TRIGGER ${table}_immutable BEFORE UPDATE OR DELETE ON ${table} FOR EACH ROW EXECUTE FUNCTION debugbundle_referral_financial_immutable()`
  ),
  `CREATE OR REPLACE FUNCTION debugbundle_referral_payout_guard() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'referral_financial_record_immutable'; END IF;
    IF (OLD.id,OLD.partner_id,OLD.currency,OLD.amount_minor,OLD.claimed_by,OLD.claimed_at)
      IS DISTINCT FROM (NEW.id,NEW.partner_id,NEW.currency,NEW.amount_minor,NEW.claimed_by,NEW.claimed_at)
      OR (OLD.status='paid' AND NEW IS DISTINCT FROM OLD)
      OR (OLD.status='uncertain' AND NEW.status='claimed') THEN
      RAISE EXCEPTION 'referral_financial_record_immutable';
    END IF;
    IF NEW.status='paid' AND NEW.paid_at<OLD.claimed_at THEN RAISE EXCEPTION 'referral_payout_time_invalid'; END IF;
    RETURN NEW;
  END $$`,
  `CREATE TRIGGER referral_payout_batches_guard BEFORE UPDATE OR DELETE ON referral_payout_batches FOR EACH ROW EXECUTE FUNCTION debugbundle_referral_payout_guard()`
] as const;
const readySql = `SELECT ${REFERRAL_LEDGER_TABLES.map((table) => `to_regclass('public.${table}') IS NOT NULL`).join(" AND ")}
  AND to_regclass('public.referral_payout_one_active_idx') IS NOT NULL
  AND (SELECT count(*)=39 FROM information_schema.columns WHERE table_schema='public' AND (
    (table_name='referral_commission_periods' AND column_name=ANY(ARRAY['attribution_id','first_paid_service_starts_at','first_payment_id','status','created_at'])) OR
    (table_name='referral_receipt_snapshots' AND column_name=ANY(ARRAY['id','organization_external_id','provider_customer_id','owner_identity_hash','digest','facts','observed_at','recorded_at'])) OR
    (table_name='referral_invoice_balances' AND column_name=ANY(ARRAY['invoice_id','attribution_id','target_minor','payout_held','snapshot_id'])) OR
    (table_name='referral_commission_ledger' AND column_name=ANY(ARRAY['id','partner_id','attribution_id','invoice_id','snapshot_id','currency','amount_minor','available_at','recorded_at'])) OR
    (table_name='referral_payout_batches' AND column_name=ANY(ARRAY['id','partner_id','currency','amount_minor','status','external_reference','claimed_by','updated_by','claimed_at','paid_at'])) OR
    (table_name='referral_payout_entries' AND column_name=ANY(ARRAY['batch_id','ledger_entry_id']))))
  AND EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('public.referral_receipt_snapshots') AND conname='referral_receipt_snapshots_organization_external_id_digest_key' AND contype='u')
  AND EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('public.referral_payout_entries') AND conname='referral_payout_entries_pkey' AND contype='p')
  AND (SELECT count(*)=5 FROM pg_trigger WHERE NOT tgisinternal AND tgname=ANY(ARRAY['referral_commission_periods_immutable','referral_receipt_snapshots_immutable','referral_commission_ledger_immutable','referral_payout_entries_immutable','referral_payout_batches_guard']) AND tgenabled='O' AND tgtype=27
    AND (tgname,tgrelid,tgfoid) IN (
      ('referral_commission_periods_immutable',to_regclass('public.referral_commission_periods'),to_regprocedure('public.debugbundle_referral_financial_immutable()')),
      ('referral_receipt_snapshots_immutable',to_regclass('public.referral_receipt_snapshots'),to_regprocedure('public.debugbundle_referral_financial_immutable()')),
      ('referral_commission_ledger_immutable',to_regclass('public.referral_commission_ledger'),to_regprocedure('public.debugbundle_referral_financial_immutable()')),
      ('referral_payout_entries_immutable',to_regclass('public.referral_payout_entries'),to_regprocedure('public.debugbundle_referral_financial_immutable()')),
      ('referral_payout_batches_guard',to_regclass('public.referral_payout_batches'),to_regprocedure('public.debugbundle_referral_payout_guard()'))))`;
export const REFERRAL_LEDGER_MIGRATION = defineStorageSchemaMigration({
  id: "202611070007_add_referral_commission_ledger",
  description:
    "Retain immutable verified cash receipts, commission adjustments and atomically claimed manual payouts.",
  statements: [
    ...REFERRAL_LEDGER_BOOTSTRAP.map((sql) =>
      sql.startsWith("CREATE TRIGGER")
        ? `DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='${sql.split(" ")[2]}') THEN ${sql}; END IF; END $$`
        : sql
            .replace(/^CREATE TABLE /, "CREATE TABLE IF NOT EXISTS ")
            .replace(/^CREATE UNIQUE INDEX /, "CREATE UNIQUE INDEX IF NOT EXISTS ")
            .replace(/^CREATE INDEX /, "CREATE INDEX IF NOT EXISTS ")
    ),
    `DO $$ BEGIN IF NOT (${readySql}) THEN RAISE EXCEPTION 'referral_ledger_schema_incomplete'; END IF; END $$`
  ]
});
export async function referralLedgerSchemaAvailable(db: Queryable): Promise<boolean> {
  return (
    (await db.query<{ available: boolean }>(`SELECT (${readySql}) AS available`, [])).rows[0]
      ?.available === true
  );
}
