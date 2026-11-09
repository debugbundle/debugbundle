import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  createPostgresMetadataStore,
  createPostgresImprovementOpportunityStore
} from "../../packages/storage/src/index.js";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import {
  migrateStorageSchema,
  assertStorageSchemaMigrationsApplied
} from "../../packages/storage/src/schema-migrations.js";
import { PROJECT_ACTOR_ROLE_STATEMENT } from "../../packages/storage/src/organization-access-schema.js";
import { SELFHOST_ORGANIZATION_ACCESS_MIGRATION } from "../../packages/storage/src/selfhost-organization-access-schema.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration
} from "../helpers/integration-setup.js";

runIntegration("live organization project grants", () => {
  const pool = createIntegrationPool();
  afterAll(async () => {
    await pool.end();
  });
  beforeEach(async () => {
    await pool.query("DROP SCHEMA public CASCADE");
    await pool.query("CREATE SCHEMA public");
    await bootstrapStorageSchema(createQueryable(pool));
  });
  afterEach(() => vi.unstubAllEnvs());
  it("requires the forward self-hosted access function before becoming ready", async () => {
    const db = createQueryable(pool);
    await migrateStorageSchema(db);
    await pool.query(PROJECT_ACTOR_ROLE_STATEMENT);
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow(
      "selfhost_organization_access_schema_incomplete"
    );
    await pool.query("DELETE FROM storage_migration_ledger WHERE id=$1", [
      SELFHOST_ORGANIZATION_ACCESS_MIGRATION.id
    ]);
    expect((await migrateStorageSchema(db)).applied).toEqual([
      SELFHOST_ORGANIZATION_ACCESS_MIGRATION.id
    ]);
    await expect(assertStorageSchemaMigrationsApplied(db)).resolves.toBeUndefined();
  });
  it("unlocks self-hosted inherited roles without broadening legacy credentials or suspension", async () => {
    vi.stubEnv("SELFHOST_MODE", "true");
    const owner = randomUUID(),
      admin = randomUUID(),
      org = randomUUID(),
      project = randomUUID();
    for (const user of [owner, admin])
      await pool.query("INSERT INTO users(id,email,email_verified_at) VALUES($1,$2,now())", [
        user,
        `${user}@example.test`
      ]);
    await pool.query(
      "INSERT INTO organizations(id,name,slug,plan) VALUES($1,'Self-hosted',$2,'free')",
      [org, org]
    );
    for (const [user, role] of [
      [owner, "owner"],
      [admin, "admin"]
    ])
      await pool.query(
        "INSERT INTO organization_members(id,organization_id,user_id,role) VALUES($1,$2,$3,$4)",
        [randomUUID(), org, user, role]
      );
    await pool.query(
      "INSERT INTO projects(id,organization_id,owner_user_id,name,slug) VALUES($1,$2,$3,'Test',$4)",
      [project, org, owner, project]
    );
    const role = async (inherit: boolean) =>
      (
        await pool.query<{ role: string | null }>(
          "SELECT debugbundle_project_actor_role($1,$2,$3,true) AS role",
          [project, admin, inherit]
        )
      ).rows[0]!.role;
    expect(await role(true)).toBe("admin");
    expect(await role(false)).toBeNull();
    const created = await createPostgresMetadataStore(createQueryable(pool)).createProjectForUser!({
      organization_id: org,
      user_id: admin,
      name: "Admin project",
      slug: randomUUID(),
      environment_default: "production",
      weekly_report_timezone: "UTC",
      include_organization_grants: true
    });
    expect(created?.owner_user_id).toBe(owner);
    await pool.query(
      "UPDATE organization_members SET suspended_at=now() WHERE organization_id=$1 AND user_id=$2",
      [org, admin]
    );
    expect(await role(true)).toBeNull();
  });
  it("keeps inherited and legacy grants distinct and checks suspension in SQL", async () => {
    const owner = randomUUID(),
      admin = randomUUID(),
      selected = randomUUID(),
      org = randomUUID(),
      project = randomUUID();
    for (const user of [owner, admin, selected])
      await pool.query("INSERT INTO users(id,email) VALUES($1,$2)", [user, `${user}@example.test`]);
    await pool.query(
      "INSERT INTO organizations(id,name,slug,plan) VALUES($1,'Test',$2,'business')",
      [org, org]
    );
    await pool.query(
      "INSERT INTO organization_members(id,organization_id,user_id,role) VALUES($1,$2,$3,'admin')",
      [randomUUID(), org, admin]
    );
    await pool.query(
      "INSERT INTO projects(id,organization_id,owner_user_id,name,slug) VALUES($1,$2,$3,'Test',$4)",
      [project, org, owner, project]
    );
    const role = async (user: string, inherit: boolean) =>
      (
        await pool.query<{ role: string | null }>(
          "SELECT debugbundle_project_actor_role($1,$2,$3,false) AS role",
          [project, user, inherit]
        )
      ).rows[0]!.role;
    expect(await role(owner, false)).toBe("owner");
    expect(await role(admin, false)).toBeNull();
    expect(await role(admin, true)).toBe("admin");
    expect(await role(selected, true)).toBeNull();
    await pool.query(
      "INSERT INTO project_members(id,project_id,user_id,role) VALUES($1,$2,$3,'viewer')",
      [randomUUID(), project, selected]
    );
    expect(await role(selected, false)).toBe("viewer");
    await pool.query(
      "UPDATE project_members SET role='member' WHERE project_id=$1 AND user_id=$2",
      [project, selected]
    );
    expect(await role(selected, false)).toBe("member");
    await pool.query(
      "UPDATE project_members SET role='viewer' WHERE project_id=$1 AND user_id=$2",
      [project, selected]
    );
    expect(
      (
        await pool.query("SELECT debugbundle_rule_actor_allowed($1,$2,NULL,false) AS allowed", [
          project,
          selected
        ])
      ).rows[0].allowed
    ).toBe(false);
    await pool.query(
      "UPDATE organization_members SET suspended_at=now() WHERE user_id=$1 AND organization_id=$2",
      [admin, org]
    );
    expect(await role(admin, true)).toBeNull();
    await pool.query("UPDATE organizations SET plan='team' WHERE id=$1", [org]);
    expect(await role(selected, false)).toBe("viewer");
    expect(await role(admin, true)).toBeNull();
    await pool.query("UPDATE organizations SET plan='free' WHERE id=$1", [org]);
    const metadata = createPostgresMetadataStore(createQueryable(pool));
    expect(
      await metadata.resolveProjectAccessForUser!({ user_id: selected, project_id: project })
    ).toMatchObject({ effective_role: "viewer", shared_access_suspended: true });
    expect(
      await metadata.listProjectsForUser!({
        user_id: selected,
        now: new Date().toISOString(),
        limit: 10
      })
    ).toEqual([
      expect.objectContaining({
        project_id: project,
        effective_role: "viewer",
        shared_access_suspended: true
      })
    ]);
  });
  it("filters lists and writes before pagination without expanding legacy credentials", async () => {
    const owner = randomUUID(),
      admin = randomUUID(),
      viewer = randomUUID(),
      org = randomUUID();
    const projects = [randomUUID(), randomUUID()],
      incidents = [randomUUID(), randomUUID()];
    for (const user of [owner, admin, viewer])
      await pool.query("INSERT INTO users(id,email) VALUES($1,$2)", [user, `${user}@example.test`]);
    await pool.query(
      "INSERT INTO organizations(id,name,slug,plan) VALUES($1,'Test',$2,'business')",
      [org, org]
    );
    await pool.query(
      "INSERT INTO organization_members(id,organization_id,user_id,role) VALUES($1,$2,$3,'admin')",
      [randomUUID(), org, admin]
    );
    for (const [index, project] of projects.entries()) {
      await pool.query(
        "INSERT INTO projects(id,organization_id,owner_user_id,name,slug) VALUES($1,$2,$3,'Test',$4)",
        [project, org, owner, project]
      );
      await pool.query(
        "INSERT INTO incidents(id,project_id,environment,fingerprint,title,severity,first_seen_at,last_seen_at) VALUES($1::uuid,$2,'production',$1::uuid::text,'Example','high',now(),now())",
        [incidents[index], project]
      );
      await pool.query(
        "INSERT INTO project_members(id,project_id,user_id,role) VALUES($1,$2,$3,'viewer')",
        [randomUUID(), project, viewer]
      );
    }
    const metadata = createPostgresMetadataStore(createQueryable(pool));
    const inherited = {
      organization_id: org,
      user_id: admin,
      include_organization_grants: true,
      limit: 10
    };
    expect(
      await metadata.listIncidentsForOrganization({
        organization_id: org,
        user_id: admin,
        limit: 10
      })
    ).toEqual([]);
    expect(
      await metadata.listProjectsForUser!({
        now: new Date().toISOString(),
        user_id: admin,
        limit: 10
      })
    ).toEqual([]);
    expect(
      (
        await metadata.listProjectsForUser!({
          now: new Date().toISOString(),
          user_id: admin,
          include_organization_grants: true,
          origin_project_ids: [projects[0]!],
          limit: 1
        })
      ).map((p) => p.project_id)
    ).toEqual([projects[0]]);
    expect(
      (
        await metadata.listIncidentsForOrganization({
          ...inherited,
          origin_project_ids: [projects[0]!],
          limit: 1
        })
      ).map((i) => i.project_id)
    ).toEqual([projects[0]]);
    expect(
      await metadata.listServicesForOrganization!({
        ...inherited,
        project_id: projects[1]!,
        origin_project_ids: [projects[0]!]
      })
    ).toBeNull();
    expect(
      await metadata.resolveIncidentForOrganization({
        ...inherited,
        incident_id: incidents[1]!,
        origin_project_ids: [projects[0]!],
        resolved_by_member_id: admin,
        resolved_at: new Date().toISOString()
      })
    ).toBeNull();
    expect(
      await metadata.resolveIncidentForOrganization({
        organization_id: org,
        user_id: viewer,
        incident_id: incidents[0]!,
        resolved_by_member_id: viewer,
        resolved_at: new Date().toISOString()
      })
    ).toBeNull();
    expect(
      await metadata.resolveIncidentForOrganization({
        ...inherited,
        incident_id: incidents[0]!,
        origin_project_ids: [projects[0]!],
        resolved_by_member_id: admin,
        resolved_at: new Date().toISOString()
      })
    ).not.toBeNull();
    await pool.query(
      "UPDATE organization_members SET suspended_at=now() WHERE organization_id=$1 AND user_id=$2",
      [org, admin]
    );
    expect(await metadata.listIncidentsForOrganization(inherited)).toEqual([]);
    expect(
      await metadata.reopenIncidentForOrganization({ ...inherited, incident_id: incidents[0]! })
    ).toBeNull();
    const improvements = createPostgresImprovementOpportunityStore(createQueryable(pool));
    // The same SQL write policy denies a suspended inherited actor even for a known id.
    expect(
      await improvements.reopenImprovementForOrganization({
        ...inherited,
        improvement_id: randomUUID()
      })
    ).toBeNull();
  });
});
