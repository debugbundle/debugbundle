import { defineStorageSchemaMigration } from "./schema-migration-definition.js";
import { REPORT_ARTIFACT_BOOTSTRAP, REPORT_ARTIFACT_READY_SQL } from "./report-artifact-schema.js";
import type { Queryable } from "./types.js";
import {
  REPORT_PROJECT_PRIVACY_BOOTSTRAP,
  REPORT_PROJECT_PRIVACY_READY_SQL
} from "./report-project-privacy-schema.js";
import {
  REPORT_MODEL_ATTEMPT_BOOTSTRAP,
  REPORT_MODEL_ATTEMPT_READY_SQL
} from "./report-model-attempt-schema.js";
export const REPORT_RUN_TABLES = [
  "report_allowance_windows",
  "report_runs",
  "report_model_attempts",
  "report_artifact_objects"
] as const;
export const REPORT_RUN_BOOTSTRAP = [
  `CREATE TABLE report_allowance_windows (
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL,
 generations integer NOT NULL DEFAULT 0 CHECK(generations>=0),held_nano_usd bigint NOT NULL DEFAULT 0 CHECK(held_nano_usd>=0),
 spent_nano_usd bigint NOT NULL DEFAULT 0 CHECK(spent_nano_usd>=0),budget_limit_nano_usd bigint NOT NULL CHECK(budget_limit_nano_usd>=0),
 PRIMARY KEY(organization_id,starts_at),CHECK(ends_at>starts_at),CHECK(held_nano_usd+spent_nano_usd<=budget_limit_nano_usd))`,
  `CREATE TABLE report_runs (
 id uuid PRIMARY KEY,organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 definition_id uuid NOT NULL REFERENCES report_definitions(id) ON DELETE CASCADE,definition_version integer NOT NULL CHECK(definition_version>0),
 request_id uuid NOT NULL,request_digest text NOT NULL CHECK(request_digest ~ '^[a-f0-9]{64}$'),
 requested_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,initiating_authority jsonb NOT NULL CHECK(jsonb_typeof(initiating_authority)='object'),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 120),accepted_scope jsonb NOT NULL CHECK(jsonb_typeof(accepted_scope)='array' AND jsonb_array_length(accepted_scope) BETWEEN 1 AND 10),
 recipient_user_ids uuid[] NOT NULL CHECK(cardinality(recipient_user_ids)<=10),privacy_mode text NOT NULL CHECK(privacy_mode IN ('full','restricted')),
 source_collection_consent boolean NOT NULL,send_email boolean NOT NULL DEFAULT false,
 period_kind text NOT NULL CHECK(period_kind IN ('daily','weekly','monthly')),period_starts_at timestamptz NOT NULL,period_ends_at timestamptz NOT NULL,
 period_duration_days smallint NOT NULL CHECK(period_duration_days BETWEEN 1 AND 31),generation_kind text NOT NULL CHECK(generation_kind IN ('manual','scheduled','regeneration')),
 regenerate_from_run_id uuid REFERENCES report_runs(id) ON DELETE SET NULL,
 window_starts_at timestamptz NOT NULL,status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','ready','factual_only','failed','skipped_quota','paused_access','cancelled','expired')),
 ai_status text NOT NULL CHECK(ai_status IN ('unavailable','pending','succeeded','failed','uncertain')),
 skip_reason text CHECK(skip_reason IN ('generation_quota','ai_budget')),
 ai_profile jsonb CHECK(ai_profile IS NULL OR jsonb_typeof(ai_profile)='object'),ai_reserved_nano_usd bigint NOT NULL CHECK(ai_reserved_nano_usd>=0),
 paid_attempts smallint NOT NULL DEFAULT 0 CHECK(paid_attempts BETWEEN 0 AND 2),generation_counted boolean NOT NULL DEFAULT true,
 facts_object_key text,facts_sha256 text CHECK(facts_sha256 IS NULL OR facts_sha256 ~ '^[a-f0-9]{64}$'),
 ready_object_key text,ready_sha256 text CHECK(ready_sha256 IS NULL OR ready_sha256 ~ '^[a-f0-9]{64}$'),
 pdf_object_key text,pdf_sha256 text CHECK(pdf_sha256 IS NULL OR pdf_sha256 ~ '^[a-f0-9]{64}$'),
 privacy_invalidated_at timestamptz,
 processing_job_id text CHECK(processing_job_id IS NULL OR processing_job_id ~ '^[a-f0-9]{64}$'),
 pdf_job_id text CHECK(pdf_job_id IS NULL OR pdf_job_id ~ '^[a-f0-9]{64}$'),
 generation_deadline_at timestamptz NOT NULL DEFAULT (now()+interval '24 hours'),
 last_claimed_at timestamptz,lease_token uuid,lease_expires_at timestamptz,next_attempt_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),published_at timestamptz,expires_at timestamptz NOT NULL DEFAULT (now()+interval '90 days'),
 UNIQUE(organization_id,request_id),FOREIGN KEY(organization_id,window_starts_at) REFERENCES report_allowance_windows(organization_id,starts_at),
 CHECK(period_ends_at>period_starts_at),CHECK(privacy_mode='restricted' OR source_collection_consent),CHECK((lease_token IS NULL)=(lease_expires_at IS NULL)),
 CHECK(skip_reason IS NULL OR NOT generation_counted),CHECK(status<>'skipped_quota' OR (skip_reason IS NOT NULL AND NOT generation_counted AND ai_reserved_nano_usd=0 AND paid_attempts=0 AND processing_job_id IS NULL)))`,
  `CREATE UNIQUE INDEX report_runs_scheduled_period_idx ON report_runs(definition_id,period_kind,period_starts_at,period_ends_at) WHERE generation_kind='scheduled'`,
  `CREATE INDEX report_runs_organization_idx ON report_runs(organization_id,created_at DESC,id)`,
  `CREATE INDEX report_runs_pending_idx ON report_runs(next_attempt_at,organization_id,id) WHERE status IN ('queued','processing')`,
  `CREATE INDEX report_runs_deadline_idx ON report_runs(generation_deadline_at,organization_id,id) WHERE status IN ('queued','processing')`,
  `CREATE UNIQUE INDEX report_runs_pdf_job_idx ON report_runs(pdf_job_id) WHERE pdf_job_id IS NOT NULL`,
  `CREATE INDEX report_runs_expiry_idx ON report_runs(expires_at,id) WHERE expires_at IS NOT NULL`,
  `CREATE INDEX report_runs_scope_idx ON report_runs USING gin(accepted_scope jsonb_path_ops)`,
  `CREATE INDEX report_runs_fair_organization_idx ON report_runs(organization_id,last_claimed_at DESC) WHERE last_claimed_at IS NOT NULL`,
  ...REPORT_MODEL_ATTEMPT_BOOTSTRAP,
  ...REPORT_ARTIFACT_BOOTSTRAP,
  ...REPORT_PROJECT_PRIVACY_BOOTSTRAP,
  `CREATE OR REPLACE FUNCTION debugbundle_release_unstarted_report_run() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    UPDATE worker_jobs SET status='skipped',payload=NULL,lease_token=NULL,lease_expires_at=NULL,last_error_code='report_deleted',updated_at=clock_timestamp() WHERE id IN(OLD.processing_job_id,OLD.pdf_job_id) AND status IN ('pending','running');
    UPDATE report_model_attempts SET narrative_json=NULL WHERE run_id=OLD.id AND narrative_json IS NOT NULL;
    UPDATE report_artifact_objects SET state='deleting',cleanup_after_at=GREATEST(clock_timestamp()+interval '2 minutes',write_deadline_at+interval '2 minutes') WHERE run_id=OLD.id;
    IF OLD.paid_attempts=0 THEN
      UPDATE report_allowance_windows SET generations=generations-CASE WHEN OLD.generation_counted AND OLD.facts_object_key IS NULL THEN 1 ELSE 0 END,held_nano_usd=held_nano_usd-OLD.ai_reserved_nano_usd
        WHERE organization_id=OLD.organization_id AND starts_at=OLD.window_starts_at;
    END IF;RETURN NULL;
  END $$`,
  `CREATE TRIGGER report_runs_unstarted_delete_guard AFTER DELETE ON report_runs FOR EACH ROW EXECUTE FUNCTION debugbundle_release_unstarted_report_run()`
] as const;
const runColumns = [
  "id",
  "organization_id",
  "definition_id",
  "definition_version",
  "request_id",
  "request_digest",
  "requested_by_user_id",
  "initiating_authority",
  "name",
  "accepted_scope",
  "recipient_user_ids",
  "privacy_mode",
  "source_collection_consent",
  "send_email",
  "period_kind",
  "period_starts_at",
  "period_ends_at",
  "period_duration_days",
  "generation_kind",
  "regenerate_from_run_id",
  "window_starts_at",
  "status",
  "skip_reason",
  "ai_status",
  "ai_profile",
  "ai_reserved_nano_usd",
  "paid_attempts",
  "generation_counted",
  "facts_object_key",
  "facts_sha256",
  "ready_object_key",
  "ready_sha256",
  "pdf_object_key",
  "pdf_sha256",
  "processing_job_id",
  "pdf_job_id",
  "privacy_invalidated_at",
  "generation_deadline_at",
  "lease_token",
  "last_claimed_at",
  "lease_expires_at",
  "next_attempt_at",
  "created_at",
  "updated_at",
  "published_at",
  "expires_at"
];
const readySql = `SELECT (${REPORT_PROJECT_PRIVACY_READY_SQL}) AND (${REPORT_ARTIFACT_READY_SQL}) AND (${REPORT_MODEL_ATTEMPT_READY_SQL}) AND to_regclass('public.report_allowance_windows') IS NOT NULL AND to_regclass('public.report_runs') IS NOT NULL
 AND (SELECT count(*)=${runColumns.length} FROM information_schema.columns WHERE table_schema='public' AND table_name='report_runs' AND column_name=ANY(ARRAY[${runColumns.map((column) => `'${column}'`).join(",")}]))
 AND (SELECT count(*)=7 FROM information_schema.columns WHERE table_schema='public' AND table_name='report_allowance_windows' AND column_name=ANY(ARRAY['organization_id','starts_at','ends_at','generations','held_nano_usd','spent_nano_usd','budget_limit_nano_usd']))
 AND to_regclass('public.report_runs_scheduled_period_idx') IS NOT NULL AND to_regclass('public.report_runs_organization_idx') IS NOT NULL
 AND to_regclass('public.report_runs_pending_idx') IS NOT NULL AND to_regclass('public.report_runs_expiry_idx') IS NOT NULL AND to_regclass('public.report_runs_scope_idx') IS NOT NULL
 AND to_regclass('public.report_runs_fair_organization_idx') IS NOT NULL
 AND to_regclass('public.report_runs_deadline_idx') IS NOT NULL
 AND to_regclass('public.report_runs_pdf_job_idx') IS NOT NULL
 AND EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('public.report_runs') AND conname='report_runs_organization_id_request_id_key' AND contype='u')
 AND EXISTS(SELECT 1 FROM pg_trigger WHERE NOT tgisinternal AND tgname='report_runs_unstarted_delete_guard' AND tgtype=9 AND tgenabled='O' AND tgrelid=to_regclass('public.report_runs')
 AND tgfoid=to_regprocedure('public.debugbundle_release_unstarted_report_run()'))`;
export const REPORT_RUN_MIGRATION = defineStorageSchemaMigration({
  id: "202611070013_add_report_run_admission",
  description:
    "Freeze report run scopes and atomically share monthly generation and AI allocations.",
  statements: [
    ...REPORT_RUN_BOOTSTRAP.map((sql) =>
      sql.startsWith("CREATE TRIGGER")
        ? `DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='${sql.split(" ")[2]}') THEN ${sql}; END IF; END $$`
        : sql
            .replace(/^CREATE TABLE /, "CREATE TABLE IF NOT EXISTS ")
            .replace(/^CREATE UNIQUE INDEX /, "CREATE UNIQUE INDEX IF NOT EXISTS ")
            .replace(/^CREATE INDEX /, "CREATE INDEX IF NOT EXISTS ")
    ),
    `DO $$ BEGIN IF NOT (${readySql}) THEN RAISE EXCEPTION 'report_run_schema_incomplete'; END IF; END $$`
  ]
});
export async function reportRunSchemaAvailable(db: Queryable): Promise<boolean> {
  return (
    (await db.query<{ available: boolean }>(`SELECT (${readySql}) AS available`, [])).rows[0]
      ?.available === true
  );
}
