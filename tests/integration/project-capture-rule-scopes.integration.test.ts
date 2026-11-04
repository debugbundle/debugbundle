import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import { migrateStorageSchema } from "../../packages/storage/src/schema-migrations.js";
import { createProjectMergeStore } from "../../packages/storage/src/project-merge-store.js";
import { createPostgresCaptureRuleStore } from "../../packages/storage/src/capture-rule-store.js";
import { createServiceDefinitionStore } from "../../packages/storage/src/service-definition-store.js";
import { createCaptureRuleManagement } from "../../packages/storage/src/capture-rule-management.js";
import { CaptureRulesResponseSchema } from "../../packages/shared-types/src/index.js";
import { seedExternalProjectCollaborator } from "../helpers/shared-project-collaborator.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration,
  seedOwnedProject
} from "../helpers/integration-setup.js";

runIntegration("capture rule origin snapshots and service-filter namespaces", () => {
  const pool = createIntegrationPool(),
    db = createQueryable(pool);
  const rules = createPostgresCaptureRuleStore(db);
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
      organizationName: "Rules",
      organizationSlug: organizationId,
      projectName: "System",
      projectSlug: target,
      ownerUserId: userId,
      organizationPlan: "team"
    });
    await pool.query(
      "INSERT INTO projects(id,organization_id,owner_user_id,name,slug) VALUES($1::uuid,$2,$3,'Site',$1::text)",
      [source, organizationId, userId]
    );
    const definitions = createServiceDefinitionStore(db);
    await definitions.create({ project_id: target, user_id: userId, name: "web" });
    await definitions.create({ project_id: source, user_id: userId, name: "web" });
    const create = (project: string, matcher: { message_contains?: string; services?: string[] }) =>
      rules.createCaptureRule({
        id: randomUUID(),
        project_id: project,
        name: "Noise",
        action: "drop",
        matcher
      });
    const consolidate = async () => {
      const services = (await definitions.list({ project_id: source, user_id: userId, limit: 100 }))
        .services;
      const request = {
        target_project_id: target,
        source_project_ids: [source],
        service_mappings: services.map((d) => ({
          source_project_id: source,
          service_definition_id: d.service_definition_id,
          name: d.name === "web" ? "Site" : `Site-${d.name}`
        }))
      };
      const merge = createProjectMergeStore(db, { enabled: true });
      const preview = await merge.preview({ user_id: userId, request });
      expect(preview.blockers).toEqual([]);
      return merge.apply({
        user_id: userId,
        request,
        plan_digest: preview.plan_digest,
        idempotency_key: randomUUID()
      });
    };
    const active = (project: string) =>
      rules.listActiveCaptureRulesByProjectId({
        project_id: project,
        now: new Date().toISOString()
      });
    return { organizationId, userId, target, source, create, consolidate, active, definitions };
  }
  it("preserves both old scopes while a newly created project rule intentionally covers current origins", async () => {
    const f = await fixture();
    const sourceRule = await f.create(f.source, { message_contains: "old-source" });
    const targetRule = await f.create(f.target, { message_contains: "old-target" });
    await f.consolidate();
    const wide = await f.create(f.target, { message_contains: "new-project" });
    expect((await f.active(f.source)).map((r) => r.id).sort()).toEqual(
      [sourceRule.id, wide.id].sort()
    );
    expect((await f.active(f.target)).map((r) => r.id).sort()).toEqual(
      [targetRule.id, wide.id].sort()
    );
    expect((await rules.listCaptureRulesByProjectId(f.target)).map((r) => r.id).sort()).toEqual(
      [sourceRule.id, targetRule.id, wide.id].sort()
    );
    await rules.updateCaptureRule({ project_id: f.target, id: sourceRule.id, enabled: false });
    expect(
      (await rules.getCaptureRuleById({ project_id: f.target, id: sourceRule.id }))?.project_id
    ).toBe(f.source);
  });
  it("interprets each service filter in its issuing view instead of matching another origin's old input name", async () => {
    const f = await fixture();
    await f.consolidate();
    const canonicalWeb = await f.create(f.target, { services: ["web"] });
    const site = await f.create(f.target, { services: ["Site"] });
    expect((await f.active(f.source)).map((r) => r.id)).toEqual([site.id]);
    expect((await f.active(f.target)).map((r) => r.id)).toEqual([canonicalWeb.id]);
    expect((await f.active(f.source))[0]?.matcher.services).toEqual(["Site", "web"]);
    await rules.recordCaptureRuleMatch({
      id: site.id,
      project_id: f.source,
      matched_at: new Date().toISOString()
    });
    expect((await rules.getCaptureRuleById({ id: site.id, project_id: f.target }))?.hit_count).toBe(
      1
    );
  });
  it("reserves configured future service names before a merge can reuse them", async () => {
    const f = await fixture();
    const future = await f.create(f.source, { services: ["future"] });
    expect(
      (await f.definitions.list({ project_id: f.source, user_id: f.userId, limit: 100 })).services
        .map((d) => d.name)
        .sort()
    ).toEqual(["future", "web"]);
    await f.consolidate();
    expect((await f.active(f.source)).find((r) => r.id === future.id)?.matcher.services).toEqual([
      "Site-future",
      "future"
    ]);
    expect(await f.active(f.target)).toEqual([]);
  });
  it("projects manager filters into canonical names and widens only through an explicit edit", async () => {
    const f = await fixture();
    const original = await f.create(f.source, { services: ["web"] });
    await f.consolidate();
    expect(
      (await rules.getCaptureRuleById({ id: original.id, project_id: f.target }))?.matcher.services
    ).toEqual(["Site"]);
    expect(
      (await rules.getCaptureRuleById({ id: original.id, project_id: f.source }))?.matcher.services
    ).toEqual(["web"]);
    await rules.updateCaptureRule({ id: original.id, project_id: f.target, name: "Renamed rule" });
    expect(await f.active(f.target)).toEqual([]);
    expect(
      (
        await pool.query(
          "SELECT matcher,filter_project_id,scope_origin_ids FROM capture_rules WHERE id=$1",
          [original.id]
        )
      ).rows
    ).toEqual([
      { matcher: { services: ["web"] }, filter_project_id: f.source, scope_origin_ids: [f.source] }
    ]);
    await rules.updateCaptureRule({
      id: original.id,
      project_id: f.target,
      project_scope: "current_project",
      matcher: { services: ["web"] }
    });
    expect((await f.active(f.target)).map((r) => r.id)).toEqual([original.id]);
    expect(await f.active(f.source)).toEqual([]);
    await expect(
      pool.query("UPDATE capture_rules SET enabled=false WHERE id=$1", [original.id])
    ).rejects.toThrow("project_consolidated");
  });
  it("rechecks current canonical admin membership inside the configuration transaction", async () => {
    const f = await fixture(),
      member = randomUUID();
    await pool.query("INSERT INTO users(id,email) VALUES($1,$2)", [
      member,
      `${member}@example.test`
    ]);
    await pool.query(
      "INSERT INTO organization_members(id,organization_id,user_id,role) VALUES($1,$2,$3,'member')",
      [randomUUID(), f.organizationId, member]
    );
    for (const project of [f.source, f.target])
      await pool.query(
        "INSERT INTO project_members(id,project_id,user_id,role) VALUES($1,$2,$3,'admin')",
        [randomUUID(), project, member]
      );
    const original = await f.create(f.source, { message_contains: "noise" });
    await f.consolidate();
    await pool.query("DELETE FROM project_members WHERE project_id=$1 AND user_id=$2", [
      f.target,
      member
    ]);
    const management = createCaptureRuleManagement(db);
    expect(
      await management.updateCaptureRuleForProject({
        organization_id: f.organizationId,
        actor_user_id: member,
        project_id: f.target,
        rule_id: original.id,
        update: { enabled: false }
      })
    ).toBeNull();
    expect(
      (await rules.getCaptureRuleById({ id: original.id, project_id: f.target }))?.enabled
    ).toBe(true);
  });
  it("keeps new logical names inside the installed capture-rule contract while legacy names remain separate", async () => {
    const f = await fixture(),
      name = "n".repeat(120);
    await f.definitions.create({ project_id: f.target, user_id: f.userId, name });
    await f.create(f.target, { services: [name] });
    expect(
      CaptureRulesResponseSchema.parse({
        access_mode: "manage",
        rules: await rules.listCaptureRulesByProjectId(f.target)
      }).rules[0]?.matcher.services
    ).toEqual([name]);
    await expect(
      f.definitions.create({ project_id: f.target, user_id: f.userId, name: name + "n" })
    ).rejects.toThrow();
  });
  it("preserves an invited administrator's own-account identity after consolidation", async () => {
    const f = await fixture();
    const member = await seedExternalProjectCollaborator(pool, [f.source, f.target]);
    const original = await f.create(f.source, { message_contains: "noise" });
    await f.consolidate();
    expect(
      await createCaptureRuleManagement(db).updateCaptureRuleForProject({
        organization_id: f.organizationId,
        actor_user_id: member,
        project_id: f.target,
        rule_id: original.id,
        update: { enabled: false }
      })
    ).not.toBeNull();
  });
});
