import { describe, expect, it } from "vitest";
import { STORAGE_SCHEMA_MIGRATIONS } from "../../../packages/storage/src/schema-migrations.js";
import {
  REQUIRED_API_TABLES,
  REQUIRED_WORKER_TABLES
} from "../../../packages/storage/src/migrations.js";
import { STORAGE_BOOTSTRAP_STATEMENTS } from "../../../packages/storage/src/storage-bootstrap-all-statements.js";

describe("semantic analytics receipt production schema", () => {
  it("adds a separate durable V2 receipt and scoped operation namespace", () => {
    const migration = STORAGE_SCHEMA_MIGRATIONS.find(
      (entry) => entry.id === "202609280006_add_semantic_analytics_receipts"
    );
    expect(migration).toBeDefined();
    const sql = migration!.statements.join("\n");
    expect(sql).toContain("PRIMARY KEY(project_id,event_id)");
    expect(sql).toContain(
      "UNIQUE(project_id,namespace_scope_kind,namespace_scope_id,namespace_revision,operation_kind,operation_id)"
    );
    expect(sql).toContain("worker_job_id text NOT NULL");
    expect(sql).not.toMatch(/DROP TABLE|ALTER TABLE analytics_ingestion_ledger/);
    for (const name of [
      "semantic_analytics_receipts",
      "semantic_analytics_operations",
      "semantic_analytics_pending_objects"
    ]) {
      expect(REQUIRED_API_TABLES).toContain(name);
      expect(REQUIRED_WORKER_TABLES).toContain(name);
      expect(STORAGE_BOOTSTRAP_STATEMENTS.join("\n")).toContain(`CREATE TABLE ${name}`);
    }
  });

  it("indexes only raw-deleted receipts for bounded expiry pruning", () => {
    const migration = STORAGE_SCHEMA_MIGRATIONS.find(
      (entry) => entry.id === "202609280010_add_semantic_raw_retention_state"
    );
    expect(migration?.statements.join("\n")).toContain("semantic_analytics_receipts_prune_idx");
    expect(migration?.statements.join("\n")).toContain("raw_delete_retry_at");
    expect(migration?.statements.join("\n")).toContain("WHERE raw_status='deleted'");
    expect(STORAGE_BOOTSTRAP_STATEMENTS.join("\n")).toContain(
      "semantic_analytics_receipts_prune_idx"
    );
  });
});
