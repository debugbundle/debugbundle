import { z } from "zod";
import { isSelfHostMode } from "../../shared-types/src/tier-capabilities.js";
import {
  REPORT_AI_MONTHLY_BUDGET_NANO_USD,
  maximumReportRunCost,
  type ReportAttemptProfile
} from "./model-cost.js";
import { reportModelProfile } from "./model-request.js";
import { createReportModelClient, type ReportModelClient } from "./model-client.js";
export interface ReportRuntimeConfiguration {
  enabled: boolean;
  profile: ReportAttemptProfile | null;
  model: ReportModelClient | null;
  monthly_budget_nano_usd: number;
}
/** Optional AI configuration never makes core debugging startup depend on a
 * provider. Invalid/missing keys or budgets keep reporting factual-only. The
 * returned configuration contains no serialisable credential field. */
export function configureSmartReports(env: NodeJS.ProcessEnv): ReportRuntimeConfiguration {
  const enabled = env["SMART_REPORTS_ENABLED"] === "true";
  const parsed = z.coerce
    .number()
    .int()
    .safe()
    .nonnegative()
    .max(isSelfHostMode() ? 1_000_000_000_000 : REPORT_AI_MONTHLY_BUDGET_NANO_USD)
    .safeParse(env["SMART_REPORT_AI_MONTHLY_BUDGET_NANO_USD"] ?? REPORT_AI_MONTHLY_BUDGET_NANO_USD);
  const budget = parsed.success ? parsed.data : REPORT_AI_MONTHLY_BUDGET_NANO_USD;
  let profile: ReportAttemptProfile | null = null,
    model: ReportModelClient | null = null;
  const selected = reportModelProfile("gpt-6.1-terra");
  if (
    enabled &&
    env["SMART_REPORT_AI_ENABLED"] === "true" &&
    parsed.success &&
    budget >= maximumReportRunCost(selected).run_nano_usd
  ) {
    try {
      model = createReportModelClient({ apiKey: env["SMART_REPORT_AI_API_KEY"] ?? "" });
      profile = selected;
    } catch {
      /* Unconfigured optional AI is an explicit factual report state. */
    }
  }
  return { enabled, profile, model, monthly_budget_nano_usd: budget };
}
