import { z } from "zod";

import {
  BrowserEventKindSchema,
  CaptureRuleClientKindSchema,
  CaptureRuleEventTypeSchema,
  CaptureRuleFingerprintSchema,
  CaptureRuleRuntimeSchema,
  type CaptureRule,
  type CaptureRuleAction,
  type CaptureRuleClientKind,
  type CaptureRuleEventType,
  type CaptureRuleFingerprint,
  type CaptureRuleRuntime,
  type CaptureRuleSampleEventClass,
  type CaptureRuleUrlMatcher,
} from "./capture-rule-schemas.js";

const CaptureRuleEvaluationUrlSchema = z.object({
  host: z.string().min(1).transform((value) => value.toLowerCase()).optional(),
  path: z.string().min(1).transform((value) => (value.startsWith("/") ? value : `/${value}`)),
});

export type CaptureRuleEvaluationUrl = z.infer<typeof CaptureRuleEvaluationUrlSchema>;

export const CaptureRuleEvaluationContextSchema = z.object({
  project_id: z.string().min(1).max(120),
  event_id: z.string().uuid(),
  event_type: CaptureRuleEventTypeSchema,
  service: z.string().min(1).optional(),
  environment: z.string().min(1).optional(),
  runtime: CaptureRuleRuntimeSchema,
  first_party: z.boolean().optional(),
  error_name: z.string().min(1).optional(),
  message: z.string().min(1).optional(),
  browser_event_kind: BrowserEventKindSchema.optional(),
  browser_event_opaque: z.boolean().optional(),
  client_kind: CaptureRuleClientKindSchema.optional(),
  bot_family: z.string().min(1).max(120).optional(),
  resource_url: CaptureRuleEvaluationUrlSchema.optional(),
  request_url: CaptureRuleEvaluationUrlSchema.optional(),
  status_code: z.number().int().min(0).max(599).optional(),
  fingerprint: CaptureRuleFingerprintSchema.optional(),
});

export type CaptureRuleEvaluationContext = z.infer<typeof CaptureRuleEvaluationContextSchema>;

export interface CaptureRuleEvaluationResult {
  rule_id: string;
  action: CaptureRuleAction;
  outcome: "demote" | "drop" | "sampled_in" | "sampled_out";
  sample_rate: number | null;
  sample_event_class: CaptureRuleSampleEventClass | null;
}

export type CaptureRuleEvaluableEvent = {
  event_id: string;
  event_type: CaptureRuleEventType;
  service: {
    name: string;
    environment: string;
    runtime?: string | null;
  };
  payload: Record<string, unknown>;
};

function normalizeRuntime(value: string | null | undefined): CaptureRuleRuntime {
  switch (value?.trim().toLowerCase()) {
    case "browser":
      return "browser";
    case "node":
    case "nodejs":
      return "node";
    case "python":
      return "python";
    case "php":
      return "php";
    case "java":
      return "java";
    case "go":
    case "golang":
      return "go";
    case "ruby":
      return "ruby";
    default:
      return "unknown";
  }
}

function normalizeRoutePath(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed.length === 0) {
    return undefined;
  }

  const pathWithoutQueryOrFragment = trimmed.split(/[?#]/, 1)[0] ?? "";
  if (pathWithoutQueryOrFragment.length === 0) {
    return "/";
  }

  return pathWithoutQueryOrFragment.startsWith("/") ? pathWithoutQueryOrFragment : `/${pathWithoutQueryOrFragment}`;
}

function normalizeEvaluationUrl(value: string | null | undefined): {
  url?: CaptureRuleEvaluationUrl;
  first_party?: boolean;
} {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed.length === 0) {
    return {};
  }

  const relativePath = normalizeRoutePath(trimmed);
  if (relativePath !== undefined && trimmed.startsWith("/")) {
    return {
      url: { path: relativePath },
      first_party: true,
    };
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return {
        url: {
          host: parsed.hostname.length > 0 ? parsed.hostname.toLowerCase() : undefined,
          path: normalizeRoutePath(parsed.pathname) ?? "/",
        },
        first_party: false,
      };
    }
  } catch {
    if (relativePath !== undefined) {
      return {
        url: { path: relativePath },
        first_party: true,
      };
    }
  }

  return {};
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readHeaderValue(headers: Record<string, unknown> | undefined, name: string): string | undefined {
  if (headers === undefined) {
    return undefined;
  }

  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowerName) {
      return readString(value);
    }
  }

  return undefined;
}

function readDeviceUserAgent(payload: Record<string, unknown>): string | undefined {
  const device = readRecord(payload["device"]);
  return readString(device?.["user_agent"]);
}

export function classifyCaptureRuleClientFromUserAgent(userAgent: string | null | undefined): {
  client_kind: CaptureRuleClientKind;
  bot_family?: string;
} {
  if (userAgent === null || userAgent === undefined) {
    return { client_kind: "unknown" };
  }

  const lower = userAgent.toLowerCase();
  const knownBots: Array<{ family: string; markers: readonly string[] }> = [
    { family: "Googlebot", markers: ["googlebot", "adsbot-google", "google-inspectiontool"] },
    { family: "Bingbot", markers: ["bingbot", "msnbot"] },
    { family: "DuckDuckBot", markers: ["duckduckbot"] },
    { family: "Applebot", markers: ["applebot"] },
    { family: "YandexBot", markers: ["yandexbot"] },
    { family: "Baiduspider", markers: ["baiduspider"] },
    { family: "FacebookBot", markers: ["facebookexternalhit", "facebot"] },
    { family: "LinkedInBot", markers: ["linkedinbot"] },
    { family: "TwitterBot", markers: ["twitterbot"] },
    { family: "Slackbot", markers: ["slackbot"] },
  ];

  const knownBot = knownBots.find((entry) => entry.markers.some((marker) => lower.includes(marker)));
  if (knownBot !== undefined) {
    return { client_kind: "bot", bot_family: knownBot.family };
  }

  if (["bot", "crawler", "spider", "slurp"].some((marker) => lower.includes(marker))) {
    return { client_kind: "bot", bot_family: "OtherBot" };
  }

  return { client_kind: "human" };
}

function readEventUserAgent(event: CaptureRuleEvaluableEvent): string | undefined {
  const deviceUserAgent = readDeviceUserAgent(event.payload);
  if (deviceUserAgent !== undefined) {
    return deviceUserAgent;
  }

  if (event.event_type === "backend_exception") {
    const request = readRecord(event.payload["request"]);
    return readHeaderValue(readRecord(request?.["headers"]), "user-agent");
  }

  if (event.event_type === "request_event") {
    return readHeaderValue(readRecord(event.payload["headers"]), "user-agent");
  }

  return undefined;
}

export function buildCaptureRuleEvaluationContext(input: {
  project_id: string;
  event: CaptureRuleEvaluableEvent;
  fingerprint?: CaptureRuleFingerprint;
}): CaptureRuleEvaluationContext {
  const context: CaptureRuleEvaluationContext = {
    project_id: input.project_id,
    event_id: input.event.event_id,
    event_type: input.event.event_type,
    service: input.event.service.name,
    environment: input.event.service.environment,
    runtime: normalizeRuntime(input.event.service.runtime),
    ...classifyCaptureRuleClientFromUserAgent(readEventUserAgent(input.event)),
    ...(input.fingerprint === undefined ? {} : { fingerprint: input.fingerprint }),
  };

  switch (input.event.event_type) {
    case "backend_exception": {
      const request = readRecord(input.event.payload["request"]);
      const response = readRecord(input.event.payload["response"]);
      const requestUrl = normalizeEvaluationUrl(readString(request?.["path"]));

      return CaptureRuleEvaluationContextSchema.parse({
        ...context,
        first_party: true,
        error_name: readString(input.event.payload["name"]),
        message: readString(input.event.payload["message"]),
        request_url: requestUrl.url,
        status_code: readNumber(response?.["status_code"]),
      });
    }

    case "request_event": {
      const requestUrl = normalizeEvaluationUrl(readString(input.event.payload["path"]));

      return CaptureRuleEvaluationContextSchema.parse({
        ...context,
        first_party: requestUrl.first_party ?? true,
        request_url: requestUrl.url,
        status_code: readNumber(input.event.payload["response_status"]),
      });
    }

    case "log_event":
      return CaptureRuleEvaluationContextSchema.parse({
        ...context,
        message: readString(input.event.payload["message"]),
      });

    case "frontend_exception": {
      const browserEvent = readRecord(input.event.payload["browser_event"]);
      const target = readRecord(browserEvent?.["target"]);
      const browserEventKind = browserEvent?.["kind"];
      const resourceSource =
        typeof target?.["source_url"] === "string"
          ? target["source_url"]
          : typeof browserEvent?.["file_name"] === "string"
            ? browserEvent["file_name"]
            : undefined;
      const resourceUrl = normalizeEvaluationUrl(resourceSource);

      return CaptureRuleEvaluationContextSchema.parse({
        ...context,
        ...(resourceUrl.first_party === undefined ? {} : { first_party: resourceUrl.first_party }),
        error_name: readString(input.event.payload["name"]),
        message: readString(input.event.payload["message"]),
        browser_event_kind:
          browserEventKind === "window_error" || browserEventKind === "resource_error"
            ? browserEventKind
            : undefined,
        browser_event_opaque:
          typeof browserEvent?.["opaque"] === "boolean" ? browserEvent["opaque"] : undefined,
        resource_url: resourceUrl.url,
      });
    }

    case "frontend_breadcrumb": {
      if (input.event.payload["breadcrumb_type"] !== "network_request") {
        return CaptureRuleEvaluationContextSchema.parse(context);
      }

      const data = readRecord(input.event.payload["data"]);
      const requestUrl = normalizeEvaluationUrl(readString(data?.["url"]));

      return CaptureRuleEvaluationContextSchema.parse({
        ...context,
        ...(requestUrl.first_party === undefined ? {} : { first_party: requestUrl.first_party }),
        request_url: requestUrl.url,
        status_code: readNumber(data?.["status_code"]),
      });
    }

    default:
      return CaptureRuleEvaluationContextSchema.parse(context);
  }
}

export function applyCaptureRuleEventClass(input: {
  event_class: "incident_signal" | "context_signal" | "operational_signal";
  capture_rule: CaptureRuleEvaluationResult | null;
}): "incident_signal" | "context_signal" | "operational_signal" {
  if (input.capture_rule === null) {
    return input.event_class;
  }

  if (input.capture_rule.outcome === "demote") {
    return "context_signal";
  }

  if (input.capture_rule.action === "sample" && input.capture_rule.sample_event_class === "context") {
    return "context_signal";
  }

  return input.event_class;
}

function matchesUrlMatcher(
  matcher: CaptureRuleUrlMatcher | undefined,
  value: CaptureRuleEvaluationUrl | undefined
): boolean {
  if (matcher === undefined) {
    return true;
  }

  if (value === undefined) {
    return false;
  }

  if (matcher.host !== undefined && value.host !== matcher.host) {
    return false;
  }

  if (matcher.host_suffix !== undefined && (value.host === undefined || !value.host.endsWith(matcher.host_suffix))) {
    return false;
  }

  if (matcher.path_equals !== undefined && value.path !== matcher.path_equals) {
    return false;
  }

  if (matcher.path_prefix !== undefined && !value.path.startsWith(matcher.path_prefix)) {
    return false;
  }

  return true;
}

function matchesStatusRange(
  statusCode: number | undefined,
  ranges: ReadonlyArray<{ start: number; end: number }> | undefined
): boolean {
  if (ranges === undefined) {
    return true;
  }

  if (statusCode === undefined) {
    return false;
  }

  return ranges.some((range) => statusCode >= range.start && statusCode <= range.end);
}

function matchesStatusCodes(statusCode: number | undefined, statusCodes: readonly number[] | undefined): boolean {
  if (statusCodes === undefined) {
    return true;
  }

  if (statusCode === undefined) {
    return false;
  }

  return statusCodes.includes(statusCode);
}

export function matchesCaptureRule(rule: CaptureRule, contextInput: CaptureRuleEvaluationContext): boolean {
  const context = CaptureRuleEvaluationContextSchema.parse(contextInput);
  const matcher = rule.matcher;

  if (matcher.event_types !== undefined && !matcher.event_types.includes(context.event_type)) {
    return false;
  }

  if (matcher.services !== undefined && (context.service === undefined || !matcher.services.includes(context.service))) {
    return false;
  }

  if (
    matcher.environments !== undefined &&
    (context.environment === undefined || !matcher.environments.includes(context.environment))
  ) {
    return false;
  }

  if (matcher.runtime !== undefined && !matcher.runtime.includes(context.runtime)) {
    return false;
  }

  if (matcher.first_party !== undefined && context.first_party !== matcher.first_party) {
    return false;
  }

  if (matcher.error_name !== undefined && context.error_name !== matcher.error_name) {
    return false;
  }

  if (matcher.message_equals !== undefined && context.message !== matcher.message_equals) {
    return false;
  }

  if (matcher.message_contains !== undefined) {
    if (context.message === undefined || !context.message.includes(matcher.message_contains)) {
      return false;
    }
  }

  if (matcher.browser_event_kind !== undefined && context.browser_event_kind !== matcher.browser_event_kind) {
    return false;
  }

  if (matcher.browser_event_opaque !== undefined && context.browser_event_opaque !== matcher.browser_event_opaque) {
    return false;
  }

  if (matcher.client_kind !== undefined && context.client_kind !== matcher.client_kind) {
    return false;
  }

  if (matcher.bot_family !== undefined && context.bot_family !== matcher.bot_family) {
    return false;
  }

  if (!matchesUrlMatcher(matcher.resource_url, context.resource_url)) {
    return false;
  }

  if (!matchesUrlMatcher(matcher.request_url, context.request_url)) {
    return false;
  }

  if (!matchesStatusCodes(context.status_code, matcher.status_codes)) {
    return false;
  }

  if (!matchesStatusRange(context.status_code, matcher.status_ranges)) {
    return false;
  }

  if (matcher.fingerprint !== undefined) {
    if (context.fingerprint === undefined) {
      return false;
    }

    if (
      context.fingerprint.version !== matcher.fingerprint.version ||
      context.fingerprint.value !== matcher.fingerprint.value
    ) {
      return false;
    }
  }

  return true;
}

export function isCaptureRuleActive(rule: CaptureRule, now: string): boolean {
  if (!rule.enabled) {
    return false;
  }

  if (rule.expires_at === null) {
    return true;
  }

  return Date.parse(rule.expires_at) > Date.parse(now);
}

export function getCaptureRuleSpecificityScore(rule: CaptureRule): number {
  const matcher = rule.matcher;
  let score = 0;

  if (matcher.fingerprint !== undefined) {
    score += 1000;
  }
  if (matcher.resource_url?.host !== undefined) {
    score += 250;
  }
  if (matcher.request_url?.host !== undefined) {
    score += 250;
  }
  if (matcher.resource_url?.path_equals !== undefined || matcher.request_url?.path_equals !== undefined) {
    score += 200;
  }
  if (matcher.status_codes !== undefined) {
    score += 150;
  }
  if (matcher.browser_event_kind !== undefined) {
    score += 100;
  }
  if (matcher.browser_event_opaque !== undefined) {
    score += 100;
  }
  if (matcher.resource_url?.host_suffix !== undefined || matcher.request_url?.host_suffix !== undefined) {
    score += 90;
  }
  if (matcher.resource_url?.path_prefix !== undefined || matcher.request_url?.path_prefix !== undefined) {
    score += 80;
  }
  if (matcher.error_name !== undefined) {
    score += 70;
  }
  if (matcher.message_equals !== undefined) {
    score += 60;
  }
  if (matcher.message_contains !== undefined) {
    score += 50;
  }
  if (matcher.bot_family !== undefined) {
    score += 45;
  }
  if (matcher.first_party !== undefined) {
    score += 40;
  }
  if (matcher.client_kind !== undefined) {
    score += 35;
  }
  if (matcher.services !== undefined) {
    score += 30;
  }
  if (matcher.environments !== undefined) {
    score += 20;
  }
  if (matcher.runtime !== undefined) {
    score += 10;
  }
  if (matcher.event_types !== undefined) {
    score += 5;
  }

  return score;
}

function compareCaptureRules(left: CaptureRule, right: CaptureRule): number {
  const specificityDifference = getCaptureRuleSpecificityScore(right) - getCaptureRuleSpecificityScore(left);
  if (specificityDifference !== 0) {
    return specificityDifference;
  }

  const updatedDifference = Date.parse(right.updated_at) - Date.parse(left.updated_at);
  if (updatedDifference !== 0) {
    return updatedDifference;
  }

  return left.id.localeCompare(right.id);
}

function stableUnitFloat(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) / 0x100000000;
}

export function shouldSampleCaptureRuleEvent(input: {
  project_id: string;
  rule_id: string;
  event_id: string;
  sample_rate: number;
}): boolean {
  if (input.sample_rate <= 0) {
    return false;
  }

  if (input.sample_rate >= 1) {
    return true;
  }

  const seed = `${input.project_id}:${input.rule_id}:${input.event_id}`;
  return stableUnitFloat(seed) < input.sample_rate;
}

export function evaluateCaptureRules(
  rules: readonly CaptureRule[],
  contextInput: CaptureRuleEvaluationContext,
  now: string
): CaptureRuleEvaluationResult | null {
  const context = CaptureRuleEvaluationContextSchema.parse(contextInput);
  const activeRules = rules.filter((rule) => isCaptureRuleActive(rule, now)).sort(compareCaptureRules);

  for (const rule of activeRules) {
    if (!matchesCaptureRule(rule, context)) {
      continue;
    }

    if (rule.action === "demote") {
      return {
        rule_id: rule.id,
        action: "demote",
        outcome: "demote",
        sample_rate: null,
        sample_event_class: null,
      };
    }

    if (rule.action === "drop") {
      return {
        rule_id: rule.id,
        action: "drop",
        outcome: "drop",
        sample_rate: null,
        sample_event_class: null,
      };
    }

    const sampledIn = shouldSampleCaptureRuleEvent({
      project_id: context.project_id,
      rule_id: rule.id,
      event_id: context.event_id,
      sample_rate: rule.sample_rate ?? 0,
    });

    return {
      rule_id: rule.id,
      action: "sample",
      outcome: sampledIn ? "sampled_in" : "sampled_out",
      sample_rate: rule.sample_rate,
      sample_event_class: rule.sample_event_class,
    };
  }

  return null;
}
