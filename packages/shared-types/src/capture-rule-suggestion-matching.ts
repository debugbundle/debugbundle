import type { CaptureRule, CaptureRuleCreate } from "./capture-rule-schemas.js";

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).sort().join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sameAction(rule: CaptureRule, suggestion: CaptureRuleCreate): boolean {
  return (
    rule.action === suggestion.action &&
    rule.sample_rate === suggestion.sample_rate &&
    rule.sample_event_class === suggestion.sample_event_class
  );
}

export function findExistingCaptureRuleForSuggestion(
  rules: readonly CaptureRule[],
  suggestion: CaptureRuleCreate
): CaptureRule | null {
  const matcherKey = stableStringify(suggestion.matcher);
  const exact = rules.find(
    (rule) => sameAction(rule, suggestion) && stableStringify(rule.matcher) === matcherKey
  );
  if (exact !== undefined) return exact;

  const matcher = suggestion.matcher;
  // Historical fingerprint suggestions lacked service/environment predicates.
  // Recognize only that exact prior shape, and return its actual saved scope.
  if (matcher.fingerprint !== undefined) {
    const legacyMatcher = { ...matcher };
    delete legacyMatcher.services;
    delete legacyMatcher.environments;
    const legacyKey = stableStringify(legacyMatcher);
    return (
      rules.find(
        (rule) => sameAction(rule, suggestion) && stableStringify(rule.matcher) === legacyKey
      ) ?? null
    );
  }

  // Original resource suggestions did not constrain element type. That stored
  // scope already covers the new typed suggestion; surface it without rewriting
  // the owner's policy. All other conditions and the action must still agree.
  if (
    matcher.browser_event_kind !== "resource_error" ||
    matcher.browser_target_tag_name === undefined ||
    matcher.resource_url?.host === undefined ||
    matcher.resource_url.path_equals === undefined ||
    matcher.services?.length !== 1 ||
    matcher.environments?.length !== 1
  )
    return null;
  const legacyMatcher = { ...matcher };
  delete legacyMatcher.browser_target_tag_name;
  const legacyKey = stableStringify(legacyMatcher);
  return (
    rules.find(
      (rule) =>
        sameAction(rule, suggestion) &&
        rule.matcher.browser_target_tag_name === undefined &&
        stableStringify(rule.matcher) === legacyKey
    ) ?? null
  );
}
