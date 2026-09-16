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
  })
] as const;
