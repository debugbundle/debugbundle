import { z } from "zod";
import { ReportPdfStateResponseSchema } from "../../../packages/smart-reports/src/report-pdf.js";
import { ReportRunMutationSchema } from "../../../packages/smart-reports/src/report-run-api-contract.js";
import { apiError } from "./openapi-components.js";
import { anyMemberAuth, component, type OperationSpec } from "./openapi-model.js";
const path = "/v1/organizations/{organizationId}/reports/{runId}/pdf";
const params = z.object({ organizationId: z.uuid(), runId: z.uuid() }).strict();
const metadata = { tags: ["Smart Reports"], security: anyMemberAuth, params };
const failures = {
  "400": { description: "Invalid identity or expected organisation.", schema: apiError },
  "401": { description: "Member authentication required.", schema: apiError },
  "403": {
    description: "Current whole-scope reader or credential access denied.",
    schema: apiError
  },
  "404": {
    description: "Report expired, deleted, unavailable or privacy-invalidated.",
    schema: apiError
  },
  "409": { description: "PDF not ready, or stale organisation/report state.", schema: apiError },
  "429": {
    description: "Management request limit or PDF retry cooldown exceeded.",
    schema: apiError
  },
  "500": { description: "PDF operation failed safely.", schema: apiError }
};
const state = {
  description: "Private preparation status; no object key or provider details.",
  schema: component("ReportPdfStateResponse", ReportPdfStateResponseSchema)
};
export function reportPdfOperations(): OperationSpec[] {
  return [
    {
      ...metadata,
      method: "get",
      path,
      operationId: "getReportPdf",
      summary: "Read authenticated report PDF cache status",
      responses: { ...failures, "200": state }
    },
    {
      ...metadata,
      method: "post",
      path,
      operationId: "prepareReportPdf",
      summary: "Coalesce private PDF preparation without another AI call or generation charge",
      requestBody: component("PrepareReportPdf", ReportRunMutationSchema),
      responses: { ...failures, "200": state, "202": state }
    },
    {
      ...metadata,
      method: "get",
      path: `${path}/file`,
      operationId: "downloadReportPdf",
      summary: "Download a prepared private PDF under current whole-scope reader access",
      responses: {
        ...failures,
        "200": {
          description:
            "Private/no-store PDF attachment, at most five MiB and one hundred A4 pages. Requires authentication; no public sharing or bearer URL.",
          mediaType: "application/pdf",
          schema: component("ReportPdfFile", z.string()),
          headers: {
            "Content-Disposition": {
              description: "Attachment with a server-generated report UUID filename.",
              schema: z.string()
            }
          }
        }
      }
    }
  ];
}
