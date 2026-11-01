import {
  EvidenceCapabilityValues,
  type ResolvedCapturePolicy
} from "../../../packages/shared-types/src/index.js";

export function requestsEvidenceCapabilities(request: {
  headers: Record<string, unknown>;
  query?: unknown;
}): boolean {
  return (
    request.headers["x-debugbundle-evidence"] === "1" ||
    (typeof request.query === "object" &&
      request.query !== null &&
      "debugbundle_evidence" in request.query &&
      request.query.debugbundle_evidence === "1")
  );
}

export function evidenceCapabilityResponse(
  request: Parameters<typeof requestsEvidenceCapabilities>[0],
  hasDurableReceipts = true
): {
  evidence_capabilities?: {
    version: 1;
    features: Array<(typeof EvidenceCapabilityValues)[number]>;
  };
} {
  return requestsEvidenceCapabilities(request)
    ? {
        evidence_capabilities: {
          version: 1,
          features: hasDurableReceipts ? [...EvidenceCapabilityValues] : []
        }
      }
    : {};
}

export function sdkEvidencePolicy(
  policy: ResolvedCapturePolicy,
  request: Parameters<typeof requestsEvidenceCapabilities>[0]
): ResolvedCapturePolicy {
  const { capture_diagnostic_context, ...legacy } = policy;
  return requestsEvidenceCapabilities(request)
    ? {
        ...legacy,
        capture_diagnostic_context:
          policy.preset !== "minimal" && (capture_diagnostic_context ?? true)
      }
    : legacy;
}
