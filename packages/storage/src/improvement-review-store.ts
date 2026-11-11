import { AcceptedReportScopeSchema } from "../../smart-reports/src/report-definition.js";
import {
  ReviewPlanDocumentSchema,
  type ReviewPlanDocument,
  type ReviewContext
} from "../../smart-improvements/src/review-planning-contract.js";
import { planReview } from "../../smart-improvements/src/review-planning.js";
import { reviewContext, validateRowReviewGuidance } from "./improvement-review-planning.js";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  ReviewArtifactSchema,
  type ReviewArtifact,
  ReviewFactsSchema,
  ReviewRecordSchema,
  type ReviewRecord
} from "../../smart-improvements/src/review.js";
import { lastCompletedReportPeriod } from "../../smart-reports/src/report-period.js";
import { redactReportData } from "../../smart-reports/src/report-redaction.js";
import { SmartReportError } from "../../smart-reports/src/report-errors.js";
import {
  ReviewActorSchema,
  requireReviewRead,
  reviewDate,
  type ReviewActor,
  type ReviewRow
} from "./improvement-review-access.js";
import { readReportIdentities } from "./report-identity-store.js";
import { ReviewListQuerySchema } from "../../smart-improvements/src/review-contract.js";
export { ReviewListQuerySchema } from "../../smart-improvements/src/review-contract.js";
import type { Queryable } from "./types.js";
const identity = ReviewActorSchema.extend({ id: z.uuid() });
const cursorSchema = z.object({ at: z.string().datetime(), id: z.uuid() }).strict();
export function improvementReviewRecord(row: ReviewRow): ReviewRecord {
  const period = lastCompletedReportPeriod(
    "weekly",
    reviewDate(row["period_ends_at"]).toISOString()
  );
  if (period.starts_at !== reviewDate(row["period_starts_at"]).toISOString())
    throw new Error("review_period_invalid");
  return ReviewRecordSchema.parse({
    id: row["id"],
    project_id: row["project_id"],
    project_name: String(redactReportData(row["project_name"])).slice(0, 160) || "Project",
    period,
    status: row["status"],
    reason: row["reason"],
    created_at: reviewDate(row["created_at"]).toISOString(),
    expires_at: reviewDate(row["expires_at"]).toISOString()
  });
}
export interface ImprovementReviewStore {
  list(
    raw: ReviewActor & z.input<typeof ReviewListQuerySchema>
  ): Promise<{ items: ReviewRecord[]; next_cursor: string | null }>;
  get(raw: ReviewActor & { id: string }): Promise<ReviewRecord>;
  bundle(
    raw: ReviewActor & { id: string }
  ): Promise<{ bundle: ReviewArtifact | null; status: ReviewRecord["status"] }>;
  plan(
    raw: ReviewActor & { id: string }
  ): Promise<{ bundle: ReviewPlanDocument | null; status: ReviewRecord["status"] }>;
}
export function createImprovementReviewStore(db: Queryable): ImprovementReviewStore {
  async function load(
    raw: ReviewActor & { id: string }
  ): Promise<{ input: z.infer<typeof identity>; row: ReviewRow }> {
    const input = identity.parse(raw),
      row = (
        await db.query<ReviewRow>(
          "SELECT r.*,p.name AS project_name FROM improvement_reviews r JOIN projects p ON p.id=r.project_id WHERE r.organization_id=$1 AND r.id=$2 AND NOT r.privacy_invalidated AND r.expires_at>clock_timestamp()",
          [input.organization_id, input.id]
        )
      ).rows[0];
    if (!row) throw new SmartReportError("report_not_found");
    await requireReviewRead(db, row, input.initiator);
    return { input, row };
  }
  async function loadBundle(raw: ReviewActor & { id: string }): Promise<{
    bundle: ReviewArtifact | null;
    context: ReviewContext | null;
    status: ReviewRecord["status"];
  }> {
    const { input, row } = await load({
      organization_id: raw.organization_id,
      initiator: raw.initiator,
      id: raw.id
    });
    if (row["artifact"] === null)
      return { bundle: null, context: null, status: improvementReviewRecord(row).status };
    const bundle = ReviewArtifactSchema.parse(row["artifact"]);
    const origins = new Set(
      AcceptedReportScopeSchema.parse(row["accepted_scope"]).flatMap(
        (view) => view.origin_project_ids
      )
    );
    if (
      createHash("sha256").update(JSON.stringify(bundle)).digest("hex") !==
        row["artifact_sha256"] ||
      bundle.facts.project_id !== row["project_id"] ||
      bundle.facts.privacy_mode !== row["privacy_mode"] ||
      bundle.facts.cutoff_at !== reviewDate(row["cutoff_at"]).toISOString() ||
      JSON.stringify(bundle.facts) !== JSON.stringify(ReviewFactsSchema.parse(row["facts"])) ||
      bundle.facts.sources.some((source) => !origins.has(source.origin_project_id)) ||
      JSON.stringify(bundle.facts.period) !== JSON.stringify(improvementReviewRecord(row).period)
    )
      throw new Error("review_artifact_integrity_failed");
    const context = reviewContext(row);
    if (
      context &&
      [
        ...context.configuration.origins,
        ...context.configuration.rules,
        ...context.configuration.alerts
      ].some((item) => !origins.has(item.origin_project_id))
    )
      throw new Error("review_artifact_integrity_failed");
    if (JSON.stringify(redactReportData(bundle.facts)) !== JSON.stringify(bundle.facts))
      throw new SmartReportError("report_not_found");
    if (bundle.guidance) {
      try {
        const identities = [
          ...new Set([
            ...z.array(z.string()).parse(row["identities"]),
            ...(await readReportIdentities(db, row["accepted_scope"]))
          ])
        ];
        bundle.guidance = validateRowReviewGuidance(row, bundle.guidance, identities);
      } catch {
        bundle.guidance = null;
        bundle.analysis = "unavailable";
      }
    }
    await load(input);
    return {
      bundle,
      context,
      status: improvementReviewRecord(row).status
    };
  }
  return {
    async list(
      raw: ReviewActor & z.input<typeof ReviewListQuerySchema>
    ): Promise<{ items: ReviewRecord[]; next_cursor: string | null }> {
      const actor = ReviewActorSchema.parse({
        organization_id: raw.organization_id,
        initiator: raw.initiator
      });
      const query = ReviewListQuerySchema.parse({
        ...(raw.project_id === undefined ? {} : { project_id: raw.project_id }),
        limit: raw.limit ?? 20,
        ...(raw.cursor === undefined ? {} : { cursor: raw.cursor })
      });
      const cursor = query.cursor
        ? cursorSchema.parse(JSON.parse(Buffer.from(query.cursor, "base64url").toString()))
        : null;
      const rows = (
        await db.query<ReviewRow>(
          `SELECT r.*,p.name AS project_name,to_char(r.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at FROM improvement_reviews r JOIN projects p ON p.id=r.project_id WHERE r.organization_id=$1 AND ($2::uuid IS NULL OR r.project_id=$2)
        AND NOT r.privacy_invalidated AND r.expires_at>clock_timestamp() AND ($3::timestamptz IS NULL OR (r.created_at,r.id)<($3::timestamptz,$4::uuid))
        ORDER BY r.created_at DESC,r.id DESC LIMIT $5`,
          [
            actor.organization_id,
            query.project_id ?? null,
            cursor?.at ?? null,
            cursor?.id ?? null,
            query.limit
          ]
        )
      ).rows;
      const items: ReviewRecord[] = [];
      for (const row of rows) {
        try {
          await requireReviewRead(db, row, actor.initiator);
          items.push(improvementReviewRecord(row));
        } catch (error) {
          if (!(error instanceof SmartReportError)) throw error;
        }
      }
      const last = rows.at(-1);
      return {
        items,
        next_cursor:
          rows.length === query.limit && last
            ? Buffer.from(
                JSON.stringify({
                  at: z.string().datetime().parse(last["cursor_at"]),
                  id: last["id"]
                })
              ).toString("base64url")
            : null
      };
    },
    async get(raw: ReviewActor & { id: string }): Promise<ReviewRecord> {
      return improvementReviewRecord((await load(raw)).row);
    },
    async bundle(raw: ReviewActor & { id: string }) {
      const { bundle, status } = await loadBundle(raw);
      return { bundle, status };
    },
    async plan(raw: ReviewActor & { id: string }) {
      const { bundle, context, status } = await loadBundle(raw);
      return {
        bundle: bundle
          ? ReviewPlanDocumentSchema.parse({
              ...bundle,
              context,
              plans: context ? planReview(bundle.facts, context) : []
            })
          : null,
        status
      };
    }
  };
}
