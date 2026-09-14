// Local-only companion to incident-recovery-check.py; never reads hosted credentials.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { performance } from "node:perf_hooks";
import { Pool } from "pg";
import { Redis } from "ioredis";
import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { bootstrapStorageSchema } from "../packages/storage/src/migrations.ts";
import { migrateStorageSchema } from "../packages/storage/src/schema-migrations.ts";
import {
  createS3ObjectStoreClient,
  buildBundleObjectKey,
  buildReproductionObjectKey
} from "../packages/storage/src/index.ts";
import { createEventEnvelope, BundleV1Schema } from "../packages/shared-types/src/index.ts";

assert.equal(process.env.DB_HOST, "postgres");
assert.equal(process.env.REDIS_URL, "redis://redis:6379");
assert.equal(process.env.S3_ENDPOINT, "http://localstack:4566");
assert.equal(process.env.AWS_ACCESS_KEY_ID, "test");
const [phase, manifestPath] = process.argv.slice(2);
assert.match(manifestPath, /^\/workspace\/\.tmp\/incident-recovery-[a-f0-9]+\/state\.json$/);
const pool = new Pool({
  host: "postgres",
  user: "debugbundle",
  password: "debugbundle",
  database: "debugbundle",
  max: 2
});
const redis = new Redis("redis://redis:6379", { maxRetriesPerRequest: 2 });
const storage = {
  endpoint: "http://localstack:4566",
  region: "us-east-1",
  bucket: "debugbundle-recovery",
  accessKeyId: "test",
  secretAccessKey: "test",
  forcePathStyle: true
};
const objectStore = createS3ObjectStoreClient(storage);
const write = (value) => {
  writeFileSync(`${manifestPath}.tmp`, JSON.stringify(value), { mode: 0o600 });
  renameSync(`${manifestPath}.tmp`, manifestPath);
};
const read = () => JSON.parse(readFileSync(manifestPath, "utf8"));
const hashToken = (token) => createHash("sha256").update(token).digest("hex");
const summarize = (values) => {
  const sorted = values.toSorted((a, b) => a - b);
  return {
    count: sorted.length,
    p95_ms: sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0,
    max_ms: sorted.at(-1) ?? 0
  };
};
async function send(state, index, replay = false) {
  const tenant = state.tenants[index % state.tenants.length];
  const labels = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel"];
  const label = labels[Math.floor(index / state.tenants.length) % labels.length];
  const event = replay
    ? state.events[index].event
    : createEventEnvelope({
        event_id: randomUUID(),
        occurred_at: new Date().toISOString(),
        event_type: "backend_exception",
        service: { name: "recovery-check", environment: "test", runtime: "node" },
        payload: {
          name: "RecoveryCheckError",
          message: `Synthetic recovery ${label}`,
          stack: `RecoveryCheckError: Synthetic recovery ${label}\n at checkout (/app/${label}.ts:12:1)`,
          handled: true,
          request: {
            method: "GET",
            path: `/test/${label}`,
            query: {},
            headers: {},
            duration_ms: 5006.268327981234
          },
          response: { status_code: 500 },
          runtime: { version: "24.0.0" }
        }
      });
  const started = performance.now();
  const response = await fetch("http://api:3000/v1/events", {
    method: "POST",
    headers: { authorization: `Bearer ${tenant.token}`, "content-type": "application/json" },
    body: JSON.stringify({ events: [event] }),
    signal: AbortSignal.timeout(20000)
  });
  const body = await response.json();
  assert.equal(response.status, 202, `ingestion_${response.status}:${JSON.stringify(body)}`);
  assert.equal(body.accepted, 1);
  assert.equal(body.rejected, 0);
  state.latencies.push(performance.now() - started);
  if (!replay) state.events[index] = { project_id: tenant.project_id, event };
}
async function burst(state, from, count, concurrency = 8) {
  let next = from;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < from + count) {
        const index = next++;
        await send(state, index);
      }
    })
  );
}
try {
  if (phase === "seed") {
    await bootstrapStorageSchema(pool);
    await migrateStorageSchema(pool);
    const s3 = new S3Client({
      endpoint: storage.endpoint,
      region: storage.region,
      forcePathStyle: true,
      credentials: { accessKeyId: "test", secretAccessKey: "test" }
    });
    await s3.send(new CreateBucketCommand({ Bucket: storage.bucket }));
    s3.destroy();
    const state = { tenants: [], events: [], latencies: [], started_at: new Date().toISOString() };
    for (let i = 0; i < 3; i++) {
      const organizationId = randomUUID(),
        userId = randomUUID(),
        projectId = randomUUID();
      const token = `dbundle_proj_recovery_${randomUUID()}`;
      await pool.query(
        "INSERT INTO organizations (id,name,slug,plan) VALUES ($1,'Local recovery check',$2,'team')",
        [organizationId, `recovery-${organizationId}`]
      );
      await pool.query("INSERT INTO users (id,email) VALUES ($1,$2)", [
        userId,
        `${userId}@example.com`
      ]);
      await pool.query(
        "INSERT INTO organization_members (id,organization_id,user_id,role) VALUES ($1,$2,$3,'owner')",
        [randomUUID(), organizationId, userId]
      );
      await pool.query(
        "INSERT INTO projects (id,organization_id,owner_user_id,name,slug,environment_default) VALUES ($1,$2,$3,'Local recovery check',$4,'test')",
        [projectId, organizationId, userId, `recovery-${projectId}`]
      );
      await pool.query(
        "INSERT INTO project_tokens (id,project_id,token_hash,label) VALUES ($1,$2,$3,'local recovery only')",
        [randomUUID(), projectId, hashToken(token)]
      );
      state.tenants.push({ project_id: projectId, token });
    }
    write(state);
    console.log(JSON.stringify({ phase, projects: 3 }));
  } else if (phase === "preload") {
    const state = read();
    state.events = [];
    state.latencies = [];
    await burst(state, 0, 150);
    write(state);
    const pending = await redis.llen("jobs:normalize-events");
    assert.equal(pending, 150);
    console.log(JSON.stringify({ phase, accepted: 150, pending }));
  } else if (phase === "pending") {
    console.log(JSON.stringify({ phase, pending: await redis.llen("jobs:normalize-events") }));
  } else if (phase === "load") {
    const state = read(),
      started = performance.now();
    await burst(state, state.events.length, 750, 12);
    write(state);
    console.log(
      JSON.stringify({
        phase: "burst",
        accepted: state.events.length,
        elapsed_ms: performance.now() - started,
        latency: summarize(state.latencies)
      })
    );
    for (let second = 0; second < 120; second++) {
      const start = performance.now();
      await burst(state, state.events.length, 10, 5);
      write(state);
      if (second % 30 === 29)
        console.log(
          JSON.stringify({ phase: "sustained", seconds: second + 1, accepted: state.events.length })
        );
      await new Promise((resolve) =>
        setTimeout(resolve, Math.max(0, 1000 - (performance.now() - start)))
      );
    }
    for (let index = 0; index < 60; index++) await send(state, index, true);
    write(state);
    console.log(
      JSON.stringify({
        phase,
        unique_events: state.events.length,
        replay_requests: 60,
        elapsed_ms: performance.now() - started,
        latency: summarize(state.latencies)
      })
    );
  } else if (phase === "progress") {
    const state = read();
    const q = await pool.query(
      `SELECT
      (SELECT COUNT(*)::int FROM processed_events WHERE project_id = ANY($1::uuid[])) AS processed,
      (SELECT COUNT(*)::int FROM worker_jobs WHERE project_id = ANY($1::uuid[]) AND status = 'running') AS running,
      (SELECT COUNT(*)::int FROM worker_jobs WHERE project_id = ANY($1::uuid[]) AND status = 'pending') AS pending,
      (SELECT COUNT(*)::int FROM worker_jobs WHERE project_id = ANY($1::uuid[]) AND status = 'failed') AS failed,
      (SELECT COALESCE(SUM(occurrence_count),0)::int FROM incidents WHERE project_id = ANY($1::uuid[])) AS occurrences`,
      [state.tenants.map((t) => t.project_id)]
    );
    console.log(JSON.stringify(q.rows[0]));
  } else if (phase === "verify") {
    const state = read();
    const projectIds = state.tenants.map((t) => t.project_id);
    const result = await pool.query(
      "SELECT id,project_id,occurrence_count FROM incidents WHERE project_id = ANY($1::uuid[]) ORDER BY project_id,id",
      [projectIds]
    );
    assert.equal(result.rows.length, 24);
    assert.equal(
      result.rows.reduce((sum, row) => sum + row.occurrence_count, 0),
      state.events.length
    );
    const processed = await pool.query(
      "SELECT event_id FROM processed_events WHERE project_id = ANY($1::uuid[])",
      [projectIds]
    );
    assert.deepEqual(
      processed.rows.map((r) => r.event_id).sort(),
      state.events.map((r) => r.event.event_id).sort()
    );
    let bundles = 0,
      reproductions = 0;
    for (const row of result.rows) {
      const bytes = await objectStore.getObject({
        key: buildBundleObjectKey(row.project_id, row.id)
      });
      const bundle = BundleV1Schema.parse(JSON.parse(gunzipSync(bytes).toString()));
      assert.equal(bundle.bundle_id, `bnd_${row.id}`);
      assert.ok(!JSON.stringify(bundle).includes("dbundle_proj_recovery_"));
      await objectStore.getObject({ key: buildReproductionObjectKey(row.project_id, row.id) });
      bundles++;
      reproductions++;
    }
    const jobs = await pool.query(
      "SELECT status,COUNT(*)::int AS count FROM worker_jobs WHERE project_id = ANY($1::uuid[]) GROUP BY status",
      [projectIds]
    );
    assert.equal(
      jobs.rows.filter((r) => ["pending", "running", "failed"].includes(r.status)).length,
      0
    );
    const tenant = state.tenants[0],
      key = `ingestion-rate:${tenant.project_id}:${hashToken(tenant.token)}`;
    // Fill the real limiter's budget, then exercise the ordinary HTTP rejection path.
    await redis.set(key, "10000", "PX", 60000);
    const rejected = await fetch("http://api:3000/v1/events", {
      method: "POST",
      headers: { authorization: `Bearer ${tenant.token}`, "content-type": "application/json" },
      body: JSON.stringify({ events: [state.events[0].event] }),
      signal: AbortSignal.timeout(20000)
    });
    const rejectionBody = await rejected.json();
    assert.equal(rejected.status, 429, JSON.stringify(rejectionBody));
    assert.ok(Number(rejected.headers.get("retry-after")) > 0);
    await redis.del(key);
    console.log(
      JSON.stringify({
        phase,
        unique_events: state.events.length,
        http_requests: state.latencies.length,
        incidents: result.rows.length,
        bundles,
        reproductions,
        jobs: jobs.rows,
        latency: summarize(state.latencies),
        rate_limit_status: rejected.status,
        retry_after: rejected.headers.get("retry-after")
      })
    );
  } else throw new Error("unsupported_phase");
} finally {
  await redis.quit();
  await pool.end();
}
