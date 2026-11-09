import { z } from "zod";
export const MAX_REPORT_PDF_BYTES = 5 * 1024 * 1024;
export const MAX_REPORT_PDF_PAGES = 100;
export const ReportPdfStateSchema = z
  .object({
    run_id: z.uuid(),
    status: z.enum(["not_requested", "queued", "processing", "ready", "failed"]),
    retry_after_seconds: z.number().int().min(0).max(300).nullable()
  })
  .strict();
export type ReportPdfState = z.infer<typeof ReportPdfStateSchema>;
export const ReportPdfStateResponseSchema = z.object({ pdf: ReportPdfStateSchema }).strict();
export function isReportPdfBytes(body: Uint8Array): boolean {
  const decode = new TextDecoder();
  return (
    body.length <= MAX_REPORT_PDF_BYTES &&
    decode.decode(body.subarray(0, 5)) === "%PDF-" &&
    /%%EOF\s*$/.test(decode.decode(body.subarray(-32)))
  );
}
