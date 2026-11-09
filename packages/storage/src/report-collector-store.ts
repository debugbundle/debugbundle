import { isSelfHostMode } from "../../shared-types/src/tier-capabilities.js";
import { REPORT_TRIAL_ENTITLEMENT_SQL } from "./report-trial-entitlement.js";
import { createSavepointQueryable } from "./savepoint-queryable.js";
import { z } from "zod";
import { AcceptedReportScopeSchema } from "../../smart-reports/src/report-definition.js";
import { canAccessReportScope } from "./report-authorization.js";
import { createReportAvailabilityStore } from "./report-availability-store.js";
import { createReportLifecycleStore } from "./report-lifecycle-store.js";
import { createReportSourceTextStore } from "./report-source-text-store.js";
import { runInTransaction } from "./transaction.js";
import type { Queryable } from "./types.js";
const InputSchema = z
  .object({ now: z.string().datetime(), limit: z.number().int().min(1).max(500).default(250) })
  .strict();
const CursorSchema = z.discriminatedUnion("stage", [
  z
    .object({
      stage: z.literal("lifecycle"),
      origin: z.number().int().nonnegative(),
      source: z.enum(["incident", "improvement"]),
      after_id: z.uuid().optional()
    })
    .strict(),
  z
    .object({
      stage: z.literal("availability"),
      after: z
        .object({
          project_id: z.uuid(),
          day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          check_id: z.uuid()
        })
        .strict()
        .optional()
    })
    .strict(),
  z.object({ stage: z.literal("refresh") }).strict()
]);
type Cursor = z.infer<typeof CursorSchema>;
const initial: Cursor = { stage: "lifecycle", origin: 0, source: "incident" };
export interface ReportCollectorStore {
  processNext(raw: {
    now: string;
    limit?: number;
  }): Promise<{ processed: boolean; failed: boolean }>;
}
/** All work is bounded database work. The saved actor, version and fixed origins
 * gate every pass. A savepoint keeps failures atomic with a durable retry delay;
 * neither S3 nor model/provider calls run while these locks are held. */
export function createReportCollectorStore(db: Queryable): ReportCollectorStore {
  return {
    async processNext(raw) {
      const input = InputSchema.parse(raw);
      return runInTransaction(db, async (tx) => {
        await tx.query("SET LOCAL lock_timeout='5s'", []);
        await tx.query("SET LOCAL statement_timeout='30s'", []);
        const candidate = (
          await tx.query<{ id: string; organization_id: string }>(
            `SELECT d.id,d.organization_id
    FROM report_definitions d JOIN organizations o ON o.id=d.organization_id
    LEFT JOIN report_collection_progress p ON p.definition_id=d.id
    WHERE d.enabled AND d.paused_at IS NULL AND NOT d.requires_owner_review AND (o.plan='business' OR $2::boolean) AND o.suspended_at IS NULL AND ${REPORT_TRIAL_ENTITLEMENT_SQL}
      AND (p.definition_id IS NULL OR p.definition_version<>d.version OR p.next_due_at<=$1::timestamptz)
    ORDER BY COALESCE(p.last_processed_at,'-infinity'::timestamptz),d.id
    LIMIT 1 FOR UPDATE OF o SKIP LOCKED`,
            [input.now, isSelfHostMode()]
          )
        ).rows[0];
        if (!candidate) return { processed: false, failed: false };
        const row = (
          await tx.query<Record<string, unknown>>(
            `SELECT d.*,p.definition_version AS collected_version,p.cursor
    FROM report_definitions d LEFT JOIN report_collection_progress p ON p.definition_id=d.id
    WHERE d.id=$1 FOR UPDATE OF d`,
            [candidate.id]
          )
        ).rows[0];
        if (
          !row ||
          row["enabled"] !== true ||
          row["paused_at"] !== null ||
          row["requires_owner_review"] === true
        )
          return { processed: false, failed: false };
        const scope = AcceptedReportScopeSchema.parse(row["accepted_scope"]);
        const authorized = (): Promise<boolean> =>
          canAccessReportScope(tx, {
            organization_id: candidate.organization_id,
            scope,
            initiator: row["initiating_authority"],
            manage: true
          });
        const pause = async (): Promise<void> => {
          await tx.query(
            "UPDATE report_definitions SET pause_reason='creator_access_lost',paused_at=$2,version=version+1,updated_at=$2 WHERE id=$1",
            [candidate.id, input.now]
          );
        };
        if (!(await authorized())) {
          await pause();
          return { processed: true, failed: false };
        }
        const version = z.number().int().positive().parse(row["version"]);
        let cursor: Cursor =
          row["collected_version"] === version ? CursorSchema.parse(row["cursor"]) : initial;
        const save = (failed: boolean): ReturnType<Queryable["query"]> =>
          tx.query(
            `INSERT INTO report_collection_progress(definition_id,definition_version,cursor,next_due_at,last_processed_at,last_error_code)
    VALUES($1,$2,$3::jsonb,$4::timestamptz+($5::int*interval '1 second'),$4,$6)
    ON CONFLICT(definition_id) DO UPDATE SET definition_version=EXCLUDED.definition_version,cursor=EXCLUDED.cursor,
    next_due_at=EXCLUDED.next_due_at,last_processed_at=EXCLUDED.last_processed_at,last_error_code=EXCLUDED.last_error_code`,
            [
              candidate.id,
              version,
              JSON.stringify(cursor),
              input.now,
              failed ? 60 : cursor.stage === "refresh" ? 300 : 0,
              failed ? "collection_failed" : null
            ]
          );
        // Existing stores join this transaction rather than issuing a nested BEGIN or
        // COMMIT. This view is local to the collector's already locked DB-only batch.
        const batch = createSavepointQueryable(tx);
        await tx.query("SAVEPOINT report_collection_batch", []);
        try {
          if (cursor.stage === "lifecycle") {
            const origins = [...new Set(scope.flatMap((view) => view.origin_project_ids))].sort();
            const project = origins[cursor.origin];
            if (!project) throw new Error("report_collection_origin_missing");
            const result = await createReportLifecycleStore(batch).backfill({
              project_id: project,
              source_type: cursor.source,
              now: input.now,
              limit: input.limit,
              ...(cursor.after_id ? { after_id: cursor.after_id } : {})
            });
            if (!result.done) cursor = { ...cursor, after_id: result.next_cursor! };
            else if (cursor.source === "incident")
              cursor = { stage: "lifecycle", origin: cursor.origin, source: "improvement" };
            else if (cursor.origin + 1 < origins.length)
              cursor = { stage: "lifecycle", origin: cursor.origin + 1, source: "incident" };
            else cursor = { stage: "availability" };
          } else if (cursor.stage === "availability") {
            const result = await createReportAvailabilityStore(batch).backfill({
              definition_id: candidate.id,
              now: input.now,
              limit: input.limit,
              ...(cursor.after ? { after: cursor.after } : {})
            });
            cursor = result.done
              ? { stage: "refresh" }
              : { stage: "availability", after: result.next_cursor! };
            // Refresh text immediately on the final numeric batch; the next pass is
            // delayed five minutes, while numeric triggers continue independently.
            if (result.done)
              await createReportSourceTextStore(batch).collect({
                organization_id: candidate.organization_id,
                definition_id: candidate.id,
                expected_version: version,
                now: input.now
              });
          } else
            await createReportSourceTextStore(batch).collect({
              organization_id: candidate.organization_id,
              definition_id: candidate.id,
              expected_version: version,
              now: input.now
            });
          if (!(await authorized())) {
            await tx.query("ROLLBACK TO SAVEPOINT report_collection_batch", []);
            await pause();
            return { processed: true, failed: false };
          }
          await tx.query("RELEASE SAVEPOINT report_collection_batch", []);
          await save(false);
          return { processed: true, failed: false };
        } catch {
          await tx.query("ROLLBACK TO SAVEPOINT report_collection_batch", []);
          await tx.query("RELEASE SAVEPOINT report_collection_batch", []);
          cursor =
            row["collected_version"] === version ? CursorSchema.parse(row["cursor"]) : initial;
          await save(true);
          return { processed: true, failed: true };
        }
      });
    }
  };
}
