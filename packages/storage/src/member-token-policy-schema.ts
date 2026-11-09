import { defineStorageSchemaMigration } from "./schema-migration-definition.js";
import type { Queryable } from "./migrations.js";

export const MEMBER_TOKEN_POLICY_COLUMN =
  "scope_policy jsonb CHECK (scope_policy IS NULL OR (jsonb_typeof(scope_policy)='object' AND scope_policy->>'version'='1'))";
export const MEMBER_TOKEN_POLICY_MIGRATION = defineStorageSchemaMigration({
  id: "202611070002_add_member_token_scope_policy",
  description: "Keep legacy member tokens unchanged and store explicit restricted scope policies.",
  statements: [`ALTER TABLE member_tokens ADD COLUMN IF NOT EXISTS ${MEMBER_TOKEN_POLICY_COLUMN}`]
});

export async function memberTokenPolicySchemaAvailable(db: Queryable): Promise<boolean> {
  const result = await db.query<{ available: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
      AND table_name='member_tokens' AND column_name='scope_policy') AS available`,
    []
  );
  return result.rows[0]?.available === true;
}
