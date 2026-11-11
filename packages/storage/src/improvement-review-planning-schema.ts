import { defineStorageSchemaMigration } from "./schema-migration-definition.js";
import type { Queryable } from "./types.js";
const ready = `EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('public.improvement_reviews') AND NOT attisdropped
    AND attname='review_context' AND atttypid='jsonb'::regtype)
  AND (SELECT count(*) FROM pg_constraint WHERE conrelid=to_regclass('public.improvement_reviews') AND convalidated
    AND conname='improvement_reviews_context_size_check')=1`;
const columns = ["review_context jsonb"];
const constraints = [
  `CONSTRAINT improvement_reviews_context_size_check CHECK(review_context IS NULL OR
        (jsonb_typeof(review_context)='object' AND octet_length(review_context::text)<=131072))`
];
export const IMPROVEMENT_REVIEW_PLANNING_COLUMNS = [...columns, ...constraints].join(",");
export const IMPROVEMENT_REVIEW_PLANNING_DDL = `ALTER TABLE improvement_reviews ${[...columns.map((c) => `ADD COLUMN ${c}`), ...constraints.map((c) => `ADD ${c}`)].join(",")}`;
export const IMPROVEMENT_REVIEW_PLANNING_MIGRATION = defineStorageSchemaMigration({
  id: "202611110001_add_improvement_review_planning",
  description: "Retain bounded configuration evidence alongside existing weekly reviews.",
  statements: [
    IMPROVEMENT_REVIEW_PLANNING_DDL,
    `DO $$ BEGIN IF NOT (${ready}) THEN RAISE EXCEPTION 'improvement_review_planning_schema_incomplete'; END IF; END $$`
  ]
});
export async function improvementReviewPlanningSchemaAvailable(db: Queryable): Promise<boolean> {
  return (
    (await db.query<{ available: boolean }>(`SELECT (${ready}) AS available`, [])).rows[0]
      ?.available === true
  );
}
