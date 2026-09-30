import { z } from "zod";
import { SemanticAnalyticsKeySchema } from "../../shared-types/src/analytics-semantic-primitives.js";
import { SemanticAnalyticsValueSchema } from "../../shared-types/src/analytics-semantic-primitives.js";
import { MAX_FUNNEL_BREAKDOWNS, MAX_FUNNEL_FACTS, type FunnelResult } from "./funnel-evidence.js";

const Timestamp = z.string().datetime({ precision: 3 });
const Count = z.number().int().min(0).max(MAX_FUNNEL_FACTS);
const Revision = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const DecimalCount = z.string().regex(/^(?:0|[1-9][0-9]{0,19})$/);
const Ratio = z.object({ numerator: Count, denominator: Count }).strict().nullable();
const Breakdown = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("missing") }).strict(),
  z.object({ kind: z.literal("ambiguous") }).strict(),
  z
    .object({
      kind: z.literal("value"),
      value: z.union([SemanticAnalyticsValueSchema, z.boolean(), z.null()])
    })
    .strict()
]);

/** Closed public query; storage still authorizes and checks the current immutable definition. */
export const ProjectSemanticFunnelQuerySchema = z
  .object({
    report_key: SemanticAnalyticsKeySchema,
    from: Timestamp,
    to: Timestamp
  })
  .strict()
  .refine((value) => {
    const duration = Date.parse(value.to) - Date.parse(value.from);
    return duration > 0 && duration <= 90 * 86_400_000;
  });

/** Server-clock window used by dashboard, CLI and MCP without trusting a client wall clock. */
export const ProjectSemanticFunnelRecentQuerySchema = z
  .object({
    report_key: SemanticAnalyticsKeySchema,
    last: z.enum(["7d", "30d", "90d"])
  })
  .strict();

/** Validate service output before it crosses API, CLI or MCP boundaries. */
export const FunnelResultSchema: z.ZodType<FunnelResult> = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("unavailable"),
      reason: z.enum([
        "invalid_input",
        "insufficient_history",
        "capacity_exceeded",
        "conflicting_evidence",
        "stale_evidence"
      ])
    })
    .strict(),
  z
    .object({
      status: z.literal("available"),
      calculation_version: z.literal("ordered-funnel-1"),
      quality: z.enum(["exact", "provisional", "partial"]),
      quality_reasons: z
        .array(
          z.enum([
            "incomplete_evidence",
            "sampled",
            "ambiguous_order",
            "ambiguous_entry_breakdown",
            "open_entries",
            "correction_window"
          ])
        )
        .max(6),
      scope: z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("project"), project_id: z.string().uuid() }).strict(),
        z.object({ kind: z.literal("space"), space_id: z.string().uuid() }).strict()
      ]),
      subject: z.enum(["session", "anonymous", "user", "account"]),
      scope_revision: Revision,
      definition_key: SemanticAnalyticsKeySchema,
      definition_revision: Revision,
      from: Timestamp,
      to: Timestamp,
      observation_cutoff: Timestamp,
      watermark: Timestamp,
      available_from: Timestamp,
      sample_rate: z.number().finite().gt(0).max(1),
      population: z
        .object({
          entered: Count,
          completed: Count,
          open: Count,
          expired: Count,
          unknown: Count,
          mature: Count
        })
        .strict(),
      steps: z
        .array(
          z
            .object({
              key: SemanticAnalyticsKeySchema,
              reached: Count,
              overall: Ratio,
              previous: Ratio
            })
            .strict()
        )
        .min(2)
        .max(10),
      breakdowns: z
        .array(
          z
            .object({
              breakdown: Breakdown,
              entered: Count,
              completed: Count
            })
            .strict()
        )
        .max(MAX_FUNNEL_BREAKDOWNS),
      time_to_convert: z
        .object({
          basis: z.literal("first_confirmed_path"),
          count: Count,
          sum_ms: z.string().regex(/^(?:0|[1-9][0-9]{0,24})$/),
          min_ms: z.number().int().min(0),
          max_ms: z.number().int().min(0),
          p50_ms: z.number().int().min(0),
          p95_ms: z.number().int().min(0)
        })
        .strict()
        .nullable()
    })
    .strict()
]);

export const FunnelEvidenceSchema = z
  .object({
    pending_events: DecimalCount,
    failed_events: DecimalCount,
    lost_events: DecimalCount,
    excluded_events: DecimalCount,
    erasure_tasks: DecimalCount,
    source_coverage: z.enum(["unverified", "partial", "verified"])
  })
  .strict();

function reportQualityMatchesEvidence(value: {
  report: FunnelResult;
  evidence: z.infer<typeof FunnelEvidenceSchema>;
}): boolean {
  if (BigInt(value.evidence.failed_events) > BigInt(value.evidence.pending_events)) return false;
  if (value.report.status !== "available") return true;
  if (
    value.evidence.source_coverage === "verified" &&
    value.evidence.pending_events === "0" &&
    value.evidence.failed_events === "0" &&
    value.evidence.lost_events === "0" &&
    value.evidence.excluded_events === "0" &&
    value.evidence.erasure_tasks === "0"
  )
    return true;
  return (
    value.report.quality === "partial" &&
    value.report.quality_reasons.includes("incomplete_evidence")
  );
}

export const ProjectSemanticFunnelReportResponseSchema = z
  .object({
    kind: z.literal("report"),
    report: FunnelResultSchema,
    evidence: FunnelEvidenceSchema
  })
  .strict()
  .refine(reportQualityMatchesEvidence);
export type ProjectSemanticFunnelReportResponse = z.infer<
  typeof ProjectSemanticFunnelReportResponseSchema
>;

/** Portfolio comparisons expose each authorized source separately and no cross-source total. */
export const PortfolioSemanticFunnelReportResponseSchema = z
  .object({
    kind: z.literal("report"),
    space_id: z.string().uuid(),
    report_key: SemanticAnalyticsKeySchema,
    from: Timestamp,
    to: Timestamp,
    sources: z
      .array(
        z.discriminatedUnion("kind", [
          z
            .object({
              kind: z.literal("catalog_gap"),
              project_id: z.string().uuid(),
              missing_steps: z.array(SemanticAnalyticsKeySchema).min(1).max(10)
            })
            .strict(),
          z
            .object({
              kind: z.literal("report"),
              project_id: z.string().uuid(),
              report: FunnelResultSchema,
              evidence: FunnelEvidenceSchema
            })
            .strict()
        ])
      )
      .min(1)
      .max(20)
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.sources.map((source) => source.project_id)).size === value.sources.length &&
      value.sources.every((source) =>
        source.kind === "catalog_gap" ? true : reportQualityMatchesEvidence(source)
      )
  );
export type PortfolioSemanticFunnelReportResponse = z.infer<
  typeof PortfolioSemanticFunnelReportResponseSchema
>;
