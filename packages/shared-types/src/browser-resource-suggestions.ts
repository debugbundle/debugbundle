import {
  describeBrowserResource,
  describeBrowserResourceInterruption
} from "./browser-resource.js";
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
  const interruption = describeBrowserResourceInterruption(input.browserEvent);
  if (
    resource?.first_party === true &&
    resource.role === "application_asset" &&
    /\.(?:m?js|css)$/i.test(resource.path) &&
    resource.host !== null &&
    interruption !== null &&
    input.service !== undefined &&
    input.environment !== undefined
  ) {
    const parentSlash = resource.path.lastIndexOf("/");
    const pathMatcher =
      parentSlash > 0
        ? { path_prefix: resource.path.slice(0, parentSlash + 1) }
        : { path_equals: resource.path };
    return [
      {
        suggestion_id: "hidden_preload_demote",
        label: "Keep hidden-page preload interruptions as context",
        recommended_action: "demote",
        confidence: "medium",
        reason:
          "The browser reported an opaque preload failure while the page was hidden and had not completed loading. This is consistent with an interruption but does not prove an abort. Review the asset scope before retaining matching failures as context; visible or completed-page asset failures do not match this rule.",
        requires_confirmation: true,
        created_rule_id: null,
        created_rule_enabled: null,
        rule: {
          name: "Keep hidden-page preload interruptions as context",
          description:
            "Retain matching first-party speculative-load failures as context while the browser page is hidden and incomplete; an abort is not proven.",
          enabled: true,
          action: "demote",
          matcher: {
            event_types: ["frontend_exception"],
            services: [input.service],
            environments: [input.environment],
            first_party: true,
            browser_event_kind: "resource_error",
            browser_event_opaque: true,
            browser_page_visibility_state: interruption.visibility_state,
            browser_page_ready_state: interruption.ready_state,
            browser_target_tag_name: interruption.target_tag_name,
            browser_target_attributes: { rel: interruption.rel },
            resource_url: { host: resource.host, ...pathMatcher }
          },
          sample_rate: null,
          sample_event_class: null,
          created_by_user_id: null,
          created_from_incident_id: input.incident.incident_id,
          created_from_event_id: null,
          expires_at: null
        }
      }
    ];
  }
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
