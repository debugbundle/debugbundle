import { z } from "zod";
import { ReportContentViewSchema } from "./report-content.js";
import { reportDashboardPath } from "./report-navigation.js";
export const ReportPdfRenderInputSchema = z
  .object({ view: ReportContentViewSchema, online_report_url: z.string().max(2048).optional() })
  .strict()
  .superRefine((value, context) => {
    if (value.online_report_url === undefined) return;
    try {
      const target = new URL(value.online_report_url);
      if (
        !["http:", "https:"].includes(target.protocol) ||
        target.username ||
        target.password ||
        target.search ||
        target.hash ||
        target.pathname !==
          reportDashboardPath(
            value.view.document.report.organization_id,
            value.view.document.run_id
          )
      )
        throw new Error("invalid");
    } catch {
      context.addIssue({
        code: "custom",
        path: ["online_report_url"],
        message: "report_online_location_invalid"
      });
    }
  });
