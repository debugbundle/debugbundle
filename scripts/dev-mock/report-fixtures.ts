import type { createDevMockFixtures } from "./fixtures.js";
import {
  ReportDefinitionRecordSchema,
  type ReportDefinitionRecord
} from "../../packages/smart-reports/src/report-definition.js";
import {
  lastCompletedReportPeriod,
  previousReportPeriod
} from "../../packages/smart-reports/src/report-period.js";
import { nextReportSchedule } from "../../packages/smart-reports/src/report-schedule.js";
import {
  prepareReportModelInput,
  type ReportModelEvidence,
  type ReportModelMetric
} from "../../packages/smart-reports/src/model-evidence.js";
import {
  ReportDocumentSchema,
  type ReportDocument
} from "../../packages/smart-reports/src/report-document.js";
import {
  ReportRunRecordSchema,
  type ReportRunRecord
} from "../../packages/smart-reports/src/report-run.js";

export const reportPreviewId = (n: number): string =>
  `92000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
type Data = ReturnType<typeof createDevMockFixtures>;
/** Fictional examples use the production fact and narrative validators. They
 * have no provider receipt or claimed paid model identity. */
export function previewReportDocument(
  data: Data,
  run: ReportRunRecord,
  quiet = false,
  factual = false
): ReportDocument {
  const cutoff = new Date(Math.max(Date.now(), Date.parse(run.period.ends_at))).toISOString();
  const selected = [...run.scope].sort((a, b) => a.project_id.localeCompare(b.project_id));
  const projects = selected.map((scope, i) => {
    const name = data.projects.find((project) => project["project_id"] === scope.project_id)?.[
      "name"
    ];
    return {
      ref: `p${i + 1}`,
      name: typeof name === "string" ? name : "Sample project",
      coverage_ref: `c${i + 1}`,
      coverage: {
        lifecycle: "complete",
        availability: quiet ? "complete" : "partial",
        analytics: i === 2 ? "unavailable" : "complete"
      },
      notes: quiet
        ? []
        : [
            "Monitoring covers part of the period; observed totals do not establish complete uptime."
          ]
    };
  });
  const values: Array<[ReportModelMetric["key"], number, number]> = [
    ["new_incidents", 24, 31],
    ["resolution_events", 17, 11],
    ["open_high_incidents", 2, 4],
    ["regressions", 3, 2],
    ["total_checks", 4320, 4464],
    ["successful_checks", 4318, 4460],
    ["estimated_check_downtime_seconds", 120, 240],
    ["analytics_sessions", 2400, 2200]
  ];
  const metrics = projects.flatMap((project, i) =>
    values.map(([key, current, previous], j) => ({
      ref: `m${i + 1}_${j + 1}`,
      project_ref: project.ref,
      key,
      current: i === 2 && key === "analytics_sessions" ? null : quiet ? 0 : current,
      previous: i === 2 && key === "analytics_sessions" ? null : quiet ? 0 : previous,
      unit: key === "estimated_check_downtime_seconds" ? "seconds" : "count",
      current_complete:
        quiet ||
        (!["total_checks", "successful_checks", "estimated_check_downtime_seconds"].includes(key) &&
          !(i === 2 && key === "analytics_sessions")),
      previous_complete:
        quiet ||
        (!["total_checks", "successful_checks", "estimated_check_downtime_seconds"].includes(key) &&
          !(i === 2 && key === "analytics_sessions")),
      notes:
        i === 2 && key === "analytics_sessions"
          ? ["Analytics collection is unavailable; this is unknown, not zero."]
          : []
    }))
  );
  const titles = [
    "Checkout request fails after confirmation",
    "Background task retries remain unresolved",
    "Report export times out"
  ];
  const evidence: ReportModelEvidence[] = quiet
    ? []
    : projects.flatMap((project, i) => [
        {
          ref: `s${i + 1}_open`,
          project_ref: project.ref,
          type: "incident",
          status: i === 2 ? "regressed" : "open",
          severity: i === 0 ? "critical" : "high",
          period_events: ["new"],
          first_seen_at: run.period.starts_at,
          last_seen_at: run.period.ends_at,
          title: titles[i] ?? "Outstanding sample incident",
          context:
            "Synthetic retained summary: affected requests failed intermittently. Review the incident evidence and confirm recovery before marking the work resolved."
        },
        {
          ref: `s${i + 1}_resolved`,
          project_ref: project.ref,
          type: "incident",
          status: "resolved",
          severity: "medium",
          period_events: ["resolved"],
          first_seen_at: run.period.starts_at,
          last_seen_at: run.period.ends_at,
          title: "Background processing incident marked resolved",
          context:
            "A workflow resolution was recorded during the period. This does not independently establish the cause of recovery."
        }
      ]);
  if (!quiet && projects.length > 1)
    evidence.push({
      ref: "s_health",
      project_ref: "p2",
      type: "health",
      status: "observed_recovery",
      severity: "unknown",
      period_events: ["observed_recovery"],
      first_seen_at: run.period.starts_at,
      last_seen_at: run.period.ends_at,
      title: "Monitored endpoint recovered",
      context: null
    });
  const facts = prepareReportModelInput({
    version: 1,
    period: run.period,
    previous_period: previousReportPeriod(run.period),
    cutoff_at: cutoff,
    privacy_mode: run.privacy_mode,
    projects,
    metrics,
    evidence,
    selection_notes: [
      "Synthetic preview data only; no AI request or email delivery has occurred.",
      ...(quiet
        ? []
        : [
            "Sources are a bounded selection. Missing observations do not prove an absence of issues."
          ])
    ]
  });
  const coverage = facts.projects.map((project) => project.coverage_ref);
  const narrative =
    factual || run.status === "factual_only"
      ? null
      : {
          version: 1,
          overview: {
            text: quiet
              ? "Sample overview: the displayed observations are quiet. No selected incident evidence supports further explanation; review coverage before drawing broader conclusions."
              : "Sample overview: recorded resolutions sit alongside outstanding work. Prioritise critical incidents and review incomplete monitoring before interpreting the results.",
            evidence_refs: coverage
          },
          highlights: quiet
            ? []
            : [
                {
                  kind: "recorded_resolution",
                  text: "An incident has a recorded workflow resolution during the period.",
                  evidence_refs: ["s1_resolved"]
                },
                ...(projects.length > 1
                  ? [
                      {
                        kind: "observed_recovery",
                        text: "Monitoring recorded an observed recovery; this does not prove a code fix.",
                        evidence_refs: ["s_health"]
                      }
                    ]
                  : [])
              ],
          priorities: quiet
            ? []
            : facts.evidence
                .filter((item) => ["open", "regressed"].includes(item.status))
                .map((item) => ({
                  title: "Review outstanding incident evidence",
                  action:
                    "Investigate the retained evidence, identify affected requests and confirm recovery before resolution.",
                  rationale:
                    "The selected incident remains active and needs an explicit follow-up.",
                  evidence_refs: [item.ref]
                })),
          limitations: [
            {
              text: quiet
                ? "This fictional preview contains no selected incident summaries. Use the numeric tables and recorded coverage before drawing broader conclusions."
                : "This fictional preview uses selected sources and partial monitoring. Missing observations are unknown and do not establish complete coverage.",
              evidence_refs: coverage
            }
          ]
        };
  const expires = new Date(Date.parse(cutoff) + 90 * 86400000).toISOString();
  return ReportDocumentSchema.parse({
    version: factual ? 2 : 1,
    template_version: 1,
    run_id: run.id,
    name: run.name,
    report: {
      version: 1,
      organization_id: run.organization_id,
      definition_id: run.definition_id,
      scope: run.scope,
      facts,
      sources: facts.evidence.map((source, i) => ({
        ref: source.ref,
        project_id: selected[Number(source.project_ref.slice(1)) - 1]!.project_id,
        origin_project_id: selected[Number(source.project_ref.slice(1)) - 1]!.project_id,
        source_type: source.type,
        source_id: reportPreviewId(500 + i),
        retained: false,
        text_available: source.context !== null,
        text_expires_at: source.context === null ? null : expires
      })),
      expires_at: expires
    },
    narrative,
    analysis: factual
      ? { status: "not_requested", reason: null, model: null, request_sha256: null }
      : {
          status: narrative === null ? "unavailable" : "available",
          reason: narrative === null ? "model_rejected" : null,
          model: null,
          request_sha256: null
        }
  });
}
export function previewReportRun(
  definition: ReportDefinitionRecord,
  id: string,
  status: ReportRunRecord["status"],
  now: string
): ReportRunRecord {
  const complete = ["ready", "factual_only"].includes(status);
  return ReportRunRecordSchema.parse({
    id,
    organization_id: definition.organization_id,
    definition_id: definition.id,
    definition_version: definition.version,
    name: definition.name,
    scope: definition.scope,
    recipient_user_ids: definition.recipient_user_ids,
    privacy_mode: definition.privacy_mode,
    period: lastCompletedReportPeriod(definition.cadence, now),
    kind: "manual",
    status,
    skip_reason: status === "skipped_quota" ? "generation_quota" : null,
    ai_status:
      status === "ready"
        ? "succeeded"
        : status === "factual_only" || status === "failed"
          ? "failed"
          : "pending",
    generation_counted: status !== "skipped_quota",
    send_email: false,
    created_at: now,
    updated_at: now,
    published_at: complete ? now : null,
    expires_at: complete ? new Date(Date.parse(now) + 90 * 86400000).toISOString() : null
  });
}
export function createReportPreviewFixtures(data: Data) {
  const now = new Date().toISOString();
  const definitions = [
    {
      name: "Sample · Monthly business review",
      cadence: "monthly",
      privacy: "full",
      count: 3,
      enabled: true
    },
    {
      name: "Sample · Weekly reliability review",
      cadence: "weekly",
      privacy: "full",
      count: 2,
      enabled: true
    },
    {
      name: "Sample · Daily private review",
      cadence: "daily",
      privacy: "restricted",
      count: 3,
      enabled: false
    },
    {
      name: "Sample · Quiet project review",
      cadence: "monthly",
      privacy: "full",
      count: 1,
      enabled: false
    },
    {
      name: "Sample · Monthly factual report",
      cadence: "monthly",
      privacy: "restricted",
      count: 1,
      enabled: false
    }
  ].map((example, i) => {
    const schedule = example.enabled ? { time: "09:00", timezone: "Europe/Ljubljana" } : null;
    const next = schedule
      ? nextReportSchedule({
          cadence: example.cadence as "monthly" | "weekly",
          schedule,
          after: now
        })
      : null;
    return ReportDefinitionRecordSchema.parse({
      id: reportPreviewId(i + 1),
      organization_id: data.session.organization_id,
      created_by_user_id: data.session.user_id,
      name: example.name,
      cadence: example.cadence,
      scope: data.projects.slice(0, example.count).map((project) => ({
        project_id: project["project_id"],
        origin_project_ids: [project["project_id"]]
      })),
      recipient_user_ids: [data.session.user_id],
      privacy_mode: example.privacy,
      source_collection_consent: example.privacy === "full",
      schedule,
      enabled: example.enabled,
      version: 1,
      next_due_at: next?.due_at ?? null,
      next_period_ends_at: next?.period.ends_at ?? null,
      requires_owner_review: false,
      pause_reason: null,
      paused_at: null,
      weekly_overlap: null,
      created_at: now,
      updated_at: now
    });
  });
  const states = [
    "ready",
    "factual_only",
    "ready",
    "factual_only",
    "queued",
    "failed",
    "skipped_quota"
  ] as const;
  const runs = states.map((status, i) =>
    previewReportRun(
      definitions[i < 4 ? i : i === 5 ? 1 : 0]!,
      reportPreviewId(101 + i),
      status,
      new Date(Date.parse(now) - i * 60000).toISOString()
    )
  );
  runs.push({
    ...previewReportRun(
      definitions[4]!,
      reportPreviewId(108),
      "ready",
      new Date(Date.parse(now) - 35 * 86400000).toISOString()
    ),
    ai_status: "unavailable"
  });
  return { definitions, runs };
}
