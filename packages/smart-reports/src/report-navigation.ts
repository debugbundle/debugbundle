import { z } from "zod";
export function reportDashboardPath(organizationId: string, runId: string): string {
  return `/reports/${z.uuid().parse(organizationId)}/${z.uuid().parse(runId)}`;
}
/** The origin is operator configuration. No model/source text supplies a destination. */
export function reportDashboardLocation(
  organizationId: string,
  runId: string,
  baseUrl: string
): string {
  const base = new URL(baseUrl);
  if (
    !["http:", "https:"].includes(base.protocol) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  )
    throw new Error("report_dashboard_base_invalid");
  return new URL(reportDashboardPath(organizationId, runId), base).toString();
}
