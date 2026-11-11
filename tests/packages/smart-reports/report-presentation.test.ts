import { expect, it } from "vitest";
import {
  reportPeriodLabel,
  reportRunPresentation,
  reportEvidenceSections,
  reportFactualHighlights
} from "../../../packages/smart-reports/src/report-presentation.js";
import { lastCompletedReportPeriod } from "../../../packages/smart-reports/src/report-period.js";
import { reportRunFixture } from "../../helpers/smart-reports.js";
import {
  maximumReportDocumentFixture,
  factualReportDocumentFixture
} from "../../helpers/report-document.js";
import { prepareReportModelInput } from "../../../packages/smart-reports/src/model-evidence.js";

it("shows the included UTC calendar days rather than the exclusive next-month boundary", () => {
  expect(reportPeriodLabel(lastCompletedReportPeriod("monthly", "2026-11-01T00:00:00.000Z"))).toBe(
    "1–31 Oct 2026 UTC"
  );
  expect(reportPeriodLabel(lastCompletedReportPeriod("daily", "2026-11-01T00:00:00.000Z"))).toBe(
    "31 Oct 2026 UTC"
  );
});

it("summarises factual reliability, usage and coverage without treating partial observations as trends", () => {
  const doc = factualReportDocumentFixture(),
    project = doc.report.facts.projects[0]!;
  project.coverage.analytics = "partial";
  doc.report.facts.metrics = [
    {
      ref: "m_new",
      project_ref: project.ref,
      key: "new_incidents",
      current: 0,
      previous: 0,
      unit: "count",
      current_complete: true,
      previous_complete: true,
      notes: []
    },
    {
      ref: "m_sessions",
      project_ref: project.ref,
      key: "analytics_sessions",
      current: 99,
      previous: 30,
      unit: "count",
      current_complete: false,
      previous_complete: true,
      notes: []
    }
  ];
  doc.report.facts = prepareReportModelInput(doc.report.facts);
  const before = structuredClone(doc),
    highlights = reportFactualHighlights(doc);
  expect(highlights).toHaveLength(1);
  expect(highlights[0]!.text).toContain("New incidents: 0");
  expect(highlights[0]!.text).toContain("Captured sessions: 99 (partial)");
  expect(highlights[0]!.text).toContain("analytics partial");
  expect(highlights[0]!.text).not.toMatch(/increased|healthy|no issues|%/);
  expect(highlights[0]!.text).toContain("Captured sessions: 99 (partial). Coverage:");
  expect(highlights[0]!.evidence_refs).toEqual(
    expect.arrayContaining(["m_new", "m_sessions", project.coverage_ref])
  );
  expect(doc).toEqual(before);
});

it("uses comparable daily rates for unequal months and describes missing data as unknown", () => {
  const doc = factualReportDocumentFixture(),
    project = doc.report.facts.projects[0]!;
  doc.report.facts.metrics = [
    {
      ref: "m_sessions",
      project_ref: project.ref,
      key: "analytics_sessions",
      current: 31,
      previous: 30,
      unit: "count",
      current_complete: true,
      previous_complete: true,
      notes: []
    }
  ];
  doc.report.facts = prepareReportModelInput(doc.report.facts);
  expect(reportFactualHighlights(doc)[0]!.text).toContain("daily rate 1 vs 1");
  doc.report.facts.metrics = [];
  expect(reportFactualHighlights(doc)[0]!.text).toContain(
    "No selected metric observations; missing data is unknown"
  );
});

it.each([true, false])(
  "reports observed health checks with complete=%s without inventing account uptime",
  (complete) => {
    const doc = factualReportDocumentFixture(),
      project = doc.report.facts.projects[0]!;
    doc.report.facts.metrics = ["total_checks", "successful_checks"].map((key, index) => ({
      ref: `m_health_${index}`,
      project_ref: project.ref,
      key: key as "total_checks" | "successful_checks",
      current: index === 0 ? 10 : 8,
      previous: null,
      unit: "count",
      current_complete: complete,
      previous_complete: false,
      notes: []
    }));
    const result = reportFactualHighlights(doc)[0]!;
    expect(result.text).toContain(
      `Successful health checks: 8 of 10 observed${complete ? ";" : " (partial);"}`
    );
    expect(result.text).toContain("not account uptime");
    expect(result.text).not.toMatch(/80%|outage|healthy/);
    expect(result.evidence_refs).toEqual([project.coverage_ref, "m_health_0", "m_health_1"]);
  }
);

it("includes lower-severity open opportunities in factual focus while preserving released Business priorities", () => {
  const doc = maximumReportDocumentFixture();
  doc.report.facts.evidence = doc.report.facts.evidence.map((item) => ({
    ...item,
    severity: "medium"
  }));
  expect(reportEvidenceSections(doc).focus).toEqual([]);
  doc.version = 2;
  doc.analysis = { status: "not_requested", reason: null, model: null, request_sha256: null };
  const { focus } = reportEvidenceSections(doc);
  expect(focus.length).toBeGreaterThan(0);
  expect(focus.length).toBeLessThanOrEqual(5);
  expect(focus.every((item) => ["open", "regressed"].includes(item.status))).toBe(true);
});
it("distinguishes ready analysis, usable facts and skipped or failed generation", () => {
  const run = reportRunFixture();
  expect(reportRunPresentation({ ...run, status: "factual_only" })).toMatchObject({
    label: "Facts only",
    tone: "info"
  });
  expect(reportRunPresentation({ ...run, status: "ready" }).label).toBe("Ready");
  expect(
    reportRunPresentation({ ...run, status: "skipped_quota", skip_reason: "ai_budget" }).description
  ).toContain("AI budget");
  expect(reportRunPresentation({ ...run, status: "failed" }).description).toContain(
    "could not be completed"
  );
});
it.each([
  ["queued", "Queued"],
  ["processing", "Generating"],
  ["paused_access", "Paused"],
  ["cancelled", "Cancelled"],
  ["expired", "Expired"],
  ["skipped_quota", "Skipped"]
] as const)("explains the %s state without exposing storage codes", (status, label) => {
  const result = reportRunPresentation({
    status,
    skip_reason: status === "skipped_quota" ? "generation_quota" : null
  });
  expect(result.label).toBe(label);
  expect(result.description).not.toMatch(/paused_access|generation_quota|skipped_quota/);
  expect(result.description.length).toBeGreaterThan(20);
});
it("ranks urgent sources by severity across projects without dropping selected work", () => {
  const doc = maximumReportDocumentFixture();
  const items = doc.report.facts.evidence.filter((item) =>
    ["open", "regressed"].includes(item.status)
  );
  items[0]!.severity = "high";
  items.at(-1)!.severity = "critical";
  const before = structuredClone(doc);
  const { urgent } = reportEvidenceSections(doc);
  expect(urgent[0]!.severity).toBe("critical");
  expect(urgent.map((item) => item.ref)).toEqual(
    expect.arrayContaining(
      items.filter((item) => ["high", "critical"].includes(item.severity)).map((item) => item.ref)
    )
  );
  expect(doc).toEqual(before);
});
