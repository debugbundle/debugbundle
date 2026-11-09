import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { renderReportPdf } from "../../../packages/smart-reports/src/report-pdf-node.js";
import { renderReportPdfInChild } from "../../../packages/smart-reports/src/report-pdf-process.js";
import {
  reportDocumentFixture,
  maximumReportDocumentFixture
} from "../../helpers/report-document.js";
const hasTextTool = spawnSync("pdftotext", ["-v"]).status === 0;
if (process.env["REPORT_PDF_TEXT_CHECK_REQUIRED"] === "true" && !hasTextTool)
  throw new Error("report_pdf_text_tool_required");
function extract(body: Buffer): string {
  const result = spawnSync("pdftotext", ["-layout", "-", "-"], {
    input: body,
    maxBuffer: 4 * 1024 * 1024,
    timeout: 15000
  });
  if (result.status !== 0) throw new Error("report_pdf_text_extraction_failed");
  return result.stdout.toString("utf8");
}
function pageCount(body: Buffer): number {
  const info = spawnSync("pdfinfo", ["-"], { input: body, maxBuffer: 65536, timeout: 15000 });
  if (info.status !== 0) throw new Error("report_pdf_structure_invalid");
  const text = info.stdout.toString();
  expect(text).toContain("A4");
  return Number(text.match(/^Pages:\s+(\d+)$/m)?.[1]);
}
describe("bounded canonical PDF renderer", () => {
  it("links only to the configured authenticated online report and rejects a mismatched report location", async () => {
    const document = reportDocumentFixture(),
      url = `https://app.example.test/reports/${document.report.organization_id}/${document.run_id}`,
      body = await renderReportPdf(
        { document, available_source_refs: [] },
        { onlineReportUrl: url }
      );
    expect(body.toString("latin1")).toContain("/Subtype /Link");
    expect(body.toString("latin1")).toContain(url);
    await expect(
      renderReportPdf(
        { document, available_source_refs: [] },
        { onlineReportUrl: "https://app.example.test/foreign" }
      )
    ).rejects.toThrow();
  });
  it.skipIf(!hasTextTool)(
    "renders the maximum report through the real fixed child under its 128-MiB heap and deadline",
    async () => {
      const doc = maximumReportDocumentFixture();
      const onlineReportUrl = `https://app.example.test/reports/${doc.report.organization_id}/${doc.run_id}`;
      const body = await renderReportPdfInChild(
        { document: doc, available_source_refs: [] },
        { onlineReportUrl }
      );
      expect(body.toString("latin1")).toContain(onlineReportUrl);
      const text = extract(body);
      expect(body.length).toBeLessThanOrEqual(5 * 1024 * 1024);
      expect(pageCount(body)).toBeLessThanOrEqual(100);
      for (const source of doc.report.sources) expect(text).toContain(source.ref);
    },
    25000
  );
  it("emits a bounded PDF from facts without executable report markup or attachments", async () => {
    const doc = reportDocumentFixture();
    doc.name = "<script>unsafe()</script>";
    const body = await renderReportPdf({ document: doc, available_source_refs: [] });
    expect(body.subarray(0, 5).toString()).toBe("%PDF-");
    expect(body.length).toBeLessThanOrEqual(5 * 1024 * 1024);
    const raw = body.toString("latin1");
    expect(raw).not.toMatch(/\/JavaScript|\/Launch|\/EmbeddedFiles|\/RichMedia/);
    expect(raw).toContain("/ToUnicode");
    expect(raw).toContain("/FontFile3");
  });
  it.skipIf(!hasTextTool)(
    "keeps accented/CJK text, explicitly represents unsupported glyphs and preserves canonical facts",
    async () => {
      const doc = reportDocumentFixture();
      doc.report.facts.projects[0]!.name = "Plačila 日本語";
      doc.name = "Monthly 🔧 review";
      const body = await renderReportPdf({ document: doc, available_source_refs: [] });
      const text = extract(body);
      expect(text).toContain("Plačila 日本語");
      expect(text).toContain("[U+1F527]");
      expect(text).toContain("AI analysis unavailable");
      expect(text).toContain("2026-10-01");
      expect(text).toContain("2026-11-01");
      expect(text).toContain("Recorded resolutions");
      expect(text).toContain("Focus for the coming month");
      expect(text).toContain("Unsupported characters");
      const count = pageCount(body),
        footers = [...text.matchAll(/DebugBundle · (\d+) \/ (\d+)/g)];
      expect(footers).toHaveLength(count);
      expect(footers.map((match) => [Number(match[1]), Number(match[2])])).toEqual(
        Array.from({ length: count }, (_, index) => [index + 1, count])
      );
    }
  );
  it.skipIf(!hasTextTool)(
    "renders every project, source and numeric row in a maximum report with long wrapped labels",
    async () => {
      const doc = maximumReportDocumentFixture();
      const body = await renderReportPdf({ document: doc, available_source_refs: [] });
      const text = extract(body);
      expect(body.length).toBeLessThanOrEqual(5 * 1024 * 1024);
      for (const project of doc.report.facts.projects) expect(text).toContain(project.ref);
      for (const source of doc.report.sources) expect(text).toContain(source.ref);
      for (const metric of doc.report.facts.metrics) expect(text).toContain(metric.ref);
      expect(pageCount(body)).toBeLessThanOrEqual(100);
      expect(text).toContain("Period comparison");
      expect(text).toContain("Coverage and limitations");
      expect(text).toContain("Source evidence unavailable");
    },
    20000
  );
});
