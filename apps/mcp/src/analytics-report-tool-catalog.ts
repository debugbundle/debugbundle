import { z } from "zod";
import {
  AnalyticsReportInputSchema,
  AnalyticsReportRecentInputSchema,
  AnalyticsReportRequestSchema
} from "../../cli/src/analytics-report-api.js";

const bearerToken = z.string().min(1).max(4096);
const absolute = AnalyticsReportInputSchema.innerType().shape;
const inputSchema = z
  .object({
    projectId: absolute.projectId,
    reportKey: absolute.reportKey,
    from: absolute.from.optional(),
    to: absolute.to.optional(),
    last: AnalyticsReportRecentInputSchema.shape.last.optional(),
    bearerToken
  })
  .strict()
  .superRefine((value, ctx) => {
    const query = {
      projectId: value.projectId,
      reportKey: value.reportKey,
      ...(value.from === undefined ? {} : { from: value.from }),
      ...(value.to === undefined ? {} : { to: value.to }),
      ...(value.last === undefined ? {} : { last: value.last })
    };
    if (!AnalyticsReportRequestSchema.safeParse(query).success)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid report window." });
  });
export const ANALYTICS_REPORT_MCP_TOOL_CATALOG = [
  {
    name: "analytics_report_query",
    group: "analytics_reports",
    description:
      "Read a current project ordered-funnel report with owner/admin access. Source coverage is currently unverified and result quality is partial or unavailable. The default V2 report service is disabled.",
    inputSchema
  }
] as const;
export const ANALYTICS_REPORT_MCP_TOOL_NAMES = ANALYTICS_REPORT_MCP_TOOL_CATALOG.map(
  (tool) => tool.name
);
