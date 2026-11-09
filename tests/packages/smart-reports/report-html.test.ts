import { describe, expect, it } from "vitest";
import { renderReportHtml } from "../../../packages/smart-reports/src/report-html.js";
import { reportLinkLocation } from "../../../packages/smart-reports/src/report-content.js";
import { reportDocumentFixture } from "../../helpers/report-document.js";
describe("canonical report HTML", () => {
  it("resolves configured API/dashboard hosts without accepting report-provided or credential-bearing URL bases", () => {
    const path =
      "/projects/22222222-2222-4222-8222-222222222222/incidents/44444444-4444-4444-8444-444444444444";
    expect(reportLinkLocation(path, "https://console.example.test")).toBe(
      `https://console.example.test${path}`
    );
    expect(reportLinkLocation(path)).toBe(path);
    for (const base of [
      "javascript:alert(1)",
      "file:///tmp/secret",
      "https://key:secret@example.test",
      "https://example.test?key=secret"
    ])
      expect(() => reportLinkLocation(path, base)).toThrow("report_link_base_invalid");
    expect(() =>
      reportLinkLocation("//external.example.test", "https://console.example.test")
    ).toThrow("report_link_path_invalid");
  });
  it("renders immutable periods, server metrics, coverage and explicit unavailable analysis without fabricated advice", () => {
    const doc = reportDocumentFixture(),
      html = renderReportHtml(doc);
    expect(html).toContain("Monthly review");
    expect(html).toContain("2026-10-01");
    expect(html).toContain("2026-11-01");
    expect(html).toContain("AI analysis unavailable");
    expect(html).toContain("No selected high or critical work");
    expect(html).toContain('scope="col"');
    expect(html).toContain('id="main"');
    expect(html).toContain("unequal");
    expect(html).not.toMatch(/<script|<iframe|<img|https?:\/\//i);
    expect(html).toBe(renderReportHtml(doc));
  });
  it("escapes source and project labels, keeps Unicode and wraps print tables", () => {
    const doc = reportDocumentFixture();
    doc.name = '"><script>alert(1)</script>';
    doc.report.facts.projects[0]!.name = "Plačila 日本語 🔧";
    const html = renderReportHtml(doc);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("Plačila 日本語 🔧");
    expect(html).toContain("overflow-wrap:anywhere");
    expect(html).toContain("@media print");
    expect(html).toContain("break-inside:avoid");
    expect(html).toContain('lang="en"');
    expect(html).toContain('name="viewport"');
  });
  it("shows recorded resolutions and active priorities from canonical evidence even without AI", () => {
    const doc = reportDocumentFixture(),
      project = doc.report.facts.projects[0]!;
    const evidence = {
      ref: "s1",
      project_ref: project.ref,
      type: "incident" as const,
      status: "resolved" as const,
      severity: "high" as const,
      period_events: ["resolved" as const],
      first_seen_at: null,
      last_seen_at: null,
      title: "Recovered database connection",
      context: null
    };
    doc.report.facts.evidence.push(evidence);
    doc.report.sources.push({
      ref: "s1",
      project_id: doc.report.scope[0]!.project_id,
      origin_project_id: doc.report.scope[0]!.project_id,
      source_type: "incident",
      source_id: doc.run_id,
      retained: false,
      text_available: false,
      text_expires_at: null
    });
    const html = renderReportHtml(doc);
    expect(html).toContain("Recorded resolutions");
    expect(html).toContain(evidence.title);
    expect(html).toContain("Source evidence unavailable");
    doc.report.facts.evidence[0] = {
      ...evidence,
      status: "regressed",
      period_events: ["regressed"]
    };
    const active = renderReportHtml(doc);
    expect(active).toContain("Focus for the coming month");
    expect(active).toContain("high");
    expect(active).not.toContain("No selected high or critical work");
  });
});
