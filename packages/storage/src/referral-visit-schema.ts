import { defineStorageSchemaMigration } from "./schema-migration-definition.js";
import type { Queryable } from "./types.js";

export const REFERRAL_VISIT_MIGRATION = defineStorageSchemaMigration({
  id: "202611210001_add_referral_link_visits",
  description: "Store bounded anonymous referral-link visit receipts.",
  statements: [
    `CREATE TABLE referral_link_visits (
      receipt_id uuid PRIMARY KEY,
      code_id uuid NOT NULL REFERENCES offer_codes(id),
      visited_at timestamptz NOT NULL
    )`,
    "CREATE INDEX referral_link_visits_code_date_idx ON referral_link_visits(code_id, visited_at)",
    "CREATE INDEX referral_link_visits_expiry_idx ON referral_link_visits(visited_at, receipt_id)"
  ]
});

export async function referralVisitSchemaAvailable(db: Queryable): Promise<boolean> {
  const { rows } = await db.query<{ ready: boolean }>(
    `SELECT to_regclass('public.referral_link_visits') IS NOT NULL
      AND EXISTS (SELECT 1 FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid=c.conrelid AND c.conkey=ARRAY[a.attnum]
        JOIN pg_index i ON i.indexrelid=c.conindid
        WHERE c.conrelid=to_regclass('public.referral_link_visits') AND c.contype='p'
          AND a.attname='receipt_id' AND NOT c.condeferrable AND i.indisvalid AND i.indisready)
      AND EXISTS (SELECT 1 FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid=c.conrelid AND c.conkey=ARRAY[a.attnum]
        JOIN pg_attribute target ON target.attrelid=c.confrelid AND c.confkey=ARRAY[target.attnum]
        WHERE c.conrelid=to_regclass('public.referral_link_visits') AND c.contype='f'
          AND a.attname='code_id' AND c.confrelid=to_regclass('public.offer_codes')
          AND target.attname='id' AND c.convalidated)
      AND to_regclass('public.referral_link_visits_code_date_idx') IS NOT NULL
      AND to_regclass('public.referral_link_visits_expiry_idx') IS NOT NULL
      AND (SELECT count(*) FROM information_schema.columns
           WHERE table_schema='public' AND table_name='referral_link_visits'
             AND is_nullable='NO' AND (column_name,data_type) IN (
               ('receipt_id','uuid'),('code_id','uuid'),('visited_at','timestamp with time zone')
             ))=3 AS ready`,
    []
  );
  return rows[0]?.ready === true;
}
