import { BundleV1Schema, type BundleV1 } from "../../packages/shared-types/src/index.js";

export const jsonScalarStringFixtureInput = "line one\r\nline two\u0000's value";
export const redactedJsonScalarStringFixtureInput = "[REDACTED]\r\ncustomer-visible\u0000's value";

export function createBundleWithRequestContext(): BundleV1 {
  return BundleV1Schema.parse({
    bundle_version: 1,
    bundle_id: "bnd_repro_fixture",
    bundle_type: "failure",
    captured_at: "2026-03-12T00:00:00.000Z",
    sdk: {
      name: "debugbundle-node",
      version: "0.1.0"
    },
    project: {
      id: "proj_fixture",
      slug: "project-proj_fixture",
      environment: "production"
    },
    service: {
      id: "svc_fixture",
      name: "checkout-api",
      runtime: "node",
      framework: "fastify",
      version: null,
      region: null
    },
    signal: {
      signal_id: "inc_fixture",
      signal_type: "request_failure",
      severity: "high",
      fingerprint: "fp_fixture",
      first_seen_at: "2026-03-12T00:00:00.000Z",
      last_seen_at: "2026-03-12T00:00:00.000Z",
      occurrence_count: 1,
      source_event_types: ["request_event"]
    },
    summary: {
      title: "Checkout request failed",
      description: "Checkout request failed",
      likely_cause: null,
      confidence: 0.75,
      recommended_action: null,
      severity: "high",
      error_type: null,
      error_message: null,
      first_application_frame: null,
      primary_signal: "request_event",
      signals: {
        new_deploy: false,
        regression_suspected: false,
        customer_visible: false
      }
    },
    impact: {
      affected_users_estimate: 1,
      affected_requests_estimate: 1,
      business_criticality: "high",
      customer_visible: false,
      regression_suspected: false
    },
    context: {
      error: null,
      request: {
        version: 1,
        method: "POST",
        path: "/checkout",
        route_template: "/checkout",
        query: {
          coupon: "SAVE10"
        },
        headers: {
          "content-type": "application/json"
        },
        body: {
          amount: 42
        },
        request_id: "req_fixture"
      },
      response: {
        version: 1,
        status_code: 500,
        duration_ms: 120
      },
      logs: null,
      frontend: null,
      environment: null,
      deploy: null,
      runtime: null,
      git: null,
      dependencies: null,
      probe_data: {
        version: 1,
        items: []
      },
      device: null
    },
    reproduction: {
      possible: false,
      confidence: 0,
      reason: "reproduction_not_generated",
      artifacts: null,
      feasibility_reference: null
    },
    verification: {
      verification_type: null,
      synthetic: false,
      local_verified: false,
      production_verified: false
    },
    links: {
      self: null,
      reproduction: null,
      incident: null,
      project: null,
      docs: null
    },
    redaction: {
      redacted: true,
      fields: [],
      notes: null
    },
    metadata: {
      created_at: "2026-03-12T00:00:00.000Z",
      updated_at: "2026-03-12T00:00:00.000Z",
      generator_version: "bundle-engine@0.1.0",
      generation_number: 1
    }
  });
}

type RequestContext = NonNullable<BundleV1["context"]["request"]>;

function withRequest(mutate: (request: RequestContext) => void): BundleV1 {
  const bundle = createBundleWithRequestContext();
  const request = bundle.context.request;
  if (request === null || request === undefined) {
    throw new Error("request_context_expected");
  }
  mutate(request);
  return bundle;
}

export function createBundleWithForwardedRequestContext(): BundleV1 {
  return withRequest((request) => {
  request.method = "GET";
  request.path = "/api/orders/123";
  request.route_template = "/api/orders/{order_id}";
  request.query = {
    expand: ["customer", "payments"],
    attempt: 2,
    include_failed: true
  };
  request.headers = {
    accept: ["application/json", "application/problem+json"],
    host: "internal.service.local",
    "x-forwarded-host": "api.example.com",
    "x-forwarded-proto": "http",
    "x-retry-count": 2,
    "x-trace": "trace_123"
  };
  request.body = null;

  });
}

export function createBundleWithNoisyBrowserHeadersRequestContext(): BundleV1 {
  return withRequest((request) => {
  request.method = "POST";
  request.path = "/v1/github/app/install-url";
  request.route_template = "/v1/github/app/install-url";
  request.query = {
    from: "dashboard"
  };
  request.headers = {
    accept: "application/json",
    "accept-encoding": "gzip, deflate, br, zstd",
    "accept-language": "en-US,en;q=0.9",
    authorization: "[REDACTED]",
    "cache-control": "max-age=0",
    connection: "keep-alive",
    "content-length": "17",
    "content-type": "application/json",
    cookie: "[REDACTED]",
    host: "api.internal.local",
    origin: "https://app.debugbundle.com",
    priority: "u=1, i",
    "sec-ch-ua": '"Chromium";v="123"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-site",
    "user-agent": "Mozilla/5.0",
    "x-debugbundle-trace-id": "trace_install_url",
    "x-forwarded-host": "api.debugbundle.com",
    "x-forwarded-proto": "https",
    "x-request-id": "req_install_url"
  };
  request.body = {
    installation_id: "123"
  };

  });
}

export function createBundleWithPlainTextRequestBody(): BundleV1 {
  return withRequest((request) => {
  request.method = "PUT";
  request.path = "/notes/incident-1";
  request.route_template = "/notes/{incident_id}";
  request.headers = {
    "content-type": "text/plain; charset=utf-8",
    "x-trace": "trace_plain_text"
  };
  request.body = "timeout exceeded on upstream retry";

  });
}

export function createBundleWithFormRequestBody(): BundleV1 {
  return withRequest((request) => {
  request.method = "POST";
  request.path = "/sessions";
  request.route_template = "/sessions";
  request.query = {};
  request.headers = {
    accept: "text/plain",
    "content-type": "application/x-www-form-urlencoded"
  };
  request.body = {
    email: "ops@example.com",
    remember: true,
    tags: ["urgent", "vip"]
  };

  });
}

export function createBundleWithScalarRequestBody(): BundleV1 {
  return withRequest((request) => {
  request.method = "POST";
  request.path = "/feature-flags/incident-1/retry";
  request.route_template = "/feature-flags/{incident_id}/retry";
  request.query = {};
  request.headers = {
    "content-type": "application/octet-stream"
  };
  request.body = false;

  });
}

export function createBundleWithJsonScalarRequestBody(body: string | number | boolean | null): BundleV1 {
  return withRequest((request) => {
  request.method = "POST";
  request.path = "/imports/scalar";
  request.route_template = "/imports/scalar";
  request.query = {
    mode: "scalar"
  };
  request.headers = {
    "content-type": "application/json",
    "x-trace": "trace_json_scalar"
  };
  request.body = body;

  });
}

export function createBundleWithRedactedJsonScalarRequestBody(body: string | number | boolean | null): BundleV1 {
  const bundle = createBundleWithJsonScalarRequestBody(body);
  const request = bundle.context.request;
  if (request === null || request === undefined) {
    throw new Error("request_context_expected");
  }

  request.headers = {
    authorization: "[REDACTED]",
    "content-type": "application/json",
    "x-trace": "trace_redacted_json_scalar"
  };

  return bundle;
}

export function createBundleWithRedactedJsonNullScalarRequestBody(): BundleV1 {
  const bundle = createBundleWithRedactedJsonScalarRequestBody(null);
  const request = bundle.context.request;
  if (request === null || request === undefined) {
    throw new Error("request_context_expected");
  }

  request.query = {
    mode: "redacted-null-scalar"
  };
  request.headers = {
    authorization: "[REDACTED]",
    "content-type": "application/json",
    "x-note": "[REDACTED]\tnull\r\nbranch"
  };

  return bundle;
}

export function createBundleWithRedactedRepeatedHeaderArrayRequestContext(): BundleV1 {
  return withRequest((request) => {
  request.method = "POST";
  request.path = "/imports/headers";
  request.route_template = "/imports/headers";
  request.query = {
    mode: "redacted-repeated-headers"
  };
  request.headers = {
    accept: "application/json",
    authorization: ["[REDACTED]\u0007", "[REDACTED]\tfallback"],
    "content-type": "application/json",
    "x-token": ["[REDACTED]\u0000", "[REDACTED]\r\nsecondary"]
  };
  request.body = {
    action: "replay",
    status: "[REDACTED]"
  };

  });
}

export function createBundleWithRedactedRepeatedQueryArrayRequestContext(): BundleV1 {
  return withRequest((request) => {
  request.method = "GET";
  request.path = "/imports/query-redaction";
  request.route_template = "/imports/query-redaction";
  request.headers = {
    accept: "application/json",
    "content-type": "application/json"
  };
  request.query = {
    mode: "redacted-query-array",
    token: ["[REDACTED]\u0000", "[REDACTED]\tfallback"],
    scope: ["[REDACTED]\r\ntier", "[REDACTED]\u0007region"]
  };
  request.body = {
    action: "lookup"
  };

  });
}

export function createBundleWithRedactedRepeatedMixedScalarQueryArrayRequestContext(): BundleV1 {
  return withRequest((request) => {
  request.method = "GET";
  request.path = "/imports/query-redaction";
  request.route_template = "/imports/query-redaction";
  request.headers = {
    accept: "application/json",
    "content-type": "application/json"
  };
  request.query = {
    mode: "redacted-query-array-mixed",
    token: ["[REDACTED]\u0000", 0, false, "[REDACTED]\tfallback"],
    scope: ["[REDACTED]\r\ntier", 1, true]
  };
  request.body = {
    action: "lookup"
  };

  });
}

export function createBundleWithRedactedRepeatedStringLiteralQueryArrayRequestContext(): BundleV1 {
  return withRequest((request) => {
  request.method = "GET";
  request.path = "/imports/query-redaction";
  request.route_template = "/imports/query-redaction";
  request.headers = {
    accept: "application/json",
    "content-type": "application/json"
  };
  request.query = {
    mode: "redacted-query-array-string-literals",
    token: ["[REDACTED]\u0000", "0", "false", "[REDACTED]\tfallback"],
    scope: ["[REDACTED]\r\ntier", "1", "true"]
  };
  request.body = {
    action: "lookup"
  };

  });
}

export function createBundleWithRedactedRepeatedSignedDecimalStringLiteralQueryArrayRequestContext(): BundleV1 {
  return withRequest((request) => {
  request.method = "GET";
  request.path = "/imports/query-redaction";
  request.route_template = "/imports/query-redaction";
  request.headers = {
    accept: "application/json",
    "content-type": "application/json"
  };
  request.query = {
    mode: "redacted-query-array-signed-decimal-strings",
    token: ["[REDACTED]\u0000", "-1", "2.75", "[REDACTED]\tfallback"],
    scope: ["[REDACTED]\r\ntier", "3.14", "-0.5"]
  };
  request.body = {
    action: "lookup"
  };

  });
}

export function createBundleWithRedactedRepeatedNumericDecimalQueryArrayRequestContext(): BundleV1 {
  return withRequest((request) => {
  request.method = "GET";
  request.path = "/imports/query-redaction";
  request.route_template = "/imports/query-redaction";
  request.headers = {
    accept: "application/json",
    "content-type": "application/json"
  };
  request.query = {
    mode: "redacted-query-array-numeric-decimals",
    token: ["[REDACTED]\u0000", -1, 2.75, "[REDACTED]\tfallback"],
    scope: ["[REDACTED]\r\ntier", 3.14, -0.5]
  };
  request.body = {
    action: "lookup"
  };

  });
}

export function createBundleWithRedactedRepeatedNullQueryArrayRequestContext(): BundleV1 {
  return withRequest((request) => {
  request.method = "GET";
  request.path = "/imports/query-redaction";
  request.route_template = "/imports/query-redaction";
  request.headers = {
    accept: "application/json",
    "content-type": "application/json"
  };
  request.query = {
    mode: "redacted-query-array-null",
    token: ["[REDACTED]\u0000", null, "[REDACTED]\tfallback"],
    scope: [null, "[REDACTED]\r\ntier"]
  };
  request.body = {
    action: "lookup"
  };

  });
}

export function createBundleWithRedactedRepeatedEmptyStringQueryArrayRequestContext(): BundleV1 {
  return withRequest((request) => {
  request.method = "GET";
  request.path = "/imports/query-redaction";
  request.route_template = "/imports/query-redaction";
  request.headers = {
    accept: "application/json",
    "content-type": "application/json"
  };
  request.query = {
    mode: "redacted-query-array-empty-string",
    token: ["[REDACTED]\u0000", "", "[REDACTED]\tfallback"],
    scope: ["", "[REDACTED]\r\ntier"]
  };
  request.body = {
    action: "lookup"
  };

  });
}

export function createBundleWithRedactedOmittedQueryRequestContext(): BundleV1 {
  return withRequest((request) => {
  request.method = "GET";
  request.path = "/imports/query-redaction";
  request.route_template = "/imports/query-redaction";
  request.headers = {
    accept: "application/json",
    "content-type": "application/json"
  };
  request.query = {
    mode: "redacted-query-omitted"
  };
  request.body = {
    action: "lookup"
  };

  });
}

export function createBundleWithRedactedNullStringScalarQueryRequestContext(): BundleV1 {
  return withRequest((request) => {
  request.method = "GET";
  request.path = "/imports/query-redaction";
  request.route_template = "/imports/query-redaction";
  request.headers = {
    accept: "application/json",
    "content-type": "application/json"
  };
  request.query = {
    mode: "redacted-query-scalar-null-string",
    token: "null",
    scope: "null"
  };
  request.body = {
    action: "lookup"
  };

  });
}

export function createBundleWithRedactedEmptyStringScalarQueryRequestContext(): BundleV1 {
  return withRequest((request) => {
  request.method = "GET";
  request.path = "/imports/query-redaction";
  request.route_template = "/imports/query-redaction";
  request.headers = {
    accept: "application/json",
    "content-type": "application/json"
  };
  request.query = {
    mode: "redacted-query-scalar-empty-string",
    token: "",
    scope: ""
  };
  request.body = {
    action: "lookup"
  };

  });
}

export function createBundleWithRedactedScalarQueryRequestContext(): BundleV1 {
  return withRequest((request) => {
  request.method = "GET";
  request.path = "/imports/query-redaction";
  request.route_template = "/imports/query-redaction";
  request.headers = {
    accept: "application/json",
    "content-type": "application/json"
  };
  request.query = {
    mode: "redacted-query-scalar",
    token: "[REDACTED]\u0000",
    scope: "[REDACTED]\r\ntier"
  };
  request.body = {
    action: "lookup"
  };

  });
}

export function createBundleWithAbsentBodyRequestContext(): BundleV1 {
  return withRequest((request) => {
  request.method = "POST";
  request.path = "/imports/empty-body";
  request.route_template = "/imports/empty-body";
  request.query = {
    mode: "absent"
  };
  request.headers = {
    "content-type": "application/json",
    "x-trace": "trace_absent_body"
  };
  delete request.body;

  });
}

export function createBundleWithRedactedAbsentBodyRequestContext(): BundleV1 {
  const bundle = createBundleWithAbsentBodyRequestContext();
  const request = bundle.context.request;
  if (request === null || request === undefined) {
    throw new Error("request_context_expected");
  }

  request.query = {
    mode: "redacted-absent"
  };
  request.headers = {
    authorization: "[REDACTED]",
    "content-type": "application/json",
    "x-trace": "trace_redacted_absent_body"
  };

  return bundle;
}

export function createBundleWithEmptyTextRequestBody(): BundleV1 {
  const bundle = createBundleWithAbsentBodyRequestContext();
  const request = bundle.context.request;
  if (request === null || request === undefined) {
    throw new Error("request_context_expected");
  }

  request.headers = {
    "content-type": "text/plain; charset=utf-8",
    "x-trace": "trace_empty_text"
  };
  request.query = {
    mode: "empty-text"
  };
  request.body = "";

  return bundle;
}

export function createBundleWithEmptyJsonStringRequestBody(): BundleV1 {
  const bundle = createBundleWithAbsentBodyRequestContext();
  const request = bundle.context.request;
  if (request === null || request === undefined) {
    throw new Error("request_context_expected");
  }

  request.query = {
    mode: "empty-json"
  };
  request.headers = {
    "content-type": "application/json",
    "x-trace": "trace_empty_json"
  };
  request.body = "";

  return bundle;
}

export function createBundleWithEmptyJsonObjectRequestBody(): BundleV1 {
  const bundle = createBundleWithAbsentBodyRequestContext();
  const request = bundle.context.request;
  if (request === null || request === undefined) {
    throw new Error("request_context_expected");
  }

  request.query = {
    mode: "empty-object"
  };
  request.headers = {
    "content-type": "application/json",
    "x-trace": "trace_empty_object"
  };
  request.body = {};

  return bundle;
}

export function createBundleWithEmptyJsonArrayRequestBody(): BundleV1 {
  const bundle = createBundleWithAbsentBodyRequestContext();
  const request = bundle.context.request;
  if (request === null || request === undefined) {
    throw new Error("request_context_expected");
  }

  request.query = {
    mode: "empty-array"
  };
  request.headers = {
    "content-type": "application/json",
    "x-trace": "trace_empty_array"
  };
  request.body = [];

  return bundle;
}

export function createBundleWithRedactedEmptyJsonObjectRequestBody(): BundleV1 {
  const bundle = createBundleWithEmptyJsonObjectRequestBody();
  const request = bundle.context.request;
  if (request === null || request === undefined) {
    throw new Error("request_context_expected");
  }

  request.headers = {
    authorization: "[REDACTED]",
    "content-type": "application/json",
    "x-trace": "trace_redacted_empty_object"
  };

  return bundle;
}

export function createBundleWithRedactedEmptyTextRequestBody(): BundleV1 {
  const bundle = createBundleWithEmptyTextRequestBody();
  const request = bundle.context.request;
  if (request === null || request === undefined) {
    throw new Error("request_context_expected");
  }

  request.query = {
    mode: "redacted-empty-text"
  };
  request.headers = {
    authorization: "[REDACTED]",
    "content-type": "text/plain; charset=utf-8",
    "x-note": "[REDACTED]\tqueued\r\nowner"
  };
  request.body = "";

  return bundle;
}

export function createBundleWithRedactedEmptyJsonStringRequestBody(): BundleV1 {
  const bundle = createBundleWithEmptyJsonStringRequestBody();
  const request = bundle.context.request;
  if (request === null || request === undefined) {
    throw new Error("request_context_expected");
  }

  request.query = {
    mode: "redacted-empty-json-string"
  };
  request.headers = {
    authorization: "[REDACTED]",
    "content-type": "application/json",
    "x-note": "[REDACTED]\tqueued\r\nowner"
  };
  request.body = "";

  return bundle;
}

export function createBundleWithRedactedEmptyJsonArrayRequestBody(): BundleV1 {
  const bundle = createBundleWithEmptyJsonArrayRequestBody();
  const request = bundle.context.request;
  if (request === null || request === undefined) {
    throw new Error("request_context_expected");
  }

  request.headers = {
    authorization: "[REDACTED]",
    "content-type": "application/json",
    "x-trace": "trace_redacted_empty_array"
  };

  return bundle;
}

export function createBundleWithRedactedPlainTextRequestBody(): BundleV1 {
  const bundle = createBundleWithPlainTextRequestBody();
  const request = bundle.context.request;
  if (request === null || request === undefined) {
    throw new Error("request_context_expected");
  }

  request.headers = {
    authorization: "[REDACTED]",
    "content-type": "text/plain; charset=utf-8",
    "x-trace": "trace_redacted_plain_text"
  };
  request.body = "apiKey=[REDACTED]; note=customer token removed";

  return bundle;
}

export function createBundleWithRedactedFormRequestBody(): BundleV1 {
  const bundle = createBundleWithFormRequestBody();
  const request = bundle.context.request;
  if (request === null || request === undefined) {
    throw new Error("request_context_expected");
  }

  request.headers = {
    accept: "text/plain",
    authorization: "[REDACTED]",
    "content-type": "application/x-www-form-urlencoded"
  };
  request.body = {
    email: "[REDACTED]",
    password: "[REDACTED]",
    tags: ["urgent", "[REDACTED]"]
  };

  return bundle;
}

export function createBundleWithStructuredFormRequestBody(): BundleV1 {
  const bundle = createBundleWithFormRequestBody();
  const request = bundle.context.request;
  if (request === null || request === undefined) {
    throw new Error("request_context_expected");
  }

  request.path = "/imports";
  request.route_template = "/imports";
  request.headers = {
    accept: "application/json",
    "content-type": "application/x-www-form-urlencoded"
  };
  request.body = {
    attempts: 3,
    filters: {
      archived: false,
      source: "dashboard"
    },
    mode: null,
    tags: ["alpha", 7, null, true]
  };

  return bundle;
}

export function createBundleWithShellQuotedRequestContext(): BundleV1 {
  const bundle = createBundleWithPlainTextRequestBody();
  const request = bundle.context.request;
  if (request === null || request === undefined) {
    throw new Error("request_context_expected");
  }

  request.method = "POST";
  request.path = "/teams/o'hara/import";
  request.route_template = "/teams/{team_slug}/import";
  request.query = {
    q: "name=O'Hara & status=active",
    redirect: "https://example.com/callback?x=1&y=two"
  };
  request.headers = {
    "content-type": "text/plain; charset=utf-8",
    "x-note": "owner's \"special\" import & review"
  };
  request.body = "owner='ops' & status=ready";

  return bundle;
}

export function createBundleWithMultilineControlCharacterRequestContext(): BundleV1 {
  const bundle = createBundleWithPlainTextRequestBody();
  const request = bundle.context.request;
  if (request === null || request === undefined) {
    throw new Error("request_context_expected");
  }

  request.method = "PATCH";
  request.path = "/notes/control-check";
  request.route_template = "/notes/{note_id}";
  request.query = {
    mode: "multiline"
  };
  request.headers = {
    "content-type": "text/plain; charset=utf-8",
    "x-note": "queued\tfor review\r\nowner=ops\u0007"
  };
  request.body = "line one\r\nline two\nline\tthree\u0000";

  return bundle;
}

export function createBundleWithStructuredJsonRequestBody(): BundleV1 {
  return withRequest((request) => {
  request.method = "POST";
  request.path = "/imports/preview";
  request.route_template = "/imports/preview";
  request.query = {
    draft: true
  };
  request.headers = {
    "content-type": "application/json",
    "x-trace": "trace_structured_json"
  };
  request.body = {
    metadata: {
      note: "line one\r\nline two\u0000",
      owner: "ops"
    },
    retry: {
      attempts: 2,
      enabled: true
    },
    steps: [
      {
        action: "open",
        target: "/checkout"
      },
      {
        action: "confirm",
        payload: {
          code: "A-1",
          note: "ship\nnow\u0007"
        }
      }
    ],
    tags: ["vip", "priority"]
  };

  });
}

export function createBundleWithRedactedStructuredJsonRequestBody(): BundleV1 {
  const bundle = createBundleWithStructuredJsonRequestBody();
  const request = bundle.context.request;
  if (request === null || request === undefined) {
    throw new Error("request_context_expected");
  }

  request.headers = {
    authorization: "[REDACTED]",
    "content-type": "application/json",
    "x-trace": "trace_redacted_structured_json"
  };
  request.body = {
    metadata: {
      note: "[REDACTED]\r\ncustomer-visible",
      owner: "ops"
    },
    retry: {
      attempts: 2,
      enabled: true
    },
    secrets: {
      apiKey: "[REDACTED]",
      nested: {
        token: "[REDACTED]\u0000"
      }
    },
    steps: [
      {
        action: "confirm",
        payload: {
          code: "A-1",
          password: "[REDACTED]\u0007"
        }
      }
    ]
  };

  return bundle;
}

export function createBundleWithJsonArrayRequestBody(): BundleV1 {
  return withRequest((request) => {
  request.method = "POST";
  request.path = "/imports/batch";
  request.route_template = "/imports/batch";
  request.query = {
    batch: "preview"
  };
  request.headers = {
    "content-type": "application/json",
    "x-trace": "trace_json_array"
  };
  request.body = [
    {
      id: "evt-1",
      note: "line one\r\nline two\u0000"
    },
    null,
    true,
    7,
    ["nested", "line\titem"],
    {
      action: "confirm",
      payload: {
        note: "ship\nnow\u0007",
        flags: [false, null, "[REDACTED]"]
      }
    }
  ];

  });
}

export function createBundleWithRedactedJsonArrayRequestBody(): BundleV1 {
  const bundle = createBundleWithJsonArrayRequestBody();
  const request = bundle.context.request;
  if (request === null || request === undefined) {
    throw new Error("request_context_expected");
  }

  request.headers = {
    authorization: "[REDACTED]",
    "content-type": "application/json",
    "x-trace": "trace_redacted_json_array"
  };
  request.body = [
    {
      id: "evt-1",
      note: "[REDACTED]\r\ncustomer-visible"
    },
    null,
    "[REDACTED]\u0000",
    {
      action: "confirm",
      payload: {
        password: "[REDACTED]\u0007",
        tokens: ["[REDACTED]", null, true]
      }
    },
    ["nested", "[REDACTED]\u0000"]
  ];

  return bundle;
}