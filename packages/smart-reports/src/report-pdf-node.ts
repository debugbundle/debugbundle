import PDFDocument from "pdfkit";
import { create as createFont } from "fontkit";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { type ReportContentView } from "./report-content.js";
import { ReportPdfRenderInputSchema } from "./report-pdf-input.js";
import {
  reportEvidenceSections,
  reportFactualHighlights,
  reportAnalysisExplanation,
  reportPeriodLabel,
  reportTimeLabel,
  reportMetricLabels,
  reportMetricComparison,
  formatReportValue
} from "./report-presentation.js";
import { MAX_REPORT_PDF_BYTES, MAX_REPORT_PDF_PAGES } from "./report-pdf.js";
export { MAX_REPORT_PDF_BYTES, MAX_REPORT_PDF_PAGES } from "./report-pdf.js";
const FONT_SHA = "68a3fc98800b2a27b371f2fb79991daf3633bd89309d4ffaa6946fd587f375b5";
/** This renderer accepts closed canonical data, not HTML or asset paths. Only
 * pinned bundled fonts are read; text cannot trigger filesystem/network IO.
 * The worker binding must use a separately bounded child process. */
export async function renderReportPdf(
  raw: ReportContentView,
  options: { onlineReportUrl?: string } = {}
): Promise<Buffer> {
  const input = ReportPdfRenderInputSchema.parse({
      view: raw,
      ...(options.onlineReportUrl === undefined
        ? {}
        : { online_report_url: options.onlineReportUrl })
    }),
    view = input.view,
    doc = view.document,
    facts = doc.report.facts;
  const bytes = await readFile(new URL("../assets/NotoSansCJKjp-Regular.otf", import.meta.url));
  if (createHash("sha256").update(bytes).digest("hex") !== FONT_SHA)
    throw new Error("report_pdf_font_integrity_failed");
  const font = createFont(bytes);
  if (!("hasGlyphForCodePoint" in font)) throw new Error("report_pdf_font_invalid");
  const latinBytes = await readFile(
    new URL("../assets/InstrumentSans-LatinExt-Regular.woff", import.meta.url)
  );
  if (
    createHash("sha256").update(latinBytes).digest("hex") !==
    "70972e3355cd7613dd08b9fb8fb07d4a88092722897f0d8aa076f3a8d40dbaa6"
  )
    throw new Error("report_pdf_font_integrity_failed");
  const latinFont = createFont(latinBytes);
  if (!("hasGlyphForCodePoint" in latinFont)) throw new Error("report_pdf_font_invalid");
  const unsupported = new Set<string>();
  const segments = (value: string): Array<{ font: "Report" | "ReportLatin"; value: string }> => {
    const result: Array<{ font: "Report" | "ReportLatin"; value: string }> = [];
    for (const character of value.replace(/\r\n?/g, "\n")) {
      const point = character.codePointAt(0)!;
      let face: "Report" | "ReportLatin" = "Report",
        rendered = character;
      if (character !== "\n" && character !== "\t" && !font.hasGlyphForCodePoint(point)) {
        if (latinFont.hasGlyphForCodePoint(point)) face = "ReportLatin";
        else {
          const fallback = `U+${point.toString(16).toUpperCase().padStart(4, "0")}`;
          unsupported.add(fallback);
          rendered = `[${fallback}]`;
        }
      }
      const previous = result.at(-1);
      if (previous?.font === face) previous.value += rendered;
      else result.push({ font: face, value: rendered });
    }
    return result;
  };
  const text = (value: string): string =>
    segments(value)
      .map((item) => item.value)
      .join("");
  return new Promise<Buffer>((resolve, reject) => {
    const pdf = new PDFDocument({
      size: "A4",
      margin: 44,
      bufferPages: true,
      lang: "en-GB",
      displayTitle: true,
      pdfVersion: "1.7",
      info: {
        Title: doc.name,
        Author: "DebugBundle",
        Creator: "DebugBundle Smart Reports",
        CreationDate: new Date(facts.cutoff_at),
        ModDate: new Date(facts.cutoff_at)
      }
    });
    const chunks: Buffer[] = [];
    let length = 0,
      pages = 1;
    pdf.on("error", (cause: Error) => reject(new Error("report_pdf_render_failed", { cause })));
    pdf.on("data", (chunk: Buffer) => {
      length += chunk.length;
      if (length > MAX_REPORT_PDF_BYTES) {
        pdf.destroy(new Error("report_pdf_size_exceeded"));
        return;
      }
      chunks.push(chunk);
    });
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("pageAdded", () => {
      pages++;
      if (pages > MAX_REPORT_PDF_PAGES) throw new Error("report_pdf_page_limit_exceeded");
    });
    try {
      pdf.registerFont("Report", bytes).registerFont("ReportLatin", latinBytes).font("Report");
      const width = pdf.page.width - 88;
      const write = (
        value: string,
        x: number,
        y: number,
        options: {
          width: number;
          lineGap?: number;
          paragraphGap?: number;
          link?: string;
          underline?: boolean;
        }
      ): void => {
        const runs = segments(value);
        for (const [index, run] of runs.entries()) {
          pdf.font(run.font);
          const format = {
            ...options,
            paragraphGap: index === runs.length - 1 ? (options.paragraphGap ?? 0) : 0,
            continued: index < runs.length - 1
          };
          if (index === 0) pdf.text(run.value, x, y, format);
          else pdf.text(run.value, format);
        }
        pdf.font("Report");
      };
      const paragraph = (value: string, size = 10, color = "#171717"): void => {
        pdf.fontSize(size).fillColor(color);
        write(value, 44, pdf.y, { width, lineGap: 2, paragraphGap: 6 });
      };
      const heading = (value: string, size = 16): void => {
        if (pdf.y > pdf.page.height - 110) pdf.addPage();
        pdf.moveDown(0.5);
        pdf.outline.addItem(text(value));
        paragraph(value, size);
      };
      const references = (items: string[]): string => `[${items.join(", ")}]`;
      const { focus, solved, coming } = reportEvidenceSections(doc);
      paragraph(
        `DebugBundle · ${facts.period.kind} report · ${facts.privacy_mode} evidence mode`,
        9,
        "#737373"
      );
      paragraph(doc.name, 22);
      if (input.online_report_url) {
        pdf.fontSize(10).fillColor("#171717");
        write("Open authenticated online report", 44, pdf.y, {
          width,
          lineGap: 2,
          paragraphGap: 6,
          link: input.online_report_url,
          underline: true
        });
      }
      paragraph(reportPeriodLabel(facts.period));
      paragraph(
        `Previous: ${reportPeriodLabel(facts.previous_period)}. Data cutoff: ${reportTimeLabel(facts.cutoff_at)}`,
        8,
        "#737373"
      );
      heading("Overview");
      paragraph(
        doc.narrative
          ? `${doc.narrative.overview.text} ${references(doc.narrative.overview.evidence_refs)}`
          : reportAnalysisExplanation(doc.analysis.reason, doc.analysis.status)
      );
      heading("What happened");
      for (const item of reportFactualHighlights(doc))
        paragraph(`${item.text} ${references(item.evidence_refs)}`);
      if (doc.narrative?.highlights.length)
        for (const highlight of doc.narrative.highlights)
          paragraph(
            `${highlight.kind.replaceAll("_", " ")}: ${highlight.text} ${references(highlight.evidence_refs)}`
          );
      else {
        const selected = facts.evidence.filter((item) =>
          item.period_events.some((event) => ["new", "regressed", "reopened"].includes(event))
        );
        for (const item of selected)
          paragraph(`${item.title} (${item.severity}, ${item.status}) ${references([item.ref])}`);
        if (selected.length === 0)
          paragraph(
            "No selected evidence in this category; missing observations require coverage review."
          );
      }
      heading(`Focus for the coming ${coming}`);
      if (doc.analysis.status === "not_requested" && focus.length)
        paragraph(
          "Review outstanding work in severity order, verify the linked evidence and check for recurrence after a bounded change."
        );
      for (const item of focus)
        paragraph(
          `${facts.projects.find((project) => project.ref === item.project_ref)?.name}: ${item.title} (${item.severity}, ${item.status}) ${references([item.ref])}`
        );
      if (doc.narrative?.priorities.length)
        for (const item of doc.narrative.priorities) {
          paragraph(item.title, 12);
          paragraph(`${item.action} ${item.rationale} ${references(item.evidence_refs)}`);
        }
      else if (!focus.length)
        paragraph(
          `No selected ${doc.analysis.status === "not_requested" ? "outstanding" : "high or critical"} work is recorded. Incomplete coverage does not establish that no issues exist.`
        );
      heading("Resolutions and recoveries");
      for (const item of solved)
        paragraph(
          `${facts.projects.find((project) => project.ref === item.project_ref)?.name}: ${item.title} (${item.type}, ${item.status.replaceAll("_", " ")}) ${references([item.ref])}`
        );
      if (solved.length === 0)
        paragraph(
          "No selected recorded resolutions or observed recoveries. See coverage before interpreting missing observations."
        );
      heading("Period comparison");
      paragraph(
        "Period totals can have unequal lengths. Compare daily rates where available; open-issue counts are period-end snapshots. Partial observations are not complete totals, and missing data is unknown.",
        9,
        "#737373"
      );
      const widths = [width * 0.38, width * 0.14, width * 0.14, width * 0.16, width * 0.18];
      const tableRow = (cells: string[], header = false): void => {
        pdf.fontSize(8);
        const rendered = cells.map(text),
          heights = rendered.map((cell, index) =>
            pdf.heightOfString(cell, { width: widths[index]! - 12, lineGap: 2 })
          );
        const height = Math.max(...heights) + 14;
        // A very long label/note uses flowing labelled text instead of clipping
        // a grid row taller than a page. All values remain in reading order.
        if (height > pdf.page.height - 130) {
          for (const [index, cell] of cells.entries())
            paragraph(
              `${["Metric", "Report period", "Previous period", "Change", "Daily rate"][index]}: ${cell}`,
              9
            );
          return;
        }
        if (pdf.y + height > pdf.page.height - 60) {
          pdf.addPage();
          if (!header)
            tableRow(["Metric", "Report period", "Previous period", "Change", "Daily rate"], true);
        }
        const y = pdf.y;
        let x = 44;
        if (header) pdf.rect(44, y, width, height).fill("#f5f5f5");
        for (const [index, cell] of rendered.entries()) {
          pdf.fontSize(8).fillColor("#171717");
          write(cell, x + 6, y + 7, { width: widths[index]! - 12, lineGap: 2 });
          x += widths[index]!;
        }
        pdf
          .moveTo(44, y + height)
          .lineTo(44 + width, y + height)
          .strokeColor("#e5e5e5")
          .stroke();
        pdf.x = 44;
        pdf.y = y + height;
      };
      for (const project of facts.projects) {
        heading(`${project.name} [${project.ref}]`, 14);
        paragraph(
          `Coverage: lifecycle ${project.coverage.lifecycle}; availability ${project.coverage.availability}; analytics ${project.coverage.analytics}. [${project.coverage_ref}]`,
          9,
          "#737373"
        );
        for (const note of project.notes) paragraph(note, 8, "#737373");
        tableRow(["Metric", "Report period", "Previous period", "Change", "Daily rate"], true);
        for (const metric of facts.metrics.filter((metric) => metric.project_ref === project.ref)) {
          const comparison = reportMetricComparison(metric);
          tableRow([
            `${reportMetricLabels[metric.key]} [${metric.ref}]${metric.notes.length ? `\n${metric.notes.join(" ")}` : ""}`,
            formatReportValue(metric.current, metric.current_complete),
            formatReportValue(metric.previous, metric.previous_complete),
            comparison.change,
            comparison.daily
          ]);
        }
      }
      heading("Selected evidence");
      if (!facts.evidence.length) paragraph("No source details were selected.");
      for (const item of facts.evidence) {
        heading(`${item.title} [${item.ref}]`, 12);
        paragraph(
          `${item.type} · ${item.severity} · ${item.status.replaceAll("_", " ")} · ${facts.projects.find((project) => project.ref === item.project_ref)?.name} · ${item.project_ref}`,
          9,
          "#737373"
        );
        if (item.context !== null) paragraph(item.context, 9);
        paragraph(
          view.available_source_refs.includes(item.ref)
            ? "Source evidence was retained when this PDF was prepared. Open the authenticated online report for current source links."
            : "Source evidence unavailable",
          8,
          "#737373"
        );
      }
      heading("Coverage and limitations");
      for (const note of facts.selection_notes) paragraph(note, 9);
      for (const limitation of doc.narrative?.limitations ?? [])
        paragraph(`${limitation.text} ${references(limitation.evidence_refs)}`, 9);
      paragraph(
        "Recorded resolution is a saved workflow action; observed recovery is a successful monitored response. Neither establishes causation. Source access and retention can change after PDF creation.",
        9
      );
      if (unsupported.size)
        paragraph(
          `Unsupported characters are represented by Unicode code points: ${[...unsupported].sort().join(", ")}. The HTML report retains the original text.`,
          8,
          "#737373"
        );
      paragraph(
        `Report expires ${reportTimeLabel(doc.report.expires_at)}. Version ${doc.version}, template ${doc.template_version}.`,
        8,
        "#737373"
      );
      const range = pdf.bufferedPageRange();
      for (let index = range.start; index < range.start + range.count; index++) {
        pdf.switchToPage(index);
        const bottom = pdf.page.margins.bottom;
        pdf.page.margins.bottom = 0;
        pdf
          .fontSize(8)
          .fillColor("#737373")
          .text(`DebugBundle · ${index + 1} / ${range.count}`, 44, pdf.page.height - 30, {
            lineBreak: false,
            width
          });
        pdf.page.margins.bottom = bottom;
      }
      pdf.end();
    } catch (cause) {
      pdf.destroy();
      reject(new Error("report_pdf_render_failed", { cause }));
    }
  });
}
