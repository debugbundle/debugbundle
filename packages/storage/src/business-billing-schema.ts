import { defineStorageSchemaMigration } from "./schema-migration-definition.js";
import type { Queryable } from "./migrations.js";

const statements = [
  "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS billing_interval text CHECK (billing_interval IN ('month','year'))",
  "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS billing_allowance_anchor_at timestamptz",
  "ALTER TABLE billing_checkout_attempts DROP CONSTRAINT IF EXISTS billing_checkout_attempts_target_plan_check",
  "ALTER TABLE billing_checkout_attempts ADD CONSTRAINT billing_checkout_attempts_target_plan_check CHECK (target_plan IN ('solo','team','business'))",
  `CREATE OR REPLACE FUNCTION debugbundle_rule_actor_allowed(requested_id uuid,actor_id uuid,creator_id uuid,selfhost_access boolean) RETURNS boolean
    LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
      SELECT EXISTS(SELECT 1 FROM projects p JOIN organizations o ON o.id=p.organization_id
        WHERE p.id=debugbundle_canonical_project($1) AND o.suspended_at IS NULL AND
        ($2 IS NULL OR p.owner_user_id=$2 OR ((o.plan IN ('team','business') OR $4) AND EXISTS(
          SELECT 1 FROM project_members pm WHERE pm.project_id=p.id AND pm.user_id=$2
            AND ($3 IS NULL OR $3=$2 OR pm.role='admin')))))
    $$`
];

export const BUSINESS_BILLING_MIGRATION = defineStorageSchemaMigration({
  id: "202611070001_add_business_billing_foundation",
  description:
    "Add explicit paid interval/allowance anchor and Business-compatible checkout and rule reads.",
  statements
});

/** Ledger seeding may attest only shapes actually present in an unversioned DB.
 * A recognised older baseline must run the new forward migration instead. */
export async function businessBillingSchemaAvailable(db: Queryable): Promise<boolean> {
  const result = await db.query<{ available: boolean }>(
    `SELECT
      (SELECT COUNT(*)=2 FROM information_schema.columns WHERE table_schema='public'
        AND table_name='organizations' AND column_name IN ('billing_interval','billing_allowance_anchor_at'))
      AND EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='billing_checkout_attempts'::regclass
        AND conname='billing_checkout_attempts_target_plan_check'
        AND position('business' in pg_get_constraintdef(oid))>0)
      AND EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('debugbundle_rule_actor_allowed(uuid,uuid,uuid,boolean)')
        AND (position('business' in prosrc)>0 OR position('debugbundle_project_actor_role' in prosrc)>0)) AS available`,
    []
  );
  return result.rows[0]?.available === true;
}
