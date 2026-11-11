import { defineStorageSchemaMigration } from "./schema-migration-definition.js";
import type { Queryable } from "./types.js";

export const REPORT_PRODUCT_MODE_COLUMN =
  "report_mode text NOT NULL DEFAULT 'ai' CHECK(report_mode IN ('factual','ai'))";
/** Historical migration strings/checksums stay frozen. A downgrade pauses
 * incompatible definitions; compatible factual schedules retain their scope. */
export const REPORT_PRODUCT_GUARD = `CREATE OR REPLACE FUNCTION debugbundle_pause_report_definitions() RETURNS trigger LANGUAGE plpgsql AS $$
 DECLARE cap integer; projects_cap integer; recipients_cap integer;
 BEGIN
  IF NEW.plan IS NOT DISTINCT FROM OLD.plan THEN RETURN NULL; END IF;
  IF (CASE NEW.plan WHEN 'business' THEN 3 WHEN 'team' THEN 2 WHEN 'solo' THEN 1 ELSE 0 END)
    >=(CASE OLD.plan WHEN 'business' THEN 3 WHEN 'team' THEN 2 WHEN 'solo' THEN 1 ELSE 0 END) THEN RETURN NULL; END IF;
  cap:=CASE NEW.plan WHEN 'business' THEN 5 WHEN 'team' THEN 2 WHEN 'solo' THEN 1 ELSE 0 END;
  projects_cap:=CASE NEW.plan WHEN 'business' THEN 10 WHEN 'team' THEN 5 WHEN 'solo' THEN 3 ELSE 0 END;
  recipients_cap:=CASE NEW.plan WHEN 'business' THEN 10 WHEN 'team' THEN 5 WHEN 'solo' THEN 1 ELSE 0 END;
  UPDATE report_definitions d SET requires_owner_review=true,pause_reason='plan_lost',paused_at=statement_timestamp(),
    version=version+1,updated_at=statement_timestamp()
  WHERE organization_id=NEW.id AND (cap=0 OR report_mode='ai' OR jsonb_array_length(accepted_scope)>projects_cap
    OR cardinality(recipient_user_ids)>recipients_cap OR (NEW.plan='solo' AND cadence<>'monthly')
    OR (NEW.plan='team' AND cadence='daily') OR (SELECT count(*) FROM report_definitions WHERE organization_id=NEW.id)>cap);
  RETURN NULL;
 END $$`;
export const REPORT_PRODUCT_RUN_CONSTRAINT = `CONSTRAINT report_runs_factual_no_ai CHECK(report_mode<>'factual' OR (ai_profile IS NULL AND ai_reserved_nano_usd=0 AND paid_attempts=0 AND ai_status='unavailable'))`;
const readySql = `EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='report_definitions' AND column_name='report_mode' AND is_nullable='NO')
 AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='report_runs' AND column_name='report_mode' AND is_nullable='NO')
 AND EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('public.report_runs') AND conname='report_runs_factual_no_ai' AND convalidated)
 AND position('projects_cap' in pg_get_functiondef(to_regprocedure('public.debugbundle_pause_report_definitions()')))>0`;
export const REPORT_PRODUCT_MIGRATION = defineStorageSchemaMigration({
  id: "202611100002_add_factual_report_products",
  description:
    "Freeze intended factual or AI report mode and pause incompatible tier transitions without changing paid receipts.",
  statements: [
    `ALTER TABLE report_definitions ADD COLUMN ${REPORT_PRODUCT_MODE_COLUMN}`,
    `ALTER TABLE report_runs ADD COLUMN ${REPORT_PRODUCT_MODE_COLUMN}`,
    `ALTER TABLE report_runs ADD ${REPORT_PRODUCT_RUN_CONSTRAINT}`,
    REPORT_PRODUCT_GUARD,
    `DO $$ BEGIN IF NOT (${readySql}) THEN RAISE EXCEPTION 'report_product_schema_incomplete'; END IF; END $$`
  ]
});
export async function reportProductSchemaAvailable(db: Queryable): Promise<boolean> {
  return (
    (await db.query<{ available: boolean }>(`SELECT (${readySql}) AS available`, [])).rows[0]
      ?.available === true
  );
}
