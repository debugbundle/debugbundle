import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import { migrateStorageSchema } from "../../packages/storage/src/schema-migrations.js";
import { createMetadataAlerts } from "../../packages/storage/src/metadata-alerts.js";
import { alertScopeProjectionSql } from "../../packages/storage/src/alert-scope-projection.js";
import { createPostgresAlertDeliveryStore } from "../../packages/storage/src/alert-delivery-store.js";
import { createProjectMergeStore } from "../../packages/storage/src/project-merge-store.js";
import { createServiceDefinitionStore } from "../../packages/storage/src/service-definition-store.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration,
  seedOwnedProject
} from "../helpers/integration-setup.js";

runIntegration("alert scope read projection", () => {
  const pool = createIntegrationPool();
  const db = createQueryable(pool);
  const alerts = createMetadataAlerts(db);
  beforeAll(async () => {
    await bootstrapStorageSchema(db);
    await migrateStorageSchema(db);
  });
  afterAll(async () => {
    await pool.end();
  });

  async function fixture() {
    const organizationId = randomUUID(),
      userId = randomUUID(),
      target = randomUUID(),
      source = randomUUID();
    await seedOwnedProject({
      pool,
      organizationId,
      projectId: target,
      organizationName: "Scope",
      organizationSlug: organizationId,
      projectName: "System",
      projectSlug: target,
      ownerUserId: userId,
      organizationPlan: "team"
    });
    await pool.query(
      "INSERT INTO projects(id,organization_id,owner_user_id,name,slug) VALUES($1::uuid,$2,$3,'Source',$1::text)",
      [source, organizationId, userId]
    );
    const definitions = createServiceDefinitionStore(db);
    await definitions.create({ project_id: target, user_id: userId, name: "api" });
    const web = await definitions.create({ project_id: source, user_id: userId, name: "web" });
    const production = randomUUID(),
      staging = randomUUID();
    await pool.query(
      "INSERT INTO services(id,project_id,name,environment) VALUES($1,$3,'web','production'),($2,$3,'web','staging')",
      [production, staging, source]
    );
    const create = (projectId: string, serviceId?: string) =>
      alerts.createAlertForOrganization({
        organization_id: organizationId,
        project_id: projectId,
        created_by_user_id: userId,
        ...(serviceId ? { service_id: serviceId } : {}),
        channel: "email",
        condition_type: "new_incident",
        cooldown_seconds: 60,
        config: { to: "owner@example.test" },
        is_enabled: true
      });
    const list = (view = target, include_scope = true) =>
      alerts.listAlertsForOrganization({
        organization_id: organizationId,
        project_id: view,
        limit: 100,
        ...(include_scope ? { include_scope: true } : {})
      });
    const merge = async () => {
      const store = createProjectMergeStore(db, { enabled: true });
      const request = {
        target_project_id: target,
        source_project_ids: [source],
        service_mappings: [
          {
            source_project_id: source,
            service_definition_id: web.service_definition_id,
            name: "Site"
          }
        ]
      };
      const plan = await store.preview({ user_id: userId, request });
      expect(plan.blockers).toEqual([]);
      await store.apply({
        user_id: userId,
        request,
        plan_digest: plan.plan_digest,
        idempotency_key: randomUUID()
      });
    };
    return {
      organizationId,
      userId,
      target,
      source,
      web,
      production,
      staging,
      create,
      list,
      merge
    };
  }

  it("distinguishes retained origins from new global rules without changing matching or default reads", async () => {
    const f = await fixture();
    const targetRule = await f.create(f.target),
      sourceRule = await f.create(f.source);
    await f.merge();
    const global = await f.create(f.target);
    const rows = await f.list();
    expect(rows?.find((r) => r.alert_id === targetRule!.alert_id)?.scope).toMatchObject({
      origin_project_ids: [f.target],
      covers_current_project: false,
      service_count: 1,
      services: [{ name: "api" }]
    });
    expect(rows?.find((r) => r.alert_id === sourceRule!.alert_id)?.scope).toMatchObject({
      origin_project_ids: [f.source],
      covers_current_project: false,
      service_count: 1,
      services: [{ name: "Site" }]
    });
    expect(rows?.find((r) => r.alert_id === global!.alert_id)?.scope).toMatchObject({
      covers_current_project: true,
      service_count: 2
    });
    expect((await f.list(f.target, false))?.every((r) => !Object.hasOwn(r, "scope"))).toBe(true);
    const matching = await createPostgresAlertDeliveryStore(db).listMatchingAlerts({
      project_id: f.source,
      service_name: "web",
      environment: "production",
      condition_type: "new_incident",
      severity: "high"
    });
    expect(matching.map((r) => r.alert_id).sort()).toEqual(
      [sourceRule!.alert_id, global!.alert_id].sort()
    );
    await alerts.updateAlertForOrganization({
      organization_id: f.organizationId,
      project_id: f.target,
      alert_id: sourceRule!.alert_id,
      actor_user_id: f.userId,
      cooldown_seconds: 86400
    });
    expect((await f.list())?.find((r) => r.alert_id === sourceRule!.alert_id)?.scope).toMatchObject(
      { origin_project_ids: [f.source], covers_current_project: false }
    );
  });

  it("separates the saved origin scope from its current service filter", async () => {
    const f = await fixture();
    await f.merge();
    const rule = await f.create(f.target, f.production);
    const scope = (await f.list())?.find((r) => r.alert_id === rule!.alert_id)?.scope;
    expect(scope).toMatchObject({
      covers_current_project: true,
      service_count: 2,
      service_filter: { service_id: f.production, name: "Site", environment: "production" }
    });
    expect(scope?.services.map((s) => s.name)).toEqual(["Site", "api"]);
  });

  it("keeps a selected environment instance and current view name distinct from all services", async () => {
    const f = await fixture();
    const filtered = await f.create(f.source, f.production);
    await f.merge();
    expect((await f.list())?.find((r) => r.alert_id === filtered!.alert_id)?.scope).toMatchObject({
      covers_current_project: false,
      service_count: 1,
      services: [{ service_definition_id: f.web.service_definition_id, name: "Site" }],
      service_filter: { service_id: f.production, name: "Site", environment: "production" }
    });
    expect((await f.list(f.source))?.[0]?.scope).toMatchObject({
      covers_current_project: true,
      services: [{ name: "web" }],
      service_filter: { service_id: f.production, name: "web", environment: "production" }
    });
  });

  it("evaluates legacy NULL snapshots without widening to the canonical closure", async () => {
    const f = await fixture();
    await f.merge();
    const result = await pool.query(
      `WITH legacy_rule AS (SELECT $2::uuid AS project_id,NULL::uuid[] AS scope_origin_ids,NULL::uuid AS service_id) SELECT ${alertScopeProjectionSql("legacy_rule", "$1")} AS scope FROM legacy_rule`,
      [f.target, f.source]
    );
    expect(result.rows[0].scope).toMatchObject({
      origin_project_ids: [f.source],
      covers_current_project: false,
      service_count: 1,
      services: [{ name: "Site" }]
    });
  });

  it("does not disclose a widened rule's other origins through a retained view", async () => {
    const f = await fixture(),
      rule = await f.create(f.source);
    await f.merge();
    await alerts.updateAlertForOrganization({
      organization_id: f.organizationId,
      project_id: f.target,
      alert_id: rule!.alert_id,
      actor_user_id: f.userId,
      project_scope: "current_project"
    });
    expect((await f.list())?.[0]?.scope?.covers_current_project).toBe(true);
    expect((await f.list(f.source))?.[0]?.scope).toBeNull();
  });

  it("bounds visible services while retaining their true total and reserved names", async () => {
    const f = await fixture();
    await f.create(f.target);
    await pool.query(
      "SELECT debugbundle_observe_service($1::uuid,'extra-' || lpad(n::text,3,'0')) FROM generate_series(1,105) n",
      [f.target]
    );
    const scope = (await f.list())?.[0]?.scope;
    expect(scope).toMatchObject({ covers_current_project: true, service_count: 106 });
    expect(scope?.services).toHaveLength(100);
    expect(scope?.services[0]?.name).toBe("api");
  });

  it("reports a new scope with no observed services without inventing names", async () => {
    const f = await fixture();
    const empty = randomUUID();
    await pool.query(
      "INSERT INTO projects(id,organization_id,owner_user_id,name,slug) VALUES($1::uuid,$2,$3,'Empty',$1::text)",
      [empty, f.organizationId, f.userId]
    );
    await f.create(empty);
    expect((await f.list(empty))?.[0]?.scope).toEqual({
      origin_project_ids: [empty],
      covers_current_project: true,
      services: [],
      service_count: 0,
      service_filter: null
    });
  });
});
