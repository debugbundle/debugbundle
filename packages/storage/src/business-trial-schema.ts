import { defineStorageSchemaMigration } from "./schema-migration-definition.js";
import type { Queryable } from "./types.js";

export const BUSINESS_TRIAL_MIGRATION = defineStorageSchemaMigration({
  id: "202611080001_add_business_trial_plan",
  description:
    "Permit Business in the existing one-time no-card trial without changing saved trial history.",
  statements: [
    "ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_trial_plan_check",
    "ALTER TABLE organizations ADD CONSTRAINT organizations_trial_plan_check CHECK (trial_plan IN ('solo','team','business') OR trial_plan IS NULL)"
  ]
});

export async function businessTrialSchemaAvailable(db: Queryable): Promise<boolean> {
  const result = await db.query<{ available: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='organizations'::regclass
      AND conname='organizations_trial_plan_check' AND convalidated
      AND position('business' in pg_get_constraintdef(oid))>0) AS available`,
    []
  );
  return result.rows[0]?.available === true;
}
