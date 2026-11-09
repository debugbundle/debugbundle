import { defineStorageSchemaMigration } from "./schema-migration-definition.js";
import type { Queryable } from "./types.js";
export const REFERRAL_BENEFIT_TABLES = ["referral_invoice_benefits"] as const;
export const REFERRAL_BENEFIT_BOOTSTRAP = [
  `CREATE TABLE referral_invoice_benefits (
 owner_identity_hash text PRIMARY KEY CHECK(owner_identity_hash ~ '^[a-f0-9]{64}$'),
 attribution_id uuid NOT NULL UNIQUE REFERENCES referral_attributions(id),organization_external_id uuid NOT NULL,
 coupon_id text NOT NULL CHECK(length(coupon_id) BETWEEN 1 AND 255),checkout_attempt_id uuid,
 provider_customer_id text CHECK(length(provider_customer_id) BETWEEN 1 AND 255),provider_subscription_id text CHECK(length(provider_subscription_id) BETWEEN 1 AND 255),
 eligible_invoice_id text UNIQUE CHECK(length(eligible_invoice_id) BETWEEN 1 AND 255),
 recovery_invoice_id text CHECK(length(recovery_invoice_id) BETWEEN 1 AND 255),recovery_requested_at timestamptz,recovery_completed_at timestamptz,
 CHECK((recovery_invoice_id IS NULL)=(recovery_requested_at IS NULL)),CHECK(recovery_completed_at IS NULL OR recovery_requested_at IS NOT NULL),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE INDEX referral_invoice_benefits_org_idx ON referral_invoice_benefits(organization_external_id)`,
  `CREATE OR REPLACE FUNCTION debugbundle_preserve_referral_invoice_benefit() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN
 IF OLD.owner_identity_hash IS DISTINCT FROM NEW.owner_identity_hash OR OLD.attribution_id IS DISTINCT FROM NEW.attribution_id
 OR OLD.organization_external_id IS DISTINCT FROM NEW.organization_external_id
 OR (OLD.eligible_invoice_id IS NOT NULL AND (OLD.eligible_invoice_id,OLD.coupon_id,OLD.provider_customer_id,OLD.provider_subscription_id)
   IS DISTINCT FROM (NEW.eligible_invoice_id,NEW.coupon_id,NEW.provider_customer_id,NEW.provider_subscription_id))
 THEN RAISE EXCEPTION 'referral_invoice_benefit_immutable';END IF;
 RETURN NEW;
 END $$`,
  `CREATE TRIGGER referral_invoice_benefit_guard BEFORE UPDATE ON referral_invoice_benefits FOR EACH ROW EXECUTE FUNCTION debugbundle_preserve_referral_invoice_benefit()`
] as const;
const readySql = `to_regclass('public.referral_invoice_benefits') IS NOT NULL
 AND (SELECT count(*)=13 FROM information_schema.columns WHERE table_schema='public' AND table_name='referral_invoice_benefits' AND column_name=ANY(ARRAY['owner_identity_hash','attribution_id','organization_external_id','coupon_id','checkout_attempt_id','provider_customer_id','provider_subscription_id','eligible_invoice_id','recovery_invoice_id','recovery_requested_at','recovery_completed_at','created_at','updated_at']))
 AND to_regclass('public.referral_invoice_benefits_org_idx') IS NOT NULL
 AND EXISTS(SELECT 1 FROM pg_trigger WHERE NOT tgisinternal AND tgname='referral_invoice_benefit_guard' AND tgenabled='O' AND tgtype=19 AND tgrelid=to_regclass('public.referral_invoice_benefits') AND tgfoid=to_regprocedure('public.debugbundle_preserve_referral_invoice_benefit()'))`;
export const REFERRAL_BENEFIT_MIGRATION = defineStorageSchemaMigration({
  id: "202611070017_add_referral_invoice_benefit",
  description:
    "Freeze the first eligible Business invoice benefit and retain identity-level reuse prevention.",
  statements: [
    ...REFERRAL_BENEFIT_BOOTSTRAP.map((sql) =>
      sql.startsWith("CREATE TRIGGER")
        ? `DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='referral_invoice_benefit_guard') THEN ${sql}; END IF; END $$`
        : sql
            .replace(/^CREATE TABLE /, "CREATE TABLE IF NOT EXISTS ")
            .replace(/^CREATE INDEX /, "CREATE INDEX IF NOT EXISTS ")
    ),
    `DO $$ BEGIN IF NOT (${readySql}) THEN RAISE EXCEPTION 'referral_benefit_schema_incomplete'; END IF; END $$`
  ]
});
export async function referralBenefitSchemaAvailable(db: Queryable): Promise<boolean> {
  return (
    (await db.query<{ available: boolean }>(`SELECT (${readySql}) AS available`, [])).rows[0]
      ?.available === true
  );
}
