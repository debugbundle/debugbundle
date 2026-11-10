// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ReportContentView } from "../../../apps/web/src/components/system/report-content-view.js";
import { ReportDocumentSchema } from "../../../packages/smart-reports/src/report-document.js";
import { reportDocumentFixture } from "../../helpers/report-document.js";
import { reportProject, reportRequest } from "../../helpers/smart-reports.js";
afterEach(cleanup);

it("renders validated analysis references and active priorities while escaping evidence prose and gating source links", () => {
  const doc = reportDocumentFixture(),
    project = doc.report.facts.projects[0]!;
  doc.report.facts.evidence.push({
    ref: "s1",
    project_ref: project.ref,
    type: "incident",
    status: "open",
    severity: "critical",
    period_events: ["new"],
    first_seen_at: null,
    last_seen_at: null,
    title: "Unresolved database failures",
    context: "<script>private source text</script>"
  });
  doc.report.sources.push({
    ref: "s1",
    project_id: reportProject,
    origin_project_id: reportProject,
    source_type: "incident",
    source_id: reportRequest,
    retained: true,
    text_available: true,
    text_expires_at: doc.report.expires_at
  });
  const refs = ["s1", project.coverage_ref];
  doc.narrative = {
    version: 1,
    overview: { text: "Database failures need attention.", evidence_refs: refs },
    highlights: [
      { kind: "outstanding", text: "Database failures remain unresolved.", evidence_refs: ["s1"] }
    ],
    priorities: [
      {
        title: "Investigate database failures",
        action: "Review the retained incident evidence.",
        rationale: "The critical incident remains open.",
        evidence_refs: ["s1"]
      }
    ],
    limitations: [
      { text: "Source coverage remains incomplete.", evidence_refs: [project.coverage_ref] }
    ]
  };
  doc.analysis = {
    status: "available",
    reason: null,
    model: "gpt-6.1-terra",
    request_sha256: "a".repeat(64)
  };
  const document = ReportDocumentSchema.parse(doc);
  const { container, rerender } = render(
    <ReportContentView view={{ document, available_source_refs: [] }} />
  );
  expect(screen.getByRole("heading", { name: "Investigate database failures" })).toBeVisible();
  expect(screen.getAllByRole("link", { name: "Evidence s1" })[0]).toHaveAttribute(
    "href",
    "#ref-s1"
  );
  expect(container.querySelector("script")).toBeNull();
  fireEvent.click(screen.getByText("Source context"));
  expect(screen.getByText("<script>private source text</script>")).toBeVisible();
  expect(screen.queryByRole("link", { name: "Open source evidence" })).not.toBeInTheDocument();
  rerender(<ReportContentView view={{ document, available_source_refs: ["s1"] }} />);
  expect(screen.getByRole("link", { name: "Open source evidence" })).toHaveAttribute(
    "href",
    expect.stringContaining(`/reports/${reportRequest}/sources/s1`)
  );
});
