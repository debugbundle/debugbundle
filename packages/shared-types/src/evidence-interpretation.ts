import { z } from "zod";
import {
  BundleEvidenceSchema,
  BundleRecoverySchema,
  BundleResourceObservationsSchema
} from "./bundle-evidence.js";
import { ExceptionEvidenceV1Schema } from "./exception-evidence.js";

export const EvidenceInterpretationSchema = z
  .object({
    version: z.literal(1),
    status: z.enum(["unavailable", "legacy", "partial", "observed"]),
    primary_event_id: z.string().nullable(),
    captured_at: z.string().datetime().nullable(),
    generated_at: z.string().datetime().nullable(),
    retained_event_count: z.number().int().nonnegative().nullable(),
    retained_first_at: z.string().datetime().nullable(),
    retained_last_at: z.string().datetime().nullable(),
    exception: z
      .object({
        source: z.enum(["sdk", "retained_stack", "unknown"]),
        node_count: z.number().int().min(1).max(8),
        trace_origin: z.enum([
          "throw",
          "native_fatal",
          "capture",
          "runtime_reported",
          "unavailable",
          "unknown"
        ]),
        parsing_status: z.enum(["parsed", "partial", "unparsed", "unavailable", "truncated"]),
        truncated: z.boolean(),
        limitation: z.enum(["unknown", "unsupported", "unsafe", "budget_exceeded"]).nullable()
      })
      .strict()
      .nullable(),
    recovery: z.enum(["unknown", "recovered", "persisted", "conflicting"]),
    passive: z
      .object({
        timing_count: z.number().int().min(0).max(10),
        unavailable_status_count: z.number().int().min(0).max(10),
        enforced_csp_count: z.number().int().min(0).max(10),
        report_only_csp_count: z.number().int().min(0).max(10),
        observed_statuses: z.array(z.number().int().min(100).max(599)).max(10)
      })
      .strict(),
    facts: z.array(z.string().max(512)).max(8),
    possible_causes: z.array(z.string().max(512)).max(3),
    importance: z.string().max(512),
    next_evidence: z.array(z.string().max(512)).max(6)
  })
  .strict();
export type EvidenceInterpretation = z.infer<typeof EvidenceInterpretationSchema>;
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function timestamp(value: unknown): string | null {
  const parsed = z.string().datetime().safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Interpret retained normalised JSON only. Absence cannot prove SDK support,
 * delivery, instrumentation coverage or a measurement on another occurrence. */
export function interpretBundleEvidence(body: unknown): EvidenceInterpretation {
  const bundle = record(body),
    context = record(bundle["context"]),
    error = record(context["error"]);
  const evidence = BundleEvidenceSchema.safeParse(context["evidence"]),
    graph = ExceptionEvidenceV1Schema.safeParse(error["exception_evidence"]);
  const recovery = BundleRecoverySchema.safeParse(context["recovery"]),
    resources = BundleResourceObservationsSchema.safeParse(context["resource_observations"]);
  const root = graph.success
    ? graph.data.nodes.find((node) => node.id === graph.data.root_id)
    : undefined;
  const facts: string[] = [],
    possibleCauses: string[] = [],
    next: string[] = [];
  const capturedAt = timestamp(bundle["captured_at"]),
    generatedAt = timestamp(record(bundle["metadata"])["updated_at"]);
  const source =
    error["exception_evidence_source"] === "sdk" ||
    error["exception_evidence_source"] === "retained_stack"
      ? error["exception_evidence_source"]
      : "unknown";
  const exception: EvidenceInterpretation["exception"] =
    graph.success && root
      ? {
          source,
          node_count: graph.data.nodes.length,
          trace_origin: root.trace_origin,
          parsing_status: root.parsing_status,
          truncated: graph.data.truncated,
          limitation: graph.data.unavailable_reason
        }
      : null;
  const passive: EvidenceInterpretation["passive"] = {
    timing_count: 0,
    unavailable_status_count: 0,
    enforced_csp_count: 0,
    report_only_csp_count: 0,
    observed_statuses: []
  };
  for (const { observation } of resources.success ? resources.data.items : []) {
    if (observation.kind === "timing") {
      passive.timing_count++;
      if (observation.response_status === null) passive.unavailable_status_count++;
      else if (observation.availability === "observed")
        passive.observed_statuses.push(observation.response_status);
    } else if (observation.disposition === "enforce") passive.enforced_csp_count++;
    else passive.report_only_csp_count++;
  }
  passive.observed_statuses = [...new Set(passive.observed_statuses)].sort(
    (left, right) => left - right
  );
  const recoveryOutcome = recovery.success ? recovery.data.outcome : "unknown";
  if (evidence.success)
    facts.push(
      `${evidence.data.retained_event_count} retained inputs describe this artifact; the count does not represent all incident occurrences.`
    );
  else facts.push("Retained input coverage is unknown for this artifact.");
  facts.push("Artifact generation time does not establish a new failure or a new measurement.");
  if (source === "retained_stack")
    facts.push(
      "Structured locations were interpreted from retained stack text; no new runtime measurement was taken."
    );
  if (exception?.trace_origin === "capture")
    facts.push(
      "The available trace was captured while reporting the error; it is not a throw-site trace."
    );
  if (recoveryOutcome === "unknown")
    facts.push(
      "Application recovery is unknown. HTTP completion and missing terminal observations do not establish recovery."
    );
  else if (recoveryOutcome === "conflicting")
    facts.push(
      "Explicit recovery and persistent-failure observations conflict; both remain retained."
    );
  else
    facts.push(
      recoveryOutcome === "recovered"
        ? "Explicit application recovery was observed within the failure scope; incident status is unchanged."
        : "An explicit persistent-failure observation was retained; incident status is unchanged."
    );
  if (passive.report_only_csp_count > 0)
    facts.push("Report-only CSP observations do not establish that a resource was blocked.");
  if (passive.enforced_csp_count > 0)
    possibleCauses.push(
      "An enforced CSP observation may explain a resource failure; temporal association does not prove causation."
    );
  if (passive.unavailable_status_count > 0)
    next.push(
      "Check resource timing and browser exposure restrictions; an unavailable status is not HTTP success or failure."
    );
  const probeItems = record(context["probe_data"])["items"];
  if (Array.isArray(probeItems) && probeItems.length === 0) {
    facts.push(
      "No matching retained probe observations are present; this does not establish activation delivery or instance coverage."
    );
    next.push(
      "Check the probe label, instrumentation, activation scope, expiry and instance delivery before repeating a bounded operation."
    );
  }
  if (exception === null || ["unknown", "unavailable", "capture"].includes(exception.trace_origin))
    next.push(
      "Capture a supported throw-site or native fatal trace during a bounded reproduction when available."
    );
  if (exception?.truncated || exception?.limitation)
    next.push(
      "Inspect the stated collection limit before requesting additional cause or frame evidence."
    );
  if (recoveryOutcome === "unknown" || recoveryOutcome === "conflicting")
    next.push(
      "Record an explicit application recovery or persistent-failure observation for the same failure scope."
    );
  const malformed = [
    { value: context["evidence"], valid: evidence.success },
    { value: error["exception_evidence"], valid: graph.success },
    { value: context["recovery"], valid: recovery.success },
    { value: context["resource_observations"], valid: resources.success }
  ].some(({ value, valid }) => value !== undefined && !valid);
  const status: EvidenceInterpretation["status"] =
    capturedAt === null
      ? "unavailable"
      : malformed
        ? "partial"
        : !evidence.success
          ? "legacy"
          : exception === null ||
              exception.source !== "sdk" ||
              ["unknown", "unavailable", "capture"].includes(exception.trace_origin) ||
              exception.truncated ||
              exception.limitation !== null ||
              recoveryOutcome === "conflicting" ||
              passive.unavailable_status_count > 0
            ? "partial"
            : "observed";
  return {
    version: 1,
    status,
    primary_event_id: evidence.success ? evidence.data.primary_event_id : null,
    captured_at: capturedAt,
    generated_at: generatedAt,
    retained_event_count: evidence.success ? evidence.data.retained_event_count : null,
    retained_first_at: evidence.success ? evidence.data.retained_first_at : null,
    retained_last_at: evidence.success ? evidence.data.retained_last_at : null,
    exception,
    recovery: recoveryOutcome,
    passive,
    facts: facts.slice(0, 8),
    possible_causes: possibleCauses,
    importance:
      "Use evidence from the primary occurrence to assess the failure. Recovery observations do not resolve or regress an incident automatically.",
    next_evidence: next.slice(0, 6)
  };
}
