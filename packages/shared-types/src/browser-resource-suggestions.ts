import { describeBrowserResource } from "./browser-resource.js";
import type {
  CaptureRuleSuggestion,
  CaptureRuleSuggestionIncident
} from "./capture-rule-suggestions.js";

export function buildBrowserResourceSuggestions(input: {
  browserEvent: unknown;
  service: string | undefined;
  environment: string | undefined;
  incident: CaptureRuleSuggestionIncident;
}): CaptureRuleSuggestion[] {
  const resource = describeBrowserResource(input.browserEvent);
  if (
    !resource?.optional_candidate ||
    resource.host === null ||
    input.service === undefined ||
    input.environment === undefined
  )
    return [];
  const { service, environment } = input;
  const { host } = resource;
  return (["demote", "drop"] as const).map((action) => ({
    suggestion_id: action === "demote" ? "resource_context" : "resource_drop",
    label:
      action === "demote"
        ? `Keep ${resource.provider} failures as context`
        : `Stop capturing ${resource.provider} failures`,
    recommended_action: action,
    confidence: "medium",
    reason:
      action === "demote"
        ? "If this dependency is optional for your app, retain future matching events as context without opening incidents, alerts or automation. Context may still count toward paid usage."
        : "Only use this if this dependency is optional and future matching failures have no diagnostic value. Matching events will be discarded; existing incidents and artifacts are unchanged.",
    requires_confirmation: true,
    created_rule_id: null,
    created_rule_enabled: null,
    rule: {
      name: `${action === "demote" ? "Keep as context" : "Stop capturing"}: ${resource.provider}`,
      description: "Operator-approved resource-specific browser noise policy.",
      enabled: true,
      action,
      matcher: {
        event_types: ["frontend_exception"],
        browser_event_kind: "resource_error",
        browser_event_opaque: true,
        services: [service],
        environments: [environment],
        resource_url: { host, path_equals: resource.path }
      },
      sample_rate: null,
      sample_event_class: null,
      created_by_user_id: null,
      created_from_incident_id: input.incident.incident_id,
      created_from_event_id: null,
      expires_at: null
    }
  }));
}
