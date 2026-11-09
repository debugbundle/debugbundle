import type { ReportContentStore } from "../../../packages/storage/src/report-content-store.js";
import type { ReportRunManagementStore } from "../../../packages/storage/src/report-run-management.js";
import type {
  OpenAiHostedOperations,
  OpenAiMcpPrincipal
} from "../../../packages/mcp-core/src/index.js";
import {
  projectOpenAiReportDocument,
  projectOpenAiReportSummary
} from "../../../packages/mcp-core/src/openai-report-contract.js";
export interface OpenAiReportReadDependencies {
  runs: Pick<ReportRunManagementStore, "list">;
  content: Pick<ReportContentStore, "read">;
}
export function createOpenAiReportOperations(
  readers: OpenAiReportReadDependencies | undefined
): Pick<OpenAiHostedOperations, "list_reports" | "get_report_content"> {
  function context(
    principal: OpenAiMcpPrincipal
  ): Omit<Parameters<ReportContentStore["read"]>[0], "id"> {
    if (!principal.scopes.includes("debugbundle:reports:read"))
      throw new Error("openai_mcp_reports_scope_required");
    return {
      organization_id: principal.organizationId,
      initiator: {
        version: 1 as const,
        kind: "openai_oauth" as const,
        user_id: principal.userId,
        grant_id: principal.grantId,
        organization_id: principal.organizationId
      }
    };
  }
  function requireReaders(): OpenAiReportReadDependencies {
    if (!readers) throw new Error("openai_mcp_operation_unavailable:reports");
    return readers;
  }
  return {
    async list_reports({ principal, input }) {
      const page = await requireReaders().runs.list({
        ...context(principal),
        ...(typeof input["limit"] === "number" ? { limit: input["limit"] } : {}),
        ...(typeof input["cursor"] === "string" ? { cursor: input["cursor"] } : {})
      });
      return { reports: page.items.map(projectOpenAiReportSummary), next_cursor: page.next_cursor };
    },
    async get_report_content({ principal, input }) {
      if (typeof input["reportId"] !== "string") throw new Error("openai_mcp_invalid_report_id");
      const document = await requireReaders().content.read({
        ...context(principal),
        id: input["reportId"]
      });
      return { report: projectOpenAiReportDocument(document) };
    }
  };
}
