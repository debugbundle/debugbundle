import { createEventEnvelope } from "../../packages/shared-types/src/index.js";

export function browserResourceEvent(
  input: {
    url?: string | null;
    route?: string;
    page?: string | null | undefined;
    tag?: string | null;
    readyState?: "loading" | "interactive" | "complete" | null;
    visibilityState?: "visible" | "hidden" | "prerender" | "unloaded" | null;
    attributes?: {
      rel?: string;
      as?: string;
      type?: string;
      media?: string;
      cross_origin?: string;
      async?: boolean;
      defer?: boolean;
      integrity_present?: boolean;
    };
  } = {}
) {
  const event = createEventEnvelope({
    event_type: "frontend_exception",
    service: { name: "web", environment: "production", runtime: "browser", framework: "react" },
    payload: {
      name: "Error",
      message: "Browser resource load error",
      stack: "Error: Browser resource load error",
      route: input.route ?? "/login",
      browser: { name: "Chrome", version: "130" },
      browser_event: {
        kind: "resource_error",
        message: null,
        file_name: null,
        line_number: null,
        column_number: null,
        target: {
          tag_name: input.tag === undefined ? "script" : input.tag,
          source_url:
            input.url === undefined
              ? "https://www.googletagmanager.com/gtm.js?id=secret#fragment"
              : input.url,
          ...(input.attributes === undefined ? {} : { attributes: input.attributes })
        },
        page: {
          url: input.page === undefined ? "https://app.example.com/login" : input.page,
          referrer: null,
          ready_state: input.readyState === undefined ? "complete" : input.readyState,
          visibility_state: input.visibilityState === undefined ? "visible" : input.visibilityState
        },
        opaque: true
      }
    }
  });
  return { ...event, service: { ...event.service, runtime: "browser" } };
}
