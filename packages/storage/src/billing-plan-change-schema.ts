import { defineStorageSchemaMigration } from "./schema-migration-definition.js";

// Additive expansion of accepted operation kinds; existing reservations remain
// intact. Keep the preceding migration checksum stable for existing ledgers.
const statements = [
  "ALTER TABLE billing_subscription_operations DROP CONSTRAINT billing_subscription_operations_kind_check",
  "ALTER TABLE billing_subscription_operations ADD CONSTRAINT billing_subscription_operations_kind_check CHECK (kind IN ('upgrade','capacity_increase','capacity_schedule','capacity_cancel','plan_schedule','plan_cancel'))"
];
export const BILLING_PLAN_CHANGE_MIGRATION = defineStorageSchemaMigration({
  id: "202610220004_add_billing_plan_change_operations",
  description: "Allow durable same-subscription plan schedules and their cancellation",
  statements
});
