import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import {
  createPostgresMetadataStore,
  migrateStorageSchema
} from "../../packages/storage/src/index.js";
import { upsertDeploymentFromEvent } from "../../packages/storage/src/metadata-incident-shared.js";
import {
  createIntegrationPool,
  runIntegration,
  seedOwnedProject
} from "../helpers/integration-setup.ts";

runIntegration("deployment attribution", () => {
  const pool = createIntegrationPool();
  beforeAll(async () => {
    await bootstrapStorageSchema(pool);
    await migrateStorageSchema(pool);
  });
  afterAll(async () => {
    await pool.end();
  });
  it("uses only project/service/environment deployment history before the occurrence", async () => {
    const projectId = randomUUID();
    const otherProjectId = randomUUID();
    for (const id of [projectId, otherProjectId]) {
      await seedOwnedProject({
        pool,
        organizationId: randomUUID(),
        projectId: id,
        organizationName: "Deploy test",
        organizationSlug: `deploy-${id}`,
        projectName: "Deploy test",
        projectSlug: `deploy-${id}`
      });
    }
    const api = randomUUID();
    const otherApi = randomUUID();
    const staging = randomUUID();
    const otherProjectService = randomUUID();
    for (const [id, project, name, environment] of [
      [api, projectId, "api", "production"],
      [otherApi, projectId, "other-api", "production"],
      [staging, projectId, "api", "staging"],
      [otherProjectService, otherProjectId, "api", "production"]
    ]) {
      await pool.query(
        "INSERT INTO services(id, project_id, name, environment) VALUES($1,$2,$3,$4)",
        [id, project, name, environment]
      );
      await upsertDeploymentFromEvent({
        db: pool,
        event_id: randomUUID(),
        project_id: project!,
        service_id: id!,
        environment: environment!,
        commit_sha: id!,
        version: "release",
        branch: "main",
        deployed_at: "2026-09-13T10:00:00.000Z"
      });
    }
    await upsertDeploymentFromEvent({
      db: pool,
      event_id: randomUUID(),
      project_id: projectId,
      service_id: api,
      environment: "production",
      commit_sha: "future",
      version: "future",
      branch: "main",
      deployed_at: "2026-09-14T10:00:00.000Z"
    });
    const store = createPostgresMetadataStore(pool);
    const input = {
      project_id: projectId,
      service_id: api,
      environment: "production",
      occurred_at: "2026-09-13T12:00:00.000Z"
    };
    expect(await store.getDeploymentForServiceAt!(input)).toMatchObject({ commit_sha: api });
    expect(
      await store.getDeploymentForServiceAt!({ ...input, project_id: otherProjectId })
    ).toBeNull();
    expect(await store.getDeploymentForServiceAt!({ ...input, environment: "staging" })).toBeNull();
    expect(
      await store.getDeploymentForServiceAt!({ ...input, occurred_at: "2026-09-12T12:00:00.000Z" })
    ).toBeNull();
  });
});
