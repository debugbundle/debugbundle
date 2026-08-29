export const ALERT_SEVERITY_LIFECYCLE_SCOPES = [
  "new_incident",
  "incident_regressed",
  "both"
] as const;

export type AlertSeverityLifecycleScope = (typeof ALERT_SEVERITY_LIFECYCLE_SCOPES)[number];
export type AlertSeverityLifecycleEvent = Exclude<AlertSeverityLifecycleScope, "both">;

export function defaultSeverityLifecycleScopeForCondition(
  conditionType: string
): AlertSeverityLifecycleScope | null {
  return conditionType === "severity_threshold" ? "both" : null;
}

export function normalizeSeverityLifecycleScopeForCondition(input: {
  conditionType: string;
  scope?: AlertSeverityLifecycleScope | null | undefined;
}): AlertSeverityLifecycleScope | null {
  if (input.conditionType !== "severity_threshold") {
    return null;
  }

  return input.scope ?? "both";
}

export function matchesSeverityLifecycleScope(input: {
  scope: AlertSeverityLifecycleScope | null;
  lifecycleEvent?: AlertSeverityLifecycleEvent | undefined;
}): boolean {
  if (input.lifecycleEvent === undefined) {
    return true;
  }

  const scope = input.scope ?? "both";
  return scope === "both" || scope === input.lifecycleEvent;
}

export function buildSeverityThresholdDedupeKey(input: {
  severity: "low" | "medium" | "high" | "critical";
  lifecycleEvent: AlertSeverityLifecycleEvent;
  transitionId?: string;
}): string {
  // Preserve the pre-scope key for new incidents so replayed pre-upgrade group jobs stay idempotent.
  if (input.lifecycleEvent === "new_incident") {
    return `severity_threshold:${input.severity}`;
  }

  if (input.transitionId === undefined || input.transitionId.length === 0) {
    throw new Error("alert_regression_transition_id_required");
  }

  // The source event is stable on retry but changes for each later regression of the same incident.
  return `severity_threshold:${input.severity}:${input.lifecycleEvent}:${input.transitionId}`;
}

export function buildRegressionAlertDedupeKey(input: {
  conditionType: "incident_regressed" | "regression_after_deploy";
  transitionId: string;
}): string {
  return `${input.conditionType}:${input.transitionId}`;
}
