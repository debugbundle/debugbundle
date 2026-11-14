import { createHash, randomUUID } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { afterAll, beforeAll, expect, it } from "vitest";
import { BundleV1Schema, type BundleV1 } from "../../packages/shared-types/src/index.js";
import { buildRawEventObjectKey } from "../../packages/storage/src/index.js";
import { rustSdkEvents } from "../helpers/rust-sdk-fixtures.js";
import {
  runtimePort,
  startRuntime,
  stopRuntime,
  untilRuntime
} from "../helpers/project-service-runtime.js";
import {
  bootstrapStorageAndCreateBucket,
  createIntegrationPool,
  createS3AdminClient,
  createTestObjectStore,
  runIntegration,
  seedOwnedProject
} from "../helpers/integration-setup.js";

runIntegration("Rust artifact ingestion and worker pipeline", () => {
  const pool = createIntegrationPool();
  const s3 = createS3AdminClient();
  beforeAll(async () => {
    await bootstrapStorageAndCreateBucket(pool, s3);
  });
  afterAll(async () => {
    await pool.end();
    s3.destroy();
  });

  it("retains Rust identity/privacy/evidence through real HTTP, durable processing and bundle retrieval", async () => {
    const projectId = randomUUID(),
      organizationId = randomUUID(),
      owner = randomUUID();
    const projectToken = `dbundle_proj_synthetic_${randomUUID()}`;
    const memberToken = `dbundle_mem_synthetic_${randomUUID()}`;
    const hash = (value: string) => createHash("sha256").update(value).digest("hex");
    await seedOwnedProject({
      pool,
      projectId,
      organizationId,
      ownerUserId: owner,
      organizationName: "Rust fixture",
      organizationSlug: organizationId,
      projectName: "Rust fixture",
      projectSlug: projectId
    });
    await pool.query(
      "INSERT INTO project_tokens (id,project_id,token_hash,label) VALUES ($1,$2,$3,$4)",
      [randomUUID(), projectId, hash(projectToken), "synthetic-rust"]
    );
    await pool.query(
      "INSERT INTO member_tokens (id,user_id,organization_id,token_hash,label) VALUES ($1,$2,$3,$4,$5)",
      [randomUUID(), owner, organizationId, hash(memberToken), "synthetic-rust"]
    );
    // Only occurrence time advances for bounded admission of the retained
    // artifact fixture. Original event/trace/failure/operation IDs stay intact.
    const events = rustSdkEvents();
    const original = events.map((event) => ({
      id: event.event_id,
      trace: event.correlation?.trace_id
    }));
    const start = Date.now() - 1000;
    const baseline = Date.parse(events[0]!.occurred_at);
    for (const event of events)
      event.occurred_at = new Date(start + Date.parse(event.occurred_at) - baseline).toISOString();
    const port = await runtimePort(),
      workerPort = await runtimePort();
    const base = `http://127.0.0.1:${port}`;
    const env = {
      ...process.env,
      API_HOST: "127.0.0.1",
      API_PORT: String(port),
      WORKER_HEALTH_PORT: String(workerPort),
      WORKER_POLL_INTERVAL_MS: "100",
      DEBUGBUNDLE_PROBE_TRIGGER_SECRET: "rust-fixture-only",
      ANALYTICS_HASH_SECRET: "rust-fixture-only",
      AWS_ACCESS_KEY_ID: "test",
      AWS_SECRET_ACCESS_KEY: "test",
      AWS_EC2_METADATA_DISABLED: "true",
      SELFHOST_MODE: "true"
    };
    const api = startRuntime("api", env);
    let worker: ReturnType<typeof startRuntime> | undefined;
    let lastBundle: unknown;
    try {
      await untilRuntime(async () => {
        if (api.child.exitCode !== null) throw new Error(api.output());
        return fetch(`${base}/ready`, { signal: AbortSignal.timeout(2000) }).then(
          (reply) => reply.ok,
          () => false
        );
      }, Boolean);
      const response = await fetch(`${base}/v1/events`, {
        method: "POST",
        headers: { authorization: `Bearer ${projectToken}`, "content-type": "application/json" },
        body: JSON.stringify({ events }),
        signal: AbortSignal.timeout(5000)
      });
      expect(response.status).toBe(202);
      expect(await response.json()).toMatchObject({ accepted: 3, rejected: 0, errors: [] });
      const objects = createTestObjectStore();
      for (const [index, event] of events.entries()) {
        const bytes = await objects.getObject({
          key: buildRawEventObjectKey({
            projectId,
            eventId: event.event_id,
            occurredAt: new Date(event.occurred_at)
          })
        });
        const stored = JSON.parse(gunzipSync(bytes).toString("utf8")) as typeof event;
        // Authenticated project scope is the object key and queued job, not an
        // invented SDK payload field. The receiver preserves the original shape.
        expect(stored.project_id).toBe(event.project_id);
        expect(stored.event_id).toBe(original[index]!.id);
        expect(stored.correlation?.trace_id).toBe(original[index]!.trace);
        expect(JSON.stringify(stored)).not.toContain("BROWSER_SECRET");
      }
      worker = startRuntime("worker", env);
      const bundle = await untilRuntime<BundleV1 | null>(
        async () => {
          if (worker!.child.exitCode !== null) throw new Error(worker!.output());
          const rows = await pool.query<{ id: string }>(
            "SELECT id FROM incidents WHERE project_id=$1",
            [projectId]
          );
          if (rows.rows.length !== 1) return null;
          const result = await fetch(`${base}/v1/incidents/${rows.rows[0]!.id}/bundle`, {
            headers: { authorization: `Bearer ${memberToken}` },
            signal: AbortSignal.timeout(5000)
          });
          expect(result.status).toBe(200);
          lastBundle = await result.json();
          const parsed = BundleV1Schema.safeParse(lastBundle);
          return parsed.success && parsed.data.context.recovery?.outcome === "recovered"
            ? parsed.data
            : null;
        },
        (result) => result !== null
      );
      expect(bundle?.context.error?.exception_evidence?.runtime).toBe("unknown");
      expect(bundle?.context.error?.exception_evidence?.nodes).toHaveLength(2);
      expect(bundle?.context.execution).toMatchObject({ kind: "command", name: "checkout.retry" });
      expect(bundle?.context.probe_data?.items).toHaveLength(1);
      expect(bundle?.context.evidence?.primary_event_id).toBe(original[0]!.id);
      expect(bundle?.service.runtime).toBe("rust");
      expect(bundle?.signal.occurrence_count).toBe(1);
      const incidents = await pool.query<{ status: string; occurrence_count: number }>(
        "SELECT status, occurrence_count FROM incidents WHERE project_id=$1",
        [projectId]
      );
      expect(incidents.rows).toEqual([{ status: "open", occurrence_count: 1 }]);
      const processed = await pool.query<{ event_id: string }>(
        "SELECT event_id FROM processed_events WHERE project_id=$1 ORDER BY event_id",
        [projectId]
      );
      expect(processed.rows.map((row) => row.event_id).sort()).toEqual(
        original.map((event) => event.id).sort()
      );
    } catch (error) {
      const retained = await pool.query(
        "SELECT event_id,kind,occurred_at,received_at,is_retained FROM evidence_context_events WHERE project_id=$1 ORDER BY occurred_at,event_id",
        [projectId]
      );
      throw new Error(
        `${String(error)}\nRetained: ${JSON.stringify(retained.rows)}\nLast bundle: ${JSON.stringify(lastBundle)}\nAPI: ${api.output()}\nWorker: ${worker?.output() ?? "not started"}`
      );
    } finally {
      if (worker) await stopRuntime(worker.child);
      await stopRuntime(api.child);
    }
  });
});
