import { createReportHealthStore } from "./report-health-store.js";
import { z } from "zod";
import { getTierCapabilities } from "../../shared-types/src/index.js";
import { AcceptedReportScopeSchema } from "../../smart-reports/src/report-definition.js";
import { SmartReportError } from "../../smart-reports/src/report-errors.js";
import {
  assembleReportFacts,
  type CanonicalReportFacts
} from "../../smart-reports/src/report-facts.js";
import { ReportPeriodSchema, previousReportPeriod } from "../../smart-reports/src/report-period.js";
import { canAccessReportScope } from "./report-authorization.js";
import { createReportAvailabilityStore } from "./report-availability-store.js";
import { readReportAnalyticsPeriod } from "./report-analytics-facts.js";
import { createReportLifecycleStore } from "./report-lifecycle-store.js";
import { createReportSourceTextStore } from "./report-source-text-store.js";
import { readReportSourceSnapshot } from "./report-source-snapshot.js";
import { runInTransaction } from "./transaction.js";
import type { Queryable, QueryResult } from "./types.js";
import type { WorkerJobClaim } from "./worker-job-store.js";
import { readReportRunClaim } from "./report-run-execution.js";
import { reportRunRecord } from "./report-run-record.js";
import { readRetainedReportText } from "./report-retained-text.js";
const InputSchema = z
  .object({
    organization_id: z.uuid(),
    definition_id: z.uuid(),
    expected_version: z.number().int().positive(),
    period: ReportPeriodSchema,
    cutoff_at: z.string().datetime()
  })
  .strict();
export interface ReportFactStore {
  readDefinition(raw: z.infer<typeof InputSchema>): Promise<CanonicalReportFacts>;
  readRun(raw: { claim: WorkerJobClaim; cutoff_at: string }): Promise<CanonicalReportFacts>;
}
/** Internal pre-generation stage, not an API permission boundary. Admission
 * must bind the requesting actor; this stage rechecks the saved creator. Reads
 * share one consistent database snapshot and hold no locks over provider work.
 * Publication/egress still requires a new live whole-scope authorisation. */
export function createReportFactStore(db: Queryable): ReportFactStore {
  return {
    async readDefinition(raw) {
      const input = InputSchema.parse(raw);
      return runInTransaction(db, async (tx) => {
        await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY", []);
        await tx.query("SET LOCAL statement_timeout='5s'", []);
        await tx.query("SET LOCAL lock_timeout='5s'", []);
        const row = (
          await tx.query<Record<string, unknown>>(
            `SELECT d.version,d.privacy_mode,d.source_collection_consent,d.accepted_scope,d.initiating_authority,
 d.paused_at,d.requires_owner_review,o.plan,o.suspended_at FROM report_definitions d JOIN organizations o ON o.id=d.organization_id
 WHERE d.id=$1 AND d.organization_id=$2`,
            [input.definition_id, input.organization_id]
          )
        ).rows[0];
        if (!row) throw new SmartReportError("report_not_found");
        if (!getTierCapabilities(z.string().parse(row["plan"])).smart_reports)
          throw new SmartReportError("upgrade_required");
        if (row["version"] !== input.expected_version)
          throw new SmartReportError("report_version_conflict");
        if (
          row["suspended_at"] !== null ||
          row["paused_at"] !== null ||
          row["requires_owner_review"] === true
        )
          throw new SmartReportError("forbidden");
        const scope = AcceptedReportScopeSchema.parse(row["accepted_scope"]),
          privacy = z.enum(["full", "restricted"]).parse(row["privacy_mode"]);
        if (
          (privacy === "full" && row["source_collection_consent"] !== true) ||
          !(await canAccessReportScope(tx, {
            organization_id: input.organization_id,
            scope,
            initiator: row["initiating_authority"],
            manage: true
          }))
        )
          throw new SmartReportError("forbidden");
        return readFactsSnapshot(tx, input, scope, privacy);
      });
    },
    async readRun(raw) {
      const cutoff = z.string().datetime().parse(raw.cutoff_at);
      return runInTransaction(db, async (tx) => {
        await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY", []);
        await tx.query("SET LOCAL statement_timeout='5s'", []);
        const row = await readReportRunClaim(tx, raw.claim),
          run = reportRunRecord(row);
        return readFactsSnapshot(
          tx,
          {
            organization_id: run.organization_id,
            definition_id: run.definition_id,
            expected_version: run.definition_version,
            period: run.period,
            cutoff_at: cutoff
          },
          run.scope,
          run.privacy_mode
        );
      });
    }
  };
}
async function readFactsSnapshot(
  connection: Queryable,
  input: z.infer<typeof InputSchema>,
  scope: z.infer<typeof AcceptedReportScopeSchema>,
  privacy: "full" | "restricted"
): Promise<CanonicalReportFacts> {
  const deadline = performance.now() + 60000;
  const tx: Queryable = {
    query: async <Row extends Record<string, unknown>>(
      sql: string,
      params: unknown[]
    ): Promise<QueryResult<Row>> => {
      if (performance.now() >= deadline) throw new Error("report_facts_deadline_exceeded");
      const result = await connection.query<Row>(sql, params);
      if (performance.now() >= deadline) throw new Error("report_facts_deadline_exceeded");
      return result;
    }
  };
  const previous = previousReportPeriod(input.period);
  const actual = (
    await tx.query<{ current_time: Date }>("SELECT clock_timestamp() AS current_time", [])
  ).rows[0]!.current_time;
  if (Date.parse(input.cutoff_at) > actual.getTime()) throw new Error("report_cutoff_in_future");
  const retentionNow = actual.toISOString();
  const text =
    privacy === "full"
      ? await createReportSourceTextStore(tx).read({
          definition_id: input.definition_id,
          now: retentionNow
        })
      : [];
  const lifecycle = createReportLifecycleStore(tx),
    availability = createReportAvailabilityStore(tx),
    views = [];
  for (const view of scope) {
    const name = (
      await tx.query<{ name: string }>("SELECT name FROM projects WHERE id=$1", [view.project_id])
    ).rows[0]?.name;
    if (!name) throw new SmartReportError("forbidden");
    const currentLifecycle = await lifecycle.readPeriod({
      definition_id: input.definition_id,
      origin_ids: view.origin_project_ids,
      period: input.period,
      now: input.cutoff_at
    });
    const previousLifecycle = await lifecycle.readPeriod({
      definition_id: input.definition_id,
      origin_ids: view.origin_project_ids,
      period: previous,
      now: input.cutoff_at
    });
    const stateInput = {
      origin_ids: view.origin_project_ids,
      cutoff_at: input.cutoff_at,
      period: input.period
    };
    const currentState = await readReportSourceSnapshot(tx, {
      ...stateInput,
      at: input.period.ends_at
    });
    const previousState = await readReportSourceSnapshot(tx, {
      ...stateInput,
      at: input.period.starts_at
    });
    const cutoffState = await readReportSourceSnapshot(tx, {
      ...stateInput,
      at: input.cutoff_at
    });
    const cachedText = text.filter(
      (source) =>
        source.selected_project_id === view.project_id &&
        view.origin_project_ids.includes(source.origin_project_id) &&
        Date.parse(source.captured_at) <= Date.parse(input.cutoff_at) &&
        cutoffState.sources.some(
          (state) =>
            state.origin_project_id === source.origin_project_id &&
            state.source_type === source.source_type &&
            state.source_id === source.source_id
        )
    );
    const freshText =
      privacy === "full"
        ? await readRetainedReportText(tx, {
            project_id: view.project_id,
            origin_ids: view.origin_project_ids,
            sources: cutoffState.sources,
            cutoff_at: input.cutoff_at,
            now: retentionNow
          })
        : [];
    const sourceText = [
      ...cachedText,
      ...freshText.filter(
        (source) =>
          !cachedText.some(
            (cached) =>
              cached.origin_project_id === source.origin_project_id &&
              cached.source_type === source.source_type &&
              cached.source_id === source.source_id
          )
      )
    ];
    const currentAvailability = await availability.readPeriod({
      definition_id: input.definition_id,
      origin_ids: view.origin_project_ids,
      period: input.period,
      now: input.cutoff_at
    });
    const previousAvailability = await availability.readPeriod({
      definition_id: input.definition_id,
      origin_ids: view.origin_project_ids,
      period: previous,
      now: input.cutoff_at
    });
    const currentAnalytics = await readReportAnalyticsPeriod(tx, {
      origin_ids: view.origin_project_ids,
      period: input.period,
      now: input.cutoff_at,
      retention_at: retentionNow
    });
    const previousAnalytics = await readReportAnalyticsPeriod(tx, {
      origin_ids: view.origin_project_ids,
      period: previous,
      now: input.cutoff_at,
      retention_at: retentionNow
    });
    views.push({
      project_id: view.project_id,
      name,
      current_lifecycle: currentLifecycle,
      previous_lifecycle: previousLifecycle,
      current_state: currentState,
      previous_state: previousState,
      cutoff_state: cutoffState,
      current_availability: currentAvailability,
      previous_availability: previousAvailability,
      current_analytics: currentAnalytics,
      previous_analytics: previousAnalytics,
      health_recoveries: await createReportHealthStore(tx).readRecoveries({
        origin_ids: view.origin_project_ids,
        period: input.period,
        cutoff_at: input.cutoff_at
      }),
      source_text: sourceText
    });
  }
  return assembleReportFacts({
    organization_id: input.organization_id,
    definition_id: input.definition_id,
    scope,
    period: input.period,
    cutoff_at: input.cutoff_at,
    privacy_mode: privacy,
    views
  });
}
