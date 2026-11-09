import { defineStorageSchemaMigration } from "./schema-migration-definition.js";
import type { Queryable } from "./types.js";
export const REPORT_COLLECTOR_TABLES = ["report_collection_progress"] as const;
export const REPORT_COLLECTOR_BOOTSTRAP = [
  `CREATE TABLE report_collection_progress (
 definition_id uuid PRIMARY KEY REFERENCES report_definitions(id) ON DELETE CASCADE,
 definition_version integer NOT NULL CHECK(definition_version>0),
 cursor jsonb NOT NULL CHECK(jsonb_typeof(cursor)='object'),
 next_due_at timestamptz NOT NULL,last_processed_at timestamptz NOT NULL,
 last_error_code text CHECK(last_error_code='collection_failed'))`,
  `CREATE INDEX report_collection_progress_due_idx ON report_collection_progress(next_due_at,definition_id)`
] as const;
const readySql = `to_regclass('public.report_collection_progress') IS NOT NULL
 AND (SELECT count(*)=6 FROM information_schema.columns WHERE table_schema='public' AND table_name='report_collection_progress' AND column_name=ANY(ARRAY['definition_id','definition_version','cursor','next_due_at','last_processed_at','last_error_code']))
 AND to_regclass('public.report_collection_progress_due_idx') IS NOT NULL`;
export const REPORT_COLLECTOR_MIGRATION = defineStorageSchemaMigration({
  id: "202611070015_add_report_collection_progress",
  description:
    "Resume bounded opted-in report history collection without blocking other definitions.",
  statements: [
    ...REPORT_COLLECTOR_BOOTSTRAP.map((sql) =>
      sql
        .replace(/^CREATE TABLE /, "CREATE TABLE IF NOT EXISTS ")
        .replace(/^CREATE INDEX /, "CREATE INDEX IF NOT EXISTS ")
    ),
    `DO $$ BEGIN IF NOT (${readySql}) THEN RAISE EXCEPTION 'report_collector_schema_incomplete'; END IF; END $$`
  ]
});
export async function reportCollectorSchemaAvailable(db: Queryable): Promise<boolean> {
  return (
    (await db.query<{ available: boolean }>(`SELECT (${readySql}) AS available`, [])).rows[0]
      ?.available === true
  );
}
