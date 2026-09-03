import { describe, expect, it } from "vitest";

import {
  REQUIRED_API_TABLES,
  STORAGE_BOOTSTRAP_SQL
} from "../../../packages/storage/src/migrations.js";
import { STORAGE_SCHEMA_MIGRATIONS } from "../../../packages/storage/src/schema-migrations.js";

describe("OpenAI OAuth storage schema", () => {
  it("adds the dedicated credential tables and durable provider adapter records through one forward migration", () => {
    const migration = STORAGE_SCHEMA_MIGRATIONS.find(
      (entry) => entry.id === "202608300001_add_openai_oauth_records"
    );

    expect(migration).toBeDefined();
    const sql = migration?.statements.join("\n") ?? "";
    for (const table of [
      "oauth_authorization_grants",
      "oauth_authorization_codes",
      "oauth_refresh_tokens",
      "oauth_provider_artifacts"
    ]) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
      expect(REQUIRED_API_TABLES).toContain(table);
      expect(STORAGE_BOOTSTRAP_SQL).toContain(`CREATE TABLE ${table}`);
    }
    expect(sql).toContain("provider_id_hash");
    expect(sql).toContain("code_challenge_method = 'S256'");
    expect(sql).toContain("resource = 'https://mcp.debugbundle.com'");
    expect(sql).toContain("oauth_refresh_tokens_one_current_family_idx");
  });
});
