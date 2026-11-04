import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { Queryable } from "../../packages/storage/src/types.js";
import { createServiceDefinitionStore } from "../../packages/storage/src/service-definition-store.js";
import { createProjectMergeStore } from "../../packages/storage/src/project-merge-store.js";
import { seedOwnedProject } from "./integration-setup.js";

export async function seedConsolidationProjects(pool: Pool, db: Queryable) {
  const organizationId = randomUUID(),
    userId = randomUUID(),
    target: string = randomUUID(),
    source: string = randomUUID();
  await seedOwnedProject({
    pool,
    organizationId,
    projectId: target,
    organizationName: "Consolidation",
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
  const web = await definitions.create({ project_id: source, user_id: userId, name: "web" });
  const request = {
    target_project_id: target,
    source_project_ids: [source],
    service_mappings: [
      { source_project_id: source, service_definition_id: web.service_definition_id, name: "Site" }
    ]
  };
  const store = createProjectMergeStore(db, { enabled: true });
  return {
    organizationId,
    userId,
    target,
    source,
    definitions,
    request,
    store,
    consolidate: async () => {
      const plan = await store.preview({ user_id: userId, request });
      if (!plan.ready) throw new Error(`fixture_merge_blocked:${JSON.stringify(plan.blockers)}`);
      return store.apply({
        user_id: userId,
        request,
        plan_digest: plan.plan_digest,
        idempotency_key: randomUUID()
      });
    }
  };
}
