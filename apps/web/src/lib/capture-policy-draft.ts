import type {
  CaptureBreadcrumbs,
  CaptureLogs,
  CapturePreset,
  CaptureProbeEvents,
  CaptureRequestEvents,
  ImmediateClientErrorPathRule,
  ProjectCapturePolicy,
  ProjectCapturePolicyResponse
} from "./api.js";

export type CapturePolicyPlan = "free" | "solo" | "team" | "business";

export type OverrideValue<T extends string> = "" | T;
export type ClientErrorIncidentMode = "preset_default" | "none" | "recommended" | "custom";

export interface CapturePolicyDraft {
  access_mode: ProjectCapturePolicyResponse["access_mode"];
  preset: CapturePreset;
  capture_logs: OverrideValue<CaptureLogs>;
  capture_request_events: OverrideValue<CaptureRequestEvents>;
  capture_breadcrumbs: OverrideValue<CaptureBreadcrumbs>;
  capture_probe_events: OverrideValue<CaptureProbeEvents>;
  client_error_incident_mode: ClientErrorIncidentMode;
  client_error_custom_input: string;
  client_error_path_rules_input: string;
}

const DEFAULT_PRESET_BY_PLAN: Record<CapturePolicyPlan, CapturePreset> = {
  free: "balanced",
  solo: "balanced",
  team: "balanced",
  business: "balanced"
};

const RECOMMENDED_IMMEDIATE_CLIENT_ERROR_STATUSES = [401, 403, 409, 422] as const;
const HTTP_METHOD_VALUES = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;

export const PRESET_DEFAULTS: Record<CapturePreset, Omit<ProjectCapturePolicy, "preset">> = {
  minimal: {
    capture_logs: "error",
    capture_request_events: "failures_only",
    capture_breadcrumbs: "local_only",
    capture_probe_events: "buffer_only",
    immediate_client_error_statuses: [],
    immediate_client_error_path_rules: []
  },
  balanced: {
    capture_logs: "warning",
    capture_request_events: "failures_only",
    capture_breadcrumbs: "exception_only",
    capture_probe_events: "buffer_only",
    immediate_client_error_statuses: [],
    immediate_client_error_path_rules: []
  },
  investigative: {
    capture_logs: "info",
    capture_request_events: "all",
    capture_breadcrumbs: "standalone",
    capture_probe_events: "standalone_when_activated",
    immediate_client_error_statuses: [...RECOMMENDED_IMMEDIATE_CLIENT_ERROR_STATUSES],
    immediate_client_error_path_rules: []
  }
};

function buildDefaultPolicy(plan: CapturePolicyPlan): ProjectCapturePolicy {
  const preset = DEFAULT_PRESET_BY_PLAN[plan];
  return {
    preset,
    ...PRESET_DEFAULTS[preset]
  };
}

export function buildDefaultPolicyResponse(plan: CapturePolicyPlan): ProjectCapturePolicyResponse {
  return {
    access_mode: "manage",
    policy: buildDefaultPolicy(plan),
    overrides: {
      capture_logs: null,
      capture_request_events: null,
      capture_breadcrumbs: null,
      capture_probe_events: null,
      immediate_client_error_statuses: null,
      immediate_client_error_path_rules: null
    }
  };
}

export function buildDraft(policyResponse: ProjectCapturePolicyResponse): CapturePolicyDraft {
  const { policy, overrides } = policyResponse;
  const clientErrorOverride = overrides.immediate_client_error_statuses;

  return {
    access_mode: policyResponse.access_mode,
    preset: policy.preset,
    capture_logs: overrides.capture_logs === null ? "" : overrides.capture_logs,
    capture_request_events:
      overrides.capture_request_events === null ? "" : overrides.capture_request_events,
    capture_breadcrumbs:
      overrides.capture_breadcrumbs === null ? "" : overrides.capture_breadcrumbs,
    capture_probe_events:
      overrides.capture_probe_events === null ? "" : overrides.capture_probe_events,
    client_error_incident_mode: getClientErrorIncidentMode(clientErrorOverride),
    client_error_custom_input:
      clientErrorOverride !== null &&
      clientErrorOverride.length > 0 &&
      !statusesEqual(clientErrorOverride, RECOMMENDED_IMMEDIATE_CLIENT_ERROR_STATUSES)
        ? clientErrorOverride.join(",")
        : "",
    client_error_path_rules_input: formatClientErrorPathRulesInput(
      overrides.immediate_client_error_path_rules ?? policy.immediate_client_error_path_rules ?? []
    )
  };
}

export function resolveDraft(draft: CapturePolicyDraft): ProjectCapturePolicy {
  const defaults = PRESET_DEFAULTS[draft.preset];
  const customStatuses = parseClientErrorStatusesInput(draft.client_error_custom_input);
  const pathRules = parseClientErrorPathRulesInput(draft.client_error_path_rules_input);

  return {
    preset: draft.preset,
    capture_logs: draft.capture_logs || defaults.capture_logs,
    capture_request_events: draft.capture_request_events || defaults.capture_request_events,
    capture_breadcrumbs: draft.capture_breadcrumbs || defaults.capture_breadcrumbs,
    capture_probe_events: draft.capture_probe_events || defaults.capture_probe_events,
    immediate_client_error_statuses:
      draft.client_error_incident_mode === "preset_default"
        ? defaults.immediate_client_error_statuses
        : draft.client_error_incident_mode === "none"
          ? []
          : draft.client_error_incident_mode === "recommended"
            ? [...RECOMMENDED_IMMEDIATE_CLIENT_ERROR_STATUSES]
            : (customStatuses.statuses ?? []),
    immediate_client_error_path_rules: pathRules.rules ?? []
  };
}

export function buildUpdatePayload(draft: CapturePolicyDraft): {
  preset: CapturePreset;
  capture_logs: CaptureLogs | null;
  capture_request_events: CaptureRequestEvents | null;
  capture_breadcrumbs: CaptureBreadcrumbs | null;
  capture_probe_events: CaptureProbeEvents | null;
  immediate_client_error_statuses: number[] | null;
  immediate_client_error_path_rules: ImmediateClientErrorPathRule[] | null;
} {
  const customStatuses = parseClientErrorStatusesInput(draft.client_error_custom_input);
  const pathRules = parseClientErrorPathRulesInput(draft.client_error_path_rules_input);

  return {
    preset: draft.preset,
    capture_logs: draft.capture_logs || null,
    capture_request_events: draft.capture_request_events || null,
    capture_breadcrumbs: draft.capture_breadcrumbs || null,
    capture_probe_events: draft.capture_probe_events || null,
    immediate_client_error_statuses:
      draft.client_error_incident_mode === "preset_default"
        ? null
        : draft.client_error_incident_mode === "none"
          ? []
          : draft.client_error_incident_mode === "recommended"
            ? [...RECOMMENDED_IMMEDIATE_CLIENT_ERROR_STATUSES]
            : (customStatuses.statuses ?? []),
    immediate_client_error_path_rules:
      draft.client_error_path_rules_input.trim().length === 0 ? null : (pathRules.rules ?? [])
  };
}

function getClientErrorIncidentMode(rawOverride: number[] | null): ClientErrorIncidentMode {
  if (rawOverride === null) {
    return "preset_default";
  }

  if (rawOverride.length === 0) {
    return "none";
  }

  if (statusesEqual(rawOverride, RECOMMENDED_IMMEDIATE_CLIENT_ERROR_STATUSES)) {
    return "recommended";
  }

  return "custom";
}

function parseClientErrorStatusesInput(value: string): { statuses?: number[]; error?: string } {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { error: "Enter at least one 4xx status code." };
  }

  const rawParts = trimmed
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (rawParts.length === 0) {
    return { error: "Enter at least one 4xx status code." };
  }

  const parsedNumbers: number[] = [];
  for (const part of rawParts) {
    if (!/^\d+$/.test(part)) {
      return { error: "Use only HTTP 4xx integers between 400 and 499." };
    }

    const status = Number(part);
    if (!Number.isInteger(status) || status < 400 || status > 499) {
      return { error: "Use only HTTP 4xx integers between 400 and 499." };
    }

    parsedNumbers.push(status);
  }

  const normalized = Array.from(new Set(parsedNumbers)).sort((left, right) => left - right);
  if (normalized.length > 12) {
    return { error: "Choose no more than 12 status codes." };
  }

  return { statuses: normalized };
}

function normalizePathPattern(value: string): string {
  return value.trim().replace(/\/{2,}/g, "/");
}

function parseClientErrorPathRulesInput(value: string): {
  rules?: ImmediateClientErrorPathRule[];
  error?: string;
} {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { rules: [] };
  }

  const rules: ImmediateClientErrorPathRule[] = [];
  for (const [index, rawLine] of trimmed.split(/\r?\n/u).entries()) {
    const line = rawLine.trim();
    if (line.length === 0) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0 || separatorIndex === line.length - 1) {
      return { error: `Line ${index + 1}: use status=/path/*@METHOD format.` };
    }

    const status = Number(line.slice(0, separatorIndex));
    if (!Number.isInteger(status) || status < 400 || status > 499) {
      return { error: `Line ${index + 1}: use an HTTP 4xx status.` };
    }

    const ruleValue = line.slice(separatorIndex + 1);
    const methodSeparatorIndex = ruleValue.lastIndexOf("@");
    const pathPattern = normalizePathPattern(
      methodSeparatorIndex === -1 ? ruleValue : ruleValue.slice(0, methodSeparatorIndex)
    );
    if (!pathPattern.startsWith("/") || pathPattern.includes("?") || pathPattern.includes("#")) {
      return { error: `Line ${index + 1}: path must start with / and exclude query strings.` };
    }
    const wildcardIndex = pathPattern.indexOf("*");
    if (wildcardIndex !== -1 && wildcardIndex !== pathPattern.length - 1) {
      return { error: `Line ${index + 1}: wildcard must be at the end of the path.` };
    }

    const methods =
      methodSeparatorIndex === -1
        ? []
        : Array.from(
            new Set(
              ruleValue
                .slice(methodSeparatorIndex + 1)
                .split(",")
                .map((method) => method.trim().toUpperCase())
                .filter((method): method is ImmediateClientErrorPathRule["methods"][number] =>
                  (HTTP_METHOD_VALUES as readonly string[]).includes(method)
                )
            )
          ).sort();

    if (methodSeparatorIndex !== -1 && methods.length === 0) {
      return { error: `Line ${index + 1}: use valid HTTP methods after @.` };
    }

    rules.push({ status_code: status, path_pattern: pathPattern, methods });
  }

  if (rules.length > 25) {
    return { error: "Choose no more than 25 path rules." };
  }

  return {
    rules: Array.from(
      new Map(
        rules.map((rule) => [
          `${rule.status_code}:${rule.path_pattern}:${rule.methods.join(",")}`,
          rule
        ])
      ).values()
    ).sort((left, right) => {
      if (left.status_code !== right.status_code) return left.status_code - right.status_code;
      const pathComparison = left.path_pattern.localeCompare(right.path_pattern);
      if (pathComparison !== 0) return pathComparison;
      return left.methods.join(",").localeCompare(right.methods.join(","));
    })
  };
}

function formatClientErrorPathRulesInput(rules: readonly ImmediateClientErrorPathRule[]): string {
  return rules
    .map((rule) => {
      const methods = rule.methods.length === 0 ? "" : `@${rule.methods.join(",")}`;
      return `${rule.status_code}=${rule.path_pattern}${methods}`;
    })
    .join("\n");
}

export function getClientErrorCustomValidationError(draft: CapturePolicyDraft): string | null {
  if (draft.client_error_incident_mode !== "custom") {
    return null;
  }

  return parseClientErrorStatusesInput(draft.client_error_custom_input).error ?? null;
}

export function getClientErrorPathRulesValidationError(draft: CapturePolicyDraft): string | null {
  return parseClientErrorPathRulesInput(draft.client_error_path_rules_input).error ?? null;
}

export function draftsEqual(left: CapturePolicyDraft, right: CapturePolicyDraft): boolean {
  return (
    left.preset === right.preset &&
    left.capture_logs === right.capture_logs &&
    left.capture_request_events === right.capture_request_events &&
    left.capture_breadcrumbs === right.capture_breadcrumbs &&
    left.capture_probe_events === right.capture_probe_events &&
    left.client_error_incident_mode === right.client_error_incident_mode &&
    left.client_error_custom_input === right.client_error_custom_input &&
    left.client_error_path_rules_input === right.client_error_path_rules_input
  );
}

function statusesEqual(left: readonly number[], right: readonly number[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

export function formatClientErrorIncidentsPreview(
  draft: CapturePolicyDraft,
  validationError: string | null
): string {
  const presetDefault = PRESET_DEFAULTS[draft.preset].immediate_client_error_statuses;

  switch (draft.client_error_incident_mode) {
    case "preset_default":
      return formatClientErrorStatusList(presetDefault);
    case "none":
      return "None";
    case "recommended":
      return formatClientErrorStatusList(RECOMMENDED_IMMEDIATE_CLIENT_ERROR_STATUSES);
    case "custom":
      if (validationError !== null) {
        return "Custom (invalid)";
      }

      return formatClientErrorStatusList(
        parseClientErrorStatusesInput(draft.client_error_custom_input).statuses ?? []
      );
  }
}

export function formatClientErrorPathRulesPreview(
  draft: CapturePolicyDraft,
  validationError: string | null
): string {
  if (validationError !== null) {
    return "Custom (invalid)";
  }

  const parsed = parseClientErrorPathRulesInput(draft.client_error_path_rules_input);
  const rules = parsed.rules ?? [];
  if (rules.length === 0) {
    return "None";
  }

  return rules.length === 1 ? formatClientErrorPathRulesInput(rules) : `${rules.length} rules`;
}

export function formatClientErrorStatusList(statuses: readonly number[]): string {
  return statuses.length === 0 ? "None" : statuses.join(", ");
}
