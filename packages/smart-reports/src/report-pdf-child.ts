import { renderReportPdf } from "./report-pdf-node.js";
import { ReportPdfRenderInputSchema } from "./report-pdf-input.js";
try {
  let length = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    if (!Buffer.isBuffer(chunk)) throw new Error("report_pdf_input_invalid");
    length += chunk.length;
    if (length > 1024 * 1024) throw new Error("report_pdf_input_limit_exceeded");
    chunks.push(chunk);
  }
  const input = ReportPdfRenderInputSchema.parse(
    JSON.parse(Buffer.concat(chunks).toString("utf8"))
  );
  const body = await renderReportPdf(
    input.view,
    input.online_report_url === undefined ? {} : { onlineReportUrl: input.online_report_url }
  );
  await new Promise<void>((resolve, reject) => {
    process.stdout.write(body, (error) => (error ? reject(error) : resolve()));
  });
} catch {
  process.stderr.write("report_pdf_failed\n");
  process.exitCode = 1;
}
