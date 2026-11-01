import { interpretBundleEvidence } from "../../shared-types/src/evidence-interpretation.js";

/** Explicit restricted allowlist. No cause text, frame paths, source IDs,
 * correlation references or diagnostic payloads cross this projection. */
export function projectEvidenceSummary(bundle: unknown): Record<string, unknown> {
  const evidence = interpretBundleEvidence(bundle);
  return {
    version: evidence.version,
    status: evidence.status,
    captured_at: evidence.captured_at,
    generated_at: evidence.generated_at,
    retained_event_count: evidence.retained_event_count,
    trace_origin: evidence.exception?.trace_origin ?? null,
    exception_node_count: evidence.exception?.node_count ?? null,
    recovery: evidence.recovery,
    passive_observation_count:
      evidence.passive.timing_count +
      evidence.passive.enforced_csp_count +
      evidence.passive.report_only_csp_count,
    unavailable_status_count: evidence.passive.unavailable_status_count,
    facts: evidence.facts,
    possible_causes: evidence.possible_causes,
    importance: evidence.importance,
    next_evidence: evidence.next_evidence
  };
}
