import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEventEnvelope, type EventEnvelope } from "../../packages/shared-types/src/index.js";

export async function createProcessFixtureRepository(): Promise<string> {
  const rootDirectory = await mkdtemp(join(tmpdir(), "debugbundle-process-"));
  await mkdir(join(rootDirectory, ".debugbundle", "local", "events"), { recursive: true });
  return rootDirectory;
}

export async function writeEventBatch(
  rootDirectory: string,
  filename: string,
  events: EventEnvelope[]
): Promise<void> {
  await writeFile(
    join(rootDirectory, ".debugbundle", "local", "events", filename),
    `${JSON.stringify(events, null, 2)}\n`,
    "utf8"
  );
}

export function createBackendExceptionEvent(input: {
  eventId: string;
  occurredAt: string;
  serviceName: string;
  environment?: string;
  message?: string;
  path?: string;
  traceId?: string;
}): EventEnvelope {
  return createEventEnvelope({
    event_id: input.eventId,
    occurred_at: input.occurredAt,
    project_id: "00000000-0000-4000-8000-000000000001",
    event_type: "backend_exception",
    service: {
      name: input.serviceName,
      environment: input.environment ?? "development",
      runtime: "node",
      framework: "fastify"
    },
    correlation: {
      request_id: null,
      trace_id: input.traceId ?? null,
      session_id: null,
      user_id_hash: null
    },
    payload: {
      name: "TypeError",
      message: input.message ?? "Order 123 failed during checkout",
      stack: "TypeError: boom\\n    at handleCheckout (src/checkout.ts:10:2)",
      handled: false,
      request: {
        method: "GET",
        path: input.path ?? "/orders/123",
        query: {
          expand: "summary"
        },
        headers: {
          host: "checkout.local",
          "content-type": "application/json"
        },
        body: {
          attempt: 1
        }
      },
      response: {
        status_code: 500
      },
      runtime: {
        version: "24.0.0"
      }
    }
  });
}

export function createFrontendExceptionEvent(input: {
  eventId: string;
  occurredAt: string;
  serviceName: string;
  environment?: string;
  message?: string;
  route?: string;
  traceId?: string;
}): EventEnvelope {
  return createEventEnvelope({
    event_id: input.eventId,
    occurred_at: input.occurredAt,
    project_id: "00000000-0000-4000-8000-000000000001",
    event_type: "frontend_exception",
    sdk_name: "@debugbundle/sdk-browser",
    sdk_version: "0.1.0",
    service: {
      name: input.serviceName,
      environment: input.environment ?? "development",
      runtime: "browser",
      framework: "react"
    },
    correlation: {
      request_id: null,
      trace_id: input.traceId ?? null,
      session_id: "sess_123",
      user_id_hash: null
    },
    payload: {
      name: "TypeError",
      message: input.message ?? "Checkout button failed",
      stack: "TypeError: checkout failed\n    at handleCheckout (src/checkout.tsx:42:11)",
      route: input.route ?? "/checkout",
      browser: {
        name: "Chrome",
        version: "135"
      },
      breadcrumbs: [
        {
          breadcrumb_type: "click",
          route: input.route ?? "/checkout",
          data: {
            selector: "button[data-testid=submit-order]",
            label: "Submit order"
          },
          ts: input.occurredAt
        }
      ],
      device: {
        user_agent: "Mozilla/5.0",
        os: {
          name: "macOS",
          version: "15.0"
        },
        device_type: "desktop",
        screen: {
          width: 1512,
          height: 982
        },
        viewport: {
          width: 1280,
          height: 720
        },
        device_pixel_ratio: 2,
        touch_capable: false,
        language: "en-US",
        connection_type: "wifi",
        color_scheme_preference: "light"
      },
      dom_context: {
        mode: "lightweight",
        html_excerpt: "<button data-testid=submit-order>Submit order</button>"
      }
    }
  });
}

export function createRequestEvent(input: {
  eventId: string;
  occurredAt: string;
  serviceName: string;
  responseStatus: number;
  environment?: string;
  headers?: Record<string, unknown>;
  method?: string;
  path?: string;
}): EventEnvelope {
  return createEventEnvelope({
    event_id: input.eventId,
    occurred_at: input.occurredAt,
    project_id: "00000000-0000-4000-8000-000000000001",
    event_type: "request_event",
    service: {
      name: input.serviceName,
      environment: input.environment ?? "development",
      runtime: "node",
      framework: "fastify"
    },
    correlation: {
      request_id: null,
      trace_id: null,
      session_id: null,
      user_id_hash: null
    },
    payload: {
      method: input.method ?? "GET",
      path: input.path ?? "/orders/123",
      query: {},
      headers: input.headers ?? {
        host: "checkout.local"
      },
      response_status: input.responseStatus,
      duration_ms: 42
    }
  });
}

export function createLogEvent(input: {
  eventId: string;
  occurredAt: string;
  serviceName: string;
  message: string;
  level?: string;
}): EventEnvelope {
  return createEventEnvelope({
    event_id: input.eventId,
    occurred_at: input.occurredAt,
    project_id: "00000000-0000-4000-8000-000000000001",
    event_type: "log_event",
    service: {
      name: input.serviceName,
      environment: "development",
      runtime: "node",
      framework: "fastify"
    },
    payload: {
      level: input.level ?? "error",
      message: input.message,
      attributes: {
        component: "checkout"
      }
    }
  });
}
