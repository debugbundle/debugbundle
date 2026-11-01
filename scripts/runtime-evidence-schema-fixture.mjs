// Runs only inside an isolated candidate/predecessor image and disposable database.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Pool } from "pg";
import {
  assertDatabaseSchema,
  buildApiReadinessCheck,
  parseApiRuntimeEnv
} from "../apps/api/src/runtime.ts";
import {
  assertWorkerSchema,
  buildWorkerReadinessCheck,
  parseWorkerEnv
} from "../apps/worker/src/worker-env.ts";
import { createPostgresCapturePolicyStore } from "../packages/storage/src/capture-policy-store.ts";

const pool = new Pool({
  host: "postgres",
  user: "debugbundle",
  password: "fixture-only",
  database: "debugbundle"
});
const db = { query: (sql, params) => pool.query(sql, params) };
const project = "11111111-1111-4111-8111-111111111111";
const owner = "22222222-2222-4222-8222-222222222222";
const organization = "33333333-3333-4333-8333-333333333333";
const eventId = "44444444-4444-4444-8444-444444444444";
const policyStore = createPostgresCapturePolicyStore(db);
const mode = process.argv[2];

async function snapshot() {
  return {
    ledger: (
      await pool.query(
        "SELECT id, checksum, applied_at::text FROM storage_migration_ledger ORDER BY id"
      )
    ).rows,
    columns: (
      await pool.query(
        "SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name, ordinal_position"
      )
    ).rows,
    owner: (await pool.query("SELECT * FROM users WHERE id=$1", [owner])).rows,
    organization: (await pool.query("SELECT * FROM organizations WHERE id=$1", [organization]))
      .rows,
    project: (await pool.query("SELECT * FROM projects WHERE id=$1", [project])).rows,
    policies: (await pool.query("SELECT * FROM capture_policies WHERE project_id=$1", [project]))
      .rows
  };
}

try {
  if (mode === "seed") {
    await pool.query("INSERT INTO users(id,email) VALUES ($1,'schema-rehearsal@example.invalid')", [
      owner
    ]);
    await pool.query(
      "INSERT INTO organizations(id,name,slug) VALUES ($1,'Schema rehearsal','schema-rehearsal')",
      [organization]
    );
    await pool.query(
      "INSERT INTO projects(id,organization_id,owner_user_id,name,slug) VALUES ($1,$2,$3,'Schema rehearsal','schema-rehearsal')",
      [project, organization, owner]
    );
    await pool.query(
      "INSERT INTO project_tokens(id,project_id,token_hash,label) VALUES ($1,$2,$3,'local fixture')",
      [
        "55555555-5555-4555-8555-555555555555",
        project,
        createHash("sha256").update("dbundle_proj_runtime-rehearsal-token").digest("hex")
      ]
    );
    await policyStore.upsertCapturePolicy({
      project_id: project,
      preset: "balanced",
      capture_logs: "all",
      immediate_client_error_statuses: [409, 422]
    });
  } else if (mode === "missing") {
    await assert.rejects(() => assertDatabaseSchema(db), /db_schema_missing_tables:.*evidence/);
    await assert.rejects(() => assertWorkerSchema(db), /worker_schema_missing_tables:.*evidence/);
    await assert.rejects(
      buildApiReadinessCheck(parseApiRuntimeEnv(process.env)),
      /db_schema_missing_tables:.*evidence/
    );
    await assert.rejects(
      buildWorkerReadinessCheck({ env: parseWorkerEnv(process.env), queryable: db }),
      /worker_schema_missing_tables:.*evidence/
    );
    console.log("candidate_schema_refused_before_migration");
  } else if (mode === "evidence") {
    const { createEventEnvelope } = await import("../packages/shared-types/src/index.ts");
    const { createEvidenceIngestionReceiptStore } =
      await import("../packages/storage/src/evidence-ingestion-receipt.ts");
    const { createEvidenceContextStore } =
      await import("../packages/storage/src/evidence-context-store.ts");
    const event = createEventEnvelope({
      event_type: "diagnostic_context",
      event_id: eventId,
      occurred_at: new Date().toISOString(),
      service: { name: "schema-rehearsal", environment: "local" },
      payload: {
        version: 1,
        kind: "recovery",
        failure_ref: "66666666-6666-4666-8666-666666666666",
        scope: { kind: "operation", operation_id: "77777777-7777-4777-8777-777777777777" },
        attempt_id: "88888888-8888-4888-8888-888888888888",
        state: "attempt_completed"
      }
    });
    const receipt = await createEvidenceIngestionReceiptStore(db).claim(
      project,
      event,
      event.occurred_at
    );
    assert.equal(receipt.matches, true);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await createEvidenceContextStore({
        query: (sql, params) => client.query(sql, params)
      }).record(project, event, receipt.received_at, "context_signal");
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    await policyStore.upsertCapturePolicy({
      project_id: project,
      preset: "balanced",
      capture_logs: "all",
      immediate_client_error_statuses: [409, 422],
      capture_diagnostic_context: false
    });
  } else if (mode === "legacy-write") {
    const current = await policyStore.getCapturePolicyByProjectId(project);
    assert.equal(current.capture_logs, "all");
    await policyStore.upsertCapturePolicy({
      ...current,
      project_id: project,
      capture_logs: "errors"
    });
  } else if (mode === "retained") {
    assert.equal(
      (await policyStore.getCapturePolicyByProjectId(project)).capture_diagnostic_context,
      false
    );
    assert.equal((await policyStore.getCapturePolicyByProjectId(project)).capture_logs, "errors");
    for (const table of ["evidence_context_events", "evidence_ingestion_receipts"]) {
      const rows = (
        await pool.query(`SELECT event_id FROM ${table} WHERE project_id=$1`, [project])
      ).rows;
      assert.deepEqual(rows, [{ event_id: eventId }]);
    }
    console.log("evidence_and_policy_retained_after_predecessor_write");
  } else if (mode !== "snapshot" && mode !== "ready") {
    throw new Error(`Unknown fixture mode: ${mode}`);
  }
  if (mode !== "missing") {
    await assertDatabaseSchema(db);
    await assertWorkerSchema(db);
    console.log(JSON.stringify(await snapshot()));
  }
} finally {
  await pool.end();
}
