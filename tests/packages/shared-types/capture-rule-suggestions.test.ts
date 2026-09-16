import { describe, expect, it } from "vitest";

import { buildCaptureRuleSuggestions } from "../../../packages/shared-types/src/capture-rule-suggestions.ts";

describe("capture rule suggestions", () => {
  it("does not suggest suppressing an unrecognized third-party resource", () => {
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

    expect(suggestions).toEqual([]);
  });

  it("does not suggest sampling application asset failures", () => {
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

    expect(suggestions).toEqual([]);
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

  it("suggests scoped demotion for generic opaque browser Window errors", () => {
    const suggestions = buildCaptureRuleSuggestions({
      incident: {
        incident_id: "inc_126",
        project_id: "proj_123",
        fingerprint: "fp_window_error",
        fingerprint_version: "v1",
        title: "Window error",
        occurrence_count: 4,
        matched_fields: ["browser_event_kind", "normalized_message"]
      },
      bundle: {
        project: { environment: "production" },
        service: { name: "saycheese-frontend" },
        signal: {
          signal_type: "frontend_exception",
          source_event_types: ["frontend_exception"],
          fingerprint: "fp_window_error"
        },
        context: {
          frontend: {
            exceptions: [
              {
                name: "WindowError",
                message: "Window error",
                browser_event: {
                  kind: "window_error",
                  opaque: true
                }
              }
            ]
          }
        }
      }
    });

    expect(suggestions[0]).toMatchObject({
      suggestion_id: "opaque_window_generic_demote",
      recommended_action: "demote",
      confidence: "medium",
      requires_confirmation: true,
      rule: {
        matcher: {
          event_types: ["frontend_exception"],
          runtime: ["browser"],
          services: ["saycheese-frontend"],
          environments: ["production"],
          browser_event_kind: "window_error",
          browser_event_opaque: true,
          message_equals: "Window error"
        }
      }
    });
  });

  it("suggests bot-scoped demotion for generic browser unhandled rejections", () => {
    const suggestions = buildCaptureRuleSuggestions({
      incident: {
        incident_id: "inc_127",
        project_id: "proj_123",
        fingerprint: "fp_googlebot_rejection",
        fingerprint_version: "v1",
        title: "Unhandled promise rejection",
        occurrence_count: 2,
        matched_fields: ["normalized_message"]
      },
      bundle: {
        project: { environment: "production" },
        service: { name: "saycheese-frontend" },
        signal: {
          signal_type: "frontend_exception",
          source_event_types: ["frontend_exception"],
          fingerprint: "fp_googlebot_rejection"
        },
        context: {
          device: {
            user_agent:
              "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/148.0.0.0 Mobile Safari/537.36 Googlebot/2.1"
          },
          frontend: {
            exceptions: [
              {
                name: "UnhandledRejection",
                message: "Unhandled promise rejection"
              }
            ]
          }
        }
      }
    });

    expect(suggestions[0]).toMatchObject({
      suggestion_id: "bot_unhandled_rejection_demote",
      recommended_action: "demote",
      requires_confirmation: true,
      rule: {
        matcher: {
          event_types: ["frontend_exception"],
          runtime: ["browser"],
          services: ["saycheese-frontend"],
          environments: ["production"],
          client_kind: "bot",
          bot_family: "Googlebot",
          message_equals: "Unhandled promise rejection"
        }
      }
    });
  });
});
