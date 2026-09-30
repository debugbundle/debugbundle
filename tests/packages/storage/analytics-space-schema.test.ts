import { describe, expect, it } from "vitest";
import { STORAGE_SCHEMA_MIGRATIONS } from "../../../packages/storage/src/schema-migrations.js";
import {
  REQUIRED_API_TABLES,
  REQUIRED_WORKER_TABLES
} from "../../../packages/storage/src/migrations.js";
import { STORAGE_BOOTSTRAP_STATEMENTS } from "../../../packages/storage/src/storage-bootstrap-all-statements.js";

describe("analytics space production schema", () => {
  it("adds connected namespace policy through a forward migration and clean bootstrap", () => {
    const migration = STORAGE_SCHEMA_MIGRATIONS.find(
      (entry) => entry.id === "202609280026_bind_analytics_space_identity_namespace"
    );
    expect(migration?.statements.join("\n")).toContain("namespace_source_project_ids uuid[]");
    expect(migration?.statements.join("\n")).toContain(
      "analytics_space_identity_namespace_mutations"
    );
    expect(REQUIRED_API_TABLES).toContain("analytics_space_identity_namespace_mutations");
    expect(REQUIRED_WORKER_TABLES).toContain("analytics_space_identity_namespace_mutations");
    expect(STORAGE_BOOTSTRAP_STATEMENTS.join("\n")).toContain(
      "CONSTRAINT analytics_spaces_identity_namespace_check"
    );
  });

  it("adds bounded membership and revision audit through one ordered forward migration", () => {
    const migration = STORAGE_SCHEMA_MIGRATIONS.find(
      (entry) => entry.id === "202609280001_add_analytics_spaces"
    );
    expect(migration).toBeDefined();
    const sql = migration!.statements.join("\n");
    expect(sql).toContain("project_id uuid PRIMARY KEY");
    expect(sql).toContain("cardinality(project_ids) BETWEEN 1 AND 20");
    expect(sql).toContain("analytics_space_project_deleted");
    expect(sql).toContain("space_project_organization_mismatch");
    expect(sql).not.toMatch(/DROP TABLE|UPDATE project_tokens|UPDATE analytics_funnel_definitions/);
    for (const name of [
      "analytics_spaces",
      "analytics_space_projects",
      "analytics_space_revisions"
    ] as const) {
      expect(REQUIRED_API_TABLES).toContain(name);
      expect(REQUIRED_WORKER_TABLES).toContain(name);
      expect(STORAGE_BOOTSTRAP_STATEMENTS.join("\n")).toContain(`CREATE TABLE ${name}`);
    }
  });

  it("adds source-complete plan declarations through a separate forward migration", () => {
    const migration = STORAGE_SCHEMA_MIGRATIONS.find(
      (entry) => entry.id === "202609280005_add_analytics_space_plans"
    );
    expect(migration).toBeDefined();
    const sql = migration!.statements.join("\n");
    expect(sql).toContain("source_catalog_revisions jsonb NOT NULL");
    expect(sql).toContain("UNIQUE(space_id,actor_user_id,idempotency_key)");
    expect(sql).not.toMatch(
      /DROP TABLE|ALTER TABLE analytics_spaces|UPDATE analytics_funnel_definitions/
    );
    for (const name of ["analytics_space_plans", "analytics_space_plan_revisions"] as const) {
      expect(REQUIRED_API_TABLES).toContain(name);
      expect(REQUIRED_WORKER_TABLES).toContain(name);
      expect(STORAGE_BOOTSTRAP_STATEMENTS.join("\n")).toContain(`CREATE TABLE ${name}`);
    }
  });
});
