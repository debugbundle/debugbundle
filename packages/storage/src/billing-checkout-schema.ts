import { defineStorageSchemaMigration } from "./schema-migration-definition.js";

const statements = [
  `CREATE TABLE IF NOT EXISTS billing_checkout_attempts (
    organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
    id uuid NOT NULL UNIQUE,
    target_plan text NOT NULL CHECK (target_plan IN ('solo','team')),
    parameters jsonb NOT NULL CHECK (jsonb_typeof(parameters) = 'object'),
    stripe_session_id text UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now()
  )`
];

export const BILLING_CHECKOUT_BOOTSTRAP_STATEMENTS = statements.map((statement) =>
  statement.replace("CREATE TABLE IF NOT EXISTS", "CREATE TABLE")
);
export const BILLING_CHECKOUT_MIGRATION = defineStorageSchemaMigration({
  id: "202610220001_add_billing_checkout_attempts",
  description: "Coordinate one durable, idempotent hosted checkout per organisation.",
  statements
});
