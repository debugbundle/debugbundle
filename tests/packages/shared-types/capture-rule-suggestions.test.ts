import { describe, expect, it } from "vitest";

import { buildCaptureRuleSuggestions } from "../../../packages/shared-types/src/capture-rule-suggestions.ts";

describe("capture rule suggestions", () => {
  it("suggests demote and drop for third-party browser resource noise", () => {
    const suggestions = buildCaptureRuleSuggestions({
      incident: {
        incident_id: "inc_123",
        project_id: "proj_123",
        fingerprint: "fp_browser_noise",
        fingerprint_version: "v1",
        title: "Browser resource load error",
        occurrence_count: 12,
        matched_fields: ["browser_event_kind", "resource_host"]
      },
      bundle: {
        signal: {
          signal_type: "frontend_exception",
          source_event_types: ["frontend_exception"],
          fingerprint: "fp_browser_noise"
        },
        context: {
          request: {
            path: "/checkout",
            headers: { host: "app.example.com" }
          },
          frontend: {
            exceptions: [
              {
                name: "ResourceLoadError",
                message: "Failed to load resource",
                route: "/checkout",
                browser_event: {
                  kind: "resource_error",
                  target: {
                    source_url: "https://analytics.example.com/tag.js?token=secret#frag"
                  }
                }
              }
            ]
          }
        }
      }
    });

    expect(suggestions.map((entry) => entry.suggestion_id)).toEqual([
      "primary_resource_host_demote",
      "primary_resource_host_drop",
      "exact_fingerprint_demote"
    ]);
    expect(suggestions[0]).toMatchObject({
      recommended_action: "demote",
      confidence: "high",
      rule: {
        matcher: {
          browser_event_kind: "resource_error",
          resource_url: { host: "analytics.example.com" }
        }
      }
    });
    expect(suggestions[1]?.rule.action).toBe("drop");
  });

  it("suggests sampling for first-party resource errors", () => {
    const suggestions = buildCaptureRuleSuggestions({
      incident: {
        incident_id: "inc_124",
        project_id: "proj_123",
        fingerprint: "fp_chunk_error",
        fingerprint_version: "v1",
        title: "Chunk load failure",
        occurrence_count: 3,
        matched_fields: ["browser_event_kind", "resource_path"]
      },
      bundle: {
        signal: {
          signal_type: "frontend_exception",
          source_event_types: ["frontend_exception"],
          fingerprint: "fp_chunk_error"
        },
        context: {
          request: {
            path: "/checkout",
            headers: { host: "app.example.com" }
          },
          frontend: {
            exceptions: [
              {
                name: "ResourceLoadError",
                message: "Failed to load resource",
                route: "/checkout",
                browser_event: {
                  kind: "resource_error",
                  target: {
                    source_url: "https://app.example.com/assets/chunk-9.js?token=secret"
                  }
                }
              }
            ]
          }
        }
      }
    });

    expect(suggestions[0]).toMatchObject({
      suggestion_id: "primary_resource_sample",
      recommended_action: "sample",
      rule: {
        action: "sample",
        sample_rate: 0.25,
        sample_event_class: "preserve",
        matcher: {
          browser_event_kind: "resource_error",
          resource_url: {
            host: "app.example.com",
            path_equals: "/assets/chunk-9.js"
          }
        }
      }
    });
    expect(suggestions.some((entry) => entry.suggestion_id === "primary_resource_host_drop")).toBe(false);
  });

  it("suggests request-event sampling for repeated narrow route failures", () => {
    const suggestions = buildCaptureRuleSuggestions({
      incident: {
        incident_id: "inc_125",
        project_id: "proj_123",
        fingerprint: "fp_request_404",
        fingerprint_version: "v1",
        title: "404 request failure",
        occurrence_count: 20,
        matched_fields: ["status_code", "request_path"]
      },
      bundle: {
        signal: {
          signal_type: "request_failure",
          source_event_types: ["request_event"],
          fingerprint: "fp_request_404"
        },
        context: {
          request: {
            path: "/v1/billing/checkout",
            headers: { host: "api.example.com" }
          },
          response: {
            status_code: 404
          }
        }
      }
    });

    expect(suggestions[0]).toMatchObject({
      suggestion_id: "primary_request_status_sample",
      confidence: "high",
      rule: {
        action: "sample",
        matcher: {
          event_types: ["request_event"],
          request_url: { path_equals: "/v1/billing/checkout" },
          status_codes: [404]
        }
      }
    });
  });
});
