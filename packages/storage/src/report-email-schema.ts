import { defineStorageSchemaMigration } from "./schema-migration-definition.js";
import type { Queryable } from "./types.js";
export const REPORT_EMAIL_TABLES = ["report_email_deliveries"] as const;
export const REPORT_EMAIL_BOOTSTRAP = [
  `CREATE TABLE report_email_deliveries (
 id uuid PRIMARY KEY,organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 run_id uuid REFERENCES report_runs(id) ON DELETE SET NULL,recipient_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
 job_id text UNIQUE REFERENCES worker_jobs(id) ON DELETE SET NULL,expected_ready_sha256 text NOT NULL CHECK(expected_ready_sha256 ~ '^[a-f0-9]{64}$'),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sending','accepted','failed','uncertain','suppressed','cancelled')),
 reason text,attempt_id uuid,provider_message_id text CHECK(length(provider_message_id)<=255),
 allowance_state text NOT NULL DEFAULT 'none' CHECK(allowance_state IN ('none','held','charged','released')),
 allowance_window_starts_at timestamptz,allowance_window_ends_at timestamptz,allowance_reserved_at timestamptz,
 send_deadline_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),accepted_at timestamptz,
 UNIQUE(run_id,recipient_user_id),CHECK(allowance_state NOT IN ('held','charged') OR (allowance_window_starts_at IS NOT NULL AND allowance_window_ends_at>allowance_window_starts_at AND allowance_reserved_at IS NOT NULL)),
 CHECK(status NOT IN ('sending','accepted','uncertain') OR attempt_id IS NOT NULL))`,
  `CREATE INDEX report_email_deliveries_usage_idx ON report_email_deliveries(organization_id,allowance_window_starts_at) WHERE allowance_state IN ('held','charged')`,
  `CREATE INDEX report_email_deliveries_expiry_idx ON report_email_deliveries(expires_at,id)`,
  `CREATE INDEX report_runs_email_due_idx ON report_runs(published_at,organization_id,id) WHERE send_email AND email_scheduled_at IS NULL AND status IN ('ready','factual_only')`,
  `CREATE OR REPLACE FUNCTION debugbundle_stop_report_email() RETURNS trigger LANGUAGE plpgsql AS $$
 DECLARE target uuid;
 BEGIN
  IF TG_OP='DELETE' THEN target:=OLD.id;
  ELSE
   IF NEW.privacy_invalidated_at IS NULL AND NEW.status NOT IN ('cancelled','expired','paused_access') THEN RETURN NULL; END IF;
   target:=NEW.id;
  END IF;
  UPDATE worker_jobs SET status='skipped',payload=NULL,lease_token=NULL,lease_expires_at=NULL,last_error_code='report_unavailable',updated_at=clock_timestamp()
   WHERE id IN(SELECT job_id FROM report_email_deliveries WHERE run_id=target) AND status IN ('pending','running');
  UPDATE report_email_deliveries SET status=CASE WHEN status='sending' THEN 'uncertain' ELSE 'cancelled' END,
   reason='report_unavailable',allowance_state=CASE WHEN status='queued' AND allowance_state='held' THEN 'released' ELSE allowance_state END,updated_at=clock_timestamp()
   WHERE run_id=target AND status IN ('queued','sending');
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;RETURN NULL;
 END $$`,
  `CREATE TRIGGER report_runs_email_delete_guard BEFORE DELETE ON report_runs FOR EACH ROW EXECUTE FUNCTION debugbundle_stop_report_email()`,
  `CREATE TRIGGER report_runs_email_privacy_guard AFTER UPDATE OF privacy_invalidated_at,status ON report_runs FOR EACH ROW EXECUTE FUNCTION debugbundle_stop_report_email()`
] as const;
const columns = [
  "id",
  "organization_id",
  "run_id",
  "recipient_user_id",
  "job_id",
  "expected_ready_sha256",
  "status",
  "reason",
  "attempt_id",
  "provider_message_id",
  "allowance_state",
  "allowance_window_starts_at",
  "allowance_window_ends_at",
  "allowance_reserved_at",
  "send_deadline_at",
  "expires_at",
  "created_at",
  "updated_at",
  "accepted_at"
];
const readySql = `to_regclass('public.report_email_deliveries') IS NOT NULL
 AND (SELECT count(*)=${columns.length} FROM information_schema.columns WHERE table_schema='public' AND table_name='report_email_deliveries' AND column_name=ANY(ARRAY[${columns.map((name) => `'${name}'`).join(",")}]))
 AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='report_runs' AND column_name='email_scheduled_at')
 AND to_regclass('public.report_email_deliveries_usage_idx') IS NOT NULL AND to_regclass('public.report_email_deliveries_expiry_idx') IS NOT NULL AND to_regclass('public.report_runs_email_due_idx') IS NOT NULL
 AND EXISTS(SELECT 1 FROM pg_trigger WHERE NOT tgisinternal AND tgname='report_runs_email_delete_guard' AND tgtype=11 AND tgenabled='O' AND tgrelid=to_regclass('public.report_runs') AND tgfoid=to_regprocedure('public.debugbundle_stop_report_email()'))
 AND EXISTS(SELECT 1 FROM pg_trigger WHERE NOT tgisinternal AND tgname='report_runs_email_privacy_guard' AND tgtype=17 AND tgenabled='O' AND tgrelid=to_regclass('public.report_runs') AND tgfoid=to_regprocedure('public.debugbundle_stop_report_email()'))`;
export const REPORT_EMAIL_MIGRATION = defineStorageSchemaMigration({
  id: "202611070014_add_report_email_delivery",
  description:
    "Fence canonical report recipient sends and retain minimal provider acceptance and notification allowance receipts.",
  statements: [
    `ALTER TABLE report_runs ADD COLUMN IF NOT EXISTS email_scheduled_at timestamptz`,
    ...REPORT_EMAIL_BOOTSTRAP.map((sql) =>
      sql.startsWith("CREATE TRIGGER")
        ? `DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='${sql.split(" ")[2]}') THEN ${sql}; END IF; END $$`
        : sql
            .replace(/^CREATE TABLE /, "CREATE TABLE IF NOT EXISTS ")
            .replace(/^CREATE UNIQUE INDEX /, "CREATE UNIQUE INDEX IF NOT EXISTS ")
            .replace(/^CREATE INDEX /, "CREATE INDEX IF NOT EXISTS ")
    ),
    `DO $$ BEGIN IF NOT (${readySql}) THEN RAISE EXCEPTION 'report_email_schema_incomplete'; END IF; END $$`
  ]
});
export async function reportEmailSchemaAvailable(db: Queryable): Promise<boolean> {
  return (
    (await db.query<{ available: boolean }>(`SELECT (${readySql}) AS available`, [])).rows[0]
      ?.available === true
  );
}
