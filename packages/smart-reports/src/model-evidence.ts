import { z } from "zod";
import { redactReportData } from "./report-redaction.js";
import { compareReportMetric, ReportPeriodSchema } from "./report-period.js";

export const ReportReferenceSchema = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/);
const note = z.string().max(300);
const coverage = z.enum(["complete", "partial", "unavailable"]);
const comparisonSchema = z
  .object({
    comparison_available: z.boolean(),
    absolute_change: z.number().nullable(),
    percent_change: z.number().nullable(),
    current_per_day: z.number().nonnegative().nullable(),
    previous_per_day: z.number().nonnegative().nullable(),
    unequal_period_lengths: z.boolean(),
    rate_direction: z.enum(["increased", "decreased", "unchanged", "unavailable"]),
    metric_semantics: z.enum(["period_total", "snapshot"]).optional(),
    value_direction: z.enum(["increased", "decreased", "unchanged", "unavailable"]).optional()
  })
  .strict();
const metricKey = z.enum([
  "new_incidents",
  "resolution_events",
  "distinct_resolved_incidents",
  "regressions",
  "new_improvements",
  "resolved_improvements",
  "open_high_incidents",
  "open_critical_incidents",
  "successful_checks",
  "total_checks",
  "estimated_check_downtime_seconds",
  "analytics_sessions",
  "analytics_events",
  "analytics_page_views",
  "daily_active_visitor_days"
]);
export const ReportModelProjectSchema = z
  .object({
    ref: ReportReferenceSchema,
    name: z.string().min(1).max(160),
    coverage_ref: ReportReferenceSchema,
    coverage: z
      .object({ lifecycle: coverage, availability: coverage, analytics: coverage })
      .strict(),
    notes: z.array(note).max(8)
  })
  .strict();
export const ReportModelMetricSchema = z
  .object({
    ref: ReportReferenceSchema,
    project_ref: ReportReferenceSchema,
    key: metricKey,
    current: z.number().int().safe().min(0).max(1_000_000_000_000).nullable(),
    previous: z.number().int().safe().min(0).max(1_000_000_000_000).nullable(),
    unit: z.enum(["count", "seconds", "visitor_days"]),
    current_complete: z.boolean(),
    previous_complete: z.boolean(),
    notes: z.array(note).max(4),
    comparison: comparisonSchema.optional()
  })
  .strict()
  .superRefine((value, ctx) => {
    const expected =
      value.key === "estimated_check_downtime_seconds"
        ? "seconds"
        : value.key === "daily_active_visitor_days"
          ? "visitor_days"
          : "count";
    if (
      value.unit !== expected ||
      (value.current_complete && value.current === null) ||
      (value.previous_complete && value.previous === null)
    )
      ctx.addIssue({ code: "custom", message: "report_metric_semantics_invalid" });
  });
export const ReportModelEvidenceSchema = z
  .object({
    ref: ReportReferenceSchema,
    project_ref: ReportReferenceSchema,
    type: z.enum(["incident", "improvement", "health"]),
    status: z.enum(["open", "resolved", "regressed", "snoozed", "dismissed", "observed_recovery"]),
    severity: z.enum(["critical", "high", "medium", "low", "unknown"]),
    period_events: z
      .array(z.enum(["new", "resolved", "regressed", "reopened", "observed_recovery"]))
      .max(5)
      .refine((events) => new Set(events).size === events.length, {
        message: "duplicate_report_period_event"
      }),
    first_seen_at: z.string().datetime().nullable(),
    last_seen_at: z.string().datetime().nullable(),
    title: z.string().min(1).max(160),
    context: z.string().max(1600).nullable()
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      (value.type === "health") !== (value.status === "observed_recovery") ||
      (value.type === "incident" && ["snoozed", "dismissed"].includes(value.status)) ||
      (value.first_seen_at !== null &&
        value.last_seen_at !== null &&
        Date.parse(value.first_seen_at) > Date.parse(value.last_seen_at))
    )
      ctx.addIssue({ code: "custom", message: "report_evidence_semantics_invalid" });
  });
export const ReportModelFactsSchema = z
  .object({
    version: z.literal(1),
    period: ReportPeriodSchema,
    previous_period: ReportPeriodSchema,
    cutoff_at: z.string().datetime(),
    privacy_mode: z.enum(["full", "restricted"]),
    projects: z.array(ReportModelProjectSchema).min(1).max(10),
    metrics: z.array(ReportModelMetricSchema).max(200),
    evidence: z.array(ReportModelEvidenceSchema).max(100),
    selection_notes: z.array(note).max(20)
  })
  .strict()
  .superRefine((value, ctx) => {
    const projects = new Set(value.projects.map((project) => project.ref));
    const refs = [
      ...value.projects.map((project) => project.coverage_ref),
      ...value.metrics.map((item) => item.ref),
      ...value.evidence.map((item) => item.ref)
    ];
    if (
      projects.size !== value.projects.length ||
      new Set(refs).size !== refs.length ||
      value.previous_period.kind !== value.period.kind ||
      value.previous_period.ends_at !== value.period.starts_at ||
      Date.parse(value.cutoff_at) < Date.parse(value.period.ends_at)
    )
      ctx.addIssue({ code: "custom", message: "report_facts_scope_invalid" });
    for (const item of [...value.metrics, ...value.evidence])
      if (!projects.has(item.project_ref))
        ctx.addIssue({ code: "custom", message: "report_unknown_project_reference" });
    for (const item of value.evidence)
      if (
        (item.last_seen_at !== null &&
          Date.parse(item.last_seen_at) > Date.parse(value.cutoff_at)) ||
        (item.first_seen_at !== null &&
          Date.parse(item.first_seen_at) > Date.parse(value.cutoff_at))
      )
        ctx.addIssue({ code: "custom", message: "report_evidence_after_cutoff" });
    for (const project of value.projects)
      if (value.evidence.filter((item) => item.project_ref === project.ref).length > 10)
        ctx.addIssue({ code: "custom", message: "report_project_selection_limit_exceeded" });
  });
export type ReportModelFacts = z.infer<typeof ReportModelFactsSchema>;
export type ReportModelEvidence = z.infer<typeof ReportModelEvidenceSchema>;
export type ReportModelMetric = z.infer<typeof ReportModelMetricSchema>;

/** A report is a bounded collection, not a single telemetry event. Apply the
 * same mandatory policy to each validated row so full multilingual evidence
 * does not exhaust the event sanitizer's byte/node budget. Canonical document
 * and provider request limits remain independent and unchanged. */
export function redactReportModelFacts(raw: unknown): ReportModelFacts {
  const facts = ReportModelFactsSchema.parse(raw);
  const { projects, metrics, evidence, ...metadata } = facts;
  return ReportModelFactsSchema.parse({
    ...(redactReportData(metadata) as typeof metadata),
    projects: projects.map((item) => redactReportData(item)),
    metrics: metrics.map((item) => redactReportData(item)),
    evidence: evidence.map((item) => redactReportData(item))
  });
}

/** This is an egress projection, never authority or raw captured input. It has
 * opaque references only; authenticated source links stay with the server. */
export function prepareReportModelInput(raw: unknown): ReportModelFacts {
  const input = ReportModelFactsSchema.parse(raw);
  input.metrics = input.metrics.map((metric): ReportModelMetric => {
    const comparison = compareReportMetric({
      current: metric.current ?? 0,
      previous: metric.previous ?? 0,
      current_period: input.period,
      previous_period: input.previous_period,
      current_complete: metric.current_complete && metric.current !== null,
      previous_complete: metric.previous_complete && metric.previous !== null
    });
    const current = (metric.current ?? 0) * input.previous_period.duration_days;
    const previous = (metric.previous ?? 0) * input.period.duration_days;
    if (metric.key === "open_high_incidents" || metric.key === "open_critical_incidents") {
      return {
        ...metric,
        comparison: {
          ...comparison,
          metric_semantics: "snapshot",
          current_per_day: null,
          previous_per_day: null,
          rate_direction: "unavailable",
          value_direction: !comparison.comparison_available
            ? "unavailable"
            : metric.current === metric.previous
              ? "unchanged"
              : metric.current! > metric.previous!
                ? "increased"
                : "decreased"
        }
      };
    }
    return {
      ...metric,
      comparison: {
        ...comparison,
        rate_direction: !comparison.comparison_available
          ? "unavailable"
          : current === previous
            ? "unchanged"
            : current > previous
              ? "increased"
              : "decreased"
      }
    };
  });
  if (input.privacy_mode === "restricted") {
    input.projects = input.projects.map((project, index) => ({
      ...project,
      name: `Project ${String.fromCharCode(65 + index)}`
    }));
    input.evidence = input.evidence.map((item) => ({
      ...item,
      title: `${item.severity} ${item.status} ${item.type}`,
      context: null
    }));
  }
  return redactReportModelFacts(input);
}
