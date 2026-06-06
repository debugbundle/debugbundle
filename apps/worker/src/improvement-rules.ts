import { isLowValueExternalProbeRequestFailure404 } from "../../../packages/shared-types/src/index.js";

export interface ImprovementRuleThresholds {
  occurrence_threshold: number;
  slow_request_duration_threshold_ms: number;
}

export function getImprovementRuleThresholds(value: "high_confidence" | "balanced" | "verbose"): ImprovementRuleThresholds {
  switch (value) {
    case "high_confidence":
      return {
        occurrence_threshold: 10,
        slow_request_duration_threshold_ms: 2_500
      };
    case "verbose":
      return {
        occurrence_threshold: 3,
        slow_request_duration_threshold_ms: 1_000
      };
    default:
      return {
        occurrence_threshold: 5,
        slow_request_duration_threshold_ms: 1_500
      };
  }
}

export function createHostedImprovementConfidence(occurrenceCount: number, threshold: number): number {
  const progress = Math.min(1, occurrenceCount / Math.max(threshold * 2, 1));
  return Math.round((0.55 + progress * 0.35) * 100) / 100;
}

export function createHostedImprovementSeverity(occurrenceCount: number): "medium" | "high" {
  return occurrenceCount >= 10 ? "high" : "medium";
}

export function createHostedRequestFailureSeverity(responseStatus: number, occurrenceCount: number): "medium" | "high" {
  return responseStatus >= 500 || occurrenceCount >= 10 ? "high" : "medium";
}

export function createHostedSlowRequestSeverity(durationMs: number, thresholdMs: number, occurrenceCount: number): "medium" | "high" {
  return durationMs >= thresholdMs * 2 || occurrenceCount >= 10 ? "high" : "medium";
}

export function isLowValueRequestFailure404(input: {
  httpMethod: string;
  routeTemplate: string;
  responseStatus: number;
}): boolean {
  return isLowValueExternalProbeRequestFailure404(input);
}
