import { defineStorageSchemaMigration } from "./schema-migration-definition.js";
import type { Queryable } from "./types.js";
export const REPORT_HEALTH_TABLES = ["report_health_recoveries"] as const;
export const REPORT_HEALTH_BOOTSTRAP = [
  `CREATE TABLE report_health_recoveries (
 project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 result_id uuid NOT NULL,check_id uuid NOT NULL,occurred_at timestamptz NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT statement_timestamp(),PRIMARY KEY(project_id,result_id))`,
  `CREATE INDEX report_health_recoveries_period_idx ON report_health_recoveries(project_id,occurred_at,result_id)`,
  `CREATE INDEX report_health_recoveries_expiry_idx ON report_health_recoveries(occurred_at,project_id,result_id)`
] as const;
const readySql = `to_regclass('public.report_health_recoveries') IS NOT NULL
 AND (SELECT count(*)=5 FROM information_schema.columns WHERE table_schema='public' AND table_name='report_health_recoveries' AND column_name=ANY(ARRAY['project_id','result_id','check_id','occurred_at','recorded_at']))
 AND to_regclass('public.report_health_recoveries_period_idx') IS NOT NULL AND to_regclass('public.report_health_recoveries_expiry_idx') IS NOT NULL`;
export const REPORT_HEALTH_MIGRATION = defineStorageSchemaMigration({
  id: "202611070016_add_report_health_recovery_facts",
  description:
    "Retain numeric observed health recovery evidence without extending raw check retention.",
  statements: [
    ...REPORT_HEALTH_BOOTSTRAP.map((sql) =>
      sql
        .replace(/^CREATE TABLE /, "CREATE TABLE IF NOT EXISTS ")
        .replace(/^CREATE INDEX /, "CREATE INDEX IF NOT EXISTS ")
    ),
    `DO $$ BEGIN IF NOT (${readySql}) THEN RAISE EXCEPTION 'report_health_schema_incomplete'; END IF; END $$`
  ]
});
export async function reportHealthSchemaAvailable(db: Queryable): Promise<boolean> {
  return (
    (await db.query<{ available: boolean }>(`SELECT (${readySql}) AS available`, [])).rows[0]
      ?.available === true
  );
}
