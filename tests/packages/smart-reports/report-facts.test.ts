import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { assembleReportFacts } from "../../../packages/smart-reports/src/report-facts.js";
import { lastCompletedReportPeriod } from "../../../packages/smart-reports/src/report-period.js";
const now = "2026-12-01T00:00:00.000Z";
function fixture() {
  const project = randomUUID(),
    id = randomUUID();
  const lifecycle = {
    project_id: project,
    coverage: {
      complete: true,
      collected_from: "2026-01-01T00:00:00.000Z",
      bounded_from: "2026-01-01T00:00:00.000Z"
    },
    incidents: { opened: 2, resolution_events: 1, distinct_resolved: 1, regressed: 1, reopened: 0 },
    improvements: { opened: 1, resolution_events: 0, distinct_resolved: 0, restored: 0, snoozed: 0 }
  };
  const source = {
    origin_project_id: project,
    source_type: "incident",
    source_id: id,
    status: "regressed",
    severity: "critical",
    first_seen_at: "2026-08-01T00:00:00.000Z",
    last_seen_at: "2026-11-20T00:00:00.000Z",
    source_version_at: "2026-11-20T00:00:00.000Z",
    retained: false,
    period_events: ["resolved", "regressed"]
  };
  const state = {
    sources: [source],
    known_sources: 1,
    open_high_incidents: 0,
    open_critical_incidents: 1,
    complete: true
  };
  const availability = {
    total_checks: 20,
    successful_checks: 18,
    estimated_check_downtime_seconds: 120,
    complete: true,
    collected_from: "2026-01-01T00:00:00.000Z"
  };
  const analytics = {
    coverage: "complete",
    sessions: 20 as number | null,
    page_views: 30 as number | null,
    daily_active_visitor_days: 10 as number | null,
    notes: ["Scoped daily estimates; not unique monthly people."]
  };
  const text = {
    ...source,
    selected_project_id: project,
    source_content_at: "2026-11-01T00:00:00.000Z",
    title: "Checkout for owner@example.test",
    context: "Connection failure at https://secret.example.test",
    summary_group: "urgent",
    captured_at: "2026-11-21T00:00:00.000Z",
    text_expires_at: "2027-01-30T00:00:00.000Z"
  };
  const { retained: _retained, period_events: _events, ...sourceText } = text;
  void _retained;
  void _events;
  return {
    organization_id: randomUUID(),
    definition_id: randomUUID(),
    scope: [{ project_id: project, origin_project_ids: [project] }],
    period: lastCompletedReportPeriod("monthly", now),
    cutoff_at: now,
    privacy_mode: "full",
    views: [
      {
        project_id: project,
        name: "Checkout",
        current_lifecycle: [lifecycle],
        previous_lifecycle: [lifecycle],
        current_state: state,
        previous_state: state,
        cutoff_state: state,
        current_availability: { ...availability },
        previous_availability: { ...availability },
        current_analytics: analytics,
        previous_analytics: analytics,
        source_text: [sourceText]
      }
    ]
  };
}
it("assembles deterministic facts, separates lifecycle events from snapshots and retains old regressed priorities", () => {
  const input = fixture(),
    report = assembleReportFacts(input);
  expect(assembleReportFacts(input)).toEqual(report);
  expect(report.facts.metrics.find((metric) => metric.key === "resolution_events")).toMatchObject({
    current: 1,
    unit: "count"
  });
  expect(report.facts.evidence[0]).toMatchObject({
    status: "regressed",
    severity: "critical",
    period_events: ["resolved", "regressed"]
  });
  expect(report.sources[0]).toMatchObject({
    source_id: input.views[0]!.cutoff_state.sources[0]!.source_id,
    retained: false,
    text_available: true
  });
  expect(report.expires_at).toBe("2027-03-01T00:00:00.000Z");
  expect(report.sources[0]?.text_expires_at).toBe("2027-01-30T00:00:00.000Z");
  expect(JSON.stringify(report.facts)).not.toContain("owner@example.test");
  expect(JSON.stringify(report.facts)).not.toContain("secret.example.test");
});
it("keeps expired or restricted source text out while preserving numeric priorities", () => {
  const input = fixture();
  input.views[0]!.source_text[0]!.text_expires_at = now;
  const report = assembleReportFacts(input);
  expect(report.sources[0]?.text_available).toBe(false);
  expect(report.facts.evidence[0]).toMatchObject({
    title: "critical regressed incident",
    context: null
  });
  input.views[0]!.source_text[0]!.text_expires_at = "2027-01-30T00:00:00.000Z";
  input.privacy_mode = "restricted";
  expect(assembleReportFacts(input).facts).toMatchObject({
    projects: [{ name: "Project A" }],
    evidence: [{ title: "critical regressed incident", context: null }]
  });
});
it("reserves an old critical priority when recent critical work is noisy", () => {
  const input = fixture(),
    state = input.views[0]!.cutoff_state,
    old = state.sources[0]!;
  state.sources = [
    old,
    ...Array.from({ length: 25 }, () => ({
      ...old,
      source_id: randomUUID(),
      first_seen_at: "2026-11-10T00:00:00.000Z",
      source_version_at: "2026-11-25T00:00:00.000Z"
    }))
  ];
  state.known_sources = 26;
  state.open_critical_incidents = 26;
  const report = assembleReportFacts(input);
  expect(report.sources.some((item) => item.source_id === old.source_id)).toBe(true);
  expect(report.sources).toHaveLength(10);
});
it("keeps unknown analytics and unobserved health from becoming complete zero comparisons", () => {
  const input = fixture();
  input.views[0]!.current_availability.total_checks = 0;
  input.views[0]!.current_availability.successful_checks = 0;
  input.views[0]!.current_analytics = {
    coverage: "unavailable",
    sessions: null,
    page_views: null,
    daily_active_visitor_days: null,
    notes: []
  };
  const report = assembleReportFacts(input);
  expect(report.facts.projects[0]?.coverage).toMatchObject({
    availability: "partial",
    analytics: "partial"
  });
  expect(report.facts.metrics.find((metric) => metric.key === "analytics_sessions")).toMatchObject({
    current: null,
    current_complete: false
  });
});
it("rejects a foreign source or missing view instead of silently shrinking mixed scope", () => {
  const input = fixture();
  input.views[0]!.cutoff_state.sources[0]!.origin_project_id = randomUUID();
  expect(() => assembleReportFacts(input)).toThrow("report_fact_scope_invalid");
  const missing = fixture();
  missing.views = [];
  expect(() => assembleReportFacts(missing)).toThrow();
});
it("counts distinct resolved improvement work separately from repeated resolution events", () => {
  const input = fixture();
  input.views[0]!.current_lifecycle[0]!.improvements.resolution_events = 2;
  input.views[0]!.current_lifecycle[0]!.improvements.distinct_resolved = 1;
  expect(
    assembleReportFacts(input).facts.metrics.find(
      (metric) => metric.key === "resolved_improvements"
    )?.current
  ).toBe(1);
});

it("retains actual observed recovery evidence alongside urgent work without inferring recovery from totals", () => {
  const input = fixture();
  const recovery = {
    origin_project_id: input.scope[0]!.project_id,
    source_type: "health" as const,
    source_id: randomUUID(),
    status: "observed_recovery" as const,
    severity: "unknown" as const,
    first_seen_at: "2026-11-20T00:00:00.000Z",
    last_seen_at: "2026-11-20T00:00:00.000Z",
    source_version_at: "2026-11-20T00:00:00.000Z",
    retained: false,
    period_events: ["observed_recovery" as const]
  };
  const report = assembleReportFacts({
    ...input,
    views: input.views.map((view) => ({ ...view, health_recoveries: [recovery] }))
  });
  expect(report.facts.evidence).toContainEqual(
    expect.objectContaining({
      type: "health",
      status: "observed_recovery",
      period_events: ["observed_recovery"],
      context: null
    })
  );
  expect(report.sources).toContainEqual(
    expect.objectContaining({
      source_type: "health",
      source_id: recovery.source_id,
      text_available: false
    })
  );
  expect(assembleReportFacts(input).facts.evidence.some((e) => e.type === "health")).toBe(false);
});
