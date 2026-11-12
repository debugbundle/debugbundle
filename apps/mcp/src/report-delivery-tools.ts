import { z } from "zod";
import {
  ReportApiError,
  type ReportDeliveryApi
} from "../../../packages/report-client/src/index.js";
const identity = z
  .object({ bearerToken: z.string().min(1), organizationId: z.uuid(), runId: z.uuid() })
  .strict();
export const REPORT_DELIVERY_MCP_TOOL_NAMES = ["list_report_deliveries"] as const;
export const REPORT_DELIVERY_MCP_TOOL_CATALOG = [
  {
    name: REPORT_DELIVERY_MCP_TOOL_NAMES[0],
    group: "reports" as const,
    inputSchema: identity,
    description:
      "Read safe per-recipient report email states under current whole-scope access. Accepted means provider acceptance, not inbox delivery. Uncertain sends are held and never automatically repeated. This read does not send mail, retry work, expose provider receipts or call AI.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  }
];
export function createReportDeliveryMcpTools(
  api: ReportDeliveryApi
): Record<
  (typeof REPORT_DELIVERY_MCP_TOOL_NAMES)[number],
  (input: Record<string, unknown>) => Promise<unknown>
> {
  return {
    async list_report_deliveries(input) {
      try {
        return { deliveries: await api.list(identity.parse(input)) };
      } catch (error) {
        throw new Error(
          `mcp_tool_error:${error instanceof ReportApiError ? error.code : "invalid_report_input"}`
        );
      }
    }
  };
}
