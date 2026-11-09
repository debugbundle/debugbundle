import { z } from "zod";
import {
  ReportPdfStateResponseSchema,
  MAX_REPORT_PDF_BYTES,
  isReportPdfBytes,
  type ReportPdfState
} from "../../smart-reports/src/report-pdf.js";
import { ReportRunMutationSchema } from "../../smart-reports/src/report-run-api-contract.js";
import {
  createReportRequest,
  reportPayload,
  reportResourceId,
  ReportApiError,
  type ReportHttpClient,
  type ReportScope
} from "./http.js";
export interface ReportBinaryHttpClient {
  requestBinary(input: {
    method: "GET";
    path: string;
    bearerToken: string;
    maxBytes: number;
  }): Promise<{ status: number; body: Uint8Array; contentType: string | null }>;
}
export type ReportPdfIdentity = ReportScope & { runId: string };
export interface ReportPdfApi {
  status(input: ReportPdfIdentity): Promise<ReportPdfState>;
  request(input: ReportPdfIdentity & { expectedOrganizationId?: string }): Promise<ReportPdfState>;
  download(input: ReportPdfIdentity): Promise<Uint8Array>;
}
const base = (input: Pick<ReportPdfIdentity, "organizationId" | "runId">): string =>
  `/v1/organizations/${reportResourceId(input.organizationId)}/reports/${reportResourceId(input.runId)}/pdf`;
export const reportPdfDownloadPath = (
  input: Pick<ReportPdfIdentity, "organizationId" | "runId">
): string => `${base(input)}/file`;
export function createReportPdfApi(
  client: ReportHttpClient & Partial<ReportBinaryHttpClient>
): ReportPdfApi {
  const request = createReportRequest(client);
  return {
    async status(input) {
      return (await request(input, "GET", base(input), ReportPdfStateResponseSchema)).pdf;
    },
    async request(input) {
      return (
        await request(
          input,
          "POST",
          base(input),
          ReportPdfStateResponseSchema,
          reportPayload(
            ReportRunMutationSchema,
            input.expectedOrganizationId === undefined
              ? {}
              : { expected_organization_id: input.expectedOrganizationId }
          )
        )
      ).pdf;
    },
    async download(input) {
      const path = reportPdfDownloadPath(input);
      if (!client.requestBinary) throw new ReportApiError(500, "report_pdf_transport_unavailable");
      const result = await client.requestBinary({
        method: "GET",
        path,
        bearerToken: input.bearerToken,
        maxBytes: MAX_REPORT_PDF_BYTES
      });
      if (result.status < 200 || result.status >= 300) {
        let code = "report_pdf_unavailable";
        try {
          const error = z
            .object({ error: z.string().max(200) })
            .safeParse(JSON.parse(new TextDecoder().decode(result.body)));
          if (error.success) code = error.data.error;
        } catch {
          /* Generic failure contains no response content. */
        }
        throw new ReportApiError(result.status, code);
      }
      if (
        !(result.body instanceof Uint8Array) ||
        result.contentType?.split(";")[0]?.trim().toLowerCase() !== "application/pdf" ||
        !isReportPdfBytes(result.body)
      )
        throw new ReportApiError(502, "invalid_report_pdf_response");
      return result.body;
    }
  };
}
