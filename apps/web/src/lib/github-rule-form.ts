import type { GitHubDispatchRuleRecord } from "./api.js";
import { durationFromSeconds, durationToSeconds, type DurationDraft } from "./duration-form.js";
export interface GitHubRuleDraft {
  name: string;
  eventTypes: string[];
  environments: string[];
  services: string[];
  severity: GitHubDispatchRuleRecord["severity_min"];
  bundleType: GitHubDispatchRuleRecord["bundle_type"];
  incidentStatus: GitHubDispatchRuleRecord["incident_status"];
  cooldown: DurationDraft;
  enabled: boolean;
}
export function githubRuleDraft(rule?: GitHubDispatchRuleRecord): GitHubRuleDraft {
  return {
    name: rule?.name ?? "",
    eventTypes: rule?.event_types ?? ["bundle.created"],
    environments: rule?.environments ?? ["production"],
    services: rule?.services ?? [],
    severity: rule === undefined ? "high" : rule.severity_min,
    bundleType: rule === undefined ? "failure" : rule.bundle_type,
    incidentStatus: rule?.incident_status ?? "new_or_reopened",
    cooldown: durationFromSeconds(rule?.cooldown_seconds ?? 300),
    enabled: rule?.enabled ?? true
  };
}
export function githubRulePayload(draft: GitHubRuleDraft): {
  name: string;
  event_types: string[];
  environments: string[];
  services: string[];
  severity_min?: NonNullable<GitHubDispatchRuleRecord["severity_min"]>;
  bundle_type?: NonNullable<GitHubDispatchRuleRecord["bundle_type"]>;
  incident_status: GitHubDispatchRuleRecord["incident_status"];
  cooldown_seconds: number;
  enabled: boolean;
} {
  const seconds = durationToSeconds(draft.cooldown, 86400);
  if (seconds === null)
    throw new Error("Enter a cooldown between 0 and 86400 seconds, in whole seconds.");
  if (draft.eventTypes.length === 0) throw new Error("Choose at least one event type.");
  if (draft.name.trim().length === 0 || draft.name.length > 200)
    throw new Error("Enter a rule name of 1 to 200 characters.");
  // Nullable legacy read values are preserved by omission: the write contract accepts only explicit scopes.
  return {
    name: draft.name,
    event_types: draft.eventTypes,
    environments: draft.environments,
    services: draft.services,
    ...(draft.severity === null ? {} : { severity_min: draft.severity }),
    ...(draft.bundleType === null ? {} : { bundle_type: draft.bundleType }),
    incident_status: draft.incidentStatus,
    cooldown_seconds: seconds,
    enabled: draft.enabled
  };
}
