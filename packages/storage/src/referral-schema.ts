import { defineStorageSchemaMigration } from "./schema-migration-definition.js";
import type { Queryable } from "./types.js";

export const REFERRAL_TABLES = [
  "referral_partners",
  "referral_attributions",
  "billing_customer_history"
] as const;
export const REFERRAL_BOOTSTRAP = [
  `CREATE TABLE referral_partners (
    id uuid PRIMARY KEY, user_id uuid UNIQUE REFERENCES users(id) ON DELETE SET NULL,
    identity_hash text NOT NULL CHECK(identity_hash ~ '^[a-f0-9]{64}$'),
    code text NOT NULL UNIQUE CHECK(code ~ '^[A-Z2-7]{10}$'),
    status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused')),
    terms_version text NOT NULL, commission_basis_points integer NOT NULL CHECK(commission_basis_points=5000),
    accepted_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE referral_attributions (
    id uuid PRIMARY KEY, partner_id uuid NOT NULL REFERENCES referral_partners(id),
    organization_id uuid UNIQUE REFERENCES organizations(id) ON DELETE SET NULL,
    organization_external_id uuid NOT NULL UNIQUE,
    owner_identity_hash text NOT NULL CHECK(owner_identity_hash ~ '^[a-f0-9]{64}$'),
    source text NOT NULL CHECK(source IN ('link','manual')),
    reserved_checkout_attempt_id uuid,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX referral_attributions_partner_idx ON referral_attributions(partner_id,created_at,id)`,
  `CREATE TABLE billing_customer_history (
    organization_external_id uuid PRIMARY KEY,
    owner_identity_hash text NOT NULL CHECK(owner_identity_hash ~ '^[a-f0-9]{64}$'),
    first_cash_at timestamptz NOT NULL, provider_invoice_id text NOT NULL, provider_payment_id text NOT NULL
  )`,
  `CREATE INDEX billing_customer_history_identity_idx ON billing_customer_history(owner_identity_hash)`
] as const;
const referralReadySql = `SELECT to_regclass('public.referral_partners') IS NOT NULL
  AND to_regclass('public.referral_attributions') IS NOT NULL AND to_regclass('public.billing_customer_history') IS NOT NULL
  AND to_regclass('public.referral_attributions_partner_idx') IS NOT NULL
  AND to_regclass('public.billing_customer_history_identity_idx') IS NOT NULL
  AND (SELECT COUNT(*)=22 FROM information_schema.columns WHERE table_schema='public' AND (
    (table_name='referral_partners' AND column_name=ANY(ARRAY['id','user_id','identity_hash','code','status','terms_version','commission_basis_points','accepted_at'])) OR
    (table_name='referral_attributions' AND column_name=ANY(ARRAY['id','partner_id','organization_id','organization_external_id','owner_identity_hash','source','reserved_checkout_attempt_id','created_at','updated_at'])) OR
    (table_name='billing_customer_history' AND column_name=ANY(ARRAY['organization_external_id','owner_identity_hash','first_cash_at','provider_invoice_id','provider_payment_id']))))
  AND EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('public.referral_partners')
    AND conname='referral_partners_commission_basis_points_check' AND contype='c'
    AND position('commission_basis_points = 5000)' in pg_get_constraintdef(oid))>0)
  AND EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('public.referral_partners')
    AND conname='referral_partners_user_id_fkey' AND confdeltype='n')
  AND EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('public.referral_attributions')
    AND conname='referral_attributions_organization_id_fkey' AND confdeltype='n')
  AND EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('public.referral_attributions')
    AND conname='referral_attributions_organization_external_id_key' AND contype='u')`;
export const REFERRAL_MIGRATION = defineStorageSchemaMigration({
  id: "202611070006_add_referral_attribution",
  description:
    "Keep partner terms, customer attribution and minimum durable prior-payment identity separate from project access.",
  statements: [
    ...REFERRAL_BOOTSTRAP.map((sql) =>
      sql
        .replace(/^CREATE TABLE /, "CREATE TABLE IF NOT EXISTS ")
        .replace(/^CREATE INDEX /, "CREATE INDEX IF NOT EXISTS ")
    ),
    `DO $$ BEGIN IF NOT (${referralReadySql}) THEN RAISE EXCEPTION 'referral_schema_incomplete'; END IF; END $$`
  ]
});
export async function referralSchemaAvailable(db: Queryable): Promise<boolean> {
  const result = await db.query<{ available: boolean }>(
    `SELECT (${referralReadySql}) AS available`,
    []
  );
  return result.rows[0]?.available === true;
}
