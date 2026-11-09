import { gunzipSync } from "node:zlib";
import { z } from "zod";
import { BundleV1Schema } from "../../shared-types/src/index.js";
import { redactReportData } from "./report-redaction.js";
const ExpectedSchema = z
  .object({
    origin_project_id: z.uuid(),
    source_id: z.uuid(),
    source_type: z.enum(["incident", "improvement"]),
    generation_number: z.number().int().positive(),
    source_content_at: z.string().datetime(),
    cutoff_at: z.string().datetime()
  })
  .strict();
export const MAX_REPORT_BUNDLE_BYTES = 524288;
function text(value: string, limit: number): string {
  let result = "";
  for (const character of value) {
    if (result.length + character.length > limit) break;
    result += character;
  }
  return result;
}
/** Existing bundle context is untrusted evidence, never an instruction or an
 * action already performed. No request bodies, headers, stacks, environment
 * values or arbitrary probe payloads enter the reusable report excerpt. */
export function projectReportBundleContext(
  compressed: Buffer,
  rawExpected: z.input<typeof ExpectedSchema>
): { title: string; context: string; generation_number: number } | null {
  const expected = ExpectedSchema.safeParse(rawExpected);
  if (!expected.success || compressed.byteLength > MAX_REPORT_BUNDLE_BYTES) return null;
  try {
    const bundle = BundleV1Schema.parse(
      JSON.parse(gunzipSync(compressed, { maxOutputLength: 1024 * 1024 }).toString("utf8"))
    );
    const input = expected.data,
      cutoff = Date.parse(input.cutoff_at),
      content = Date.parse(input.source_content_at);
    if (
      bundle.project.id !== input.origin_project_id ||
      bundle.bundle_type !== (input.source_type === "incident" ? "failure" : "improvement") ||
      bundle.bundle_id !==
        `${input.source_type === "incident" ? "bnd" : "improvement_bundle"}_${input.source_id}` ||
      bundle.metadata.generation_number !== input.generation_number ||
      Date.parse(bundle.metadata.updated_at) !== content ||
      content > cutoff ||
      Date.parse(bundle.metadata.created_at) > content ||
      Date.parse(bundle.captured_at) > cutoff ||
      Date.parse(bundle.signal.last_seen_at) > cutoff
    )
      return null;
    const parts = [
      `Service context: ${text(bundle.service.name, 80)}; runtime ${text(bundle.service.runtime ?? "unavailable", 80)}; framework ${text(bundle.service.framework ?? "unavailable", 80)}.`,
      `Bundle summary: ${text(bundle.summary.description, 600)}`
    ];
    if (bundle.context.error)
      parts.push(
        `Error: ${text(bundle.context.error.name, 100)}: ${text(bundle.context.error.message, 350)}`
      );
    if (bundle.summary.likely_cause)
      parts.push(
        `Bundle inference: ${text(bundle.summary.likely_cause, 300)} (tentative, not verified causation).`
      );
    if (bundle.summary.recommended_action)
      parts.push(
        `Suggested next step: ${text(bundle.summary.recommended_action, 250)} (not performed by this report).`
      );
    const request = bundle.context.request,
      response = bundle.context.response;
    if (request || response)
      parts.push(
        `Observed request: ${request?.method ?? "unknown method"} ${text(request?.route_template ?? "route unavailable", 160)}; HTTP status ${response?.status_code ?? "unavailable"}.`
      );
    if (bundle.context.recovery)
      parts.push(
        `Bounded recovery evidence: ${bundle.context.recovery.outcome}; truncated=${String(bundle.context.recovery.truncated)}. This does not establish a causal fix.`
      );
    if (bundle.impact.customer_visible)
      parts.push(
        "The source bundle marks this signal as customer-visible; period-wide impact is not established by this flag."
      );
    for (const item of (bundle.context.logs?.items ?? [])
      .filter((item) => ["warn", "warning", "error", "fatal"].includes(item.level))
      .slice(0, 2))
      parts.push(`Captured ${item.level} log excerpt: ${text(item.message, 150)}`);
    const safe = z
      .object({ title: z.string(), parts: z.array(z.string()) })
      .strict()
      .parse(redactReportData({ title: text(bundle.summary.title, 4096), parts }, 128 * 1024));
    return {
      title: text(safe.title, 160),
      context: text(safe.parts.join("\n"), 1600),
      generation_number: input.generation_number
    };
  } catch {
    return null;
  }
}
