import { describe, expect, it } from "vitest";
import { buildCaptureRuleSuggestions } from "../../../packages/shared-types/src/capture-rule-suggestions.js";
import {
  buildCaptureRuleEvaluationContext,
  CaptureRuleSchema,
  evaluateCaptureRules
} from "../../../packages/shared-types/src/capture-rules.js";
import { browserResourceEvent } from "../../helpers/browser-resource-fixtures.js";
import { describeBrowserResource } from "../../../packages/shared-types/src/browser-resource.js";
import { buildBrowserResourceSuggestions } from "../../../packages/shared-types/src/browser-resource-suggestions.js";

function suggestions(url: string, page?: string | null, relatedUrl?: string) {
  const event = browserResourceEvent({ url, page });
  return buildCaptureRuleSuggestions({
    incident: {
      incident_id: "incident",
      project_id: "project",
      fingerprint: "hash",
      fingerprint_version: "v2",
      title: "Browser resource load error",
      occurrence_count: 10,
      matched_fields: []
    },
    bundle: {
      project: { environment: event.service.environment },
      service: { name: event.service.name },
      signal: {
        signal_type: "frontend_exception",
        source_event_types:
          relatedUrl === undefined ? [event.event_type] : ["backend_exception", event.event_type],
        fingerprint: "hash"
      },
      context: {
        ...(relatedUrl === undefined
          ? {}
          : { resource_failure: describeBrowserResource(event.payload.browser_event)! }),
        frontend: {
          exceptions: [
            event.payload,
            ...(relatedUrl === undefined ? [] : [browserResourceEvent({ url: relatedUrl }).payload])
          ]
        }
      }
    }
  });
}

describe("resource noise policy", () => {
  it("does not recommend tracker suppression for an application exception with related resource context", () => {
    const event = browserResourceEvent();
    expect(
      buildCaptureRuleSuggestions({
        incident: {
          incident_id: "incident",
          project_id: "project",
          fingerprint: "hash",
          fingerprint_version: "v2",
          title: "Checkout failed",
          occurrence_count: 1,
          matched_fields: []
        },
        bundle: {
          project: { environment: "production" },
          service: { name: "web" },
          signal: {
            signal_type: "frontend_exception",
            source_event_types: ["frontend_exception"],
            fingerprint: "hash"
          },
          context: {
            error: { name: "TypeError", message: "Checkout failed" },
            frontend: { exceptions: [event.payload] }
          }
        }
      })
    ).toMatchObject([
      {
        suggestion_id: "exact_fingerprint_demote",
        requires_confirmation: true,
        rule: { matcher: { fingerprint: { version: "v2", value: "hash" } } }
      }
    ]);
  });
  it("uses the incident resource instead of a related exception when recommending noise rules", () => {
    const tracker = "https://www.googletagmanager.com/gtm.js";
    const signIn = "https://accounts.google.com/gsi/client";
    expect(
      suggestions(tracker, undefined, signIn).map((item) => item.rule.matcher.resource_url)
    ).toEqual([
      { host: "www.googletagmanager.com", path_equals: "/gtm.js" },
      { host: "www.googletagmanager.com", path_equals: "/gtm.js" }
    ]);
    expect(suggestions(signIn, undefined, tracker)).toEqual([]);
  });
  it("keeps other resources, application errors, services and environments outside a suggested rule", () => {
    const suggestion = suggestions("https://www.googletagmanager.com/gtm.js")[0]!;
    const rule = CaptureRuleSchema.parse({
      ...suggestion.rule,
      id: "00000000-0000-4000-8000-000000000101",
      project_id: "project",
      hit_count: 0,
      last_matched_at: null,
      created_at: "2026-09-16T00:00:00.000Z",
      updated_at: "2026-09-16T00:00:00.000Z"
    });
    const event = browserResourceEvent();
    const evaluate = (candidate: typeof event) =>
      evaluateCaptureRules(
        [rule],
        buildCaptureRuleEvaluationContext({ project_id: "project", event: candidate }),
        "2026-09-16T00:00:00.000Z"
      );
    expect(evaluate(event)?.outcome).toBe("demote");
    for (const candidate of [
      browserResourceEvent({ url: "https://www.googletagmanager.com/gtag/js" }),
      browserResourceEvent({ url: "https://accounts.google.com/gsi/client" }),
      browserResourceEvent({ url: "/assets/main.js" }),
      { ...event, service: { ...event.service, name: "admin" } },
      { ...event, service: { ...event.service, environment: "staging" } },
      {
        ...event,
        payload: {
          ...event.payload,
          browser_event: { ...event.payload.browser_event!, kind: "window_error" as const }
        }
      },
      {
        ...event,
        payload: {
          ...event.payload,
          browser_event: { ...event.payload.browser_event!, opaque: false }
        }
      }
    ])
      expect(evaluate(candidate)).toBeNull();
  });
  it("suggests exact resource, service and environment for recognized tracker candidates", () => {
    const result = suggestions("https://www.googletagmanager.com/gtm.js?id=private");
    const demote = result.find(
      (item) => item.rule.action === "demote" && item.rule.matcher.resource_url
    );
    expect(demote?.rule.matcher).toMatchObject({
      event_types: ["frontend_exception"],
      browser_event_kind: "resource_error",
      browser_event_opaque: true,
      services: ["web"],
      environments: ["production"],
      resource_url: { host: "www.googletagmanager.com", path_equals: "/gtm.js" }
    });
    expect(JSON.stringify(result)).not.toContain("private");
    expect(demote?.requires_confirmation).toBe(true);
  });

  it.each([
    "https://accounts.google.com/gsi/client",
    "https://app.example.com/assets/main.js",
    "https://cdn.example.com/unknown.js",
    "https://www.googletagmanager.com.evil.example/gtm.js"
  ])("does not recommend suppressing a functional or unknown resource: %s", (url) => {
    expect(suggestions(url)).toEqual([]);
  });

  it("compares absolute resource URLs with the captured page origin", () => {
    const event = browserResourceEvent({ url: "https://app.example.com/assets/main.js" });
    const context = buildCaptureRuleEvaluationContext({ project_id: "project", event });
    expect(context.first_party).toBe(true);
    const withoutOrigin = buildCaptureRuleEvaluationContext({
      project_id: "project",
      event: browserResourceEvent({ page: null })
    });
    expect(withoutOrigin.first_party).toBeUndefined();
  });

  it("suggests only lifecycle-scoped demotion for hidden first-party preloads", () => {
    const event = browserResourceEvent({
      url: "https://app.example.com/assets/app-8f3a.js?signature=secret",
      page: "https://app.example.com/gallery",
      tag: "link",
      readyState: "interactive",
      visibilityState: "hidden",
      attributes: { rel: "modulepreload", as: "script" }
    });
    const result = buildCaptureRuleSuggestions({
      incident: {
        incident_id: "incident",
        project_id: "project",
        fingerprint: "hash",
        fingerprint_version: "v2",
        title: "Browser resource load error",
        occurrence_count: 3,
        matched_fields: []
      },
      bundle: {
        project: { environment: "production" },
        service: { name: "web" },
        signal: {
          signal_type: "frontend_exception",
          source_event_types: ["frontend_exception"],
          fingerprint: "hash"
        },
        context: {
          resource_failure: describeBrowserResource(event.payload.browser_event)!,
          frontend: { exceptions: [event.payload] }
        }
      }
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      suggestion_id: "hidden_preload_demote",
      recommended_action: "demote",
      confidence: "medium",
      requires_confirmation: true,
      rule: {
        matcher: {
          event_types: ["frontend_exception"],
          services: ["web"],
          environments: ["production"],
          first_party: true,
          browser_event_kind: "resource_error",
          browser_event_opaque: true,
          browser_page_visibility_state: "hidden",
          browser_page_ready_state: "interactive",
          browser_target_tag_name: "link",
          browser_target_attributes: { rel: "modulepreload" },
          resource_url: { host: "app.example.com", path_prefix: "/assets/" }
        }
      }
    });
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it.each([
    ["https://accounts.google.com/gsi/client", "https://accounts.google.com/login"],
    ["https://app.example.com/api/session", "https://app.example.com/gallery"]
  ])(
    "does not infer a safe asset suppression rule for a hidden non-asset preload: %s",
    (url, page) => {
      const event = browserResourceEvent({
        url,
        page,
        tag: "link",
        readyState: "interactive",
        visibilityState: "hidden",
        attributes: { rel: "preload", as: "script" }
      });
      expect(
        buildBrowserResourceSuggestions({
          browserEvent: event.payload.browser_event,
          service: "web",
          environment: "production",
          incident: {
            incident_id: "incident",
            project_id: "project",
            fingerprint: "hash",
            fingerprint_version: "v2",
            title: "Resource failed",
            occurrence_count: 1,
            matched_fields: []
          }
        })
      ).toEqual([]);
    }
  );
});
