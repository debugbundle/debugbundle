import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import { migrateStorageSchema } from "../../packages/storage/src/schema-migrations.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration,
  seedOwnedProject
} from "../helpers/integration-setup.js";

runIntegration("canonical ownership with preserved project origins", () => {
  const pool = createIntegrationPool();
  const db = createQueryable(pool);
  beforeAll(async () => {
    await bootstrapStorageSchema(db);
    await migrateStorageSchema(db);
  });
  afterAll(async () => {
    await pool.end();
  });
  async function fixture() {
    const organizationId = randomUUID();
    const ownerUserId = randomUUID();
    const target = randomUUID();
    await seedOwnedProject({
      pool,
      organizationId,
      projectId: target,
      organizationName: "Origins",
      organizationSlug: organizationId,
      projectName: "System",
      projectSlug: target,
      ownerUserId,
      organizationPlan: "team"
    });
    const source = randomUUID();
    const later = randomUUID();
    for (const id of [source, later])
      await pool.query(
        "INSERT INTO projects(id,organization_id,owner_user_id,name,slug) VALUES($1::uuid,$2,$3,'Component',$1::text)",
        [id, organizationId, ownerUserId]
      );
    const operationId = randomUUID();
    await pool.query(
      "INSERT INTO project_merge_operations(id,organization_id,actor_user_id,target_project_id,idempotency_key,request,plan_digest,state) VALUES($1::uuid,$2,$3,$4,$1::text,'{}',$5,'queued')",
      [operationId, organizationId, ownerUserId, target, "a".repeat(64)]
    );
    return { organizationId, ownerUserId, target, source, later, operationId };
  }
  it("keeps old reads narrow and flattens later merges without changing their former scope", async () => {
    const f = await fixture();
    await pool.query(
      "INSERT INTO project_legacy_bindings(legacy_project_id,canonical_project_id,scope_origin_ids,operation_id) VALUES($1,$2,ARRAY[$1::uuid],$3)",
      [f.source, f.target, f.operationId]
    );
    const origins = async (id: string): Promise<string[]> =>
      (await pool.query<{ ids: string[] }>("SELECT debugbundle_project_origins($1) AS ids", [id]))
        .rows[0]!.ids;
    expect(await origins(f.source)).toEqual([f.source]);
    expect(await origins(f.target)).toEqual([f.target, f.source].sort());
    await pool.query(
      "UPDATE project_legacy_bindings SET canonical_project_id=$1 WHERE canonical_project_id=$2",
      [f.later, f.target]
    );
    await pool.query(
      "INSERT INTO project_legacy_bindings(legacy_project_id,canonical_project_id,scope_origin_ids,operation_id) VALUES($1,$2,$3,$4)",
      [f.target, f.later, [f.target, f.source].sort(), f.operationId]
    );
    expect(await origins(f.source)).toEqual([f.source]);
    expect(await origins(f.target)).toEqual([f.target, f.source].sort());
    expect(await origins(f.later)).toEqual([f.target, f.source, f.later].sort());
    expect(
      (
        await pool.query<{ id: string }>("SELECT debugbundle_canonical_project($1) AS id", [
          f.source
        ])
      ).rows[0]!.id
    ).toBe(f.later);
    await expect(pool.query("DELETE FROM projects WHERE id=$1", [f.source])).rejects.toThrow(
      "project_consolidated"
    );
    await expect(pool.query("DELETE FROM projects WHERE id=$1", [f.later])).rejects.toThrow(
      "project_has_origins"
    );
  });
  it("rejects cross-owner bindings and alias cycles at the storage boundary", async () => {
    const f = await fixture();
    const other = await fixture();
    await expect(
      pool.query(
        "INSERT INTO project_legacy_bindings(legacy_project_id,canonical_project_id,scope_origin_ids,operation_id) VALUES($1,$2,ARRAY[$1::uuid],$3)",
        [f.source, other.target, f.operationId]
      )
    ).rejects.toThrow("project_binding_scope_mismatch");
    await pool.query(
      "INSERT INTO project_legacy_bindings(legacy_project_id,canonical_project_id,scope_origin_ids,operation_id) VALUES($1,$2,ARRAY[$1::uuid],$3)",
      [f.source, f.target, f.operationId]
    );
    await expect(
      pool.query(
        "INSERT INTO project_legacy_bindings(legacy_project_id,canonical_project_id,scope_origin_ids,operation_id) VALUES($1,$2,ARRAY[$1::uuid],$3)",
        [f.target, f.source, f.operationId]
      )
    ).rejects.toThrow("project_binding_target_is_alias");
  });
});
