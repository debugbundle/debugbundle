import { expect, it } from "vitest";
import {
  reportPeriodLabel,
  reportRunPresentation,
  reportEvidenceSections
} from "../../../packages/smart-reports/src/report-presentation.js";
import { lastCompletedReportPeriod } from "../../../packages/smart-reports/src/report-period.js";
import { reportRunFixture } from "../../helpers/smart-reports.js";
import { maximumReportDocumentFixture } from "../../helpers/report-document.js";

it("shows the included UTC calendar days rather than the exclusive next-month boundary", () => {
  expect(reportPeriodLabel(lastCompletedReportPeriod("monthly", "2026-11-01T00:00:00.000Z"))).toBe(
    "1–31 Oct 2026 UTC"
  );
  expect(reportPeriodLabel(lastCompletedReportPeriod("daily", "2026-11-01T00:00:00.000Z"))).toBe(
    "31 Oct 2026 UTC"
  );
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
