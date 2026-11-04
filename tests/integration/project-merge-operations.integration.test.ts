import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import { migrateStorageSchema } from "../../packages/storage/src/schema-migrations.js";
import { createProjectMergeStore } from "../../packages/storage/src/project-merge-store.js";
import type { Queryable } from "../../packages/storage/src/types.js";
import { getOrCreateServiceId } from "../../packages/storage/src/metadata-incident-shared.js";
import { createServiceDefinitionStore } from "../../packages/storage/src/service-definition-store.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration,
  seedOwnedProject
} from "../helpers/integration-setup.js";

runIntegration("checked durable project consolidation", () => {
  const pool = createIntegrationPool();
  const db = createQueryable(pool);
  const store = createProjectMergeStore(db, { enabled: true });
  beforeAll(async () => {
    await bootstrapStorageSchema(db);
    await migrateStorageSchema(db);
  });
  afterAll(async () => {
    await pool.end();
  });
  async function fixture() {
    const organizationId = randomUUID();
    const userId = randomUUID();
    const target = randomUUID();
    const source = randomUUID();
    await seedOwnedProject({
      pool,
      organizationId,
      projectId: target,
      organizationName: "Merge fixture",
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
    const serviceId = await getOrCreateServiceId(db, source, "web", "production");
    const definition = (
      await pool.query<{ service_definition_id: string }>(
        "SELECT service_definition_id FROM services WHERE id=$1",
        [serviceId]
      )
    ).rows[0]!.service_definition_id;
    const request = {
      target_project_id: target,
      source_project_ids: [source],
      service_mappings: [
        { source_project_id: source, service_definition_id: definition, name: "Site" }
      ]
    };
    return { organizationId, userId, target, source, serviceId, definition, request };
  }
  it("rejects malformed operation selectors without exposing database errors", async () => {
    await expect(
      store.status({ user_id: randomUUID(), operation_id: "invalid" })
    ).rejects.toMatchObject({ code: "invalid_merge_request" });
    await expect(
      store.status({ user_id: randomUUID(), idempotency_key: "bad/key" })
    ).rejects.toMatchObject({ code: "invalid_merge_request" });
  });
  it("qualifies the supported thousand-service cutover within enforced transaction deadlines", async () => {
    const f = await fixture();
    await pool.query(
      `INSERT INTO service_definitions(id,project_id,origin_project_id,repository_default_project_id,name,input_name)
      SELECT gen_random_uuid(),$1,$1,$1,'source-'||n,'source-'||n FROM generate_series(1,999) n`,
      [f.source]
    );
    const definitions = await pool.query<{ id: string; name: string }>(
      "SELECT id,name FROM service_definitions WHERE project_id=$1 ORDER BY id",
      [f.source]
    );
    const request = {
      ...f.request,
      service_mappings: definitions.rows.map((d, index) => ({
        source_project_id: f.source,
        service_definition_id: d.id,
        name: `Imported-${index}`
      }))
    };
    const plan = await store.preview({ user_id: f.userId, request });
    expect(plan.blockers).toEqual([]);
    const result = await store.apply({
      user_id: f.userId,
      request,
      plan_digest: plan.plan_digest,
      idempotency_key: randomUUID()
    });
    expect(result.state).toBe("completed");
    expect(result.receipt?.service_mappings).toHaveLength(1000);
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS count FROM service_definitions WHERE project_id=$1",
          [f.target]
        )
      ).rows[0]?.count
    ).toBe(1000);
  }, 30000);
  it("previews without persistence and does not stale on normal service-environment or health traffic", async () => {
    const f = await fixture();
    const check = randomUUID();
    await pool.query(
      "INSERT INTO availability_checks(id,project_id,name,url,method,interval_seconds) VALUES($1,$2,'Web','https://example.test','GET',60)",
      [check, f.source]
    );
    const before = await store.preview({ user_id: f.userId, request: f.request });
    expect(before.blockers).toEqual([]);
    await getOrCreateServiceId(db, f.source, "web", "staging");
    await pool.query(
      "UPDATE availability_checks SET consecutive_failures=2,last_checked_at=now(),status='failing',updated_at=now() WHERE id=$1",
      [check]
    );
    expect((await store.preview({ user_id: f.userId, request: f.request })).plan_digest).toBe(
      before.plan_digest
    );
    expect(
      (
        await pool.query("SELECT id FROM project_merge_operations WHERE actor_user_id=$1", [
          f.userId
        ])
      ).rows
    ).toEqual([]);
  });
  it("rejects credential-bearing mappings and idempotency keys before creating an operation", async () => {
    const f = await fixture(),
      credential = "dbundle_mem_synthetic_not_a_real_credential";
    await expect(
      store.preview({
        user_id: f.userId,
        request: {
          ...f.request,
          service_mappings: f.request.service_mappings.map((mapping) => ({
            ...mapping,
            name: credential
          }))
        }
      })
    ).rejects.toThrow("invalid_merge_request");
    const plan = await store.preview({ user_id: f.userId, request: f.request });
    await expect(
      store.apply({
        user_id: f.userId,
        request: f.request,
        plan_digest: plan.plan_digest,
        idempotency_key: credential
      })
    ).rejects.toThrow("invalid_merge_request");
    expect(
      (
        await pool.query("SELECT id FROM project_merge_operations WHERE actor_user_id=$1", [
          f.userId
        ])
      ).rows
    ).toEqual([]);
  });
  it("commits one checked operation and preserves existing credential, queue and instance identities", async () => {
    const f = await fixture();
    const token = randomUUID();
    const jobId = `fixture:${randomUUID()}`;
    await pool.query(
      "INSERT INTO project_tokens(id,project_id,token_hash,label) VALUES($1,$2,$3,'Existing')",
      [token, f.source, randomUUID()]
    );
    await pool.query(
      "INSERT INTO worker_jobs(id,job_name,project_id,payload) VALUES($1,'normalize-events',$2,$3)",
      [
        jobId,
        f.source,
        JSON.stringify({
          project_id: f.source,
          event_id: randomUUID(),
          object_key: `raw-events/${f.source}/existing.json.gz`
        })
      ]
    );
    const original = (
      await pool.query(
        "SELECT token_hash,project_id,scope_origin_ids FROM project_tokens WHERE id=$1",
        [token]
      )
    ).rows;
    const job = (
      await pool.query("SELECT project_id,payload FROM worker_jobs WHERE id=$1", [jobId])
    ).rows;
    const plan = await store.preview({ user_id: f.userId, request: f.request });
    const input = {
      user_id: f.userId,
      request: f.request,
      plan_digest: plan.plan_digest,
      idempotency_key: randomUUID()
    };
    const first = await store.apply(input);
    expect(first.state).toBe("completed");
    expect(first.canonical_project_id).toBe(f.target);
    expect((await store.apply(input)).operation_id).toBe(first.operation_id);
    expect(
      (await store.verify({ user_id: f.userId, operation_id: first.operation_id })).verified
    ).toBe(true);
    expect(
      (
        await pool.query(
          "SELECT token_hash,project_id,scope_origin_ids FROM project_tokens WHERE id=$1",
          [token]
        )
      ).rows
    ).toEqual(original);
    expect(
      (await pool.query("SELECT project_id,payload FROM worker_jobs WHERE id=$1", [jobId])).rows
    ).toEqual(job);
    expect(await getOrCreateServiceId(db, f.source, "web", "production")).toBe(f.serviceId);
    expect(await getOrCreateServiceId(db, f.source, "Site", "production")).toBe(f.serviceId);
    await getOrCreateServiceId(db, f.source, "web", "staging");
    expect(
      (
        await pool.query<{ project_id: string; name: string }>(
          "SELECT project_id,name FROM service_definitions WHERE id=$1",
          [f.definition]
        )
      ).rows
    ).toEqual([{ project_id: f.target, name: "Site" }]);
  });
  it("rejects stale policies, foreign owners and mismatched idempotency without a partial cutover", async () => {
    const f = await fixture();
    const plan = await store.preview({ user_id: f.userId, request: f.request });
    await pool.query("UPDATE projects SET environment_default='staging' WHERE id=$1", [f.source]);
    await expect(
      store.apply({
        user_id: f.userId,
        request: f.request,
        plan_digest: plan.plan_digest,
        idempotency_key: randomUUID()
      })
    ).rejects.toThrow(/merge_conflict|stale_merge_plan/);
    expect(
      (
        await pool.query(
          "SELECT legacy_project_id FROM project_legacy_bindings WHERE legacy_project_id=$1",
          [f.source]
        )
      ).rows
    ).toEqual([]);
    expect((await store.preview({ user_id: randomUUID(), request: f.request })).ready).toBe(false);
    await pool.query("UPDATE projects SET environment_default='production' WHERE id=$1", [
      f.source
    ]);
    const fresh = await store.preview({ user_id: f.userId, request: f.request });
    const key = randomUUID();
    await store.apply({
      user_id: f.userId,
      request: f.request,
      plan_digest: fresh.plan_digest,
      idempotency_key: key
    });
    await expect(
      store.apply({
        user_id: f.userId,
        request: {
          ...f.request,
          service_mappings: [{ ...f.request.service_mappings[0]!, name: "Other" }]
        },
        plan_digest: fresh.plan_digest,
        idempotency_key: key
      })
    ).rejects.toThrow("idempotency_conflict");
  });
  it("preserves an absent repository through repeated merges until inheritance is explicitly requested", async () => {
    const f = await fixture(),
      installation = randomUUID(),
      later = randomUUID();
    const definitions = createServiceDefinitionStore(db);
    await pool.query(
      "INSERT INTO github_installations(id,organization_id,installation_id,account_login,account_type) VALUES($1,$2,1001,'fixture','Organization')",
      [installation, f.organizationId]
    );
    await pool.query(
      "INSERT INTO project_github_repos(id,project_id,installation_id,repo_owner,repo_name) VALUES($1,$2,$3,'fixture','backend')",
      [randomUUID(), f.target, installation]
    );
    const api = await definitions.create({ project_id: f.target, user_id: f.userId, name: "API" });
    const preview = await store.preview({ user_id: f.userId, request: f.request });
    await store.apply({
      user_id: f.userId,
      request: f.request,
      plan_digest: preview.plan_digest,
      idempotency_key: randomUUID()
    });
    expect(
      (
        await definitions.get({
          project_id: f.target,
          user_id: f.userId,
          service_definition_id: f.definition
        })
      ).repository
    ).toBeNull();
    await pool.query(
      "INSERT INTO projects(id,organization_id,owner_user_id,name,slug) VALUES($1::uuid,$2,$3,'Combined',$1::text)",
      [later, f.organizationId, f.userId]
    );
    await pool.query(
      "INSERT INTO project_github_repos(id,project_id,installation_id,repo_owner,repo_name) VALUES($1,$2,$3,'fixture','combined')",
      [randomUUID(), later, installation]
    );
    const request = {
      target_project_id: later,
      source_project_ids: [f.target],
      service_mappings: [
        { source_project_id: f.target, service_definition_id: f.definition, name: "Site" },
        {
          source_project_id: f.target,
          service_definition_id: api.service_definition_id,
          name: "API"
        }
      ]
    };
    const next = await store.preview({ user_id: f.userId, request });
    await store.apply({
      user_id: f.userId,
      request,
      plan_digest: next.plan_digest,
      idempotency_key: randomUUID()
    });
    expect(
      (
        await definitions.get({
          project_id: later,
          user_id: f.userId,
          service_definition_id: f.definition
        })
      ).repository
    ).toBeNull();
    expect(
      (
        await definitions.get({
          project_id: later,
          user_id: f.userId,
          service_definition_id: api.service_definition_id
        })
      ).repository?.url
    ).toBe("https://github.com/fixture/backend");
    expect(
      (
        await definitions.update({
          project_id: later,
          user_id: f.userId,
          service_definition_id: f.definition,
          repository_url: null,
          repository_root: null
        })
      ).repository
    ).toEqual({ url: "https://github.com/fixture/combined", root: null, source: "project" });
  });

  it("does not enable apply merely because migrations exist", async () => {
    const f = await fixture();
    const plan = await store.preview({ user_id: f.userId, request: f.request });
    await expect(
      createProjectMergeStore(db).apply({
        user_id: f.userId,
        request: f.request,
        plan_digest: plan.plan_digest,
        idempotency_key: randomUUID()
      })
    ).rejects.toThrow("project_merge_not_enabled");
  });

  it("fences concurrent configuration without blocking runtime counters and rejects later alias policy edits", async () => {
    const f = await fixture(),
      rule = randomUUID();
    await pool.query(
      "INSERT INTO capture_rules(id,project_id,name,action,matcher) VALUES($1,$2,'Keep scope','drop','{}')",
      [rule, f.source]
    );
    const plan = await store.preview({ user_id: f.userId, request: f.request });
    const writer = await pool.connect();
    try {
      await writer.query("BEGIN");
      await writer.query("SELECT id FROM projects WHERE id=$1 FOR UPDATE", [f.source]);
      await expect(
        pool.query("UPDATE capture_rules SET enabled=false WHERE id=$1", [rule])
      ).rejects.toThrow("project_merge_in_progress");
      await pool.query(
        "UPDATE capture_rules SET hit_count=hit_count+1,last_matched_at=now() WHERE id=$1",
        [rule]
      );
    } finally {
      await writer.query("ROLLBACK");
      writer.release();
    }
    expect((await store.preview({ user_id: f.userId, request: f.request })).plan_digest).toBe(
      plan.plan_digest
    );
    await store.apply({
      user_id: f.userId,
      request: f.request,
      plan_digest: plan.plan_digest,
      idempotency_key: randomUUID()
    });
    await expect(
      pool.query("UPDATE capture_rules SET enabled=false WHERE id=$1", [rule])
    ).rejects.toThrow("project_consolidated");
    await pool.query(
      "UPDATE capture_rules SET hit_count=hit_count+1,last_matched_at=now() WHERE id=$1",
      [rule]
    );
    expect(
      (await pool.query("SELECT enabled,hit_count FROM capture_rules WHERE id=$1", [rule])).rows
    ).toEqual([{ enabled: true, hit_count: "2" }]);
    await expect(
      pool.query("UPDATE projects SET environment_default='staging' WHERE id=$1", [f.source])
    ).rejects.toThrow("project_consolidated");
  });

  it("rejects excessive configuration before cutover instead of producing a partial inventory", async () => {
    const f = await fixture();
    await pool.query(
      "INSERT INTO capture_rules(id,project_id,name,action,matcher) SELECT gen_random_uuid(),$1,'Rule '||n,'drop','{}'::jsonb FROM generate_series(1,5001) n",
      [f.source]
    );
    const plan = await store.preview({ user_id: f.userId, request: f.request });
    expect(plan.ready).toBe(false);
    expect(plan.blockers).toContainEqual({
      code: "configuration_limit_exceeded",
      project_id: f.source,
      resource: "capture_rules"
    });
    expect(
      (await pool.query("SELECT project_id FROM service_definitions WHERE id=$1", [f.definition]))
        .rows[0]?.project_id
    ).toBe(f.source);
  });

  it("coalesces simultaneous apply retries under one durable idempotency key", async () => {
    const f = await fixture();
    const plan = await store.preview({ user_id: f.userId, request: f.request });
    const input = {
      user_id: f.userId,
      request: f.request,
      plan_digest: plan.plan_digest,
      idempotency_key: randomUUID()
    };
    const results = await Promise.all(Array.from({ length: 8 }, () => store.apply(input)));
    expect(new Set(results.map((result) => result.operation_id)).size).toBe(1);
    const status = await store.status({
      user_id: f.userId,
      idempotency_key: input.idempotency_key
    });
    expect(status.state).toBe("completed");
    await expect(
      store.status({ user_id: randomUUID(), operation_id: status.operation_id })
    ).rejects.toThrow("project_merge_not_found");
  });
  it("fences account policy and owner membership for the whole cutover", async () => {
    const f = await fixture();
    const plan = await store.preview({ user_id: f.userId, request: f.request });
    let checked = false;
    const fenced: Queryable = {
      query: db.query,
      transaction: (callback) =>
        db.transaction!(async (tx) =>
          callback({
            query: async <Row extends Record<string, unknown>>(sql: string, params: unknown[]) => {
              if (!checked && sql.includes("WITH ranked AS MATERIALIZED")) {
                checked = true;
                for (const [statement, parameters] of [
                  [
                    "SELECT id FROM organizations WHERE id=$1 FOR UPDATE NOWAIT",
                    [f.organizationId]
                  ],
                  [
                    "SELECT user_id FROM organization_members WHERE organization_id=$1 AND user_id=$2 FOR UPDATE NOWAIT",
                    [f.organizationId, f.userId]
                  ]
                ] as const) {
                  const competing = await pool.connect();
                  try {
                    await competing.query("BEGIN");
                    await expect(competing.query(statement, [...parameters])).rejects.toMatchObject(
                      { code: "55P03" }
                    );
                  } finally {
                    await competing.query("ROLLBACK");
                    competing.release();
                  }
                }
              }
              return tx.query<Row>(sql, params);
            }
          })
        )
    };
    const result = await createProjectMergeStore(fenced, { enabled: true }).apply({
      user_id: f.userId,
      request: f.request,
      plan_digest: plan.plan_digest,
      idempotency_key: randomUUID()
    });
    expect(checked).toBe(true);
    expect(result.state).toBe("completed");
  });

  it("preserves former canonical read scopes through a later consolidation", async () => {
    const f = await fixture();
    const first = await store.preview({ user_id: f.userId, request: f.request });
    const completed = await store.apply({
      user_id: f.userId,
      request: f.request,
      plan_digest: first.plan_digest,
      idempotency_key: randomUUID()
    });
    const later = randomUUID();
    await pool.query(
      "INSERT INTO projects(id,organization_id,owner_user_id,name,slug) VALUES($1::uuid,$2,$3,'Combined',$1::text)",
      [later, f.organizationId, f.userId]
    );
    const request = {
      target_project_id: later,
      source_project_ids: [f.target],
      service_mappings: [
        { source_project_id: f.target, service_definition_id: f.definition, name: "Site" }
      ]
    };
    const preview = await store.preview({ user_id: f.userId, request });
    const result = await store.apply({
      user_id: f.userId,
      request,
      plan_digest: preview.plan_digest,
      idempotency_key: randomUUID()
    });
    expect(result.state).toBe("completed");
    expect(
      (
        await pool.query<{ ids: string[] }>("SELECT debugbundle_project_origins($1) AS ids", [
          f.target
        ])
      ).rows[0]!.ids
    ).toEqual([f.source, f.target].sort());
    expect(
      (
        await pool.query<{ ids: string[] }>("SELECT debugbundle_project_origins($1) AS ids", [
          f.source
        ])
      ).rows[0]!.ids
    ).toEqual([f.source]);
    expect(
      (await store.verify({ user_id: f.userId, operation_id: completed.operation_id })).verified
    ).toBe(true);
  });

  it("does not let unknown legacy destination names attach to imported services", async () => {
    const f = await fixture();
    const preview = await store.preview({ user_id: f.userId, request: f.request });
    await store.apply({
      user_id: f.userId,
      request: f.request,
      plan_digest: preview.plan_digest,
      idempotency_key: randomUUID()
    });
    const local = await getOrCreateServiceId(db, f.target, "Site", "production");
    expect(local).not.toBe(f.serviceId);
    const records = await pool.query<{ name: string; origin_project_id: string }>(
      "SELECT d.name,d.origin_project_id FROM services s JOIN service_definitions d ON d.id=s.service_definition_id WHERE s.id=$1",
      [local]
    );
    expect(records.rows[0]!.name).toMatch(/^Site~[a-f0-9]{32}$/);
    expect(records.rows[0]!.origin_project_id).toBe(f.target);
    expect(await getOrCreateServiceId(db, f.target, "Site", "production")).toBe(local);
  });

  it.each(["cutover", "verification"] as const)(
    "recovers a database failure during %s without repeating a committed move",
    async (boundary) => {
      const f = await fixture();
      const plan = await store.preview({ user_id: f.userId, request: f.request });
      let fail = true;
      const faulty: Queryable = {
        query: db.query,
        transaction: (callback) =>
          db.transaction!(async (tx) =>
            callback({
              query: async <Row extends Record<string, unknown>>(
                sql: string,
                params: unknown[]
              ) => {
                if (
                  fail &&
                  (boundary === "cutover"
                    ? sql.includes("SET project_id=$1,name=$2")
                    : sql.includes("AS retained"))
                ) {
                  fail = false;
                  throw new Error("injected_database_failure");
                }
                return tx.query<Row>(sql, params);
              }
            })
          )
      };
      const input = {
        user_id: f.userId,
        request: f.request,
        plan_digest: plan.plan_digest,
        idempotency_key: randomUUID()
      };
      const candidate = createProjectMergeStore(faulty, { enabled: true });
      if (boundary === "cutover")
        await expect(candidate.apply(input)).rejects.toThrow("project_merge_failed");
      else expect((await candidate.apply(input)).state).toBe("verification_failed_after_commit");
      const status = await store.status({
        user_id: f.userId,
        idempotency_key: input.idempotency_key
      });
      expect(status.state).toBe(
        boundary === "cutover" ? "failed_before_commit" : "verification_failed_after_commit"
      );
      const verified = await store.verify({ user_id: f.userId, operation_id: status.operation_id });
      expect(verified.verified).toBe(boundary === "verification");
      expect(await store.status({ user_id: f.userId, operation_id: status.operation_id })).toEqual(
        status
      );
      expect(
        (await store.resume({ user_id: f.userId, operation_id: status.operation_id })).state
      ).toBe("completed");
      expect((await store.apply(input)).operation_id).toBe(status.operation_id);
      expect(
        (
          await pool.query(
            "SELECT legacy_project_id FROM project_legacy_bindings WHERE legacy_project_id=$1",
            [f.source]
          )
        ).rows
      ).toHaveLength(1);
    }
  );
});
