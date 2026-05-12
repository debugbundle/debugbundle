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

  it("should fail closed when the migration ledger is missing or has a checksum mismatch", async (): Promise<void> => {
    const missingLedgerQuery = vi.fn().mockResolvedValueOnce({ rows: [{ relation_name: null }] });
    const checksumMismatchQuery = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ relation_name: "storage_migration_ledger" }] })
      .mockResolvedValueOnce({ rows: [{ id: STORAGE_SCHEMA_MIGRATIONS[0]?.id, checksum: "wrong" }] });

    await expect(assertStorageSchemaMigrationsApplied({ query: missingLedgerQuery } as Queryable)).rejects.toThrow(
      "storage_schema_missing_migrations"
    );
    await expect(assertStorageSchemaMigrationsApplied({ query: checksumMismatchQuery } as Queryable)).rejects.toThrow(
      "storage_migration_checksum_mismatch"
    );
  });

  it("should rollback and surface rollback failures during migration application", async (): Promise<void> => {
    const rollbackQuery = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error("statement_failed"))
      .mockResolvedValueOnce({ rows: [] });
    const rollbackFailureQuery = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error("statement_failed"))
      .mockRejectedValueOnce(new Error("rollback_failed"));

    await expect(migrateStorageSchema({ query: rollbackQuery } as Queryable)).rejects.toThrow("statement_failed");
    expect(rollbackQuery).toHaveBeenCalledWith("ROLLBACK", []);

    await expect(migrateStorageSchema({ query: rollbackFailureQuery } as Queryable)).rejects.toThrow(
      "storage_migration_rollback_failed"
    );
  });

  it("should reject invalid migration metadata before touching the database", async (): Promise<void> => {
    const originalMigrations = STORAGE_SCHEMA_MIGRATIONS.slice();
    const mutatedMigrations = STORAGE_SCHEMA_MIGRATIONS as unknown as Array<{
      id: string;
      description: string;
      statements: string[];
      checksum: string;
    }>;

    mutatedMigrations.splice(
      0,
      mutatedMigrations.length,
      {
        ...originalMigrations[0]!,
        id: "invalid-id"
      },
      {
        ...originalMigrations[1]!,
        statements: ["   "]
      }
    );

    try {
      await expect(migrateStorageSchema({ query: vi.fn() } as Queryable)).rejects.toThrow("storage_migration_invalid_id");

      mutatedMigrations.splice(
        0,
        mutatedMigrations.length,
        {
          ...originalMigrations[0]!,
          statements: []
        }
      );
      await expect(assertStorageSchemaMigrationsApplied({ query: vi.fn() } as Queryable)).rejects.toThrow(
        "storage_migration_empty"
      );

      mutatedMigrations.splice(
        0,
        mutatedMigrations.length,
        originalMigrations[1]!,
        originalMigrations[0]!
      );
      await expect(assertStorageSchemaMigrationsApplied({ query: vi.fn() } as Queryable)).rejects.toThrow(
        "storage_migration_order_invalid"
      );
    } finally {
      mutatedMigrations.splice(0, mutatedMigrations.length, ...originalMigrations);
    }
  });
});