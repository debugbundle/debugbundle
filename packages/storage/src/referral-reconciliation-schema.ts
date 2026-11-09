import { defineStorageSchemaMigration } from "./schema-migration-definition.js";
import type { Queryable } from "./types.js";

export const REFERRAL_RECONCILIATION_TABLES = ["referral_reconciliation_events"] as const;
export const REFERRAL_RECONCILIATION_BOOTSTRAP = [
  `CREATE TABLE referral_reconciliation_events (
    event_id text PRIMARY KEY CHECK(length(event_id) BETWEEN 1 AND 255),
    event_type text NOT NULL CHECK(length(event_type) BETWEEN 1 AND 100),
    resource_type text NOT NULL CHECK(resource_type IN ('invoice','invoice_payment','charge','refund','dispute','credit_note','checkout_session')),
    resource_id text NOT NULL CHECK(length(resource_id) BETWEEN 1 AND 255),
    provider_customer_id text CHECK(length(provider_customer_id) BETWEEN 1 AND 255),
    organization_external_id uuid,
    owner_identity_hash text CHECK(owner_identity_hash ~ '^[a-f0-9]{64}$'),
    livemode boolean NOT NULL, provider_created_at timestamptz NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed')),
    dispatch_generation integer NOT NULL DEFAULT 0 CHECK(dispatch_generation>=0),
    worker_job_id text, next_dispatch_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
    CHECK((organization_external_id IS NULL)=(owner_identity_hash IS NULL)),
    CHECK(organization_external_id IS NULL OR provider_customer_id IS NOT NULL),
    CHECK((status='completed')=(completed_at IS NOT NULL))
  )`,
  `CREATE INDEX referral_reconciliation_pending_idx ON referral_reconciliation_events(next_dispatch_at,event_id) WHERE status='pending'`,
  `CREATE INDEX referral_reconciliation_scope_idx ON referral_reconciliation_events(organization_external_id) WHERE status='pending'`,
  `CREATE INDEX referral_reconciliation_customer_idx ON referral_reconciliation_events(provider_customer_id) WHERE organization_external_id IS NOT NULL`,
  `CREATE OR REPLACE FUNCTION debugbundle_referral_reconciliation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    IF TG_OP='DELETE' OR (OLD.event_id,OLD.event_type,OLD.resource_type,OLD.resource_id,OLD.livemode,OLD.provider_created_at,OLD.created_at)
      IS DISTINCT FROM (NEW.event_id,NEW.event_type,NEW.resource_type,NEW.resource_id,NEW.livemode,NEW.provider_created_at,NEW.created_at)
      OR (OLD.provider_customer_id IS NOT NULL AND OLD.provider_customer_id IS DISTINCT FROM NEW.provider_customer_id)
      OR (OLD.organization_external_id IS NOT NULL AND (OLD.organization_external_id,OLD.owner_identity_hash) IS DISTINCT FROM (NEW.organization_external_id,NEW.owner_identity_hash))
      OR (OLD.status='completed' AND NEW IS DISTINCT FROM OLD) THEN RAISE EXCEPTION 'referral_reconciliation_identity_immutable'; END IF;
    RETURN NEW;
  END $$`,
  `CREATE TRIGGER referral_reconciliation_events_guard BEFORE UPDATE OR DELETE ON referral_reconciliation_events FOR EACH ROW EXECUTE FUNCTION debugbundle_referral_reconciliation_guard()`
] as const;
const readySql = `SELECT to_regclass('public.referral_reconciliation_events') IS NOT NULL
  AND (SELECT count(*)=15 FROM information_schema.columns WHERE table_schema='public' AND table_name='referral_reconciliation_events' AND column_name=ANY(ARRAY['event_id','event_type','resource_type','resource_id','provider_customer_id','organization_external_id','owner_identity_hash','livemode','provider_created_at','status','dispatch_generation','worker_job_id','next_dispatch_at','created_at','completed_at']))
  AND to_regclass('public.referral_reconciliation_pending_idx') IS NOT NULL
  AND to_regclass('public.referral_reconciliation_scope_idx') IS NOT NULL
  AND to_regclass('public.referral_reconciliation_customer_idx') IS NOT NULL
  AND EXISTS(SELECT 1 FROM pg_trigger WHERE NOT tgisinternal AND tgname='referral_reconciliation_events_guard' AND tgenabled='O' AND tgtype=27
    AND tgrelid=to_regclass('public.referral_reconciliation_events') AND tgfoid=to_regprocedure('public.debugbundle_referral_reconciliation_guard()'))`;
export const REFERRAL_RECONCILIATION_MIGRATION = defineStorageSchemaMigration({
  id: "202611070008_add_referral_reconciliation_outbox",
  description:
    "Retain financial handoffs beyond job and account deletion, with immutable provider identity.",
  statements: [
    ...REFERRAL_RECONCILIATION_BOOTSTRAP.map((sql) =>
      sql.startsWith("CREATE TRIGGER")
        ? `DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='referral_reconciliation_events_guard') THEN ${sql}; END IF; END $$`
        : sql
            .replace(/^CREATE TABLE /, "CREATE TABLE IF NOT EXISTS ")
            .replace(/^CREATE INDEX /, "CREATE INDEX IF NOT EXISTS ")
    ),
    `DO $$ BEGIN IF NOT (${readySql}) THEN RAISE EXCEPTION 'referral_reconciliation_schema_incomplete'; END IF; END $$`
  ]
});
export async function referralReconciliationSchemaAvailable(db: Queryable): Promise<boolean> {
  return (
    (await db.query<{ available: boolean }>(`SELECT (${readySql}) AS available`, [])).rows[0]
      ?.available === true
  );
}
