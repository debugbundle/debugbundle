import reportContracts from "./contracts/report-tool-contracts.json" with { type: "json" };
import { z } from "zod";
import { sanitizeTelemetry } from "../../redaction/src/index.js";
import { ReportModelFactsSchema } from "../../smart-reports/src/model-evidence.js";
import {
  LegacyReportDocumentBase,
  legacyReportDocument,
  type ReportDocument
} from "../../smart-reports/src/report-document.js";
import { ReportRunRecordSchema, type ReportRunRecord } from "../../smart-reports/src/report-run.js";
import { ReportNarrativeSchema } from "../../smart-reports/src/model-narrative.js";

export const OPENAI_REPORT_SCOPE = "debugbundle:reports:read";
export const OPENAI_REPORT_TOOL_NAMES = ["list_reports", "get_report_content"] as const;
const listing = z
  .object({
    limit: z.number().int().min(1).max(25).optional(),
    cursor: z.string().min(1).max(4096).optional()
  })
  .strict();
const identity = z.object({ reportId: z.uuid() }).strict();
const summary = ReportRunRecordSchema.pick({
  id: true,
  name: true,
  status: true,
  privacy_mode: true,
  period: true,
  created_at: true,
  published_at: true,
  expires_at: true
})
  .extend({ project_count: z.number().int().min(1).max(10) })
  .strict();
const document = z
  .object({
    report_id: z.uuid(),
    name: z.string().min(1).max(120),
    expires_at: z.string().datetime(),
    facts: ReportModelFactsSchema,
    narrative: ReportNarrativeSchema.nullable(),
    analysis: LegacyReportDocumentBase.shape.analysis.omit({ request_sha256: true }).strict()
  })
  .strict();
const inputs = { list_reports: listing, get_report_content: identity };
const outputs = {
  list_reports: z
    .object({ reports: z.array(summary).max(25), next_cursor: z.string().nullable() })
    .strict(),
  get_report_content: z.object({ report: document }).strict()
};
type Name = (typeof OPENAI_REPORT_TOOL_NAMES)[number];
export function isOpenAiReportTool(name: string): name is Name {
  return OPENAI_REPORT_TOOL_NAMES.some((value) => value === name);
}
export const OPENAI_REPORT_TOOL_CATALOG = reportContracts.tools;
export function openAiReportSchemas(name: Name): {
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
} {
  return {
    inputSchema: z.toJSONSchema(inputs[name], { target: "draft-2020-12" }),
    outputSchema: z.toJSONSchema(outputs[name], { target: "draft-2020-12" })
  };
}
export function parseOpenAiReportInput(name: Name, value: unknown): Record<string, unknown> {
  try {
    return inputs[name].parse(value);
  } catch {
    throw new Error(`openai_mcp_invalid_input:${name}`);
  }
}
export function validateOpenAiReportOutput(name: Name, value: unknown): unknown {
  return outputs[name].parse(value);
}
/** A mixed report is withheld if current sanitisation would alter its facts or
 * prose. Never return a narrative filtered from a wider canonical document. */
export function projectOpenAiReportOutput(name: Name, value: unknown): unknown {
  const parsed = validateOpenAiReportOutput(name, value),
    encoded = JSON.stringify(parsed);
  if (Buffer.byteLength(encoded) > 524288) throw new Error(`openai_mcp_output_too_large:${name}`);
  const safe = sanitizeTelemetry(parsed, { maxTotalBytes: 524288 });
  if (!safe.ok || JSON.stringify(safe.value) !== encoded)
    throw new Error(`openai_mcp_output_redaction_failed:${name}`);
  return parsed;
}
export function projectOpenAiReportSummary(run: ReportRunRecord): z.infer<typeof summary> {
  return summary.parse({
    id: run.id,
    name: run.name,
    status: run.status,
    privacy_mode: run.privacy_mode,
    period: run.period,
    created_at: run.created_at,
    published_at: run.published_at,
    expires_at: run.expires_at,
    project_count: run.scope.length
  });
}
export function projectOpenAiReportDocument(value: ReportDocument): z.infer<typeof document> {
  value = legacyReportDocument(value);
  return document.parse({
    report_id: value.run_id,
    name: value.name,
    expires_at: value.report.expires_at,
    facts: value.report.facts,
    narrative: value.narrative,
    analysis: {
      status: value.analysis.status,
      reason: value.analysis.reason,
      model: value.analysis.model
    }
  });
}
