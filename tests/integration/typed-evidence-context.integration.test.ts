import {
  restoreStoragePredecessor,
  PROJECT_SERVICE_MIGRATION_IDS
} from "../helpers/storage-predecessor.js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  assertStorageSchemaMigrationsApplied,
  migrateStorageSchema
} from "../../packages/storage/src/schema-migrations.js";
import { EVIDENCE_CONTEXT_MIGRATIONS } from "../../packages/storage/src/evidence-context-schema.js";
import { createEvidenceContextStore } from "../../packages/storage/src/evidence-context-store.js";
import { createEvidenceContextReader } from "../../packages/storage/src/evidence-context-reader.js";
import { createEvidenceIngestionReceiptStore } from "../../packages/storage/src/evidence-ingestion-receipt.js";
import { validateEventAtAdmission } from "../../packages/event-normalizer/src/admission.js";
import { createEvidenceContextRetentionStore } from "../../packages/storage/src/evidence-context-retention.js";
import { createEventEnvelope, type EventEnvelope } from "../../packages/shared-types/src/index.js";
import {
  bootstrapStorageAndCreateBucket,
  createIntegrationPool,
  createQueryable,
  createS3AdminClient,
  runIntegration,
  seedOwnedProject
} from "../helpers/integration-setup.js";
import { browserResourceEvent } from "../helpers/browser-resource-fixtures.js";

runIntegration("typed evidence migration and scoped context index", () => {
  const pool = createIntegrationPool();
  const s3 = createS3AdminClient();
  const db = createQueryable(pool);
  beforeAll(async () => {
    await bootstrapStorageAndCreateBucket(pool, s3);
  });
  afterAll(async () => {
    await pool.end();
    s3.destroy();
  });

  async function transaction<T>(
    callback: (db: ReturnType<typeof createQueryable>) => Promise<T>
  ): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback({ query: (sql, params) => client.query(sql, params) });
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async function seed() {
    const projectId = randomUUID();
    await seedOwnedProject({
      pool,
      projectId,
      organizationId: randomUUID(),
      organizationName: "Evidence",
      organizationSlug: `evidence-${projectId}`,
      projectName: "Evidence",
      projectSlug: "evidence"
    });
    return projectId;
  }
  async function record(project: string, event: EventEnvelope, receipt: string) {
    return transaction(async (tx) =>
      createEvidenceContextStore(tx).record(
        project,
        event,
        receipt,
        event.event_type === "diagnostic_context" ? "context_signal" : "incident_signal"
      )
    );
  }

  it("atomically claims evidence retries and preserves an initially rejected receipt until cleanup", async () => {
    const project = await seed(),
      receipt = new Date().toISOString();
    const event = createEventEnvelope({
      event_type: "diagnostic_context",
      occurred_at: new Date(Date.now() + 120_000).toISOString(),
      service: { name: "api", environment: "test" },
      payload: {
        version: 1,
        kind: "recovery",
        failure_ref: randomUUID(),
        scope: { kind: "operation", operation_id: randomUUID() },
        attempt_id: randomUUID(),
        state: "attempt_completed"
      }
    });
    const store = createEvidenceIngestionReceiptStore(db);
    try {
      const first = await store.claim(project, event, receipt);
      expect(validateEventAtAdmission(event, first.received_at).success).toBe(false);
      const changed = {
        ...event,
        payload: { ...event.payload, state: "recovery_observed" as const }
      };
      const later = new Date(Date.now() + 180_000).toISOString();
      const results = await Promise.all(
        Array.from({ length: 12 }, (_, i) => store.claim(project, i % 2 ? event : changed, later))
      );
      for (const [index, result] of results.entries()) {
        expect(result.received_at).toBe(first.received_at);
        expect(result.matches).toBe(index % 2 === 1);
        expect(validateEventAtAdmission(event, result.received_at).success).toBe(false);
      }
      expect(
        (
          await store.claim(
            project,
            { ...event, service: { environment: "test", name: "api" } },
            later
          )
        ).matches
      ).toBe(true);
      const expired = new Date(Date.now() + 8 * 86_400_000).toISOString();
      const retention = createEvidenceContextRetentionStore(db);
      const refs = await retention.listExpiredDiagnosticRawEvents({ now: expired, limit: 100 });
      expect(refs.map((ref) => ref.event_id)).toContain(event.event_id);
      await retention.deleteExpiredDiagnosticRawEvents({ references: refs });
      expect(
        (
          await pool.query("SELECT event_id FROM evidence_ingestion_receipts WHERE project_id=$1", [
            project
          ])
        ).rows
      ).toEqual([]);
    } finally {
      await pool.query("DELETE FROM projects WHERE id=$1", [project]);
    }
  });

  it("rebuilds the latest retained occurrence without borrowing a later context sample", async () => {
    const project = await seed(),
      incidentId = randomUUID(),
      first = Date.now() - 4000;
    const reference = {
      version: 1 as const,
      failure_ref: randomUUID(),
      scope: { kind: "operation" as const, operation_id: randomUUID() }
    };
    const failure = createEventEnvelope({
      event_type: "log_event",
      occurred_at: new Date(first).toISOString(),
      service: { name: "api", environment: "production" },
      context: { evidence_reference: reference },
      payload: { level: "error", message: "operation failed", attributes: {} }
    });
    const primaryId = randomUUID(),
      sampleId = randomUUID();
    try {
      await pool.query(
        `INSERT INTO incidents (id, project_id, environment, fingerprint, title, severity, status, first_seen_at, last_seen_at, occurrence_count, matched_fields)
        VALUES ($1::uuid,$2,'production',($1::uuid)::text,'Failure','high','open',$3::timestamptz,$4::timestamptz,2,$5::text[])`,
        [incidentId, project, failure.occurred_at, new Date(first + 1000).toISOString(), []]
      );
      for (const [id, type, classification, offset] of [
        [failure.event_id, "log_event", "incident_signal", 0],
        [primaryId, "request_event", "incident_signal", 1000],
        [sampleId, "frontend_exception", "context_signal", 2000]
      ] as const)
        await pool.query(
          `INSERT INTO incident_events (incident_id,event_id,event_type,event_class,occurred_at,is_sampled)
          VALUES ($1,$2,$3,$4,$5::timestamptz,true)`,
          [incidentId, id, type, classification, new Date(first + offset).toISOString()]
        );
      await record(project, failure, new Date().toISOString());
      const recovery = createEventEnvelope({
        event_type: "diagnostic_context",
        service: failure.service,
        occurred_at: new Date(first + 3000).toISOString(),
        payload: {
          ...reference,
          kind: "recovery",
          attempt_id: randomUUID(),
          state: "recovery_observed"
        }
      });
      await record(project, recovery, new Date().toISOString());
      const jobs = await pool.query(
        "SELECT payload FROM worker_jobs WHERE project_id=$1 AND job_name='build-bundle'",
        [project]
      );
      expect(jobs.rows).toHaveLength(1);
      expect(jobs.rows[0].payload).toMatchObject({
        event_id: recovery.event_id,
        primary_event_id: primaryId,
        occurrence_count: 2,
        trigger: "new_context_type"
      });
      expect(
        (await pool.query("SELECT occurrence_count FROM incidents WHERE id=$1", [incidentId]))
          .rows[0].occurrence_count
      ).toBe(2);
    } finally {
      await pool.query("DELETE FROM projects WHERE id=$1", [project]);
    }
  });

  it("upgrades the predecessor, refuses readiness before migration and retains existing data/checksums", async () => {
    await restoreStoragePredecessor(pool);
    const project = await seed();
    const id = EVIDENCE_CONTEXT_MIGRATIONS[0]!.id;
    await pool.query("DROP TABLE evidence_context_events");
    await pool.query("DROP TABLE evidence_ingestion_receipts");
    await pool.query("ALTER TABLE capture_policies DROP COLUMN capture_diagnostic_context");
    await pool.query("DELETE FROM storage_migration_ledger WHERE id=$1", [id]);
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow();
    const client = await pool.connect();
    try {
      const result = await migrateStorageSchema({
        query: (sql, params) => client.query(sql, params)
      });
      expect(result.applied).toEqual([id, ...PROJECT_SERVICE_MIGRATION_IDS]);
      expect(
        (await migrateStorageSchema({ query: (sql, params) => client.query(sql, params) })).applied
      ).toEqual([]);
    } finally {
      client.release();
    }
    await expect(assertStorageSchemaMigrationsApplied(db)).resolves.toBeUndefined();
    expect((await pool.query("SELECT id FROM projects WHERE id=$1", [project])).rows).toHaveLength(
      1
    );
    expect(
      (await pool.query("SELECT checksum FROM storage_migration_ledger WHERE id=$1", [id])).rows[0]
        .checksum
    ).toBe(EVIDENCE_CONTEXT_MIGRATIONS[0]!.checksum);
    await pool.query("DELETE FROM projects WHERE id=$1", [project]);
  });

  it.each([false, true])(
    "correlates either arrival order, firstContext=%s, with replay/scope/ambiguity isolation",
    async (firstContext) => {
      const project = await seed();
      const first = Date.now() - 2000;
      const failure = browserResourceEvent();
      failure.occurred_at = new Date(first).toISOString();
      failure.correlation = {
        session_id: "synthetic-private-session",
        request_id: null,
        trace_id: null,
        user_id_hash: null
      };
      const reference = {
        version: 1 as const,
        failure_ref: randomUUID(),
        scope: { kind: "page" as const, page_id: randomUUID() }
      };
      failure.context = { evidence_reference: reference };
      const recovery = createEventEnvelope({
        event_type: "diagnostic_context",
        service: failure.service,
        occurred_at: new Date(first + 1000).toISOString(),
        correlation: { session_id: "synthetic-private-session" },
        payload: {
          ...reference,
          kind: "recovery",
          attempt_id: randomUUID(),
          state: "attempt_completed",
          status_code: 200
        }
      });
      const receipt = new Date().toISOString();
      try {
        for (const event of firstContext ? [recovery, failure] : [failure, recovery])
          await record(project, event, receipt);
        await record(project, recovery, new Date(Date.now() + 60_000).toISOString());
        const reader = createEvidenceContextReader(db);
        const query = {
          project_id: project,
          service_name: failure.service.name,
          environment: failure.service.environment,
          failure_event_ids: [failure.event_id]
        };
        expect(
          (await reader.listEvidenceContextCandidates(query)).map((item) => item.event_id)
        ).toEqual([recovery.event_id]);
        expect(
          (
            await pool.query(
              "SELECT received_at::text FROM evidence_context_events WHERE event_id=$1",
              [recovery.event_id]
            )
          ).rows[0].received_at
        ).toContain(receipt.slice(0, 10));
        const metadata = JSON.stringify(
          (
            await pool.query(
              "SELECT failure_hash,scope_hash,session_hash,trace_hash FROM evidence_context_events WHERE project_id=$1",
              [project]
            )
          ).rows
        );
        expect(metadata).not.toContain("synthetic-private-session");
        expect(metadata).not.toContain(reference.failure_ref);
        for (const wrong of [
          { ...recovery, event_id: randomUUID(), service: { ...recovery.service, name: "other" } },
          {
            ...recovery,
            event_id: randomUUID(),
            service: { ...recovery.service, environment: "other" }
          },
          {
            ...recovery,
            event_id: randomUUID(),
            correlation: { ...recovery.correlation!, session_id: "unrelated" }
          },
          {
            ...recovery,
            event_id: randomUUID(),
            occurred_at: new Date(first + 301_000).toISOString()
          }
        ])
          await record(project, wrong, receipt);
        expect(
          (await reader.listEvidenceContextCandidates(query)).map((item) => item.event_id)
        ).toEqual([recovery.event_id]);
        expect(
          (await pool.query("SELECT id FROM incidents WHERE project_id=$1", [project])).rows
        ).toHaveLength(0);
        expect(
          (await pool.query("SELECT id FROM worker_jobs WHERE project_id=$1", [project])).rows
        ).toHaveLength(0);
        await record(project, { ...failure, event_id: randomUUID() }, receipt);
        expect(await reader.listEvidenceContextCandidates(query)).toEqual([]);
      } finally {
        await pool.query("DELETE FROM projects WHERE id=$1", [project]);
      }
    }
  );
});
