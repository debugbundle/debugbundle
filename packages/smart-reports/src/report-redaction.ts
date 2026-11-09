import { sanitizeTelemetry } from "../../redaction/src/index.js";

function withholdAddresses(value: unknown): unknown {
  if (typeof value === "string")
    return value
      .replace(/\bhttps?:\/\/[^\s<>"']+/gi, "[URL withheld]")
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email withheld]");
  if (Array.isArray(value)) return value.map(withholdAddresses);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, withholdAddresses(entry)])
    );
  return value;
}
/** Shared report-only minimisation after the mandatory credential sanitizer.
 * Callers still validate their closed source/egress schema before storage/use. */
export function redactReportData(raw: unknown, maxBytes = 256 * 1024): unknown {
  const sanitised = sanitizeTelemetry(raw, { maxTotalBytes: maxBytes });
  if (!sanitised.ok) throw new Error("report_egress_budget_exceeded");
  return withholdAddresses(sanitised.value);
}
