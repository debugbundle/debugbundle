import { z } from "zod";
import { AcceptedReportScopeSchema } from "./report-definition.js";
import { OriginLifecycleSummarySchema } from "./lifecycle-facts.js";
import {
  prepareReportModelInput,
  ReportModelFactsSchema,
  ReportReferenceSchema,
  type ReportModelFacts,
  type ReportModelMetric,
  type ReportModelEvidence
} from "./model-evidence.js";
import { ReportPeriodSchema, previousReportPeriod } from "./report-period.js";
import {
  ReportSourceSnapshotSchema,
  ReportSourceStateSchema,
  type ReportSourceState
} from "./source-state.js";
import { ReportSourceTextSchema } from "./source-text.js";
const count = z.number().int().safe().nonnegative();
const availability = z
  .object({
    total_checks: count,
    successful_checks: count,
    estimated_check_downtime_seconds: count,
    complete: z.boolean(),
    collected_from: z.string().datetime().nullable()
  })
  .strict();
const analytics = z
  .object({
    coverage: z.enum(["complete", "partial", "unavailable"]),
    sessions: count.nullable(),
    page_views: count.nullable(),
    daily_active_visitor_days: count.nullable(),
    notes: z.array(z.string().max(300)).max(4)
  })
  .strict();
const viewSchema = z
  .object({
    project_id: z.uuid(),
    name: z.string().min(1).max(160),
    current_lifecycle: z.array(OriginLifecycleSummarySchema),
    previous_lifecycle: z.array(OriginLifecycleSummarySchema),
    current_state: ReportSourceSnapshotSchema,
    previous_state: ReportSourceSnapshotSchema,
    cutoff_state: ReportSourceSnapshotSchema,
    current_availability: availability,
    previous_availability: availability,
    current_analytics: analytics,
    previous_analytics: analytics,
    source_text: z.array(ReportSourceTextSchema).max(50),
    health_recoveries: z
      .array(ReportSourceStateSchema.refine((source) => source.source_type === "health"))
      .max(10)
      .default([])
  })
  .strict();
const InputSchema = z
  .object({
    organization_id: z.uuid(),
    definition_id: z.uuid(),
    scope: AcceptedReportScopeSchema,
    period: ReportPeriodSchema,
    cutoff_at: z.string().datetime(),
    privacy_mode: z.enum(["full", "restricted"]),
    views: z.array(viewSchema).min(1).max(10)
  })
  .strict();
const SourceSchema = z
  .object({
    ref: ReportReferenceSchema,
    project_id: z.uuid(),
    origin_project_id: z.uuid(),
    source_type: z.enum(["incident", "improvement", "health"]),
    source_id: z.uuid(),
    retained: z.boolean(),
    text_available: z.boolean(),
    text_expires_at: z.string().datetime().nullable()
  })
  .strict();
export const CanonicalReportFactsSchema = z
  .object({
    version: z.literal(1),
    organization_id: z.uuid(),
    definition_id: z.uuid(),
    scope: AcceptedReportScopeSchema,
    facts: ReportModelFactsSchema,
    sources: z.array(SourceSchema).max(100),
    expires_at: z.string().datetime()
  })
  .strict()
  .superRefine((value, ctx) => {
    const views = [...value.scope].sort((a, b) => a.project_id.localeCompare(b.project_id));
    const valid =
      Date.parse(value.expires_at) > Date.parse(value.facts.cutoff_at) &&
      Date.parse(value.expires_at) <= Date.parse(value.facts.cutoff_at) + 90 * 86400000 &&
      value.facts.projects.length === views.length &&
      value.sources.length === value.facts.evidence.length &&
      new Set(value.sources.map((source) => source.ref)).size === value.sources.length &&
      value.sources.every((source) => {
        const view = views.find((view) => view.project_id === source.project_id),
          evidence = value.facts.evidence.find((item) => item.ref === source.ref);
        return (
          view !== undefined &&
          view.origin_project_ids.includes(source.origin_project_id) &&
          evidence?.project_ref === `p${views.indexOf(view) + 1}` &&
          evidence.type === source.source_type &&
          (source.source_type !== "health" || !source.text_available) &&
          (source.text_available
            ? source.text_expires_at !== null &&
              Date.parse(source.text_expires_at) > Date.parse(value.facts.cutoff_at)
            : source.text_expires_at === null && evidence.context === null)
        );
      });
    if (!valid) ctx.addIssue({ code: "custom", message: "report_fact_scope_invalid" });
  });
export type ReportFactSource = z.infer<typeof SourceSchema>;
export type CanonicalReportFacts = z.infer<typeof CanonicalReportFactsSchema>;
const severity = { critical: 0, high: 1, medium: 2, low: 3, unknown: 4 };
function sourceKey(
  source: Pick<ReportSourceState, "origin_project_id" | "source_type" | "source_id">
): string {
  return `${source.origin_project_id}:${source.source_type}:${source.source_id}`;
}
function selectedSources(raw: ReportSourceState[]): ReportSourceState[] {
  const ordered = [...raw].sort(
    (a, b) =>
      severity[a.severity] - severity[b.severity] ||
      b.source_version_at.localeCompare(a.source_version_at) ||
      sourceKey(a).localeCompare(sourceKey(b))
  );
  const selected: ReportSourceState[] = [],
    keys = new Set<string>();
  // Preserve the oldest urgent work in each severity before recent activity
  // fills the bounded selection. Missing first-seen uses its last known state.
  for (const level of ["critical", "high"] as const) {
    const oldest = ordered
      .filter(
        (source) => ["open", "regressed"].includes(source.status) && source.severity === level
      )
      .sort(
        (a, b) =>
          (a.first_seen_at ?? a.source_version_at).localeCompare(
            b.first_seen_at ?? b.source_version_at
          ) || sourceKey(a).localeCompare(sourceKey(b))
      )[0];
    if (oldest) {
      selected.push(oldest);
      keys.add(sourceKey(oldest));
    }
  }
  const take = (predicate: (source: ReportSourceState) => boolean, limit: number): void => {
    let added = 0;
    for (const source of ordered) {
      if (added >= limit || selected.length >= 10) break;
      if (predicate(source) && !keys.has(sourceKey(source))) {
        keys.add(sourceKey(source));
        selected.push(source);
        added++;
      }
    }
  };
  take(
    (source) =>
      ["open", "regressed"].includes(source.status) &&
      ["critical", "high"].includes(source.severity),
    6 - selected.length
  );
  take((source) => source.source_type === "health", 1);
  take((source) => source.status === "resolved" && source.period_events.includes("resolved"), 2);
  take((source) => source.source_type === "improvement" && source.period_events.length > 0, 1);
  take((source) => source.period_events.length > 0, 1);
  take(() => true, 10);
  return selected;
}
function aggregateCoverage(
  current: string,
  previous: string
): "complete" | "partial" | "unavailable" {
  return current === "complete" && previous === "complete"
    ? "complete"
    : current === "unavailable" && previous === "unavailable"
      ? "unavailable"
      : "partial";
}
/** One deterministic canonical fact set feeds all renderers. Numeric facts never
 * come from the model, and cached text never supplies lifecycle state. Input
 * scopes must already have been authorised as a whole by the storage service. */
export function assembleReportFacts(raw: unknown): CanonicalReportFacts {
  const input = InputSchema.parse(raw),
    previous = previousReportPeriod(input.period),
    cutoff = Date.parse(input.cutoff_at);
  if (cutoff < Date.parse(input.period.ends_at) || input.scope.length !== input.views.length)
    throw new Error("report_fact_scope_invalid");
  const metrics: ReportModelMetric[] = [],
    evidence: ReportModelEvidence[] = [],
    projects: ReportModelFacts["projects"] = [],
    sources: ReportFactSource[] = [],
    selectionNotes: string[] = [];
  const expires = cutoff + 90 * 86_400_000;
  for (const [index, scope] of [...input.scope]
    .sort((a, b) => a.project_id.localeCompare(b.project_id))
    .entries()) {
    const view = input.views.find((item) => item.project_id === scope.project_id);
    if (!view || input.views.filter((item) => item.project_id === scope.project_id).length !== 1)
      throw new Error("report_fact_scope_invalid");
    const origins = new Set(scope.origin_project_ids);
    for (const summaries of [view.current_lifecycle, view.previous_lifecycle]) {
      if (
        summaries.length !== origins.size ||
        new Set(summaries.map((item) => item.project_id)).size !== origins.size ||
        summaries.some((item) => !origins.has(item.project_id))
      )
        throw new Error("report_fact_scope_invalid");
    }
    for (const state of [view.current_state, view.previous_state, view.cutoff_state]) {
      if (
        state.sources.some((item) => !origins.has(item.origin_project_id)) ||
        new Set(state.sources.map(sourceKey)).size !== state.sources.length
      )
        throw new Error("report_fact_scope_invalid");
    }
    if (
      view.source_text.some(
        (item) =>
          item.selected_project_id !== scope.project_id || !origins.has(item.origin_project_id)
      )
    )
      throw new Error("report_fact_scope_invalid");
    const projectRef = `p${index + 1}`,
      lifecycleCurrent = view.current_lifecycle.every((item) => item.coverage.complete),
      lifecyclePrevious = view.previous_lifecycle.every((item) => item.coverage.complete);
    const healthCurrent =
        view.current_availability.complete && view.current_availability.total_checks > 0,
      healthPrevious =
        view.previous_availability.complete && view.previous_availability.total_checks > 0;
    const healthCoverage = aggregateCoverage(
      view.current_availability.total_checks === 0
        ? "unavailable"
        : healthCurrent
          ? "complete"
          : "partial",
      view.previous_availability.total_checks === 0
        ? "unavailable"
        : healthPrevious
          ? "complete"
          : "partial"
    );
    const notes = [
      "Open counts are snapshots at period close; source states and priorities are known at the report cutoff.",
      "Availability totals cover monitored checks; estimated check downtime is not account outage duration.",
      ...view.current_analytics.notes
    ];
    if (!view.cutoff_state.complete)
      notes.push(
        "Outstanding states are last known; migration or twelve-month history limits may omit older pruned predecessors."
      );
    projects.push({
      ref: projectRef,
      name: view.name,
      coverage_ref: `c${index + 1}`,
      coverage: {
        lifecycle: lifecycleCurrent && lifecyclePrevious ? "complete" : "partial",
        availability: healthCoverage,
        analytics: aggregateCoverage(
          view.current_analytics.coverage,
          view.previous_analytics.coverage
        )
      },
      notes
    });
    const metric = (
      key: ReportModelMetric["key"],
      current: number | null,
      prior: number | null,
      currentComplete: boolean,
      previousComplete: boolean,
      metricNotes: string[] = []
    ): void => {
      metrics.push({
        ref: `m${metrics.length + 1}`,
        project_ref: projectRef,
        key,
        current,
        previous: prior,
        current_complete: currentComplete,
        previous_complete: previousComplete,
        unit:
          key === "estimated_check_downtime_seconds"
            ? "seconds"
            : key === "daily_active_visitor_days"
              ? "visitor_days"
              : "count",
        notes: metricNotes
      });
    };
    const total = (
      which: "current_lifecycle" | "previous_lifecycle",
      group: "incidents" | "improvements",
      key: "opened" | "resolution_events" | "distinct_resolved" | "regressed"
    ): number =>
      view[which].reduce((sum, item) => {
        if (group === "incidents") return sum + item.incidents[key];
        return key === "regressed" ? sum : sum + item.improvements[key];
      }, 0);
    for (const [key, group, field] of [
      ["new_incidents", "incidents", "opened"],
      ["resolution_events", "incidents", "resolution_events"],
      ["distinct_resolved_incidents", "incidents", "distinct_resolved"],
      ["regressions", "incidents", "regressed"],
      ["new_improvements", "improvements", "opened"],
      ["resolved_improvements", "improvements", "distinct_resolved"]
    ] as const)
      metric(
        key,
        total("current_lifecycle", group, field),
        total("previous_lifecycle", group, field),
        lifecycleCurrent,
        lifecyclePrevious
      );
    for (const key of ["open_high_incidents", "open_critical_incidents"] as const)
      metric(
        key,
        view.current_state[key],
        view.previous_state[key],
        view.current_state.complete,
        view.previous_state.complete,
        [
          "Point-in-time known incident states at each period close; unavailable history is not a resolved issue."
        ]
      );
    for (const key of [
      "total_checks",
      "successful_checks",
      "estimated_check_downtime_seconds"
    ] as const)
      metric(
        key,
        view.current_availability[key],
        view.previous_availability[key],
        healthCurrent,
        healthPrevious
      );
    for (const [key, field] of [
      ["analytics_sessions", "sessions"],
      ["analytics_page_views", "page_views"],
      ["daily_active_visitor_days", "daily_active_visitor_days"]
    ] as const)
      metric(
        key,
        view.current_analytics[field],
        view.previous_analytics[field],
        view.current_analytics.coverage === "complete",
        view.previous_analytics.coverage === "complete",
        view.current_analytics.notes
      );
    const selected = selectedSources([...view.cutoff_state.sources, ...view.health_recoveries]);
    let missingText = false;
    if (selected.length < view.cutoff_state.known_sources)
      selectionNotes.push(
        `${projectRef}: source detail is a bounded urgent/resolved/improvement/recent selection; numeric totals retain their stated coverage.`
      );
    for (const source of selected) {
      const cached =
        input.privacy_mode === "full"
          ? view.source_text.find(
              (item) =>
                sourceKey(item) === sourceKey(source) &&
                Date.parse(item.text_expires_at) > cutoff &&
                [
                  item.captured_at,
                  item.source_version_at,
                  item.source_content_at,
                  item.first_seen_at,
                  item.last_seen_at
                ].every((at) => Date.parse(at) <= cutoff)
            )
          : undefined;
      const ref = `e${evidence.length + 1}`;
      missingText ||= cached === undefined;
      evidence.push({
        ref,
        project_ref: projectRef,
        type: source.source_type,
        status: source.status,
        severity: source.severity,
        period_events: source.period_events,
        first_seen_at: source.first_seen_at,
        last_seen_at: source.last_seen_at,
        title:
          cached?.title ??
          (source.source_type === "health"
            ? "Health check observed recovery"
            : `${source.severity} ${source.status} ${source.source_type}`),
        context: cached?.context ?? null
      });
      sources.push({
        ref,
        project_id: scope.project_id,
        origin_project_id: source.origin_project_id,
        source_type: source.source_type,
        source_id: source.source_id,
        retained: source.retained,
        text_available: cached !== undefined,
        text_expires_at: cached?.text_expires_at ?? null
      });
    }
    if (missingText)
      notes.push(
        input.privacy_mode === "restricted"
          ? "Source text is omitted in restricted mode."
          : "Some source text is unavailable or expired; generic labels preserve known numeric states without inventing missing context."
      );
  }
  const facts = prepareReportModelInput({
    version: 1,
    period: input.period,
    previous_period: previous,
    cutoff_at: input.cutoff_at,
    privacy_mode: input.privacy_mode,
    projects,
    metrics,
    evidence,
    selection_notes: selectionNotes
  });
  return CanonicalReportFactsSchema.parse({
    version: 1,
    organization_id: input.organization_id,
    definition_id: input.definition_id,
    scope: input.scope,
    facts,
    sources,
    expires_at: new Date(expires).toISOString()
  });
}
