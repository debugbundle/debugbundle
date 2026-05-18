import { describe, expect, it } from "vitest";

import { assertDatabaseSchema, parseApiRuntimeEnv, type Queryable } from "../../../apps/api/src/runtime.js";
import { STORAGE_SCHEMA_MIGRATIONS } from "../../../packages/storage/src/schema-migrations.js";

const API_TABLE_ROWS = [
  { table_name: "users" },
  { table_name: "sessions" },
  { table_name: "email_auth_challenges" },
  { table_name: "oauth_identities" },
  { table_name: "organizations" },
  { table_name: "organization_members" },
  { table_name: "projects" },
  { table_name: "project_members" },
  { table_name: "project_invites" },
  { table_name: "project_tokens" },
  { table_name: "member_tokens" },
  { table_name: "github_device_authorizations" },
  { table_name: "probe_activations" },
  { table_name: "services" },
  { table_name: "deployments" },
  { table_name: "incidents" },
  { table_name: "incident_events" },
  { table_name: "improvement_opportunities" },
  { table_name: "improvement_opportunity_events" },
  { table_name: "bundle_generations" },
  { table_name: "weekly_report_channels" },
  { table_name: "alert_rules" },
  { table_name: "agent_webhooks" },
  { table_name: "webhook_deliveries" },
  { table_name: "slack_destinations" },
  { table_name: "capture_policies" },
  { table_name: "audit_logs" },
  { table_name: "processed_billing_events" },
  { table_name: "github_installations" },
  { table_name: "project_github_repos" },
  { table_name: "github_dispatch_rules" },
  { table_name: "github_dispatch_deliveries" }
];

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
      DEBUGBUNDLE_PROBE_TRIGGER_SECRET: "test-probe-secret"
    });

    expect(env.API_PORT).toBe(3000);
    expect(env.DB_SSL_MODE).toBe("disable");
    expect(env.DB_HOST).toBe("localhost");
    expect(env.S3_BUCKET).toBe("debugbundle-raw-events");
  });

  it("should parse require DB SSL mode", (): void => {
    const env = parseApiRuntimeEnv({
      DEBUGBUNDLE_PROBE_TRIGGER_SECRET: "test-probe-secret",
      DB_SSL_MODE: "require"
    });

    expect(env.DB_SSL_MODE).toBe("require");
  });

  it("should require the probe trigger secret env var", (): void => {
    expect(() => parseApiRuntimeEnv({})).toThrow("api_runtime_env_invalid");
    expect(() => parseApiRuntimeEnv({})).toThrow("DEBUGBUNDLE_PROBE_TRIGGER_SECRET");
  });

  it("should throw clear error for invalid port", (): void => {
    expect(() =>
      parseApiRuntimeEnv({
        DEBUGBUNDLE_PROBE_TRIGGER_SECRET: "test-probe-secret",
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
