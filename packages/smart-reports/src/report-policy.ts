import { getTierCapabilities, isSelfHostMode } from "../../shared-types/src/tier-capabilities.js";
import { SmartReportError } from "./report-errors.js";
import type { ReportPeriod } from "./report-period.js";
export type ReportProductMode = "factual" | "ai";
/** Provider availability never decides product entitlement. Saved factual
 * definitions stay factual on upgrade; a new AI definition is explicit. */
export function reportPolicy(
  plan: string | undefined,
  selfHosted = isSelfHostMode()
): ReturnType<typeof getTierCapabilities> & {
  available: boolean;
  ai: boolean;
  cadences: ReportPeriod["kind"][];
} {
  const caps = selfHosted
    ? {
        ...getTierCapabilities(plan),
        smart_reports: true,
        monthly_smart_report_generations: 1_000_000,
        max_smart_report_definitions: 100,
        max_smart_report_projects: 10,
        max_smart_report_recipients: 10
      }
    : getTierCapabilities(plan);
  return {
    ...caps,
    available: selfHosted || caps.smart_reports,
    ai: selfHosted || plan === "business",
    cadences: (selfHosted || plan === "business"
      ? ["daily", "weekly", "monthly"]
      : plan === "team"
        ? ["weekly", "monthly"]
        : plan === "solo"
          ? ["monthly"]
          : []) as ReportPeriod["kind"][]
  };
}
export function requireReportPolicy(
  plan: string,
  definition: {
    cadence: ReportPeriod["kind"];
    projects: number;
    recipients: number;
    mode?: ReportProductMode;
  }
): void {
  const policy = reportPolicy(plan);
  if (
    !policy.available ||
    (definition.mode === "ai" && !policy.ai) ||
    !policy.cadences.includes(definition.cadence) ||
    definition.projects > policy.max_smart_report_projects ||
    definition.recipients > policy.max_smart_report_recipients
  )
    throw new SmartReportError("upgrade_required");
}
