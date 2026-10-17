import {
  describeBrowserResource,
  describeBrowserResourceInterruption,
  type BrowserResource
} from "./browser-resource.js";
import type { CaptureRuleMatcher } from "./capture-rule-schemas.js";
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
  const suggestions: CaptureRuleSuggestion[] = [];
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
    suggestions.push({
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
    });
  }
  const opacity =
    typeof input.browserEvent === "object" &&
    input.browserEvent !== null &&
    "opaque" in input.browserEvent &&
    typeof input.browserEvent.opaque === "boolean"
      ? input.browserEvent.opaque
      : undefined;
  const matcher: CaptureRuleMatcher =
    resource?.host != null &&
    resource.type !== null &&
    input.service !== undefined &&
    input.environment !== undefined &&
    opacity !== undefined
      ? {
          event_types: ["frontend_exception"],
          browser_event_kind: "resource_error",
          browser_event_opaque: opacity,
          browser_target_tag_name: resource.type,
          services: [input.service],
          environments: [input.environment],
          resource_url: { host: resource.host, path_equals: resource.path }
        }
      : {
          event_types: ["frontend_exception"],
          // Service is a separate incident key and is not included in its fingerprint.
          ...(input.service === undefined ? {} : { services: [input.service] }),
          ...(input.environment === undefined ? {} : { environments: [input.environment] }),
          fingerprint: {
            version: input.incident.fingerprint_version,
            value: input.incident.fingerprint
          }
        };
  const exactFingerprint = matcher.fingerprint !== undefined;
  const subject = exactFingerprint
    ? "this exact fingerprint"
    : (resource?.provider ?? "this resource");
  const failures = exactFingerprint
    ? "matches for this fingerprint"
    : `${resource?.provider ?? "this resource's"} failures`;
  const caution = resourceCaution(resource);
  return suggestions.concat(
    (["demote", "drop"] as const).map((action) => ({
      suggestion_id: exactFingerprint
        ? `exact_fingerprint_${action}`
        : action === "demote"
          ? "resource_context"
          : "resource_drop",
      label: action === "demote" ? `Keep ${failures} as context` : `Stop capturing ${failures}`,
      recommended_action: action,
      confidence:
        resource?.optional_candidate === true && !exactFingerprint
          ? ("medium" as const)
          : ("low" as const),
      reason: `${caution} ${exactFingerprint ? "Resource evidence is incomplete; match this fingerprint within the service and environment shown below. " : ""}${
        action === "demote"
          ? "Retain future matches as context without opening incidents, alerts or automation. Context may still count toward paid usage."
          : "Discard future matches only if they have no diagnostic value. Existing incidents and artifacts stay available."
      }`,
      requires_confirmation: true,
      created_rule_id: null,
      created_rule_enabled: null,
      rule: {
        name: `${action === "demote" ? "Keep as context" : "Stop capturing"}: ${subject}`,
        description:
          "Operator-approved browser resource capture policy; dependency importance is application-specific.",
        enabled: true,
        action,
        matcher,
        sample_rate: null,
        sample_event_class: null,
        created_by_user_id: null,
        created_from_incident_id: input.incident.incident_id,
        created_from_event_id: null,
        expires_at: null
      }
    }))
  );
}

function resourceCaution(resource: BrowserResource | null): string {
  if (resource?.role === "authentication")
    return "This resource supports authentication; hiding its failures can conceal sign-in problems.";
  if (resource?.first_party === true)
    return "This is an application resource; confirm its failure does not hide broken functionality.";
  if (resource?.provider != null)
    return "Provider recognition does not establish that this dependency is optional; it may affect application behavior.";
  return "This dependency's importance is unknown; confirm the impact before changing capture.";
}
