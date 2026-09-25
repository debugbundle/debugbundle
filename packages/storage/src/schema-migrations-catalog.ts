import { EARLY_STORAGE_SCHEMA_MIGRATIONS } from "./schema-migrations-catalog-early.js";
import { LATE_STORAGE_SCHEMA_MIGRATIONS } from "./schema-migrations-catalog-late.js";
import { defineStorageSchemaMigration } from "./schema-migration-definition.js";

export type { StorageSchemaMigration } from "./schema-migration-definition.js";

export const STORAGE_SCHEMA_MIGRATIONS = [
  ...EARLY_STORAGE_SCHEMA_MIGRATIONS,
  ...LATE_STORAGE_SCHEMA_MIGRATIONS,
  defineStorageSchemaMigration({
    id: "202609160001_add_browser_resource_routes",
    description: "Retain sanitized browser resource routes independently of raw event sampling.",
    statements: ["ALTER TABLE incident_events ADD COLUMN IF NOT EXISTS resource_route text"]
  }),
  defineStorageSchemaMigration({
    id: "202609240001_add_alert_delivery_members",
    description: "Retain incident identities represented by one coherent alert delivery.",
    statements: [
      `
        CREATE TABLE IF NOT EXISTS alert_delivery_members (
          id uuid PRIMARY KEY,
          delivery_id uuid NOT NULL REFERENCES alert_deliveries(id) ON DELETE CASCADE,
          incident_id uuid NOT NULL,
          condition_type text NOT NULL,
          dedupe_key text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (delivery_id, incident_id, condition_type, dedupe_key)
        )
      `,
      `
        CREATE INDEX IF NOT EXISTS alert_delivery_members_delivery_created_idx
        ON alert_delivery_members (delivery_id, created_at ASC, id ASC)
      `
    ]
  }),
  defineStorageSchemaMigration({
    id: "202609240002_add_alert_webhook_signing_secret",
    description: "Store custom alert-webhook signing secrets separately from readable rule config.",
    statements: ["ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS signing_secret text"]
  }),
  defineStorageSchemaMigration({
    id: "202609250001_add_alert_evaluation_owner",
    description: "Bind direct alert retries to the durable evaluation job that created the intent.",
    statements: ["ALTER TABLE alert_deliveries ADD COLUMN IF NOT EXISTS evaluation_job_id text"]
  }),
  defineStorageSchemaMigration({
    id: "202609250002_version_alert_webhook_payloads",
    description: "Preserve legacy custom webhook bodies while enforcing signatures for every delivery.",
    statements: [
      "ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS webhook_payload_version smallint NOT NULL DEFAULT 0 CHECK (webhook_payload_version IN (0, 1))",
      "UPDATE alert_rules SET webhook_payload_version = 1 WHERE channel = 'webhook' AND signing_secret IS NOT NULL"
    ]
  })
] as const;
