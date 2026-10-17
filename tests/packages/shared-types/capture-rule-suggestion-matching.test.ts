import { describe, expect, it } from "vitest";
import { findExistingCaptureRuleForSuggestion } from "../../../packages/shared-types/src/capture-rule-suggestion-matching.js";
import {
  CaptureRuleSchema,
  type CaptureRuleCreate
} from "../../../packages/shared-types/src/capture-rule-schemas.js";

const suggestion: CaptureRuleCreate = {
  name: "Keep as context",
  description: null,
  enabled: true,
  action: "demote",
  matcher: {
    event_types: ["frontend_exception"],
    browser_event_kind: "resource_error",
    browser_event_opaque: true,
    browser_target_tag_name: "script",
    services: ["web"],
    environments: ["production"],
    resource_url: { host: "www.googletagmanager.com", path_equals: "/gtm.js" }
  },
  sample_rate: null,
  sample_event_class: null,
  created_by_user_id: null,
  created_from_incident_id: "incident",
  created_from_event_id: null,
  expires_at: null
};
function stored(legacy = false) {
  const matcher = { ...suggestion.matcher };
  if (legacy) delete matcher.browser_target_tag_name;
  return CaptureRuleSchema.parse({
    ...suggestion,
    matcher,
    id: "00000000-0000-4000-8000-000000000101",
    project_id: "project",
    hit_count: 9,
    last_matched_at: "2026-09-16T00:00:00.000Z",
    created_at: "2026-09-16T00:00:00.000Z",
    updated_at: "2026-09-16T00:00:00.000Z"
  });
}

describe("capture rule suggestion compatibility", () => {
  it.each([true, false])(
    "recognizes a legacy rule without changing its enabled=%s state or scope",
    (enabled) => {
      const rule = { ...stored(true), enabled };
      const snapshot = structuredClone(rule);
      expect(findExistingCaptureRuleForSuggestion([rule], suggestion)).toBe(rule);
      expect(rule).toEqual(snapshot);
    }
  );
  it("prefers an exact rule when both typed and legacy rules exist", () => {
    const legacy = stored(true);
    const exact = { ...stored(), id: "00000000-0000-4000-8000-000000000102" };
    expect(findExistingCaptureRuleForSuggestion([legacy, exact], suggestion)).toBe(exact);
  });
  it.each([
    { action: "drop" as const },
    { matcher: { ...suggestion.matcher, browser_target_tag_name: "img" } },
    { matcher: { ...suggestion.matcher, services: ["admin"] } },
    { matcher: { ...suggestion.matcher, environments: ["staging"] } },
    { matcher: { ...suggestion.matcher, browser_event_opaque: false } },
    {
      matcher: {
        ...suggestion.matcher,
        resource_url: { host: "www.googletagmanager.com", path_equals: "/gtag/js" }
      }
    },
    {
      matcher: {
        event_types: ["frontend_exception" as const],
        resource_url: { host: "www.googletagmanager.com" }
      }
    }
  ])("keeps other actions and scopes separate: %j", (override) => {
    expect(
      findExistingCaptureRuleForSuggestion([{ ...stored(true), ...override }], suggestion)
    ).toBeNull();
  });
  it("preserves order-independent exact matching for ordinary rules", () => {
    const rule = stored();
    rule.matcher.services = ["web", "admin"];
    expect(
      findExistingCaptureRuleForSuggestion([rule], {
        ...suggestion,
        matcher: { ...suggestion.matcher, services: ["admin", "web"] }
      })
    ).toBe(rule);
  });

  it.each([true, false])("preserves legacy fingerprint rules with enabled=%s", (enabled) => {
    const matcher = {
      event_types: ["frontend_exception" as const],
      fingerprint: { version: "v2", value: "hash" }
    };
    const legacy = { ...stored(), enabled, matcher };
    const scoped = {
      ...suggestion,
      matcher: { ...matcher, services: ["web"], environments: ["production"] }
    };
    const exact = { ...legacy, matcher: scoped.matcher };
    const snapshot = structuredClone(legacy);
    expect(findExistingCaptureRuleForSuggestion([legacy], scoped)).toBe(legacy);
    expect(findExistingCaptureRuleForSuggestion([legacy, exact], scoped)).toBe(exact);
    expect(legacy).toEqual(snapshot);
    for (const changed of [
      { ...legacy, action: "drop" as const },
      { ...legacy, matcher: { ...matcher, services: ["admin"] } },
      { ...legacy, matcher: { ...matcher, fingerprint: { version: "v1", value: "hash" } } },
      { ...legacy, matcher: { ...matcher, fingerprint: { version: "v2", value: "other" } } }
    ])
      expect(findExistingCaptureRuleForSuggestion([changed], scoped)).toBeNull();
  });
});
