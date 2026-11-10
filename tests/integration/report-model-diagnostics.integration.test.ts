import { createHash } from "node:crypto";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { processNextSmartReportJob } from "../../apps/worker/src/smart-report-processor.js";
import { createReportModelClient } from "../../packages/smart-reports/src/model-client.js";
import { REPORT_MODEL_DIAGNOSTIC_CODES } from "../../packages/smart-reports/src/model-diagnostics.js";
import { createReportModelAttemptStore } from "../../packages/storage/src/report-model-attempt-store.js";
import { createReportContentStore } from "../../packages/storage/src/report-content-store.js";
import { ReportDocumentSchema } from "../../packages/smart-reports/src/report-document.js";
import {
  assertStorageSchemaMigrationsApplied,
  migrateStorageSchema,
  STORAGE_SCHEMA_MIGRATIONS
} from "../../packages/storage/src/schema-migrations.js";
import {
  resetReportRunFixture,
  reportTestUsage as usage,
  reportTestCost as cost
} from "../helpers/report-runs.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration
} from "../helpers/integration-setup.js";

const migrationId = "202611090001_add_report_model_diagnostics";
const STORAGE_MIGRATION_LEDGER_TABLE = "storage_migration_ledger";
const narrative = {
  version: 1,
  overview: { text: "Available observations are incomplete.", evidence_refs: ["c1"] },
  highlights: [],
  priorities: [],
  limitations: [{ text: "Source coverage is partial.", evidence_refs: ["c1"] }]
};
runIntegration("report model diagnostic persistence", () => {
  const pool = createIntegrationPool(),
    db = createQueryable(pool);
  let admit: Awaited<ReturnType<typeof resetReportRunFixture>>["admit"], owner: string;
  beforeEach(async () => {
    ({ admit, owner } = await resetReportRunFixture(pool, db));
  });
  afterAll(async () => {
    await pool.end();
  });

  function fixture(content: unknown, status = "completed", failReady = false) {
    const saved = new Map<string, Buffer>();
    const objects = {
      async putObject(input: { key: string; body: Buffer }) {
        if (failReady && input.key.includes("/ready-")) {
          failReady = false;
          throw new Error("storage_unavailable");
        }
        saved.set(input.key, Buffer.from(input.body));
      },
      async getObject(input: { key: string }) {
        const body = saved.get(input.key);
        if (!body) throw new Error("s3_object_not_found");
        return body;
      },
      async deleteObject(input: { key: string }) {
        saved.delete(input.key);
      }
    };
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ object: "response.input_tokens", input_tokens: 100 }))
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "resp_diagnostic_fixture",
            model: "gpt-6.1-terra",
            service_tier: "default",
            status,
            usage,
            output: [
              { type: "message", role: "assistant", status: "completed", content: [content] }
            ]
          })
        )
      );
    const model = createReportModelClient({ apiKey: "sk-synthetic-diagnostic", fetch: request });
    return { saved, objects, request, model };
  }

  it.each([
    [
      "report_unsafe_prose",
      {
        type: "output_text",
        annotations: [],
        text: JSON.stringify({
          ...narrative,
          overview: {
            text: "Contact private@example.test for the observations.",
            evidence_refs: ["c1"]
          }
        })
      },
      "completed"
    ],
    [
      "report_claim_not_supported",
      {
        type: "output_text",
        text: JSON.stringify({
          ...narrative,
          highlights: [
            {
              kind: "outstanding",
              text: "The linked observation describes active work.",
              evidence_refs: ["c1"]
            }
          ]
        }),
        annotations: []
      },
      "completed"
    ],
    [
      "report_output_incomplete",
      { type: "output_text", text: "private rejected text", annotations: [] },
      "incomplete"
    ],
    ["report_model_refused", { type: "refusal", refusal: "private rejected text" }, "completed"],
    [
      "report_invalid_json",
      { type: "output_text", text: "private rejected text", annotations: [] },
      "completed"
    ],
    [
      "report_numeric_prose",
      {
        type: "output_text",
        text: JSON.stringify({
          ...narrative,
          overview: { text: "One issue remains.", evidence_refs: ["c1"] }
        }),
        annotations: []
      },
      "completed"
    ]
  ])(
    "persists %s through the real worker/client/store and resumes without another paid request",
    async (reason, content, status) => {
      const run = await admit(),
        f = fixture(content, status, true);
      await expect(
        processNextSmartReportJob({ db, objects: f.objects, model: f.model })
      ).rejects.toThrow("report_generation_unavailable");
      const before = (await pool.query("SELECT * FROM report_model_attempts")).rows[0]!;
      expect(before).toMatchObject({
        state: "rejected",
        diagnostic_code: reason,
        usage,
        cost_nano_usd: String(cost),
        narrative_json: null
      });
      expect(JSON.stringify(before)).not.toContain("private rejected text");
      const legacyHash = createHash("sha256")
        .update(
          JSON.stringify({
            state: "rejected",
            usage,
            cost_nano_usd: cost,
            provider_response_id: "resp_diagnostic_fixture"
          })
        )
        .digest("hex");
      expect(before.outcome_sha256).toBe(legacyHash);
      const attempts = createReportModelAttemptStore(db);
      await attempts.settle({
        attempt_id: before.id,
        outcome: {
          state: "rejected",
          usage,
          cost_nano_usd: cost,
          provider_response_id: "resp_diagnostic_fixture",
          elapsed_ms: 0,
          reason: "secret arbitrary exception text"
        }
      });
      expect(
        (await pool.query("SELECT diagnostic_code,outcome_sha256 FROM report_model_attempts"))
          .rows[0]
      ).toEqual({ diagnostic_code: reason, outcome_sha256: legacyHash });
      await pool.query(
        "UPDATE worker_jobs SET available_at=now()-interval '1 second' WHERE job_name='generate-smart-report'"
      );
      expect(await processNextSmartReportJob({ db, objects: f.objects, model: f.model })).toEqual({
        processed: true
      });
      expect(f.request).toHaveBeenCalledTimes(2);
      const row = (
        await pool.query<{ status: string; ready_object_key: string }>(
          "SELECT * FROM report_runs WHERE id=$1",
          [run.id]
        )
      ).rows[0]!;
      expect(row).toMatchObject({ status: "factual_only", paid_attempts: 1, ai_status: "failed" });
      const document = ReportDocumentSchema.parse(
        JSON.parse(f.saved.get(row.ready_object_key)!.toString())
      );
      expect(document.analysis).toMatchObject({ status: "unavailable", reason: "model_rejected" });
      expect(document.narrative).toBeNull();
      expect(
        await createReportContentStore(db, f.objects).read({
          organization_id: run.organization_id,
          id: run.id,
          initiator: { version: 1, kind: "browser_session", user_id: owner }
        })
      ).toEqual(document);
      expect(
        (
          await pool.query(
            "SELECT generations,held_nano_usd,spent_nano_usd FROM report_allowance_windows"
          )
        ).rows[0]
      ).toMatchObject({ generations: 1, held_nano_usd: "0", spent_nano_usd: String(cost) });
    }
  );

  it("preserves the first uncertain diagnostic and its full reservation on crash recovery", async () => {
    await admit();
    const f = fixture(null, "completed", true);
    f.request
      .mockReset()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ object: "response.input_tokens", input_tokens: 100 }))
      )
      .mockResolvedValueOnce(new Response("private provider error", { status: 429 }));
    await expect(
      processNextSmartReportJob({ db, objects: f.objects, model: f.model })
    ).rejects.toThrow("report_generation_unavailable");
    await pool.query(
      "UPDATE worker_jobs SET available_at=now()-interval '1 second' WHERE job_name='generate-smart-report'"
    );
    await processNextSmartReportJob({ db, objects: f.objects, model: f.model });
    expect(
      (await pool.query("SELECT state,diagnostic_code,outcome_sha256 FROM report_model_attempts"))
        .rows[0]
    ).toEqual({
      state: "uncertain",
      diagnostic_code: "report_provider_http_429",
      outcome_sha256: null
    });
    expect(
      (
        await pool.query(
          "SELECT generations,held_nano_usd,spent_nano_usd FROM report_allowance_windows"
        )
      ).rows[0]
    ).toMatchObject({ generations: 1, held_nano_usd: "24750000", spent_nano_usd: "0" });
    expect(f.request).toHaveBeenCalledTimes(2);
  });

  it("keeps successful narratives and their established receipt projection unchanged", async () => {
    const run = await admit(),
      f = fixture({ type: "output_text", text: JSON.stringify(narrative), annotations: [] });
    await processNextSmartReportJob({ db, objects: f.objects, model: f.model });
    const attempt = (await pool.query("SELECT * FROM report_model_attempts")).rows[0]!;
    expect(attempt).toMatchObject({
      state: "succeeded",
      diagnostic_code: null,
      narrative_json: null
    });
    expect(attempt.outcome_sha256).toBe(
      createHash("sha256")
        .update(
          JSON.stringify({
            state: "succeeded",
            usage,
            cost_nano_usd: cost,
            provider_response_id: "resp_diagnostic_fixture",
            narrative
          })
        )
        .digest("hex")
    );
    const row = (
      await pool.query<{ status: string; ready_object_key: string }>(
        "SELECT status,ready_object_key FROM report_runs WHERE id=$1",
        [run.id]
      )
    ).rows[0]!;
    expect(row.status).toBe("ready");
    expect(
      ReportDocumentSchema.parse(JSON.parse(f.saved.get(row.ready_object_key)!.toString()))
        .narrative
    ).toEqual(narrative);
    expect(f.request).toHaveBeenCalledTimes(2);
    await expect(
      pool.query("UPDATE report_model_attempts SET diagnostic_code=$1", [
        "report_unknown_reference: secret"
      ])
    ).rejects.toThrow("report_model_attempts_diagnostic_code_check");
    // The immutable migration catalogue must admit every current runtime code.
    for (const code of REPORT_MODEL_DIAGNOSTIC_CODES)
      await pool.query("UPDATE report_model_attempts SET diagnostic_code=$1", [code]);
  });

  it("projects unknown rejection text to a fixed code at the storage boundary", async () => {
    await admit();
    const f = fixture({ type: "output_text", text: "{}", annotations: [] });
    const model = {
      async prepare(input: Parameters<typeof f.model.prepare>[0]) {
        const prepared = await f.model.prepare(input);
        return {
          ...prepared,
          async run(before: () => Promise<void>) {
            const outcome = await prepared.run(before);
            return outcome.state === "rejected"
              ? { ...outcome, reason: "private arbitrary exception text" }
              : outcome;
          }
        };
      }
    };
    await processNextSmartReportJob({ db, objects: f.objects, model });
    const attempt = (await pool.query("SELECT * FROM report_model_attempts")).rows[0]!;
    expect(attempt.diagnostic_code).toBe("report_diagnostic_unavailable");
    expect(JSON.stringify(attempt)).not.toContain("private arbitrary exception text");
    expect(f.request).toHaveBeenCalledTimes(2);
  });

  it("migrates populated legacy receipts without changing prior checksums or inventing a diagnosis", async () => {
    await migrateStorageSchema(db);
    await admit();
    const f = fixture({ type: "output_text", text: "{}", annotations: [] });
    await processNextSmartReportJob({ db, objects: f.objects, model: f.model });
    await pool.query("ALTER TABLE report_model_attempts DROP COLUMN diagnostic_code");
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow(
      "report_model_diagnostic_schema_incomplete"
    );
    await pool.query(`DELETE FROM ${STORAGE_MIGRATION_LEDGER_TABLE} WHERE id=$1`, [migrationId]);
    const before = (await pool.query("SELECT * FROM report_model_attempts")).rows[0]!;
    const ledger = (
      await pool.query(`SELECT id,checksum FROM ${STORAGE_MIGRATION_LEDGER_TABLE} ORDER BY id`)
    ).rows;
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow(
      "storage_schema_missing_migrations"
    );
    expect((await migrateStorageSchema(db)).applied).toEqual([migrationId]);
    await expect(assertStorageSchemaMigrationsApplied(db)).resolves.toBeUndefined();
    expect((await pool.query("SELECT * FROM report_model_attempts")).rows[0]).toEqual({
      ...before,
      diagnostic_code: null
    });
    expect(
      (
        await pool.query(
          `SELECT id,checksum FROM ${STORAGE_MIGRATION_LEDGER_TABLE} WHERE id<>$1 ORDER BY id`,
          [migrationId]
        )
      ).rows
    ).toEqual(ledger);
    await createReportModelAttemptStore(db).settle({
      attempt_id: before.id,
      outcome: {
        state: "rejected",
        usage,
        cost_nano_usd: cost,
        provider_response_id: "resp_diagnostic_fixture",
        elapsed_ms: 0,
        reason: "report_invalid_narrative"
      }
    });
    expect((await pool.query("SELECT * FROM report_model_attempts")).rows[0]).toEqual({
      ...before,
      diagnostic_code: null
    });
    expect((await migrateStorageSchema(db)).applied).toEqual([]);
    const migration = STORAGE_SCHEMA_MIGRATIONS.find((item) => item.id === migrationId)!;
    await pool.query(
      "ALTER TABLE report_model_attempts DROP CONSTRAINT report_model_attempts_diagnostic_code_check"
    );
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow(
      "report_model_diagnostic_schema_incomplete"
    );
    await pool.query(`DELETE FROM ${STORAGE_MIGRATION_LEDGER_TABLE} WHERE id=$1`, [migration.id]);
  });
});
