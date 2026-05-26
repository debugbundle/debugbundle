import { buildApiUrl, buildBrowserSessionHeaders, InvalidSessionError } from "./api.js";

export type CaptureRuleAction = "demote" | "sample" | "drop";
export type CaptureRuleEventType =
  | "backend_exception"
  | "request_event"
  | "log_event"
  | "frontend_breadcrumb"
  | "frontend_exception"
  | "deploy_metadata"
  | "error_suppressed"
  | "probe_event";
export type CaptureRuleRuntime = "node" | "python" | "php" | "browser";
export type CaptureRuleBrowserEventKind = "window_error" | "resource_error";

export interface CaptureRuleUrlMatcher {
  host?: string;
  host_suffix?: string;
  path_prefix?: string;
  path_equals?: string;
}

export interface CaptureRuleMatcher {
  event_types?: CaptureRuleEventType[];
  services?: string[];
  environments?: string[];
  runtime?: CaptureRuleRuntime[];
  first_party?: boolean;
  error_name?: string;
  message_contains?: string;
  message_equals?: string;
  browser_event_kind?: CaptureRuleBrowserEventKind;
  resource_url?: CaptureRuleUrlMatcher;
  request_url?: CaptureRuleUrlMatcher;
  status_codes?: number[];
  status_ranges?: Array<{ start: number; end: number }>;
  fingerprint?: {
    version: string;
    value: string;
  };
}

export interface ProjectCaptureRule {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  action: CaptureRuleAction;
  matcher: CaptureRuleMatcher;
  sample_rate: number | null;
  sample_event_class: "preserve" | "context" | null;
  created_by_user_id: string | null;
  created_from_incident_id: string | null;
  created_from_event_id: string | null;
  expires_at: string | null;
  hit_count: number;
  last_matched_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectCaptureRulesResponse {
  access_mode: "manage" | "preview";
  rules: ProjectCaptureRule[];
}

export interface ProjectCaptureRuleUpdate {
  name?: string;
  description?: string | null;
  enabled?: boolean;
  action?: CaptureRuleAction;
  matcher?: CaptureRuleMatcher;
  sample_rate?: number | null;
  sample_event_class?: "preserve" | "context" | null;
  expires_at?: string | null;
}

export interface CaptureRuleSuggestion {
  suggestion_id: string;
  label: string;
  recommended_action: CaptureRuleAction;
  confidence: "high" | "medium" | "low";
  reason: string;
  requires_confirmation: boolean;
  rule: {
    name: string;
    description: string | null;
    enabled: boolean;
    action: CaptureRuleAction;
    matcher: CaptureRuleMatcher;
    sample_rate: number | null;
    sample_event_class: "preserve" | "context" | null;
    created_by_user_id: string | null;
    created_from_incident_id: string | null;
    created_from_event_id: string | null;
    expires_at: string | null;
  };
}

export interface CaptureRuleSuggestionsResponse {
  suggestions: CaptureRuleSuggestion[];
  bundle_status?: "ready" | "pending" | "failed";
  bundle_reason?: string | null;
}

async function readCaptureRuleJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (response.status === 401 && body?.error === "invalid_session") {
      throw new InvalidSessionError();
    }

    throw new Error(body?.error ?? `request_failed_${response.status}`);
  }

  return (await response.json()) as T;
}

export async function listProjectCaptureRules(projectId: string): Promise<ProjectCaptureRulesResponse> {
  return await readCaptureRuleJson<ProjectCaptureRulesResponse>(
    await fetch(buildApiUrl(`/v1/projects/${projectId}/capture-rules`), {
      credentials: "include"
    })
  );
}

export async function updateProjectCaptureRule(
  projectId: string,
  ruleId: string,
  update: ProjectCaptureRuleUpdate
): Promise<ProjectCaptureRule> {
  const body = await readCaptureRuleJson<{ rule: ProjectCaptureRule }>(
    await fetch(buildApiUrl(`/v1/projects/${projectId}/capture-rules/${ruleId}`), {
      method: "PATCH",
      credentials: "include",
      headers: buildBrowserSessionHeaders(true),
      body: JSON.stringify(update)
    })
  );

  return body.rule;
}

export async function deleteProjectCaptureRule(projectId: string, ruleId: string): Promise<void> {
  await readCaptureRuleJson<{ success: true }>(
    await fetch(buildApiUrl(`/v1/projects/${projectId}/capture-rules/${ruleId}`), {
      method: "DELETE",
      credentials: "include",
      headers: buildBrowserSessionHeaders()
    })
  );
}

export async function suggestCaptureRulesFromIncident(incidentId: string): Promise<CaptureRuleSuggestionsResponse> {
  return await readCaptureRuleJson<CaptureRuleSuggestionsResponse>(
    await fetch(buildApiUrl(`/v1/incidents/${incidentId}/capture-rule-suggestion`), {
      method: "POST",
      credentials: "include",
      headers: buildBrowserSessionHeaders()
    })
  );
}

export async function createCaptureRuleFromIncidentSuggestion(
  incidentId: string,
  payload: {
    suggestion_id: string;
    name?: string;
    description?: string | null;
    enabled?: boolean;
    expires_at?: string | null;
  }
): Promise<ProjectCaptureRule> {
  const body = await readCaptureRuleJson<{ rule: ProjectCaptureRule }>(
    await fetch(buildApiUrl(`/v1/incidents/${incidentId}/capture-rules`), {
      method: "POST",
      credentials: "include",
      headers: buildBrowserSessionHeaders(true),
      body: JSON.stringify(payload)
    })
  );

  return body.rule;
}
