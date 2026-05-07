import { describe, expect, it, vi } from "vitest";

import {
  assertStorageSchemaMigrationsApplied,
  migrateStorageSchema,
  STORAGE_SCHEMA_MIGRATIONS
} from "../../../packages/storage/src/schema-migrations.js";
import type { Queryable } from "../../../packages/storage/src/migrations.js";

describe("storage schema migrations", () => {
  it("should apply pending migrations once and persist checksums", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValue({ rows: [] });

    const result = await migrateStorageSchema({ query } as Queryable);

    expect(result.applied).toEqual(STORAGE_SCHEMA_MIGRATIONS.map((migration) => migration.id));
    expect(query).toHaveBeenCalledWith("BEGIN", []);
    expect(query).toHaveBeenCalledWith("COMMIT", []);
    expect(String(query.mock.calls[3]?.[0] ?? "")).toContain("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS suspended_at timestamptz");
    expect(String(query.mock.calls[5]?.[0] ?? "")).toContain("INSERT INTO storage_migration_ledger");
  });

  it("should skip already-applied migrations with matching checksums", async (): Promise<void> => {
    const appliedRows = STORAGE_SCHEMA_MIGRATIONS.map((migration) => ({
      id: migration.id,
      checksum: migration.checksum
    }));
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: appliedRows })
      .mockResolvedValue({ rows: [] });

    const result = await migrateStorageSchema({ query } as Queryable);

    expect(result.applied).toEqual([]);
    expect(result.already_applied).toEqual(STORAGE_SCHEMA_MIGRATIONS.map((migration) => migration.id));
    expect(query.mock.calls.map((call) => String(call[0]))).not.toContain("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS suspended_at timestamptz");
  });

  it("should fail closed when an applied migration checksum changes", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: STORAGE_SCHEMA_MIGRATIONS[0]?.id, checksum: "wrong" }] });

    await expect(migrateStorageSchema({ query } as Queryable)).rejects.toThrow("storage_migration_checksum_mismatch");
    expect(query).toHaveBeenCalledWith("ROLLBACK", []);
  });

  it("should assert all required migrations are applied before runtimes start", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ relation_name: "storage_migration_ledger" }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(assertStorageSchemaMigrationsApplied({ query } as Queryable)).rejects.toThrow("storage_schema_missing_migrations");
  });
});