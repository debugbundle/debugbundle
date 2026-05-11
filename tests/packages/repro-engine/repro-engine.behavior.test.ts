import { describe, expect, it } from "vitest";

import { buildReproduction } from "../../../packages/repro-engine/src/index.js";
import {
  createBundleWithAbsentBodyRequestContext,
  createBundleWithEmptyJsonArrayRequestBody,
  createBundleWithEmptyJsonObjectRequestBody,
  createBundleWithEmptyJsonStringRequestBody,
  createBundleWithEmptyTextRequestBody,
  createBundleWithFormRequestBody,
  createBundleWithForwardedRequestContext,
  createBundleWithJsonArrayRequestBody,
  createBundleWithJsonScalarRequestBody,
  createBundleWithMultilineControlCharacterRequestContext,
  createBundleWithNoisyBrowserHeadersRequestContext,
  createBundleWithPlainTextRequestBody,
  createBundleWithRedactedRepeatedNumericDecimalQueryArrayRequestContext,
  createBundleWithRedactedRepeatedSignedDecimalStringLiteralQueryArrayRequestContext,
  createBundleWithRedactedRepeatedMixedScalarQueryArrayRequestContext,
  createBundleWithRedactedRepeatedStringLiteralQueryArrayRequestContext,
  createBundleWithRequestContext,
  createBundleWithScalarRequestBody,
  createBundleWithShellQuotedRequestContext,
  createBundleWithStructuredFormRequestBody,
  createBundleWithStructuredJsonRequestBody,
  jsonScalarStringFixtureInput
} from "../../helpers/repro-engine.ts";

describe("repro-engine replay semantics", () => {
  it("should return explicit low-confidence output when request context is missing", (): void => {
    const bundle = createBundleWithRequestContext();
    bundle.context.request = null;

    expect(buildReproduction(bundle)).toEqual({
      possible: false,
      confidence: 0.1,
      reason: "request_context_missing",
      artifacts: null,
      feasibility_reference: null
    });
  });

  it("should generate usable proxy-aware replay commands for body-less HTTP failures", (): void => {
    const reproduction = buildReproduction(createBundleWithForwardedRequestContext());

    expect(reproduction).toEqual({
      possible: true,
      confidence: 0.8,
      reason: "request_context_available",
      artifacts: {
        curl:
          "curl -X GET 'http://api.example.com/api/orders/123?attempt=2&expand=customer&expand=payments&include_failed=true' -H 'accept: application/json' -H 'accept: application/problem+json' -H 'x-retry-count: 2' -H 'x-trace: trace_123'",
        httpie:
          "http GET 'http://api.example.com/api/orders/123?attempt=2&expand=customer&expand=payments&include_failed=true' 'accept:application/json' 'accept:application/problem+json' 'x-retry-count:2' 'x-trace:trace_123'",
        json_spec: {
          method: "GET",
          url: "http://api.example.com/api/orders/123?attempt=2&expand=customer&expand=payments&include_failed=true",
          headers: {
            accept: ["application/json", "application/problem+json"],
            "x-retry-count": "2",
            "x-trace": "trace_123"
          },
          query: {
            attempt: 2,
            expand: ["customer", "payments"],
            include_failed: true
          },
          body: null
        }
      },
      feasibility_reference: null
    });
  });

  it("should filter noisy browser transport headers while preserving replay-relevant context", (): void => {
    const reproduction = buildReproduction(createBundleWithNoisyBrowserHeadersRequestContext());

    expect(reproduction.artifacts?.curl).toBe(
      "curl -X POST 'https://api.debugbundle.com/v1/github/app/install-url?from=dashboard' -H 'authorization: [REDACTED]' -H 'cookie: [REDACTED]' -H 'accept: application/json' -H 'content-type: application/json' -H 'origin: https://app.debugbundle.com' -H 'accept-language: en-US,en;q=0.9' -H 'x-request-id: req_install_url' -H 'x-debugbundle-trace-id: trace_install_url' --data-raw '{\"installation_id\":\"123\"}'"
    );
    expect(reproduction.artifacts?.httpie).toBe(
      "printf '%s' '{\"installation_id\":\"123\"}' | http POST 'https://api.debugbundle.com/v1/github/app/install-url?from=dashboard' 'authorization:[REDACTED]' 'cookie:[REDACTED]' 'accept:application/json' 'content-type:application/json' 'origin:https://app.debugbundle.com' 'accept-language:en-US,en;q=0.9' 'x-request-id:req_install_url' 'x-debugbundle-trace-id:trace_install_url'"
    );
    expect(reproduction.artifacts?.json_spec).toEqual({
      method: "POST",
      url: "https://api.debugbundle.com/v1/github/app/install-url?from=dashboard",
      headers: {
        authorization: "[REDACTED]",
        cookie: "[REDACTED]",
        accept: "application/json",
        "content-type": "application/json",
        origin: "https://app.debugbundle.com",
        "accept-language": "en-US,en;q=0.9",
        "x-request-id": "req_install_url",
        "x-debugbundle-trace-id": "trace_install_url"
      },
      body: {
        installation_id: "123"
      }
    });
  });

  it("should keep plain-text request bodies raw in replay artifacts", (): void => {
    const reproduction = buildReproduction(createBundleWithPlainTextRequestBody());

    expect(reproduction.artifacts).toEqual({
      curl:
        "curl -X PUT 'https://example.invalid/notes/incident-1?coupon=SAVE10' -H 'content-type: text/plain; charset=utf-8' -H 'x-trace: trace_plain_text' --data-raw 'timeout exceeded on upstream retry'",
      httpie:
        "printf '%s' 'timeout exceeded on upstream retry' | http PUT 'https://example.invalid/notes/incident-1?coupon=SAVE10' 'content-type:text/plain; charset=utf-8' 'x-trace:trace_plain_text'",
      json_spec: {
        method: "PUT",
        url: "https://example.invalid/notes/incident-1?coupon=SAVE10",
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "x-trace": "trace_plain_text"
        },
        body: "timeout exceeded on upstream retry"
      }
    });
  });

  it("should encode form-style request bodies deterministically in replay artifacts", (): void => {
    const reproduction = buildReproduction(createBundleWithFormRequestBody());

    expect(reproduction.artifacts).toEqual({
      curl:
        "curl -X POST 'https://example.invalid/sessions' -H 'accept: text/plain' -H 'content-type: application/x-www-form-urlencoded' --data-raw 'email=ops%40example.com&remember=true&tags=urgent&tags=vip'",
      httpie:
        "printf '%s' 'email=ops%40example.com&remember=true&tags=urgent&tags=vip' | http POST 'https://example.invalid/sessions' 'accept:text/plain' 'content-type:application/x-www-form-urlencoded'",
      json_spec: {
        method: "POST",
        url: "https://example.invalid/sessions",
        headers: {
          accept: "text/plain",
          "content-type": "application/x-www-form-urlencoded"
        },
        body: {
          email: "ops@example.com",
          remember: true,
          tags: ["urgent", "vip"]
        }
      }
    });
  });

  it("should keep scalar request bodies explicit and replayable", (): void => {
    const reproduction = buildReproduction(createBundleWithScalarRequestBody());

    expect(reproduction.artifacts).toEqual({
      curl:
        "curl -X POST 'https://example.invalid/feature-flags/incident-1/retry' -H 'content-type: application/octet-stream' --data-raw 'false'",
      httpie:
        "printf '%s' 'false' | http POST 'https://example.invalid/feature-flags/incident-1/retry' 'content-type:application/octet-stream'",
      json_spec: {
        method: "POST",
        url: "https://example.invalid/feature-flags/incident-1/retry",
        headers: {
          "content-type": "application/octet-stream"
        },
        body: false
      }
    });
  });

  it("should flatten structured form payload edge cases deterministically", (): void => {
    const reproduction = buildReproduction(createBundleWithStructuredFormRequestBody());

    expect(reproduction.artifacts).toEqual({
      curl:
        "curl -X POST 'https://example.invalid/imports' -H 'accept: application/json' -H 'content-type: application/x-www-form-urlencoded' --data-raw 'attempts=3&filters=%7B%22archived%22%3Afalse%2C%22source%22%3A%22dashboard%22%7D&mode=null&tags=alpha&tags=7&tags=null&tags=true'",
      httpie:
        "printf '%s' 'attempts=3&filters=%7B%22archived%22%3Afalse%2C%22source%22%3A%22dashboard%22%7D&mode=null&tags=alpha&tags=7&tags=null&tags=true' | http POST 'https://example.invalid/imports' 'accept:application/json' 'content-type:application/x-www-form-urlencoded'",
      json_spec: {
        method: "POST",
        url: "https://example.invalid/imports",
        headers: {
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded"
        },
        body: {
          attempts: 3,
          filters: {
            archived: false,
            source: "dashboard"
          },
          mode: null,
          tags: ["alpha", 7, null, true]
        }
      }
    });
  });

  it("should keep shell-sensitive characters replay-safe in curl and HTTPie artifacts", (): void => {
    const reproduction = buildReproduction(createBundleWithShellQuotedRequestContext());

    expect(reproduction.artifacts).toEqual({
      curl:
        "curl -X POST 'https://example.invalid/teams/o'\\''hara/import?q=name%3DO%27Hara+%26+status%3Dactive&redirect=https%3A%2F%2Fexample.com%2Fcallback%3Fx%3D1%26y%3Dtwo' -H 'content-type: text/plain; charset=utf-8' -H 'x-note: owner'\\''s \"special\" import & review' --data-raw 'owner='\\''ops'\\'' & status=ready'",
      httpie:
        "printf '%s' 'owner='\\''ops'\\'' & status=ready' | http POST 'https://example.invalid/teams/o'\\''hara/import?q=name%3DO%27Hara+%26+status%3Dactive&redirect=https%3A%2F%2Fexample.com%2Fcallback%3Fx%3D1%26y%3Dtwo' 'content-type:text/plain; charset=utf-8' 'x-note:owner'\\''s \"special\" import & review'",
      json_spec: {
        method: "POST",
        url: "https://example.invalid/teams/o'hara/import?q=name%3DO%27Hara+%26+status%3Dactive&redirect=https%3A%2F%2Fexample.com%2Fcallback%3Fx%3D1%26y%3Dtwo",
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "x-note": "owner's \"special\" import & review"
        },
        body: "owner='ops' & status=ready"
      }
    });
  });

  it("should sanitize control characters in headers while keeping multiline text bodies replay-safe", (): void => {
    const reproduction = buildReproduction(createBundleWithMultilineControlCharacterRequestContext());

    expect(reproduction.artifacts).toEqual({
      curl:
        "curl -X PATCH 'https://example.invalid/notes/control-check?mode=multiline' -H 'content-type: text/plain; charset=utf-8' -H 'x-note: queued for review owner=ops' --data-raw 'line one\nline two\nline\tthree'",
      httpie:
        "printf '%s' 'line one\nline two\nline\tthree' | http PATCH 'https://example.invalid/notes/control-check?mode=multiline' 'content-type:text/plain; charset=utf-8' 'x-note:queued for review owner=ops'",
      json_spec: {
        method: "PATCH",
        url: "https://example.invalid/notes/control-check?mode=multiline",
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "x-note": "queued for review owner=ops"
        },
        body: "line one\nline two\nline\tthree"
      }
    });
  });

  it("should normalize nested multiline JSON string values deterministically across replay artifacts", (): void => {
    const reproduction = buildReproduction(createBundleWithStructuredJsonRequestBody());

    expect(reproduction.artifacts).toEqual({
      curl:
        "curl -X POST 'https://example.invalid/imports/preview?draft=true' -H 'content-type: application/json' -H 'x-trace: trace_structured_json' --data-raw '{\"metadata\":{\"note\":\"line one\\nline two\",\"owner\":\"ops\"},\"retry\":{\"attempts\":2,\"enabled\":true},\"steps\":[{\"action\":\"open\",\"target\":\"/checkout\"},{\"action\":\"confirm\",\"payload\":{\"code\":\"A-1\",\"note\":\"ship\\nnow\"}}],\"tags\":[\"vip\",\"priority\"]}'",
      httpie:
        "printf '%s' '{\"metadata\":{\"note\":\"line one\\nline two\",\"owner\":\"ops\"},\"retry\":{\"attempts\":2,\"enabled\":true},\"steps\":[{\"action\":\"open\",\"target\":\"/checkout\"},{\"action\":\"confirm\",\"payload\":{\"code\":\"A-1\",\"note\":\"ship\\nnow\"}}],\"tags\":[\"vip\",\"priority\"]}' | http POST 'https://example.invalid/imports/preview?draft=true' 'content-type:application/json' 'x-trace:trace_structured_json'",
      json_spec: {
        method: "POST",
        url: "https://example.invalid/imports/preview?draft=true",
        headers: {
          "content-type": "application/json",
          "x-trace": "trace_structured_json"
        },
        query: {
          draft: true
        },
        body: {
          metadata: {
            note: "line one\nline two",
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
                note: "ship\nnow"
              }
            }
          ],
          tags: ["vip", "priority"]
        }
      }
    });
  });

  it("should normalize top-level JSON array bodies deterministically across replay artifacts", (): void => {
    const reproduction = buildReproduction(createBundleWithJsonArrayRequestBody());

    expect(reproduction.artifacts).toEqual({
      curl:
        "curl -X POST 'https://example.invalid/imports/batch?batch=preview' -H 'content-type: application/json' -H 'x-trace: trace_json_array' --data-raw '[{\"id\":\"evt-1\",\"note\":\"line one\\nline two\"},null,true,7,[\"nested\",\"line\\titem\"],{\"action\":\"confirm\",\"payload\":{\"flags\":[false,null,\"[REDACTED]\"],\"note\":\"ship\\nnow\"}}]'",
      httpie:
        "printf '%s' '[{\"id\":\"evt-1\",\"note\":\"line one\\nline two\"},null,true,7,[\"nested\",\"line\\titem\"],{\"action\":\"confirm\",\"payload\":{\"flags\":[false,null,\"[REDACTED]\"],\"note\":\"ship\\nnow\"}}]' | http POST 'https://example.invalid/imports/batch?batch=preview' 'content-type:application/json' 'x-trace:trace_json_array'",
      json_spec: {
        method: "POST",
        url: "https://example.invalid/imports/batch?batch=preview",
        headers: {
          "content-type": "application/json",
          "x-trace": "trace_json_array"
        },
        body: [
          {
            id: "evt-1",
            note: "line one\nline two"
          },
          null,
          true,
          7,
          ["nested", "line\titem"],
          {
            action: "confirm",
            payload: {
              note: "ship\nnow",
              flags: [false, null, "[REDACTED]"]
            }
          }
        ]
      }
    });
  });

  it("should keep top-level JSON scalar bodies deterministic across replay artifacts", (): void => {
    expect(buildReproduction(createBundleWithJsonScalarRequestBody(jsonScalarStringFixtureInput)).artifacts).toEqual({
      curl:
        "curl -X POST 'https://example.invalid/imports/scalar?mode=scalar' -H 'content-type: application/json' -H 'x-trace: trace_json_scalar' --data-raw '\"line one\\nline two'\\''s value\"'",
      httpie:
        "printf '%s' '\"line one\\nline two'\\''s value\"' | http POST 'https://example.invalid/imports/scalar?mode=scalar' 'content-type:application/json' 'x-trace:trace_json_scalar'",
      json_spec: {
        method: "POST",
        url: "https://example.invalid/imports/scalar?mode=scalar",
        headers: {
          "content-type": "application/json",
          "x-trace": "trace_json_scalar"
        },
        body: "line one\nline two's value"
      }
    });

    expect(buildReproduction(createBundleWithJsonScalarRequestBody(7)).artifacts).toEqual({
      curl:
        "curl -X POST 'https://example.invalid/imports/scalar?mode=scalar' -H 'content-type: application/json' -H 'x-trace: trace_json_scalar' --data-raw '7'",
      httpie:
        "printf '%s' '7' | http POST 'https://example.invalid/imports/scalar?mode=scalar' 'content-type:application/json' 'x-trace:trace_json_scalar'",
      json_spec: {
        method: "POST",
        url: "https://example.invalid/imports/scalar?mode=scalar",
        headers: {
          "content-type": "application/json",
          "x-trace": "trace_json_scalar"
        },
        body: 7
      }
    });

    expect(buildReproduction(createBundleWithJsonScalarRequestBody(false)).artifacts).toEqual({
      curl:
        "curl -X POST 'https://example.invalid/imports/scalar?mode=scalar' -H 'content-type: application/json' -H 'x-trace: trace_json_scalar' --data-raw 'false'",
      httpie:
        "printf '%s' 'false' | http POST 'https://example.invalid/imports/scalar?mode=scalar' 'content-type:application/json' 'x-trace:trace_json_scalar'",
      json_spec: {
        method: "POST",
        url: "https://example.invalid/imports/scalar?mode=scalar",
        headers: {
          "content-type": "application/json",
          "x-trace": "trace_json_scalar"
        },
        body: false
      }
    });

    expect(buildReproduction(createBundleWithJsonScalarRequestBody(null)).artifacts).toEqual({
      curl:
        "curl -X POST 'https://example.invalid/imports/scalar?mode=scalar' -H 'content-type: application/json' -H 'x-trace: trace_json_scalar' --data-raw 'null'",
      httpie:
        "printf '%s' 'null' | http POST 'https://example.invalid/imports/scalar?mode=scalar' 'content-type:application/json' 'x-trace:trace_json_scalar'",
      json_spec: {
        method: "POST",
        url: "https://example.invalid/imports/scalar?mode=scalar",
        headers: {
          "content-type": "application/json",
          "x-trace": "trace_json_scalar"
        },
        body: null
      }
    });
  });

  it("should distinguish absent bodies from zero-length text and JSON payloads", (): void => {
    expect(buildReproduction(createBundleWithAbsentBodyRequestContext()).artifacts).toEqual({
      curl:
        "curl -X POST 'https://example.invalid/imports/empty-body?mode=absent' -H 'content-type: application/json' -H 'x-trace: trace_absent_body'",
      httpie:
        "http POST 'https://example.invalid/imports/empty-body?mode=absent' 'content-type:application/json' 'x-trace:trace_absent_body'",
      json_spec: {
        method: "POST",
        url: "https://example.invalid/imports/empty-body?mode=absent",
        headers: {
          "content-type": "application/json",
          "x-trace": "trace_absent_body"
        },
        body: null
      }
    });

    expect(buildReproduction(createBundleWithEmptyTextRequestBody()).artifacts).toEqual({
      curl:
        "curl -X POST 'https://example.invalid/imports/empty-body?mode=empty-text' -H 'content-type: text/plain; charset=utf-8' -H 'x-trace: trace_empty_text' --data-raw ''",
      httpie:
        "printf '%s' '' | http POST 'https://example.invalid/imports/empty-body?mode=empty-text' 'content-type:text/plain; charset=utf-8' 'x-trace:trace_empty_text'",
      json_spec: {
        method: "POST",
        url: "https://example.invalid/imports/empty-body?mode=empty-text",
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "x-trace": "trace_empty_text"
        },
        body: ""
      }
    });

    expect(buildReproduction(createBundleWithEmptyJsonStringRequestBody()).artifacts).toEqual({
      curl:
        "curl -X POST 'https://example.invalid/imports/empty-body?mode=empty-json' -H 'content-type: application/json' -H 'x-trace: trace_empty_json' --data-raw '\"\"'",
      httpie:
        "printf '%s' '\"\"' | http POST 'https://example.invalid/imports/empty-body?mode=empty-json' 'content-type:application/json' 'x-trace:trace_empty_json'",
      json_spec: {
        method: "POST",
        url: "https://example.invalid/imports/empty-body?mode=empty-json",
        headers: {
          "content-type": "application/json",
          "x-trace": "trace_empty_json"
        },
        body: ""
      }
    });
  });

  it("should keep empty structured JSON objects and arrays distinct from absent and scalar-empty payloads", (): void => {
    expect(buildReproduction(createBundleWithEmptyJsonObjectRequestBody()).artifacts).toEqual({
      curl:
        "curl -X POST 'https://example.invalid/imports/empty-body?mode=empty-object' -H 'content-type: application/json' -H 'x-trace: trace_empty_object' --data-raw '{}'",
      httpie:
        "printf '%s' '{}' | http POST 'https://example.invalid/imports/empty-body?mode=empty-object' 'content-type:application/json' 'x-trace:trace_empty_object'",
      json_spec: {
        method: "POST",
        url: "https://example.invalid/imports/empty-body?mode=empty-object",
        headers: {
          "content-type": "application/json",
          "x-trace": "trace_empty_object"
        },
        body: {}
      }
    });

    expect(buildReproduction(createBundleWithEmptyJsonArrayRequestBody()).artifacts).toEqual({
      curl:
        "curl -X POST 'https://example.invalid/imports/empty-body?mode=empty-array' -H 'content-type: application/json' -H 'x-trace: trace_empty_array' --data-raw '[]'",
      httpie:
        "printf '%s' '[]' | http POST 'https://example.invalid/imports/empty-body?mode=empty-array' 'content-type:application/json' 'x-trace:trace_empty_array'",
      json_spec: {
        method: "POST",
        url: "https://example.invalid/imports/empty-body?mode=empty-array",
        headers: {
          "content-type": "application/json",
          "x-trace": "trace_empty_array"
        },
        body: []
      }
    });
  });

  it("should preserve ambiguous query value typing in json_spec while keeping replay URLs wire-accurate", (): void => {
    const stringLiteralArtifacts = buildReproduction(createBundleWithRedactedRepeatedStringLiteralQueryArrayRequestContext()).artifacts;
    const mixedScalarArtifacts = buildReproduction(createBundleWithRedactedRepeatedMixedScalarQueryArrayRequestContext()).artifacts;

    if (stringLiteralArtifacts === null || stringLiteralArtifacts.json_spec === null) {
      throw new Error("expected_string_literal_replay_artifacts");
    }

    if (mixedScalarArtifacts === null || mixedScalarArtifacts.json_spec === null) {
      throw new Error("expected_mixed_scalar_replay_artifacts");
    }

    expect(stringLiteralArtifacts.json_spec.url).toBe(
      "https://example.invalid/imports/query-redaction?mode=redacted-query-array-string-literals&scope=%5BREDACTED%5D+tier&scope=1&scope=true&token=%5BREDACTED%5D&token=0&token=false&token=%5BREDACTED%5D+fallback"
    );

    expect(stringLiteralArtifacts.json_spec.query).toEqual({
      mode: "redacted-query-array-string-literals",
      scope: ["[REDACTED] tier", "1", "true"],
      token: ["[REDACTED]", "0", "false", "[REDACTED] fallback"]
    });
    expect(mixedScalarArtifacts.json_spec.query).toEqual({
      mode: "redacted-query-array-mixed",
      scope: ["[REDACTED] tier", 1, true],
      token: ["[REDACTED]", 0, false, "[REDACTED] fallback"]
    });
    expect(stringLiteralArtifacts.json_spec.query).not.toEqual(mixedScalarArtifacts.json_spec.query);
  });

  it("should preserve signed and decimal string query literals in json_spec while keeping replay URLs wire-accurate against numeric decimal variants", (): void => {
    const stringLiteralArtifacts = buildReproduction(
      createBundleWithRedactedRepeatedSignedDecimalStringLiteralQueryArrayRequestContext()
    ).artifacts;
    const numericArtifacts = buildReproduction(createBundleWithRedactedRepeatedNumericDecimalQueryArrayRequestContext()).artifacts;

    if (stringLiteralArtifacts === null || stringLiteralArtifacts.json_spec === null) {
      throw new Error("expected_signed_decimal_string_replay_artifacts");
    }

    if (numericArtifacts === null || numericArtifacts.json_spec === null) {
      throw new Error("expected_numeric_decimal_replay_artifacts");
    }

    expect(stringLiteralArtifacts.json_spec.url).toBe(
      "https://example.invalid/imports/query-redaction?mode=redacted-query-array-signed-decimal-strings&scope=%5BREDACTED%5D+tier&scope=3.14&scope=-0.5&token=%5BREDACTED%5D&token=-1&token=2.75&token=%5BREDACTED%5D+fallback"
    );
    expect(numericArtifacts.json_spec.url).toBe(
      "https://example.invalid/imports/query-redaction?mode=redacted-query-array-numeric-decimals&scope=%5BREDACTED%5D+tier&scope=3.14&scope=-0.5&token=%5BREDACTED%5D&token=-1&token=2.75&token=%5BREDACTED%5D+fallback"
    );
    expect(stringLiteralArtifacts.json_spec.query).toEqual({
      mode: "redacted-query-array-signed-decimal-strings",
      scope: ["[REDACTED] tier", "3.14", "-0.5"],
      token: ["[REDACTED]", "-1", "2.75", "[REDACTED] fallback"]
    });
    expect(numericArtifacts.json_spec.query).toEqual({
      mode: "redacted-query-array-numeric-decimals",
      scope: ["[REDACTED] tier", 3.14, -0.5],
      token: ["[REDACTED]", -1, 2.75, "[REDACTED] fallback"]
    });
    expect(stringLiteralArtifacts.json_spec.query).not.toEqual(numericArtifacts.json_spec.query);
  });
});