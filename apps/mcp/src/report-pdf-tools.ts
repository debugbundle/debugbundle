import { z } from "zod";
import {
  ReportApiError,
  reportPdfDownloadPath,
  type ReportPdfApi
} from "../../../packages/report-client/src/index.js";
import { reportLinkLocation } from "../../../packages/smart-reports/src/report-content.js";
import type { ReportPdfState } from "../../../packages/smart-reports/src/report-pdf.js";

const identity = z
  .object({ bearerToken: z.string().min(1), organizationId: z.uuid(), runId: z.uuid() })
  .strict();
const mutation = identity.extend({ expectedOrganizationId: z.uuid().optional() });
export const REPORT_PDF_MCP_TOOL_NAMES = ["prepare_report_pdf", "get_report_pdf"] as const;
export const REPORT_PDF_MCP_TOOL_CATALOG = [
  {
    name: REPORT_PDF_MCP_TOOL_NAMES[0],
    inputSchema: mutation,
    description:
      "Prepare or reuse a private PDF of the canonical report. Coalesces concurrent requests without another AI call or generation charge. Requires current read access to every frozen origin. Poll get_report_pdf; download links require authentication and expire with the report.",
    read: false
  },
  {
    name: REPORT_PDF_MCP_TOOL_NAMES[1],
    inputSchema: identity,
    description:
      "Read PDF preparation status and an authenticated download location when ready. Returns no PDF bytes or public bearer link. Current whole-scope access is checked again at download, including for retained archives after downgrade.",
    read: true
  }
].map(({ read, ...entry }) => ({
  ...entry,
  group: "reports" as const,
  annotations: {
    readOnlyHint: read,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  }
}));

export function createReportPdfMcpTools(
  api: ReportPdfApi,
  options: { apiBaseUrl: string }
): Record<
  (typeof REPORT_PDF_MCP_TOOL_NAMES)[number],
  (input: Record<string, unknown>) => Promise<unknown>
> {
  const response = (
    input: z.output<typeof identity>,
    pdf: ReportPdfState
  ): { pdf: ReportPdfState; download_url: string | null; requires_authentication: true } => ({
    pdf,
    download_url:
      pdf.status === "ready"
        ? reportLinkLocation(reportPdfDownloadPath(input), options.apiBaseUrl)
        : null,
    requires_authentication: true
  });
  function forward<S extends z.ZodType>(schema: S, run: (input: z.output<S>) => Promise<unknown>) {
    return async (input: Record<string, unknown>): Promise<unknown> => {
      try {
        return await run(schema.parse(input));
      } catch (error) {
        throw new Error(
          `mcp_tool_error:${error instanceof ReportApiError ? error.code : "invalid_report_input"}`
        );
      }
    };
  }
  return {
    prepare_report_pdf: forward(mutation, async (input) =>
      response(
        input,
        await api.request({
          bearerToken: input.bearerToken,
          organizationId: input.organizationId,
          runId: input.runId,
          ...(input.expectedOrganizationId === undefined
            ? {}
            : { expectedOrganizationId: input.expectedOrganizationId })
        })
      )
    ),
    get_report_pdf: forward(identity, async (input) => response(input, await api.status(input)))
  };
}
