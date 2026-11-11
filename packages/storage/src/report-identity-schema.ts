import { defineStorageSchemaMigration } from "./schema-migration-definition.js";
import type { Queryable } from "./types.js";

export const REPORT_IDENTITY_BOOTSTRAP = [
  `CREATE TABLE report_identity_snapshots (
    run_id uuid PRIMARY KEY REFERENCES report_runs(id) ON DELETE CASCADE,
    identities jsonb NOT NULL CHECK(jsonb_typeof(identities)='array' AND jsonb_array_length(identities)<=2048)
  )`,
  `CREATE TABLE report_pdf_projections (
    run_id uuid PRIMARY KEY REFERENCES report_runs(id) ON DELETE CASCADE,
    document_sha256 text NOT NULL CHECK(document_sha256 ~ '^[a-f0-9]{64}$'),
    pdf_sha256 text NOT NULL CHECK(pdf_sha256 ~ '^[a-f0-9]{64}$')
  )`
] as const;
const readySql = `to_regclass('public.report_identity_snapshots') IS NOT NULL
 AND to_regclass('public.report_pdf_projections') IS NOT NULL
 AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='report_identity_snapshots' AND column_name='identities' AND data_type='jsonb')
 AND (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='report_pdf_projections' AND column_name IN ('document_sha256','pdf_sha256') AND data_type='text' AND is_nullable='NO')=2
 AND EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('public.report_pdf_projections') AND contype='f' AND confrelid=to_regclass('public.report_runs') AND confdeltype='c')
 AND EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('public.report_identity_snapshots') AND contype='f' AND confrelid=to_regclass('public.report_runs') AND confdeltype='c')`;
export const REPORT_IDENTITY_MIGRATION = defineStorageSchemaMigration({
  id: "202611100001_add_report_identity_snapshots",
  description:
    "Retain private accepted identity aliases for restricted report input and egress checks.",
  statements: [
    ...REPORT_IDENTITY_BOOTSTRAP,
    `DO $$ BEGIN IF NOT (${readySql}) THEN RAISE EXCEPTION 'report_identity_schema_incomplete'; END IF; END $$`
  ]
});
export async function reportIdentitySchemaAvailable(db: Queryable): Promise<boolean> {
  return (
    (await db.query<{ available: boolean }>(`SELECT (${readySql}) AS available`, [])).rows[0]
      ?.available === true
  );
}
