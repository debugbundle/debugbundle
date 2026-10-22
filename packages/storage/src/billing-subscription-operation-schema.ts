import { defineStorageSchemaMigration } from "./schema-migration-definition.js";

const statements = [
  `CREATE TABLE IF NOT EXISTS billing_subscription_operations (
    organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
    id uuid NOT NULL UNIQUE,
    subscription_id text NOT NULL,
    customer_id text NOT NULL,
    kind text NOT NULL CHECK (kind IN ('upgrade','capacity_increase','capacity_schedule','capacity_cancel')),
    intent jsonb NOT NULL CHECK (jsonb_typeof(intent) = 'object'),
    parameters jsonb CHECK (jsonb_typeof(parameters) = 'object'),
    resource_id text,
    created_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz
  )`
];

export const BILLING_SUBSCRIPTION_OPERATION_BOOTSTRAP_STATEMENTS = statements.map((statement) =>
  // Empty-schema creation uses the final shape; installed schemas use 004.
  statement
    .replace("CREATE TABLE IF NOT EXISTS", "CREATE TABLE")
    .replace("'capacity_cancel'))", "'capacity_cancel','plan_schedule','plan_cancel'))")
);
export const BILLING_SUBSCRIPTION_OPERATION_MIGRATION = defineStorageSchemaMigration({
  id: "202610220002_add_billing_subscription_operations",
  description: "Serialize durable subscription upgrades and capacity mutations",
  statements
});
