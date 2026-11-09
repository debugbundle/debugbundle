import { ReportApiError } from "./http.js";
import type { ReportBinaryHttpClient } from "./pdf-api.js";
import { MAX_REPORT_PDF_BYTES } from "../../smart-reports/src/report-pdf.js";
/** Dedicated bounded transport: no redirects, no PDF decoding as JSON/text,
 * and no caller-controlled download paths outside the report namespace. */
export function createReportBinaryTransport(input: {
  baseUrl: string;
  fetchImpl: typeof fetch;
  credentials?: RequestCredentials;
}): ReportBinaryHttpClient {
  return {
    async requestBinary(request) {
      if (
        !/^\/v1\/organizations\/[0-9a-f-]{36}\/reports\/[0-9a-f-]{36}\/pdf\/file$/i.test(
          request.path
        ) ||
        !Number.isInteger(request.maxBytes) ||
        request.maxBytes < 1 ||
        request.maxBytes > MAX_REPORT_PDF_BYTES
      )
        throw new ReportApiError(400, "invalid_report_pdf_request");
      const base = input.baseUrl.replace(/\/+$/, "");
      if (base) {
        const url = new URL(base);
        if (
          !["http:", "https:"].includes(url.protocol) ||
          url.username ||
          url.password ||
          url.search ||
          url.hash
        )
          throw new ReportApiError(400, "invalid_report_pdf_base_url");
      }
      const response = await input.fetchImpl(`${base}${request.path}`, {
        method: "GET",
        headers: {
          accept: "application/pdf",
          ...(request.bearerToken ? { authorization: `Bearer ${request.bearerToken}` } : {})
        },
        redirect: "error",
        signal: AbortSignal.timeout(30000),
        ...(input.credentials === undefined ? {} : { credentials: input.credentials })
      });
      const reader = response.body?.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      if (reader) {
        try {
          while (true) {
            const item = await reader.read();
            if (item.done) break;
            length += item.value.byteLength;
            if (length > request.maxBytes) {
              await reader.cancel();
              throw new ReportApiError(502, "report_pdf_download_limit_exceeded");
            }
            chunks.push(item.value);
          }
        } finally {
          reader.releaseLock();
        }
      }
      const body = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.length;
      }
      return { status: response.status, body, contentType: response.headers.get("content-type") };
    }
  };
}
