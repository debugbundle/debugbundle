import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import { migrateStorageSchema } from "../../packages/storage/src/schema-migrations.js";
import { createPostgresMetadataStore } from "../../packages/storage/src/metadata-store.js";
import { createPostgresAccountStore } from "../../packages/storage/src/account-store.js";
import { createPostgresBillingStore } from "../../packages/storage/src/billing-store.js";
import { createPostgresWebhookDeliveryStore } from "../../packages/storage/src/webhook-delivery-store.js";
import { seedExternalProjectCollaborator } from "../helpers/shared-project-collaborator.js";
import { createPostgresAvailabilityCheckStore } from "../../packages/storage/src/availability-check-store.js";
import { seedConsolidationProjects } from "../helpers/consolidation-projects.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration
} from "../helpers/integration-setup.js";

runIntegration("canonical project and account lifecycle", () => {
  const pool = createIntegrationPool(),
    db = createQueryable(pool),
    metadata = createPostgresMetadataStore(db);
  beforeAll(async () => {
    await bootstrapStorageSchema(db);
    await migrateStorageSchema(db);
  });
  afterAll(async () => {
    await pool.end();
  });
  async function fixture() {
    const f = await seedConsolidationProjects(pool, db);
    await pool.query(
      "INSERT INTO services(id,project_id,name,environment) VALUES(gen_random_uuid(),$1,'web','production')",
      [f.source]
    );
    const health = createPostgresAvailabilityCheckStore(db);
    await health.createCheckForProjectInOrganization({
      organization_id: f.organizationId,
      project_id: f.source,
      created_by_user_id: f.userId,
      name: "Endpoint",
      url: "https://example.test/health",
      method: "GET",
      expected_status_min: 200,
      expected_status_max: 399,
      timeout_ms: 1000,
      interval_seconds: 60,
      failure_threshold: 2,
      recovery_threshold: 2,
      environment: "production",
      service_name: "web",
      enabled: true,
      now: new Date().toISOString()
    });
    await f.consolidate();
    return f;
  }
  it("rejects a legacy delete and leaves all canonical data intact", async () => {
    const f = await fixture();
    await expect(
      metadata.deleteProjectForUser!({ user_id: f.userId, project_id: f.source })
    ).rejects.toMatchObject({ message: "project_consolidated" });
    expect(
      (await pool.query("SELECT id FROM projects WHERE id=ANY($1::uuid[])", [[f.source, f.target]]))
        .rowCount
    ).toBe(2);
  });
  it.each(["owner", "organization"])(
    "deletes every origin atomically through %s project deletion",
    async (mode) => {
      const f = await fixture();
      const result =
        mode === "owner"
          ? await metadata.deleteProjectForUser!({ user_id: f.userId, project_id: f.target })
          : await metadata.deleteProjectForOrganization({
              organization_id: f.organizationId,
              project_id: f.target
            });
      expect(result?.project_id).toBe(f.target);
      expect(result?.storage_origin_ids?.sort()).toEqual([f.source, f.target].sort());
      expect(
        (
          await pool.query("SELECT id FROM projects WHERE id=ANY($1::uuid[])", [
            [f.source, f.target]
          ])
        ).rows
      ).toEqual([]);
      expect(
        (
          await pool.query(
            "SELECT id FROM service_definitions WHERE origin_project_id=ANY($1::uuid[])",
            [[f.source, f.target]]
          )
        ).rows
      ).toEqual([]);
    }
  );
  it("deletes a consolidated account while returning every retained object namespace", async () => {
    const f = await fixture();
    const accounts = createPostgresAccountStore(db);
    const result = await accounts.deleteAccountForOrganization({
      organization_id: f.organizationId,
      user_id: f.userId,
      deleted_at: new Date().toISOString()
    });
    if (!result || typeof result === "string") throw new Error("account_deletion_failed");
    expect(result.deleted_project_ids.sort()).toEqual([f.source, f.target].sort());
    expect(
      (await pool.query("SELECT id FROM projects WHERE organization_id=$1", [f.organizationId]))
        .rows
    ).toEqual([]);
  });
  it("counts one active project without resetting purchased capacity or original usage", async () => {
    const f = await seedConsolidationProjects(pool, db),
      billing = createPostgresBillingStore(db),
      now = "2026-11-04T12:00:00.000Z";
    await pool.query("UPDATE organizations SET additional_capacity_units=2 WHERE id=$1", [
      f.organizationId
    ]);
    const before = await billing.getBillingSummaryForOrganization({
      organization_id: f.organizationId,
      now
    });
    expect(before?.active_projects).toBe(2);
    await f.consolidate();
    const after = await billing.getBillingSummaryForOrganization({
      organization_id: f.organizationId,
      now
    });
    expect(after?.active_projects).toBe(1);
    expect(after?.capacity_units).toEqual(before?.capacity_units);
    expect(after?.allowances).toEqual(before?.allowances);
  });
  it("uses canonical membership at retained links and removes imported member-owned automation on revocation", async () => {
    const f = await seedConsolidationProjects(pool, db),
      member = await seedExternalProjectCollaborator(pool, [f.target, f.source]);
    const hooks = createPostgresWebhookDeliveryStore(db);
    await hooks.createWebhookForOrganization({
      organization_id: f.organizationId,
      project_id: f.source,
      created_by_user_id: member,
      url: "https://example.test/hook",
      signing_secret: "fixture-preserved",
      events: ["bundle.created"],
      filters: {},
      is_enabled: true
    });
    await f.consolidate();
    expect(
      await metadata.removeProjectMember!({
        project_id: f.target,
        actor_user_id: f.userId,
        user_id: member
      })
    ).toMatchObject({ kind: "removed" });
    const legacyMembers = await metadata.listMembersForProject!({
      project_id: f.source,
      user_id: f.userId
    });
    expect(legacyMembers?.members.map((m) => m.user_id)).toEqual([f.userId]);
    expect(
      await metadata.listMembersForProject!({ project_id: f.source, user_id: member })
    ).toBeNull();
    expect(
      (
        await pool.query(
          "SELECT id FROM agent_webhooks WHERE project_id=ANY($1::uuid[]) AND created_by_user_id=$2",
          [[f.target, f.source], member]
        )
      ).rows
    ).toEqual([]);
  });
  it("lists retained SDK credentials canonically and rechecks live access before issuing or revoking", async () => {
    const f = await seedConsolidationProjects(pool, db),
      member = await seedExternalProjectCollaborator(pool, [f.source, f.target]);
    const sourceToken = await metadata.createProjectTokenForOrganization({
      organization_id: f.organizationId,
      project_id: f.source,
      token_hash: randomUUID(),
      label: "Source",
      allowed_origins: []
    });
    const targetToken = await metadata.createProjectTokenForOrganization({
      organization_id: f.organizationId,
      project_id: f.target,
      token_hash: randomUUID(),
      label: "Target",
      allowed_origins: []
    });
    await f.consolidate();
    expect(
      (
        await metadata.listProjectTokensForOrganization({
          organization_id: f.organizationId,
          project_id: f.target,
          actor_user_id: f.userId,
          limit: 1000
        })
      )
        ?.map((t) => t.token_id)
        .sort()
    ).toEqual([sourceToken!.token_id, targetToken!.token_id].sort());
    expect(
      (
        await metadata.listProjectTokensForOrganization({
          organization_id: f.organizationId,
          project_id: f.source,
          actor_user_id: f.userId,
          limit: 1000
        })
      )?.map((t) => t.token_id)
    ).toEqual([sourceToken!.token_id]);
    await pool.query("DELETE FROM project_members WHERE project_id=$1 AND user_id=$2", [
      f.target,
      member
    ]);
    expect(
      await metadata.createProjectTokenForOrganization({
        organization_id: f.organizationId,
        project_id: f.target,
        actor_user_id: member,
        token_hash: randomUUID(),
        label: "Denied",
        allowed_origins: []
      })
    ).toBeNull();
    expect(
      await metadata.revokeProjectTokenForOrganization({
        organization_id: f.organizationId,
        project_id: f.source,
        actor_user_id: member,
        token_id: sourceToken!.token_id,
        revoked_at: new Date().toISOString()
      })
    ).toBeNull();
    expect(
      await metadata.revokeProjectTokenForOrganization({
        organization_id: f.organizationId,
        project_id: f.target,
        actor_user_id: f.userId,
        token_id: sourceToken!.token_id,
        revoked_at: new Date().toISOString()
      })
    ).toMatchObject({ token_id: sourceToken!.token_id, project_id: f.source });
  });
  it("exports complete service routing and lineage inside existing project records without private operation leases", async () => {
    const f = await fixture(),
      accounts = createPostgresAccountStore(db);
    const result = await accounts.exportAccountForOrganization({
      organization_id: f.organizationId,
      user_id: f.userId,
      exported_at: new Date().toISOString()
    });
    const source = result?.projects.find((p) => p["project_id"] === f.source);
    expect(source?.["service_context"]).toMatchObject({
      schema: "project-services-v1",
      canonical_project_id: f.target,
      definitions: [{ project_id: f.target, origin_project_id: f.source, name: "Site" }]
    });
    const root = result?.projects.find((p) => p["project_id"] === f.target);
    expect(root?.["service_context"]).toMatchObject({
      origin_project_ids: [f.source, f.target].sort(),
      operations: [{ state: "completed", target_project_id: f.target }]
    });
    expect(JSON.stringify(result?.projects)).not.toMatch(/lease_token|lease_expires_at|token_hash/);
  });
  it("deletes a collaborator's account without damaging another owner's consolidated project", async () => {
    const owner = await seedConsolidationProjects(pool, db),
      other = await seedConsolidationProjects(pool, db),
      hooks = createPostgresWebhookDeliveryStore(db);
    const retainedMember = await seedExternalProjectCollaborator(pool, [
      other.source,
      other.target
    ]);
    for (const project of [other.source, other.target])
      await pool.query(
        "INSERT INTO project_members(id,project_id,user_id,role) VALUES(gen_random_uuid(),$1,$2,'admin')",
        [project, owner.userId]
      );
    await pool.query(
      "UPDATE project_members SET invited_by_user_id=$1 WHERE project_id=ANY($2::uuid[]) AND user_id=$3",
      [owner.userId, [other.source, other.target], retainedMember]
    );
    await hooks.createWebhookForOrganization({
      organization_id: other.organizationId,
      project_id: other.source,
      created_by_user_id: owner.userId,
      url: "https://example.test/foreign-hook",
      signing_secret: "fixture-owner",
      events: ["bundle.created"],
      filters: {},
      is_enabled: true
    });
    await owner.consolidate();
    await other.consolidate();
    const result = await createPostgresAccountStore(db).deleteAccountForOrganization({
      organization_id: owner.organizationId,
      user_id: owner.userId,
      deleted_at: new Date().toISOString()
    });
    expect(result).toMatchObject({ user_deleted: true });
    expect(
      (await pool.query("SELECT id FROM projects WHERE organization_id=$1", [other.organizationId]))
        .rowCount
    ).toBe(2);
    expect(
      (await pool.query("SELECT id FROM project_members WHERE user_id=$1", [owner.userId])).rows
    ).toEqual([]);
    expect(
      (
        await pool.query("SELECT id FROM agent_webhooks WHERE created_by_user_id=$1", [
          owner.userId
        ])
      ).rows
    ).toEqual([]);
    expect(
      (await pool.query("SELECT id FROM service_definitions WHERE project_id=$1", [other.target]))
        .rowCount
    ).toBe(1);
    expect(
      (
        await pool.query(
          "SELECT invited_by_user_id FROM project_members WHERE project_id=ANY($1::uuid[]) AND user_id=$2",
          [[other.source, other.target], retainedMember]
        )
      ).rows
    ).toEqual([{ invited_by_user_id: null }, { invited_by_user_id: null }]);
    const raw = await pool.connect();
    try {
      await raw.query("BEGIN");
      await raw.query(
        "SELECT set_config('debugbundle.account_deletion_user',$1,true),set_config('debugbundle.account_deletion_projects',$2::uuid[]::text,true)",
        [owner.userId, [other.source, other.target]]
      );
      await expect(
        raw.query("DELETE FROM project_members WHERE project_id=$1 AND user_id=$2", [
          other.source,
          retainedMember
        ])
      ).rejects.toMatchObject({ message: "project_consolidated" });
    } finally {
      await raw.query("ROLLBACK");
      raw.release();
    }
  });
});
