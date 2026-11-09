import { defineStorageSchemaMigration } from "./schema-migration-definition.js";
import type { Queryable } from "./types.js";

export const REPORT_SOURCE_TEXT_TABLES = ["report_source_text"] as const;
export const REPORT_SOURCE_TEXT_BOOTSTRAP = [
  `CREATE TABLE report_source_text (
    definition_id uuid NOT NULL REFERENCES report_definitions(id) ON DELETE CASCADE,
    selected_project_id uuid NOT NULL,origin_project_id uuid NOT NULL,
    source_type text NOT NULL CHECK(source_type IN ('incident','improvement')),source_id uuid NOT NULL,
    summary_group text NOT NULL CHECK(summary_group IN ('urgent','resolved','recent')),
    text_expires_at timestamptz NOT NULL,
    summary jsonb NOT NULL CHECK(jsonb_typeof(summary)='object' AND octet_length(summary::text)<=12288),
    PRIMARY KEY(definition_id,selected_project_id,origin_project_id,source_type,source_id),
    CHECK(summary->>'selected_project_id'=selected_project_id::text AND summary->>'origin_project_id'=origin_project_id::text
      AND summary->>'source_type'=source_type AND summary->>'source_id'=source_id::text AND summary->>'summary_group'=summary_group)
  )`,
  `CREATE INDEX report_source_text_expiry_idx ON report_source_text(text_expires_at,definition_id)`,
  // Routine source pruning cannot erase this bounded summary. Explicit source
  // project deletion removes the entire definition through its existing guard.
  `CREATE OR REPLACE FUNCTION debugbundle_clear_report_source_text() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    IF NOT NEW.enabled OR NEW.paused_at IS NOT NULL OR NEW.requires_owner_review
      OR NEW.privacy_mode<>'full' OR NOT NEW.source_collection_consent
      OR OLD.accepted_scope IS DISTINCT FROM NEW.accepted_scope THEN
      DELETE FROM report_source_text WHERE definition_id=NEW.id;
    END IF;
    RETURN NULL;
  END $$`,
  `CREATE TRIGGER report_definitions_source_privacy_guard AFTER UPDATE OF enabled,paused_at,requires_owner_review,privacy_mode,source_collection_consent,accepted_scope
    ON report_definitions FOR EACH ROW EXECUTE FUNCTION debugbundle_clear_report_source_text()`
] as const;
const readySql = `SELECT to_regclass('public.report_source_text') IS NOT NULL
  AND (SELECT count(*)=8 FROM information_schema.columns WHERE table_schema='public' AND table_name='report_source_text'
    AND column_name=ANY(ARRAY['definition_id','selected_project_id','origin_project_id','source_type','source_id','summary_group','text_expires_at','summary']))
  AND to_regclass('public.report_source_text_expiry_idx') IS NOT NULL
  AND EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('public.report_source_text') AND contype='p')
  AND EXISTS(SELECT 1 FROM pg_trigger WHERE NOT tgisinternal AND tgname='report_definitions_source_privacy_guard' AND tgenabled='O' AND tgtype=17
    AND tgrelid=to_regclass('public.report_definitions') AND tgfoid=to_regprocedure('public.debugbundle_clear_report_source_text()'))`;
export const REPORT_SOURCE_TEXT_MIGRATION = defineStorageSchemaMigration({
  id: "202611070011_add_report_source_text",
  description:
    "Retain bounded redacted report summaries with original-content expiry and privacy deletion guards.",
  statements: [
    ...REPORT_SOURCE_TEXT_BOOTSTRAP.map((sql) =>
      sql.startsWith("CREATE TRIGGER")
        ? `DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='report_definitions_source_privacy_guard') THEN ${sql}; END IF; END $$`
        : sql
            .replace(/^CREATE TABLE /, "CREATE TABLE IF NOT EXISTS ")
            .replace(/^CREATE INDEX /, "CREATE INDEX IF NOT EXISTS ")
    ),
    `DO $$ BEGIN IF NOT (${readySql}) THEN RAISE EXCEPTION 'report_source_text_schema_incomplete'; END IF; END $$`
  ]
});
export async function reportSourceTextSchemaAvailable(db: Queryable): Promise<boolean> {
  return (
    (await db.query<{ available: boolean }>(`SELECT (${readySql}) AS available`, [])).rows[0]
      ?.available === true
  );
}
