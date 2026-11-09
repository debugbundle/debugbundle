import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import predecessor from "../fixtures/project-service-predecessor.json" with { type: "json" };
import {
  bootstrapStorageSchema,
  bootstrapStorageSchemaIfEmpty
} from "../../packages/storage/src/migrations.js";
import { createServiceDefinitionStore } from "../../packages/storage/src/service-definition-store.js";
import { createPostgresGitHubStore } from "../../packages/storage/src/github-store.js";
import { createProjectMergeStore } from "../../packages/storage/src/project-merge-store.js";
import { getOrCreateServiceId } from "../../packages/storage/src/metadata-incident-shared.js";
import { inspectProjectMergeInventory } from "../../packages/storage/src/project-merge-inventory.js";
import { createProjectServicesApi } from "../../packages/project-management-client/src/project-services.js";
import { createApiServer } from "../../apps/api/src/server.js";
import { createBaseDependencies } from "../helpers/api-capture-rule-ingestion.js";
import {
  STORAGE_SCHEMA_MIGRATIONS,
  migrateStorageSchema,
  assertStorageSchemaMigrationsApplied
} from "../../packages/storage/src/schema-migrations.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration,
  seedOwnedProject
} from "../helpers/integration-setup.js";

runIntegration("logical services on fresh and populated databases", () => {
  const pool = createIntegrationPool();
  const db = createQueryable(pool);
  beforeAll(async () => {
    await bootstrapStorageSchema(db);
    await migrateStorageSchema(db);
  });
  afterAll(async () => {
    await pool.end();
  });

  async function project(legacyProjectId?: string) {
    const ids = {
      projectId: legacyProjectId ?? randomUUID(),
      organizationId: randomUUID(),
      userId: randomUUID()
    };
    await seedOwnedProject({
      pool,
      projectId: ids.projectId,
      organizationId: ids.organizationId,
      organizationName: "Service test",
      organizationSlug: ids.organizationId,
      projectName: "Service test",
      projectSlug: ids.projectId,
      organizationPlan: "team",
      ownerUserId: ids.userId,
      ownerEmail: `${ids.userId}@example.test`
    });
    return ids;
  }

  it("rejects credential-bearing metadata and sanitizes historical catalogue output without rewriting it", async () => {
    const { projectId, userId } = await project(),
      store = createServiceDefinitionStore(db);
    const token = "dbundle_proj_synthetic_not_a_real_credential";
    for (const metadata of [
      { name: token },
      { name: "safe", description: `Authorization: Bearer ${token}` }
    ]) {
      await expect(
        store.create({ project_id: projectId, user_id: userId, ...metadata })
      ).rejects.toThrow("unsafe_service_metadata");
    }
    const instance = await getOrCreateServiceId(db, projectId, token, "production");
    const rows = await store.list({ project_id: projectId, user_id: userId, limit: 100 });
    expect(JSON.stringify(rows)).not.toContain(token);
    expect(rows.services[0]).toMatchObject({
      name: "[REDACTED]",
      input_name: "[REDACTED]",
      redacted_fields: ["name", "input_name"]
    });
    expect(
      (await pool.query("SELECT name FROM services WHERE id=$1", [instance])).rows[0].name
    ).toBe(token);
    await store.update({
      project_id: projectId,
      user_id: userId,
      service_definition_id: rows.services[0]!.service_definition_id,
      description: "Updated description"
    });
    expect(
      (
        await pool.query("SELECT name,input_name FROM service_definitions WHERE id=$1", [
          rows.services[0]!.service_definition_id
        ])
      ).rows[0]
    ).toEqual({ name: token, input_name: token });
  });

  it("classifies every current table and refuses unknown direct or indirect dependencies", async () => {
    const inventory = await inspectProjectMergeInventory(db);
    expect(inventory.blockers).toEqual([]);
    expect(inventory.complete).toBe(true);
    await pool.query(
      "CREATE TABLE unknown_consumer(id uuid PRIMARY KEY, incident_id uuid REFERENCES incidents(id))"
    );
    try {
      expect((await inspectProjectMergeInventory(db)).blockers).toContain(
        "unclassified_table:unknown_consumer"
      );
    } finally {
      await pool.query("DROP TABLE unknown_consumer");
    }
    await pool.query("ALTER TABLE users ADD COLUMN extra_project_id uuid REFERENCES projects(id)");
    try {
      expect((await inspectProjectMergeInventory(db)).blockers).toContain(
        "unclassified_project_column:users.extra_project_id"
      );
    } finally {
      await pool.query("ALTER TABLE users DROP COLUMN extra_project_id");
    }
  });

  it("links old instance IDs across environments without changing their public meaning", async () => {
    const { projectId } = await project();
    const ids = [randomUUID(), randomUUID()];
    await pool.query(
      "INSERT INTO services(id,project_id,name,environment) VALUES($1,$3,'api','production'),($2,$3,'api','staging')",
      [...ids, projectId]
    );
    const instances = await pool.query<{ id: string; service_definition_id: string }>(
      "SELECT id,service_definition_id FROM services WHERE project_id=$1 ORDER BY environment",
      [projectId]
    );
    expect(new Set(instances.rows.map((r) => r.id))).toEqual(new Set(ids));
    expect(new Set(instances.rows.map((r) => r.service_definition_id)).size).toBe(1);
    expect(instances.rows[0]!.service_definition_id).not.toBeNull();
    expect(
      (
        await pool.query(
          "SELECT name,origin_project_id FROM service_definitions WHERE project_id=$1",
          [projectId]
        )
      ).rows
    ).toEqual([{ name: "api", origin_project_id: projectId }]);
  });

  it("keeps same-named services in independent projects distinct under concurrent creation", async () => {
    const first = await project();
    const second = await project();
    await Promise.all(
      [first, second].flatMap(({ projectId }) =>
        ["production", "staging"].map((env) =>
          pool.query(
            "INSERT INTO services(id,project_id,name,environment) VALUES($1,$2,'web',$3)",
            [randomUUID(), projectId, env]
          )
        )
      )
    );
    const definitions = await pool.query(
      "SELECT id FROM service_definitions WHERE project_id=ANY($1::uuid[])",
      [[first.projectId, second.projectId]]
    );
    expect(definitions.rows).toHaveLength(2);
    expect(definitions.rows[0].id).not.toBe(definitions.rows[1].id);
  });

  it("continues accepting legacy service names beyond the new metadata editor's naming limit", async () => {
    const { projectId } = await project();
    const name = "legacy-service-".repeat(20);
    await pool.query("INSERT INTO services(id,project_id,name) VALUES($1,$2,$3)", [
      randomUUID(),
      projectId,
      name
    ]);
    expect(
      (
        await pool.query<{ name: string }>(
          "SELECT name FROM service_definitions WHERE project_id=$1",
          [projectId]
        )
      ).rows
    ).toEqual([{ name }]);
  });

  it("does not allow an instance to reference another project's logical service", async () => {
    const first = await project();
    const second = await project();
    await pool.query("INSERT INTO services(id,project_id,name) VALUES($1,$2,'api')", [
      randomUUID(),
      first.projectId
    ]);
    const definition = (
      await pool.query("SELECT id FROM service_definitions WHERE project_id=$1", [first.projectId])
    ).rows[0].id;
    await expect(
      pool.query(
        "INSERT INTO services(id,project_id,name,service_definition_id) VALUES($1,$2,'api',$3)",
        [randomUUID(), second.projectId, definition]
      )
    ).rejects.toThrow(/service_definition_scope_mismatch/);
  });

  it("preserves ordinary project deletion without orphaned definitions or instances", async () => {
    const { projectId } = await project();
    await pool.query("INSERT INTO services(id,project_id,name) VALUES($1,$2,'api')", [
      randomUUID(),
      projectId
    ]);
    await pool.query("DELETE FROM projects WHERE id=$1", [projectId]);
    expect(
      (await pool.query("SELECT id FROM service_definitions WHERE project_id=$1", [projectId])).rows
    ).toEqual([]);
    expect(
      (await pool.query("SELECT id FROM services WHERE project_id=$1", [projectId])).rows
    ).toEqual([]);
  });

  it("supports repository overrides, clearing to the default, and complete bounded pagination", async () => {
    const { projectId, userId } = await project();
    const store = createServiceDefinitionStore(db);
    const scope = { project_id: projectId, user_id: userId };
    const first = await store.create({
      ...scope,
      name: "api",
      repository_url: "https://github.com/example/api",
      repository_root: "apps/api"
    });
    const second = await store.create({ ...scope, name: "web" });
    expect(first.repository).toEqual({
      url: "https://github.com/example/api",
      root: "apps/api",
      source: "service"
    });
    expect(second.repository).toBeNull();
    const page = await store.list({ ...scope, limit: 1 });
    expect(page.services).toHaveLength(1);
    expect(page.next_cursor).not.toBeNull();
    const last = await store.list({ ...scope, limit: 1, cursor: page.next_cursor! });
    expect(
      new Set([...page.services, ...last.services].map((s) => s.service_definition_id))
    ).toEqual(new Set([first.service_definition_id, second.service_definition_id]));
    expect(last.next_cursor).toBeNull();
    const updated = await store.update({
      ...scope,
      service_definition_id: first.service_definition_id,
      repository_url: null,
      repository_root: null
    });
    expect(updated.repository).toBeNull();
    expect(
      await store.get({ ...scope, service_definition_id: first.service_definition_id })
    ).toEqual(updated);
  });

  it.each([undefined, "00000000-0000-0000-0000-000000000101"])(
    "executes the shared client through authenticated HTTP routes and real storage with project identity %s",
    async (legacyProjectId) => {
      const { projectId, userId } = await project(legacyProjectId);
      const dependencies = createBaseDependencies();
      const access = await pool.query<{ organization_id: string }>(
        "SELECT organization_id FROM projects WHERE id=$1",
        [projectId]
      );
      dependencies.memberAuth.resolveMemberByTokenHash = () =>
        Promise.resolve({
          member_id: userId,
          organization_id: access.rows[0]!.organization_id,
          role: "owner"
        });
      const app = createApiServer({
        ...dependencies,
        serviceDefinitions: createServiceDefinitionStore(db)
      });
      try {
        const api = createProjectServicesApi({
          request: async (request) => {
            const response = await app.inject({
              method: request.method,
              url: request.path,
              headers: { authorization: `Bearer ${request.bearerToken}` },
              ...(request.body === undefined
                ? {}
                : { payload: request.body as Record<string, unknown> })
            });
            return { status: response.statusCode, body: response.json<unknown>() };
          }
        });
        const scope = { bearerToken: "dbundle_mem_test", projectId };
        const service = await api.createServiceDefinition({ ...scope, service: { name: "api" } });
        expect((await api.listServiceDefinitions(scope)).services).toEqual([service]);
        expect(
          await api.getServiceDefinition({
            ...scope,
            serviceDefinitionId: service.service_definition_id
          })
        ).toEqual(service);
        expect(
          (
            await api.updateServiceDefinition({
              ...scope,
              serviceDefinitionId: service.service_definition_id,
              update: { description: "API service" }
            })
          ).description
        ).toBe("API service");
        const unauthenticated = await app.inject({
          method: "GET",
          url: `/v1/projects/${projectId}/service-definitions`
        });
        expect(unauthenticated.statusCode).toBe(401);
      } finally {
        await app.close();
      }
    }
  );

  it("keeps legacy input names after rename and rejects conflicting names and unsafe repository roots", async () => {
    const { projectId, userId } = await project();
    const store = createServiceDefinitionStore(db);
    const scope = { project_id: projectId, user_id: userId };
    const service = await store.create({ ...scope, name: "api" });
    expect(
      (
        await pool.query("SELECT capture_rules_require_server FROM projects WHERE id=$1", [
          projectId
        ])
      ).rows[0].capture_rules_require_server
    ).toBe(false);
    await store.update({
      ...scope,
      service_definition_id: service.service_definition_id,
      name: "API"
    });
    expect(
      (
        await pool.query("SELECT capture_rules_require_server FROM projects WHERE id=$1", [
          projectId
        ])
      ).rows[0].capture_rules_require_server
    ).toBe(true);
    await pool.query("INSERT INTO services(id,project_id,name) VALUES($1,$2,'api')", [
      randomUUID(),
      projectId
    ]);
    expect((await store.list({ ...scope, limit: 100 })).services).toHaveLength(1);
    const oldId = await getOrCreateServiceId(db, projectId, "api", "production");
    expect(await getOrCreateServiceId(db, projectId, "API", "production")).toBe(oldId);
    await store.update({
      ...scope,
      service_definition_id: service.service_definition_id,
      name: "ApiServer"
    });
    expect(await getOrCreateServiceId(db, projectId, "API", "production")).toBe(oldId);
    expect(await getOrCreateServiceId(db, projectId, "api", "production")).toBe(oldId);
    const aliases = await pool.query<{ names: string[] }>(
      "SELECT debugbundle_service_input_names($1,'API') AS names",
      [projectId]
    );
    expect(new Set(aliases.rows[0]!.names)).toEqual(new Set(["api", "API", "ApiServer"]));
    await expect(store.create({ ...scope, name: "API" })).rejects.toThrow("service_name_conflict");
    await expect(store.create({ ...scope, name: "api" })).rejects.toThrow("service_name_conflict");
    for (const root of ["../api", "/api", "a/../b", "a\\b", "a//b"]) {
      await expect(
        store.update({
          ...scope,
          service_definition_id: service.service_definition_id,
          repository_root: root
        })
      ).rejects.toThrow("invalid_service_definition");
    }
    await expect(
      store.update({
        ...scope,
        service_definition_id: service.service_definition_id,
        repository_url: "https://user:secret@github.com/example/api"
      })
    ).rejects.toThrow("invalid_service_definition");
  });

  it("checks current project membership and denies non-admin metadata writes", async () => {
    const { projectId, userId } = await project();
    const stranger = await project();
    const store = createServiceDefinitionStore(db);
    await expect(
      store.list({ project_id: projectId, user_id: stranger.userId, limit: 100 })
    ).rejects.toThrow("project_not_found");
    await pool.query(
      "INSERT INTO project_members(id,project_id,user_id,role) VALUES($1,$2,$3,'member')",
      [randomUUID(), projectId, stranger.userId]
    );
    expect(
      (await store.list({ project_id: projectId, user_id: stranger.userId, limit: 100 })).services
    ).toEqual([]);
    await expect(
      store.create({ project_id: projectId, user_id: stranger.userId, name: "api" })
    ).rejects.toThrow("forbidden");
    await store.create({ project_id: projectId, user_id: userId, name: "api" });
  });

  it("refuses readiness when a credential fence is disabled even with a complete migration ledger", async () => {
    await pool.query("ALTER TABLE project_tokens DISABLE TRIGGER project_token_scope_snapshot");
    try {
      await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow(
        "project_service_schema_incomplete"
      );
    } finally {
      await pool.query("ALTER TABLE project_tokens ENABLE TRIGGER project_token_scope_snapshot");
    }
    await expect(assertStorageSchemaMigrationsApplied(db)).resolves.toBeUndefined();
  });

  it("reserves diagnostic-only service names before another service can adopt them", async () => {
    const { projectId, userId } = await project();
    const store = createServiceDefinitionStore(db);
    await pool.query(
      `INSERT INTO browser_recovery_events(event_id,project_id,service_name,environment,kind,occurred_at,expires_at,session_hash)
       VALUES($1,$2,'diagnostics-only','production','resource',now(),now()+interval '1 day','bounded-session-hash')`,
      [randomUUID(), projectId]
    );
    const observed = await store.list({ project_id: projectId, user_id: userId, limit: 100 });
    expect(observed.services.map((s) => s.name)).toEqual(["diagnostics-only"]);
    const other = await store.create({ project_id: projectId, user_id: userId, name: "api" });
    await expect(
      store.update({
        project_id: projectId,
        user_id: userId,
        service_definition_id: other.service_definition_id,
        name: "diagnostics-only"
      })
    ).rejects.toThrow(/service_name_conflict/);
  });

  it("upgrades populated service rows and refuses readiness while its migration is absent", async () => {
    // Exact committed predecessor SQL/checksums, captured before this candidate;
    // bootstrap and forward migration remain separate paths in this tmpfs fixture.
    await pool.query("DROP SCHEMA public CASCADE");
    await pool.query("CREATE SCHEMA public");
    for (const statement of predecessor.bootstrap) await pool.query(statement);
    await pool.query(
      "CREATE TABLE storage_migration_ledger(id text PRIMARY KEY,description text NOT NULL,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())"
    );
    for (const migration of predecessor.migrations)
      await pool.query(
        "INSERT INTO storage_migration_ledger(id,description,checksum) VALUES($1,$2,$3)",
        [migration.id, migration.description, migration.checksum]
      );
    const { projectId, organizationId, userId } = await project();
    const serviceId = randomUUID(),
      target = randomUUID(),
      installation = randomUUID(),
      legacyRule = randomUUID();
    await pool.query(
      "INSERT INTO projects(id,organization_id,owner_user_id,name,slug,environment_default) VALUES($1::uuid,$2,$3,'System',$1::text,'production')",
      [target, organizationId, userId]
    );
    await pool.query(
      "INSERT INTO github_installations(id,organization_id,installation_id,account_login,account_type) VALUES($1,$2,$3,'fixture','User')",
      [
        installation,
        organizationId,
        Number.parseInt(projectId.replaceAll("-", "").slice(0, 12), 16)
      ]
    );
    for (const [id, name] of [
      [projectId, "original"],
      [target, "system"]
    ])
      await pool.query(
        "INSERT INTO project_github_repos(id,project_id,installation_id,repo_owner,repo_name) VALUES($1,$2,$3,'fixture',$4)",
        [randomUUID(), id, installation, name]
      );
    await pool.query(
      "INSERT INTO github_dispatch_rules(id,project_id,created_by_user_id,name,event_types,services) VALUES($1,$2,$3,'Legacy',ARRAY['bundle.created'],ARRAY['worker'])",
      [legacyRule, projectId, userId]
    );
    await pool.query("INSERT INTO services(id,project_id,name) VALUES($1,$2,'worker')", [
      serviceId,
      projectId
    ]);
    const diagnosticId = randomUUID();
    await pool.query(
      `INSERT INTO browser_recovery_events(event_id,project_id,service_name,environment,kind,occurred_at,expires_at,session_hash)
       VALUES($1,$2,'diagnostics-only','production','resource',now(),now()+interval '1 day','bounded-session-hash')`,
      [diagnosticId, projectId]
    );
    expect(await bootstrapStorageSchemaIfEmpty(db)).toEqual({ status: "skipped_existing" });
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow(
      /storage_schema_missing_migrations/
    );
    const result = await migrateStorageSchema(db);
    const installedIds = new Set(predecessor.migrations.map((migration) => migration.id));
    expect(result.applied.slice(0, 2)).toEqual([
      "202611030001_add_service_definitions",
      "202611030002_add_project_consolidation"
    ]);
    expect(result.applied).toEqual(
      STORAGE_SCHEMA_MIGRATIONS.filter((migration) => !installedIds.has(migration.id)).map(
        (migration) => migration.id
      )
    );
    const rows = (
      await pool.query("SELECT id,service_definition_id FROM services WHERE id=$1", [serviceId])
    ).rows;
    expect(rows[0].id).toBe(serviceId);
    expect(rows[0].service_definition_id).not.toBeNull();
    expect(
      (
        await pool.query(
          "SELECT name FROM service_definitions WHERE origin_project_id=$1 ORDER BY name",
          [projectId]
        )
      ).rows
    ).toEqual([{ name: "diagnostics-only" }, { name: "worker" }]);
    expect(
      (
        await pool.query("SELECT service_name FROM browser_recovery_events WHERE event_id=$1", [
          diagnosticId
        ])
      ).rows
    ).toEqual([{ service_name: "diagnostics-only" }]);
    expect((await migrateStorageSchema(db)).applied).toEqual([]);
    await expect(assertStorageSchemaMigrationsApplied(db)).resolves.toBeUndefined();
    expect(
      (
        await pool.query("SELECT scope_origin_ids FROM github_dispatch_rules WHERE id=$1", [
          legacyRule
        ])
      ).rows
    ).toEqual([{ scope_origin_ids: null }]);
    const definitions = createServiceDefinitionStore(db),
      merge = createProjectMergeStore(db, { enabled: true });
    const catalogue = await definitions.list({
      project_id: projectId,
      user_id: userId,
      limit: 100
    });
    for (const definition of catalogue.services)
      await definitions.update({
        project_id: projectId,
        user_id: userId,
        service_definition_id: definition.service_definition_id,
        repository_url: "https://github.com/fixture/system"
      });
    const request = {
      target_project_id: target,
      source_project_ids: [projectId],
      service_mappings: catalogue.services.map((d) => ({
        source_project_id: projectId,
        service_definition_id: d.service_definition_id,
        name: d.name
      }))
    };
    const plan = await merge.preview({ user_id: userId, request });
    expect(plan.blockers).toEqual([]);
    await merge.apply({
      user_id: userId,
      request,
      plan_digest: plan.plan_digest,
      idempotency_key: randomUUID()
    });
    const github = createPostgresGitHubStore(db);
    const current = await github.createProjectGitHubRuleForOrganization({
      organization_id: organizationId,
      project_id: target,
      created_by_user_id: userId,
      name: "Current",
      enabled: true,
      event_types: ["bundle.created"],
      environments: [],
      services: ["worker"],
      severity_min: null,
      bundle_type: null,
      incident_status: "new_or_reopened",
      cooldown_seconds: 60
    });
    const matching = await github.listMatchingGitHubDispatchRules({
      project_id: projectId,
      event_type: "bundle.created",
      service_name: "worker",
      environment: "production",
      severity: "high",
      bundle_type: "failure",
      incident_status: "new_or_reopened"
    });
    expect(matching.map((r) => [r.rule_id, r.repo_name]).sort()).toEqual(
      [
        [legacyRule, "original"],
        [current!.rule_id, "system"]
      ].sort()
    );
  });
});
