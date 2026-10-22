import { defineStorageSchemaMigration } from "./schema-migration-definition.js";

export const BILLING_NOTIFICATION_MIGRATION = defineStorageSchemaMigration({
  id: "202610220003_add_billing_lifecycle_notifications",
  description: "Queue billing lifecycle notifications atomically with webhook state",
  statements: [
    "ALTER TABLE operational_email_deliveries DROP CONSTRAINT IF EXISTS operational_email_deliveries_kind_check",
    `ALTER TABLE operational_email_deliveries ADD CONSTRAINT operational_email_deliveries_kind_check
     CHECK (kind IN ('webhook_auto_disabled','allowance_warning_80','allowance_limit_reached','retention_rotation_notice',
       'trial_started','trial_ending_soon','trial_expired','trial_converted','billing_lifecycle'))`
  ]
});
