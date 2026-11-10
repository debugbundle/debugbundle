import { describe, expect, it } from "vitest";
import { renderSmartReportEmail } from "../../../packages/email/src/smart-report-email.js";
import {
  reportDocumentFixture,
  maximumReportDocumentFixture
} from "../../helpers/report-document.js";
describe("canonical Smart Report email overview", () => {
  it("escapes source text, shows honest factual fallback and links to the authenticated canonical report", () => {
    const document = reportDocumentFixture();
    document.name = "<script>Report & review</script>";
    const result = renderSmartReportEmail({ document, appBaseUrl: "https://app.example.test" });
    expect(result.html).toContain("&lt;script&gt;Report &amp; review&lt;/script&gt;");
    expect(result.html).not.toContain("<script>");
    expect(result.text).toContain("AI analysis is unavailable");
    expect(result.text).toContain("Recorded resolutions");
    expect(result.text).toContain("Focus for the coming month");
    expect(result.text).toContain("end exclusive, UTC");
    expect(result.html).toContain(
      `https://app.example.test/reports/${document.report.organization_id}/${document.run_id}`
    );
    expect(result.text).toContain("HTML and downloadable PDF");
    expect(result.html).not.toMatch(/data:application\/pdf|X-Amz-|bearer=/);
  });
  it("keeps the maximum overview bounded while retaining canonical critical/resolved evidence and numeric comparison semantics", () => {
    const document = maximumReportDocumentFixture(),
      result = renderSmartReportEmail({ document, appBaseUrl: "https://app.example.test" });
    expect(new TextEncoder().encode(result.html).length).toBeLessThan(128 * 1024);
    for (const project of document.report.facts.projects)
      expect(result.text).toContain(project.name);
    const critical = document.report.facts.evidence.find(
      (item) => item.severity === "critical" && ["open", "regressed"].includes(item.status)
    );
    if (!critical) throw new Error("missing_critical_fixture");
    expect(result.text).toContain(critical.title);
    expect(result.text).toContain("Current / previous");
    expect(result.text).toContain("Open critical incidents at period end");
    expect(result.text).toContain("Neither establishes causation");
    expect(result.text).toContain("separate report retention");
  });
  it.each(["model_rejected", "model_uncertain"] as const)(
    "uses the same safe factual fallback explanation for %s",
    (reason) => {
      const document = reportDocumentFixture();
      document.analysis.reason = reason;
      const result = renderSmartReportEmail({ document, appBaseUrl: "https://app.example.test" });
      for (const body of [result.html, result.text]) {
        expect(body).toContain(
          "The recorded facts, resolutions and selected outstanding work remain available."
        );
        expect(body).toContain("No automatic paid retry will be made.");
        expect(body).not.toContain(reason);
      }
    }
  );
  it("rejects a credential-bearing or non-HTTP dashboard configuration rather than publishing a caller URL", () => {
    for (const appBaseUrl of [
      "javascript:alert(1)",
      "https://secret:token@app.example.test",
      "https://app.example.test?bearer=secret"
    ])
      expect(() =>
        renderSmartReportEmail({ document: reportDocumentFixture(), appBaseUrl })
      ).toThrow();
  });
});
