import { describe, expect, it } from "vitest";

import {
  assertDatabaseSchema,
  parseApiRuntimeEnv,
  type Queryable
} from "../../../apps/api/src/runtime.js";
import { REQUIRED_API_TABLES } from "../../../packages/storage/src/migrations.js";
import { STORAGE_SCHEMA_MIGRATIONS } from "../../../packages/storage/src/schema-migrations.js";

const API_TABLE_ROWS = REQUIRED_API_TABLES.map((table_name) => ({ table_name }));

function buildMigratedApiSchemaDb(): Queryable {
  return {
    query: async <Row extends Record<string, unknown>>(sql: string) => {
      await Promise.resolve();

      if (sql.includes("information_schema.tables")) {
        return { rows: API_TABLE_ROWS as unknown as Row[] };
      }

      if (sql.includes("to_regclass")) {
        return { rows: [{ relation_name: "storage_migration_ledger" }] as unknown as Row[] };
      }

      if (sql.includes("storage_migration_ledger")) {
        return {
          rows: STORAGE_SCHEMA_MIGRATIONS.map((migration) => ({
            id: migration.id,
            checksum: migration.checksum
          })) as unknown as Row[]
        };
      }

      return { rows: [] as Row[] };
    }
  };
}

describe("api runtime", () => {
  it("should parse environment with defaults", (): void => {
    const env = parseApiRuntimeEnv({
      DEBUGBUNDLE_PROBE_TRIGGER_SECRET: "test-probe-secret",
      ANALYTICS_HASH_SECRET: "test-analytics-secret"
    });

    expect(env.API_PORT).toBe(3000);
    expect(env.DB_SSL_MODE).toBe("disable");
    expect(env.DB_HOST).toBe("localhost");
    expect(env.DB_POOL_MAX).toBe(10);
    expect(env.S3_BUCKET).toBe("debugbundle-raw-events");
  });

  it("should parse require DB SSL mode", (): void => {
    const env = parseApiRuntimeEnv({
      DEBUGBUNDLE_PROBE_TRIGGER_SECRET: "test-probe-secret",
      ANALYTICS_HASH_SECRET: "test-analytics-secret",
      DB_SSL_MODE: "require"
    });

    expect(env.DB_SSL_MODE).toBe("require");
  });

  it("should require the probe trigger secret env var", (): void => {
    expect(() => parseApiRuntimeEnv({})).toThrow("api_runtime_env_invalid");
    expect(() => parseApiRuntimeEnv({})).toThrow("DEBUGBUNDLE_PROBE_TRIGGER_SECRET");
  });

  it("should require the analytics hash secret env var", (): void => {
    expect(() =>
      parseApiRuntimeEnv({
        DEBUGBUNDLE_PROBE_TRIGGER_SECRET: "test-probe-secret"
      })
    ).toThrow("ANALYTICS_HASH_SECRET");
  });

  it("should throw clear error for invalid port", (): void => {
    expect(() =>
      parseApiRuntimeEnv({
        DEBUGBUNDLE_PROBE_TRIGGER_SECRET: "test-probe-secret",
        ANALYTICS_HASH_SECRET: "test-analytics-secret",
        API_PORT: "99999"
      })
    ).toThrow("api_runtime_env_invalid");
  });

  it("should pass schema guard when required tables exist", async (): Promise<void> => {
    await expect(assertDatabaseSchema(buildMigratedApiSchemaDb())).resolves.toBeUndefined();
  });

  it("should fail schema guard with explicit missing table names", async (): Promise<void> => {
    const db: Queryable = {
      query: async <Row extends Record<string, unknown>>() => {
        await Promise.resolve();
        return {
          rows: [{ table_name: "projects" }] as unknown as Row[]
        };
      }
    };

    await expect(assertDatabaseSchema(db)).rejects.toThrow("db_schema_missing_tables");
    await expect(assertDatabaseSchema(db)).rejects.toThrow("project_tokens");
  });
});
