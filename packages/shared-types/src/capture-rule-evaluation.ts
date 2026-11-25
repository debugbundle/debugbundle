import {
  CaptureRuleEvaluationContextSchema,
  type CaptureRuleEvaluationContext,
  type CaptureRuleEvaluationUrl
} from "./capture-rule-evaluation-context.js";
import type {
  CaptureRule,
  CaptureRuleAction,
  CaptureRuleBrowserTargetAttributes,
  CaptureRuleExactUrlMatcher,
  CaptureRuleSampleEventClass,
  CaptureRuleThresholdGroupBy,
  CaptureRuleUrlMatcher
} from "./capture-rule-schemas.js";

export {
  CaptureRuleEvaluationContextSchema,
  classifyCaptureRuleClientFromUserAgent,
  buildCaptureRuleEvaluationContext,
  type CaptureRuleEvaluationUrl,
  type CaptureRuleEvaluationContext,
  type CaptureRuleEvaluableEvent
} from "./capture-rule-evaluation-context.js";

export interface CaptureRuleEvaluationResult {
  rule_id: string;
  action: CaptureRuleAction;
  outcome: "demote" | "drop" | "sampled_in" | "sampled_out" | "threshold" | "allow";
  sample_rate: number | null;
  sample_event_class: CaptureRuleSampleEventClass | null;
  threshold_count?: number | null;
  threshold_window_seconds?: number | null;
  threshold_group_by?: CaptureRuleThresholdGroupBy | null;
  rule_updated_at?: string;
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

  if (
    input.capture_rule.action === "sample" &&
    input.capture_rule.sample_event_class === "context"
  ) {
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

  if (
    matcher.host_suffix !== undefined &&
    (value.host === undefined || !value.host.endsWith(matcher.host_suffix))
  ) {
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

function matchesExactUrlMatchers(
  matchers: readonly CaptureRuleExactUrlMatcher[] | undefined,
  value: CaptureRuleEvaluationUrl | undefined
): boolean {
  if (matchers === undefined) {
    return true;
  }
  if (value === undefined || value.host === undefined) {
    return false;
  }
  return matchers.some(
    (entry) => value.host === entry.host && value.path === entry.path_equals
  );
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

function matchesStatusCodes(
  statusCode: number | undefined,
  statusCodes: readonly number[] | undefined
): boolean {
  if (statusCodes === undefined) {
    return true;
  }

  if (statusCode === undefined) {
    return false;
  }

  return statusCodes.includes(statusCode);
}

export function matchesCaptureRule(
  rule: CaptureRule,
  contextInput: CaptureRuleEvaluationContext
): boolean {
  const context = CaptureRuleEvaluationContextSchema.parse(contextInput);
  const matcher = rule.matcher;

  if (matcher.event_types !== undefined && !matcher.event_types.includes(context.event_type)) {
    return false;
  }

  if (
    matcher.services !== undefined &&
    !matcher.services.some(
      (service) => service === context.service || context.service_aliases?.includes(service)
    )
  ) {
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

  if (
    matcher.browser_event_kind !== undefined &&
    context.browser_event_kind !== matcher.browser_event_kind
  ) {
    return false;
  }

  if (
    matcher.browser_event_opaque !== undefined &&
    context.browser_event_opaque !== matcher.browser_event_opaque
  ) {
    return false;
  }

  if (
    matcher.browser_page_visibility_state !== undefined &&
    context.browser_page_visibility_state !== matcher.browser_page_visibility_state
  )
    return false;

  if (
    matcher.browser_page_ready_state !== undefined &&
    context.browser_page_ready_state !== matcher.browser_page_ready_state
  )
    return false;

  if (
    matcher.browser_target_tag_name !== undefined &&
    context.browser_target_tag_name !== matcher.browser_target_tag_name
  )
    return false;

  if (matcher.browser_target_attributes !== undefined) {
    if (context.browser_target_attributes === undefined) return false;
    for (const [key, expected] of Object.entries(matcher.browser_target_attributes)) {
      if (
        context.browser_target_attributes[key as keyof CaptureRuleBrowserTargetAttributes] !==
        expected
      ) {
        return false;
      }
    }
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

  if (!matchesExactUrlMatchers(matcher.resource_urls, context.resource_url)) {
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
    const fingerprints = [
      ...(context.fingerprint === undefined ? [] : [context.fingerprint]),
      ...(context.fingerprint_aliases ?? [])
    ];
    if (
      !fingerprints.some(
        (candidate) =>
          candidate.version === matcher.fingerprint!.version &&
          candidate.value === matcher.fingerprint!.value
      )
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
  if (
    matcher.resource_url?.path_equals !== undefined ||
    matcher.request_url?.path_equals !== undefined
  ) {
    score += 200;
  }
  if (matcher.resource_urls !== undefined && matcher.resource_urls.length > 0) {
    // Multi-URL exact lists share exact host+path precedence while ranking slightly below a single exact URL.
    score += 450 - (matcher.resource_urls.length - 1) * 0.1;
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
  if (matcher.browser_page_visibility_state !== undefined) score += 75;
  if (matcher.browser_page_ready_state !== undefined) score += 75;
  if (matcher.browser_target_tag_name !== undefined) score += 75;
  if (matcher.browser_target_attributes !== undefined) {
    score += 75 + Object.keys(matcher.browser_target_attributes).length * 5;
  }
  const hostSuffix = matcher.resource_url?.host_suffix ?? matcher.request_url?.host_suffix;
  if (hostSuffix !== undefined) {
    score += 90 + Math.min(hostSuffix.length, 255) / 255;
  }
  const pathPrefix = matcher.resource_url?.path_prefix ?? matcher.request_url?.path_prefix;
  if (pathPrefix !== undefined) {
    score += 80 + Math.min(pathPrefix.length, 1024) / 1024;
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

const SERVER_ONLY_CAPTURE_RULE_RUNTIMES = new Set([
  "dotnet",
  "rust",
  "android",
  "swift",
  "react-native"
]);

/** Server-only actions, newer runtime values, and browser DOM/multi-URL predicates stay authoritative at hosted ingestion. */
export function captureRuleRequiresServerEvaluation(
  rule: Pick<CaptureRule, "matcher"> & Partial<Pick<CaptureRule, "action">>
): boolean {
  if (rule.action === "threshold" || rule.action === "allow") {
    return true;
  }
  const matcher = rule.matcher;
  return (
    matcher.resource_urls !== undefined ||
    matcher.browser_page_visibility_state !== undefined ||
    matcher.browser_page_ready_state !== undefined ||
    matcher.browser_target_tag_name !== undefined ||
    matcher.browser_target_attributes !== undefined ||
    matcher.runtime?.some((runtime) => SERVER_ONLY_CAPTURE_RULE_RUNTIMES.has(runtime)) === true
  );
}

function compareCaptureRules(left: CaptureRule, right: CaptureRule): number {
  const specificityDifference =
    getCaptureRuleSpecificityScore(right) - getCaptureRuleSpecificityScore(left);
  if (specificityDifference !== 0) {
    return specificityDifference;
  }

  if (left.action !== right.action) {
    if (left.action === "allow") return -1;
    if (right.action === "allow") return 1;
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
  const activeRules = rules
    .filter((rule) => isCaptureRuleActive(rule, now))
    .sort(compareCaptureRules);

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
        sample_event_class: null
      };
    }

    if (rule.action === "drop") {
      return {
        rule_id: rule.id,
        action: "drop",
        outcome: "drop",
        sample_rate: null,
        sample_event_class: null
      };
    }

    if (rule.action === "allow") {
      return {
        rule_id: rule.id,
        action: "allow",
        outcome: "allow",
        sample_rate: null,
        sample_event_class: null
      };
    }

    if (rule.action === "threshold") {
      return {
        rule_id: rule.id,
        action: "threshold",
        outcome: "threshold",
        sample_rate: null,
        sample_event_class: null,
        threshold_count: rule.threshold_count ?? null,
        threshold_window_seconds: rule.threshold_window_seconds ?? null,
        threshold_group_by: rule.threshold_group_by ?? null,
        rule_updated_at: rule.updated_at
      };
    }

    const sampledIn = shouldSampleCaptureRuleEvent({
      project_id: context.project_id,
      rule_id: rule.id,
      event_id: context.event_id,
      sample_rate: rule.sample_rate ?? 0
    });

    return {
      rule_id: rule.id,
      action: "sample",
      outcome: sampledIn ? "sampled_in" : "sampled_out",
      sample_rate: rule.sample_rate,
      sample_event_class: rule.sample_event_class
    };
  }

  return null;
}
