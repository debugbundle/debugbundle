import { CaptureRuleMatcherSchema } from "../../../../../packages/shared-types/src/capture-rule-schemas.js";
import type {
  CaptureRuleAction,
  CaptureRuleBrowserEventKind,
  CaptureRuleClientKind,
  CaptureRuleEventType,
  CaptureRuleExactResourceUrlMatcher,
  CaptureRuleMatcher,
  CaptureRuleRuntime,
  CaptureRuleThresholdGroupBy,
  ProjectCaptureRuleCreate
} from "../../lib/capture-rules-api.js";

export const THRESHOLD_WINDOW_PRESET_VALUES = ["300", "900", "3600", "21600", "86400"] as const;
export type ThresholdWindowPreset = (typeof THRESHOLD_WINDOW_PRESET_VALUES)[number] | "custom";

export interface CaptureRuleCreateDraft {
  name: string;
  description: string;
  enabled: boolean;
  action: CaptureRuleAction;
  eventType: CaptureRuleEventType;
  serviceNames: string;
  environments: string;
  runtime: CaptureRuleRuntime | "";
  firstParty: "" | "true" | "false";
  errorName: string;
  messageContains: string;
  messageEquals: string;
  browserEventKind: CaptureRuleBrowserEventKind | "";
  browserEventOpaque: boolean;
  clientKind: CaptureRuleClientKind | "";
  botFamily: string;
  resourceHost: string;
  resourcePathEquals: string;
  resourceUrlsText: string;
  requestPathEquals: string;
  statusCodes: string;
  fingerprintVersion: string;
  fingerprintValue: string;
  sampleRatePercent: string;
  sampleEventClass: "preserve" | "context";
  thresholdCount: string;
  thresholdWindowPreset: ThresholdWindowPreset;
  thresholdWindowCustomSeconds: string;
  thresholdGroupBy: CaptureRuleThresholdGroupBy;
  expiresAt: string;
  advancedMatcherJson: string;
  matcherJsonOnly?: boolean;
}

export function createDefaultCaptureRuleCreateDraft(): CaptureRuleCreateDraft {
  return {
    name: "",
    description: "",
    enabled: true,
    action: "demote",
    eventType: "frontend_exception",
    serviceNames: "",
    environments: "",
    runtime: "",
    firstParty: "",
    errorName: "",
    messageContains: "",
    messageEquals: "",
    browserEventKind: "",
    browserEventOpaque: false,
    clientKind: "",
    botFamily: "",
    resourceHost: "",
    resourcePathEquals: "",
    resourceUrlsText: "",
    requestPathEquals: "",
    statusCodes: "",
    fingerprintVersion: "",
    fingerprintValue: "",
    sampleRatePercent: "25",
    sampleEventClass: "preserve",
    thresholdCount: "10",
    thresholdWindowPreset: "3600",
    thresholdWindowCustomSeconds: "3600",
    thresholdGroupBy: "fingerprint",
    expiresAt: "",
    advancedMatcherJson: ""
  };
}

export function resolveThresholdWindowSeconds(draft: CaptureRuleCreateDraft): number {
  const raw =
    draft.thresholdWindowPreset === "custom"
      ? draft.thresholdWindowCustomSeconds.trim()
      : draft.thresholdWindowPreset;
  return raw === "" ? Number.NaN : Number(raw);
}

export function parseExactResourceUrlsText(
  value: string
):
  | { ok: true; urls: CaptureRuleExactResourceUrlMatcher[] }
  | { ok: false; error: string } {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) {
    return { ok: true, urls: [] };
  }
  if (lines.length > 10) {
    return { ok: false, error: "List at most 10 exact resource URLs." };
  }

  const urls: CaptureRuleExactResourceUrlMatcher[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    let parsed: URL;
    try {
      parsed = new URL(line);
    } catch {
      return {
        ok: false,
        error: "Each resource URL must be a full http(s)://host/path address."
      };
    }
    if (
      (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
      parsed.hostname.length === 0 ||
      parsed.username.length > 0 ||
      parsed.password.length > 0 ||
      parsed.search.length > 0 ||
      parsed.hash.length > 0 ||
      !parsed.pathname.startsWith("/") ||
      parsed.pathname.length === 0
    ) {
      return {
        ok: false,
        error:
          "Resource URLs must use exact http(s)://host/path addresses without credentials, queries, or fragments."
      };
    }

    const entry: CaptureRuleExactResourceUrlMatcher = {
      host: parsed.hostname.toLowerCase(),
      path_equals: parsed.pathname
    };
    const key = `${entry.host}${entry.path_equals}`;
    if (!seen.has(key)) {
      seen.add(key);
      urls.push(entry);
    }
  }

  return { ok: true, urls };
}

export function getCaptureRuleCreateDraftValidationError(
  draft: CaptureRuleCreateDraft
): string | null {
  if (draft.name.trim().length === 0) {
    return "Rule name is required.";
  }

  if (draft.action === "sample") {
    const sampleRate = Number(draft.sampleRatePercent);
    if (
      draft.sampleRatePercent.trim() === "" ||
      !Number.isFinite(sampleRate) ||
      sampleRate < 0 ||
      sampleRate > 100
    ) {
      return "Sample rate must be between 0 and 100.";
    }
  }

  if (draft.action === "threshold") {
    const thresholdCount = Number(draft.thresholdCount.trim());
    if (
      draft.thresholdCount.trim() === "" ||
      !Number.isInteger(thresholdCount) ||
      thresholdCount < 2 ||
      thresholdCount > 1000
    ) {
      return "Occurrence threshold must be a whole number between 2 and 1000.";
    }
    const windowSeconds = resolveThresholdWindowSeconds(draft);
    if (!Number.isInteger(windowSeconds) || windowSeconds < 60 || windowSeconds > 86400) {
      return "Rolling window must be a whole number of seconds between 60 and 86400.";
    }
  }

  if (draft.matcherJsonOnly) {
    try {
      const parsed = CaptureRuleMatcherSchema.safeParse(JSON.parse(draft.advancedMatcherJson));
      if (!parsed.success) {
        return "Matcher JSON must satisfy the capture rule matcher schema.";
      }
      if (draft.action === "threshold" && draft.thresholdGroupBy === "resource") {
        const eventTypes = parsed.data.event_types ?? [];
        if (
          parsed.data.browser_event_kind !== "resource_error" ||
          eventTypes.length !== 1 ||
          eventTypes[0] !== "frontend_exception"
        ) {
          return 'Resource threshold grouping requires event_types ["frontend_exception"] and browser_event_kind "resource_error".';
        }
      }
      return null;
    } catch {
      return "Matcher JSON must be valid JSON.";
    }
  }

  const parsedUrls = parseExactResourceUrlsText(draft.resourceUrlsText);
  if (!parsedUrls.ok) {
    return parsedUrls.error;
  }
  const hasSingleResource =
    draft.resourceHost.trim().length > 0 || draft.resourcePathEquals.trim().length > 0;
  if (hasSingleResource && parsedUrls.urls.length > 0) {
    return "Use either single Resource host/path fields or Multiple exact resource URLs, not both.";
  }

  if (draft.statusCodes.trim().length > 0 && parseNumberList(draft.statusCodes).length === 0) {
    return "Status codes must be a comma-separated list of HTTP status codes.";
  }

  if (draft.fingerprintValue.trim().length > 0 && draft.fingerprintVersion.trim().length === 0) {
    return "Fingerprint version is required when matching a fingerprint value.";
  }

  if (draft.advancedMatcherJson.trim().length > 0) {
    try {
      JSON.parse(draft.advancedMatcherJson);
    } catch {
      return "Advanced matcher JSON must be valid JSON.";
    }
  }

  const matcher = buildCaptureRuleMatcher(draft);
  const hasNarrowingField = Object.keys(matcher).some((key) => key !== "event_types");
  if (!hasNarrowingField) {
    return "Add at least one matcher field beyond event type.";
  }

  if (
    matcher.browser_event_kind === "resource_error" &&
    matcher.resource_url === undefined &&
    matcher.resource_urls === undefined &&
    matcher.fingerprint === undefined
  ) {
    return "Resource-error rules need a resource URL matcher, exact resource URL list, or exact fingerprint.";
  }

  const parsedMatcher = CaptureRuleMatcherSchema.safeParse(matcher);
  if (!parsedMatcher.success) {
    return "Matcher fields must satisfy the capture rule matcher schema.";
  }

  if (draft.action === "threshold" && draft.thresholdGroupBy === "resource") {
    const eventTypes = parsedMatcher.data.event_types ?? [];
    if (
      parsedMatcher.data.browser_event_kind !== "resource_error" ||
      eventTypes.length !== 1 ||
      eventTypes[0] !== "frontend_exception"
    ) {
      return "Resource threshold grouping requires Frontend exception with Browser event kind set to Resource error.";
    }
  }

  return null;
}

export function buildProjectCaptureRuleCreate(
  draft: CaptureRuleCreateDraft
): ProjectCaptureRuleCreate {
  const expiresAt = parseDateTimeLocalValue(draft.expiresAt);
  const isThreshold = draft.action === "threshold";
  return {
    name: draft.name.trim(),
    description: draft.description.trim().length === 0 ? null : draft.description.trim(),
    enabled: draft.enabled,
    action: draft.action,
    matcher: buildCaptureRuleMatcher(draft),
    sample_rate: draft.action === "sample" ? Number(draft.sampleRatePercent) / 100 : null,
    sample_event_class: draft.action === "sample" ? draft.sampleEventClass : null,
    threshold_count: isThreshold ? Number(draft.thresholdCount.trim()) : null,
    threshold_window_seconds: isThreshold ? resolveThresholdWindowSeconds(draft) : null,
    threshold_group_by: isThreshold ? draft.thresholdGroupBy : null,
    created_by_user_id: null,
    created_from_incident_id: null,
    created_from_event_id: null,
    expires_at: expiresAt
  };
}

export function buildCaptureRuleMatcher(draft: CaptureRuleCreateDraft): CaptureRuleMatcher {
  if (draft.matcherJsonOnly) return JSON.parse(draft.advancedMatcherJson) as CaptureRuleMatcher;
  const matcher: CaptureRuleMatcher = {
    event_types: [draft.eventType]
  };
  const services = parseStringList(draft.serviceNames);
  const environments = parseStringList(draft.environments);
  const statusCodes = parseNumberList(draft.statusCodes);

  if (services.length > 0) matcher.services = services;
  if (environments.length > 0) matcher.environments = environments;
  if (draft.runtime !== "") matcher.runtime = [draft.runtime];
  if (draft.firstParty !== "") matcher.first_party = draft.firstParty === "true";
  if (draft.errorName.trim().length > 0) matcher.error_name = draft.errorName.trim();
  if (draft.messageContains.trim().length > 0)
    matcher.message_contains = draft.messageContains.trim();
  if (draft.messageEquals.trim().length > 0) matcher.message_equals = draft.messageEquals.trim();
  if (draft.browserEventKind !== "") matcher.browser_event_kind = draft.browserEventKind;
  if (draft.browserEventOpaque) matcher.browser_event_opaque = true;
  if (draft.clientKind !== "") matcher.client_kind = draft.clientKind;
  if (draft.botFamily.trim().length > 0) matcher.bot_family = draft.botFamily.trim();
  if (statusCodes.length > 0) matcher.status_codes = statusCodes;

  const resourceUrl = buildUrlMatcher(draft.resourceHost, draft.resourcePathEquals);
  if (resourceUrl !== null) matcher.resource_url = resourceUrl;
  const parsedUrls = parseExactResourceUrlsText(draft.resourceUrlsText);
  if (parsedUrls.ok && parsedUrls.urls.length > 0) {
    matcher.resource_urls = parsedUrls.urls;
  }
  const requestUrl = buildUrlMatcher("", draft.requestPathEquals);
  if (requestUrl !== null) matcher.request_url = requestUrl;
  if (draft.fingerprintValue.trim().length > 0) {
    matcher.fingerprint = {
      version: draft.fingerprintVersion.trim(),
      value: draft.fingerprintValue.trim()
    };
  }

  if (draft.advancedMatcherJson.trim().length === 0) {
    return matcher;
  }

  return {
    ...matcher,
    ...(JSON.parse(draft.advancedMatcherJson) as CaptureRuleMatcher)
  };
}

function buildUrlMatcher(
  host: string,
  pathEquals: string
): NonNullable<CaptureRuleMatcher["resource_url"]> | null {
  const matcher: NonNullable<CaptureRuleMatcher["resource_url"]> = {};
  if (host.trim().length > 0) matcher.host = host.trim().toLowerCase();
  if (pathEquals.trim().length > 0) matcher.path_equals = normalizePath(pathEquals.trim());
  return Object.keys(matcher).length === 0 ? null : matcher;
}

function parseStringList(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
    )
  );
}

function parseNumberList(value: string): number[] {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((entry) => Number(entry.trim()))
        .filter((entry) => Number.isInteger(entry) && entry >= 100 && entry <= 599)
    )
  ).sort((left, right) => left - right);
}

function normalizePath(value: string): string {
  return value.startsWith("/") ? value : `/${value}`;
}

function parseDateTimeLocalValue(value: string): string | null {
  if (value.trim().length === 0) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
}
