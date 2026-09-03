import { EARLY_STORAGE_SCHEMA_MIGRATIONS } from "./schema-migrations-catalog-early.js";
import { LATE_STORAGE_SCHEMA_MIGRATIONS } from "./schema-migrations-catalog-late.js";

export type { StorageSchemaMigration } from "./schema-migration-definition.js";

export const STORAGE_SCHEMA_MIGRATIONS = [
  ...EARLY_STORAGE_SCHEMA_MIGRATIONS,
  ...LATE_STORAGE_SCHEMA_MIGRATIONS
] as const;
