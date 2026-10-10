import { createHash, randomBytes, randomUUID } from "node:crypto";
import { assertDatabaseSchema } from "../../apps/api/src/runtime.js";
import { createApiDependencies } from "../../apps/api/src/default-dependencies.js";
import { createApiServer } from "../../apps/api/src/server.js";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  PublicStatusManagementSchema,
  PublicStatusPageSchema
} from "../../packages/shared-types/src/public-status.js";
import { createRedisAuthRateLimiter } from "../../packages/storage/src/auth-rate-limiter.js";
import { createPublicStatusPageStore } from "../../packages/storage/src/public-status-store.js";
import type { Queryable } from "../../packages/storage/src/types.js";
import { runStorageBootstrapScript } from "../../scripts/bootstrap-storage.js";
import { createPostgresAvailabilityCheckStore } from "../../packages/storage/src/availability-check-store.js";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import {
  assertStorageSchemaMigrationsApplied,
  migrateStorageSchema
} from "../../packages/storage/src/schema-migrations.js";
import {
  createIntegrationPool,
  createQueryable,
  createTestObjectStore,
  createTestQueue,
  redisUrl,
  runIntegration,
  seedOwnedProject
} from "../helpers/integration-setup.ts";

runIntegration("public status publication", () => {
  const pool = createIntegrationPool();
  const db = createQueryable(pool);
  const pages = createPublicStatusPageStore(db);
  const checks = createPostgresAvailabilityCheckStore(db);
  beforeAll(async () => {
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("CREATE SCHEMA public");
    await runStorageBootstrapScript(process.env, { ifEmpty: true });
    await migrateStorageSchema(db);
  });
  afterAll(async () => {
    await pool.end();
  });
  async function fixture() {
    const organization_id = randomUUID(),
      project_id = randomUUID();
    const { ownerUserId: owner_user_id } = await seedOwnedProject({
      pool,
      organizationId: organization_id,
      projectId: project_id,
      organizationName: "Status account",
      organizationSlug: organization_id,
      projectName: "Website",
      projectSlug: "website",
      organizationPlan: "team"
    });
    return { organization_id, project_id, owner_user_id };
  }
  async function project(
    scope: Awaited<ReturnType<typeof fixture>>,
    name: string,
    owner = scope.owner_user_id
  ) {
    const id = randomUUID();
    await pool.query(
      "INSERT INTO projects(id,organization_id,owner_user_id,name,slug) VALUES($1,$2,$3,$4,$5)",
      [id, scope.organization_id, owner, name, id]
    );
    return id;
  }
  async function check(
    scope: Awaited<ReturnType<typeof fixture>>,
    project_id = scope.project_id,
    name = "Public service"
  ) {
    const result = await checks.createCheckForProjectInOrganization({
      ...scope,
      project_id,
      created_by_user_id: scope.owner_user_id,
      name,
      url: "https://private.example.com/health?secret=private",
      method: "GET",
      expected_status_min: 200,
      expected_status_max: 399,
      timeout_ms: 5000,
      interval_seconds: 60,
      failure_threshold: 3,
      recovery_threshold: 2,
      environment: "internal",
      service_name: "private-service",
      enabled: true,
      now: new Date().toISOString()
    });
    if (typeof result === "string") throw new Error(result);
    return result;
  }
  it("composes real member auth, database publication and Redis throttling through HTTP", async () => {
    const scope = await fixture(),
      selected = await check(scope);
    const token = `dbundle_mem_${randomBytes(32).toString("base64url")}`;
    await pool.query(
      "INSERT INTO member_tokens(id,user_id,organization_id,token_hash,label) VALUES($1,$2,$3,$4,'status test')",
      [
        randomUUID(),
        scope.owner_user_id,
        scope.organization_id,
        createHash("sha256").update(token).digest("hex")
      ]
    );
    const queue = createTestQueue();
    const limiter = createRedisAuthRateLimiter({ redisUrl });
    const app = createApiServer(
      createApiDependencies({
        db,
        queue,
        objectStore: createTestObjectStore(),
        authRateLimiter: limiter,
        appBaseUrl: "https://app.status-customer.test/"
      })
    );
    try {
      const endpoint = await app.listen({ host: "127.0.0.1", port: 0 });
      const managementPath = `/v1/projects/${scope.project_id}/status-page`;
      const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
      const settings = {
        title: "Customer status",
        enabled: true,
        projects: [{ project_id: scope.project_id, check_ids: [selected.check_id] }]
      };
      const save = await fetch(`${endpoint}${managementPath}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(settings)
      });
      expect(save.status).toBe(200);
      const saved = PublicStatusManagementSchema.parse(await save.json());
      expect(saved.public_url).toBe(`https://app.status-customer.test/status/${saved.public_id}`);
      const publicPath = `/v1/public/status/${saved.public_id}`;
      const response = await fetch(`${endpoint}${publicPath}`);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      const view = PublicStatusPageSchema.parse(await response.json());
      expect(view.title).toBe("Customer status");
      expect(view.projects[0]?.name).toBe("Website");
      expect(JSON.stringify(view)).not.toContain("private.example.com");
      expect(
        (await fetch(`${endpoint}/v1/projects/${scope.project_id}/availability-checks`)).status
      ).toBe(401);
      expect(
        (
          await fetch(`${endpoint}/v1/projects/${scope.project_id}/availability-checks`, {
            headers
          })
        ).status
      ).toBe(200);
      const unpublish = await fetch(`${endpoint}${managementPath}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ ...settings, enabled: false })
      });
      expect(unpublish.status).toBe(200);
      expect(PublicStatusManagementSchema.parse(await unpublish.json()).public_id).toBe(
        saved.public_id
      );
      expect((await fetch(`${endpoint}${publicPath}`)).status).toBe(404);
      expect(
        (
          await pool.query("SELECT status,last_checked_at FROM availability_checks WHERE id=$1", [
            selected.check_id
          ])
        ).rows[0]
      ).toMatchObject({ status: "unknown", last_checked_at: null });
    } finally {
      await app.close();
      await limiter.close();
      await queue.close();
    }
  });

  it("upgrades a populated predecessor before readiness, preserves data and checksums, and is idempotent", async () => {
    const scope = await fixture(),
      savedCheck = await check(scope);
    await pool.query(
      "DROP TABLE public_status_page_checks, public_status_page_projects, public_status_pages"
    );
    const migration = "202610080001_add_public_status_pages";
    await pool.query("DELETE FROM storage_migration_ledger WHERE id=$1", [migration]);
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow(migration);
    await expect(assertDatabaseSchema(db)).rejects.toThrow("public_status_pages");
    await expect(bootstrapStorageSchema(db)).rejects.toThrow();
    // Exercise the actual Compose startup entrypoint on an installed predecessor.
    await runStorageBootstrapScript(process.env, { ifEmpty: true });
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow(migration);
    expect((await migrateStorageSchema(db)).applied).toEqual([migration]);
    await expect(assertDatabaseSchema(db)).resolves.toBeUndefined();
    await expect(assertStorageSchemaMigrationsApplied(db)).resolves.toBeUndefined();
    expect((await migrateStorageSchema(db)).applied).toEqual([]);
    expect(
      (await pool.query("SELECT name FROM availability_checks WHERE id=$1", [savedCheck.check_id]))
        .rows[0].name
    ).toBe("Public service");
    const original = (
      await pool.query("SELECT checksum FROM storage_migration_ledger WHERE id=$1", [migration])
    ).rows[0].checksum;
    await pool.query("UPDATE storage_migration_ledger SET checksum='tampered' WHERE id=$1", [
      migration
    ]);
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow("checksum_mismatch");
    await expect(migrateStorageSchema(db)).rejects.toThrow("checksum_mismatch");
    await pool.query("UPDATE storage_migration_ledger SET checksum=$2 WHERE id=$1", [
      migration,
      original
    ]);
  });
  it("publishes only selected existing checks without mutating monitoring and retains one stable URL", async () => {
    const scope = await fixture(),
      second = await project(scope, "API"),
      selected = await check(scope),
      other = await check(scope, second, "API check");
    await check(scope, scope.project_id, "Private check");
    const input = {
      title: "Product status",
      enabled: true,
      projects: [
        { project_id: scope.project_id, check_ids: [selected.check_id] },
        { project_id: second, check_ids: [other.check_id] }
      ]
    };
    const initial = await pages.getSettings(scope);
    expect(initial.public_id).toBeNull();
    expect(initial.settings.enabled).toBe(false);
    await pool.query(
      "UPDATE availability_checks SET status='passing',last_result_error_message='private-error' WHERE id=$1",
      [selected.check_id]
    );
    await pool.query(
      `INSERT INTO availability_check_daily_rollups(id,check_id,project_id,day,state,total_checks,successful_checks,failed_checks,downtime_seconds,last_checked_at)
      VALUES($1,$2,$3,(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date,'down',100,90,10,60,now())`,
      [randomUUID(), selected.check_id, scope.project_id]
    );
    const before = (
      await pool.query(
        "SELECT * FROM availability_checks WHERE project_id=ANY($1::uuid[]) ORDER BY id",
        [[scope.project_id, second]]
      )
    ).rows;
    const saved = await pages.saveSettings(scope, input);
    expect(saved.public_id).toMatch(/^[a-f0-9]{24}$/);
    const view = await pages.getPublicPage(saved.public_id!);
    expect(view?.projects.map((p) => p.name)).toEqual(["Website", "API"]);
    expect(view?.projects[0]?.current_state).toBe("operational");
    expect(view?.projects[0]?.uptime_percentage).toBe(90);
    expect(view?.projects[0]?.days.at(-1)?.impact).toBe("outage");
    const json = JSON.stringify(view);
    for (const sensitive of [
      "private.example.com",
      "private-error",
      "private-service",
      "Private check",
      scope.project_id,
      selected.check_id,
      "incident_ids"
    ])
      expect(json).not.toContain(sensitive);
    expect(
      (
        await pool.query(
          "SELECT * FROM availability_checks WHERE project_id=ANY($1::uuid[]) ORDER BY id",
          [[scope.project_id, second]]
        )
      ).rows
    ).toEqual(before);
    expect(await pages.preview(scope)).toEqual(view);
    await check(scope, scope.project_id, "New private check");
    expect(JSON.stringify(await pages.getPublicPage(saved.public_id!))).not.toContain(
      "New private check"
    );
    const disabled = await pages.saveSettings(scope, { ...input, enabled: false });
    expect(disabled.public_id).toBe(saved.public_id);
    expect(await pages.getPublicPage(saved.public_id!)).toBeNull();
    expect(await pages.preview(scope)).not.toBeNull();
    expect((await pages.saveSettings(scope, input)).public_id).toBe(saved.public_id);
  });
  it("rejects cross-owner, cross-account and mismatched-check selections atomically", async () => {
    const scope = await fixture(),
      foreign = await fixture(),
      selected = await check(scope),
      foreignCheck = await check(foreign);
    const otherOwner = await project(scope, "Other owner", foreign.owner_user_id);
    const valid = {
      title: "Public",
      enabled: true,
      projects: [{ project_id: scope.project_id, check_ids: [selected.check_id] }]
    };
    await pages.saveSettings(scope, valid);
    for (const projects of [
      [{ project_id: scope.project_id, check_ids: [foreignCheck.check_id] }],
      [...valid.projects, { project_id: foreign.project_id, check_ids: [foreignCheck.check_id] }],
      [...valid.projects, { project_id: otherOwner, check_ids: [] }],
      [{ project_id: foreign.project_id, check_ids: [] }],
      [{ project_id: scope.project_id, check_ids: [] }]
    ])
      await expect(pages.saveSettings(scope, { ...valid, projects })).rejects.toThrow(
        "invalid_selection"
      );
    expect((await pages.getSettings(scope)).settings).toEqual(valid);
    await expect(
      pages.listOptions(scope, { check_project_id: foreign.project_id })
    ).rejects.toThrow("invalid_selection");
  });
  it("removes soft-deleted and reassigned data immediately and invalidates a deleted anchor", async () => {
    const scope = await fixture(),
      foreign = await fixture(),
      second = await project(scope, "API"),
      a = await check(scope),
      b = await check(scope, second);
    const saved = await pages.saveSettings(scope, {
      title: "Public",
      enabled: true,
      projects: [
        { project_id: scope.project_id, check_ids: [a.check_id] },
        { project_id: second, check_ids: [b.check_id] }
      ]
    });
    await pool.query("UPDATE availability_checks SET deleted_at=now() WHERE id=$1", [a.check_id]);
    expect((await pages.getPublicPage(saved.public_id!))?.projects.map((p) => p.name)).toEqual([
      "API"
    ]);
    await pool.query("UPDATE projects SET owner_user_id=$2 WHERE id=$1", [
      second,
      foreign.owner_user_id
    ]);
    expect((await pages.getPublicPage(saved.public_id!))?.projects).toEqual([]);
    expect((await pages.getSettings(scope)).settings.projects).toEqual([
      { project_id: scope.project_id, check_ids: [] }
    ]);
    await pool.query("UPDATE projects SET owner_user_id=$2 WHERE id=$1", [
      scope.project_id,
      foreign.owner_user_id
    ]);
    expect(await pages.getPublicPage(saved.public_id!)).toBeNull();
    await expect(pages.getSettings(scope)).rejects.toThrow("not_found");
    await pool.query("DELETE FROM projects WHERE id=$1", [scope.project_id]);
    expect(
      (await pool.query("SELECT id FROM public_status_pages WHERE public_id=$1", [saved.public_id]))
        .rows
    ).toEqual([]);
  });
  it("paginates large option sets without dropping saved checks, and saves concurrently without partial selection", async () => {
    const scope = await fixture();
    await pool.query(
      `INSERT INTO projects(id,organization_id,owner_user_id,name,slug)
      SELECT gen_random_uuid(),$1,$2,'Option '||n,'option-'||n FROM generate_series(1,55)n`,
      [scope.organization_id, scope.owner_user_id]
    );
    const selected = await check(scope);
    await pool.query(
      `INSERT INTO availability_checks(id,project_id,name,url,created_by_user_id,method,interval_seconds)
      SELECT gen_random_uuid(),$1,'Check '||n,'https://example.com',$2,'GET',60 FROM generate_series(1,55)n`,
      [scope.project_id, scope.owner_user_id]
    );
    const first = await pages.listOptions(scope);
    expect(first.projects).toHaveLength(50);
    expect(first.next_cursor).not.toBeNull();
    const rest = await pages.listOptions(scope, { cursor: first.next_cursor! });
    expect(rest.projects).toHaveLength(6);
    expect(rest.next_cursor).toBeNull();
    const firstChecks = await pages.listOptions(scope, { check_project_id: scope.project_id });
    expect(firstChecks.projects[0]?.checks).toHaveLength(50);
    const cursor = firstChecks.projects[0]!.next_check_cursor!;
    expect(cursor).not.toBeNull();
    const nextChecks = await pages.listOptions(scope, {
      check_project_id: scope.project_id,
      check_cursor: cursor
    });
    expect(nextChecks.projects[0]?.checks).toHaveLength(6);
    expect(nextChecks.projects[0]?.next_check_cursor).toBeNull();
    const input = {
      title: "One",
      enabled: true,
      projects: [{ project_id: scope.project_id, check_ids: [selected.check_id] }]
    };
    const results = await Promise.all([
      pages.saveSettings(scope, input),
      pages.saveSettings(scope, { ...input, title: "Two" })
    ]);
    expect(results[0].public_id).toBe(results[1].public_id);
    expect(["One", "Two"]).toContain((await pages.getSettings(scope)).settings.title);
    expect((await pages.getSettings(scope)).settings.projects).toEqual(input.projects);
  });
  it("saves two pages including each other's anchor without a lock-order deadlock", async () => {
    const scope = await fixture();
    const second = { ...scope, project_id: await project(scope, "API") };
    const a = await check(scope),
      b = await check(second);
    let arrivals = 0;
    let release!: () => void;
    const bothAnchorsRead = new Promise<void>((resolve) => {
      release = resolve;
    });
    // Force overlap after anchor validation, using real independent Postgres transactions.
    const synchronized: Queryable = {
      ...db,
      transaction: (work) =>
        db.transaction!((tx) =>
          work({
            query: async <Row extends Record<string, unknown>>(sql: string, params: unknown[]) => {
              const result = await tx.query<Row>(sql, params);
              if (sql.startsWith("SELECT name FROM projects") && arrivals < 2) {
                arrivals += 1;
                if (arrivals === 2) release();
                await bothAnchorsRead;
              }
              return result;
            }
          })
        )
    };
    const store = createPublicStatusPageStore(synchronized);
    const selections = [
      { project_id: scope.project_id, check_ids: [a.check_id] },
      { project_id: second.project_id, check_ids: [b.check_id] }
    ];
    const saved = await Promise.all([
      store.saveSettings(scope, { title: "Website status", enabled: true, projects: selections }),
      store.saveSettings(second, {
        title: "API status",
        enabled: true,
        projects: [...selections].reverse()
      })
    ]);
    expect(saved[0].public_id).not.toBe(saved[1].public_id);
    for (const page of saved) {
      expect((await pages.getPublicPage(page.public_id!))?.projects).toHaveLength(2);
    }
  });
});
