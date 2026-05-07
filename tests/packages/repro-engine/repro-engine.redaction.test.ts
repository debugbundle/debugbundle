import { describe, expect, it } from "vitest";

import { buildReproduction } from "../../../packages/repro-engine/src/index.js";
import {
  createBundleWithAbsentBodyRequestContext,
  createBundleWithEmptyJsonArrayRequestBody,
  createBundleWithEmptyJsonObjectRequestBody,
  createBundleWithEmptyJsonStringRequestBody,
  createBundleWithEmptyTextRequestBody,
  createBundleWithRedactedAbsentBodyRequestContext,
  createBundleWithRedactedEmptyJsonStringRequestBody,
  createBundleWithRedactedEmptyTextRequestBody,
  createBundleWithRedactedRepeatedHeaderArrayRequestContext,
  createBundleWithRedactedRepeatedEmptyStringQueryArrayRequestContext,
  createBundleWithRedactedRepeatedMixedScalarQueryArrayRequestContext,
  createBundleWithRedactedRepeatedNumericDecimalQueryArrayRequestContext,
  createBundleWithRedactedRepeatedNullQueryArrayRequestContext,
  createBundleWithRedactedRepeatedSignedDecimalStringLiteralQueryArrayRequestContext,
  createBundleWithRedactedRepeatedStringLiteralQueryArrayRequestContext,
  createBundleWithRedactedRepeatedQueryArrayRequestContext,
  createBundleWithRedactedEmptyStringScalarQueryRequestContext,
  createBundleWithRedactedOmittedQueryRequestContext,
  createBundleWithRedactedNullStringScalarQueryRequestContext,
  createBundleWithRedactedScalarQueryRequestContext,
  createBundleWithRedactedJsonNullScalarRequestBody,
  createBundleWithRedactedEmptyJsonArrayRequestBody,
  createBundleWithRedactedEmptyJsonObjectRequestBody,
  createBundleWithRedactedFormRequestBody,
  createBundleWithRedactedJsonArrayRequestBody,
  createBundleWithRedactedJsonScalarRequestBody,
  createBundleWithRedactedPlainTextRequestBody,
  createBundleWithRedactedStructuredJsonRequestBody,
  createBundleWithRequestContext,
  redactedJsonScalarStringFixtureInput
} from "../../helpers/repro-engine.ts";

describe("repro-engine redaction semantics", () => {
  it("should preserve redacted values without reintroducing secrets", (): void => {
    const bundle = createBundleWithRequestContext();
    const request = bundle.context.request;
    if (request === null || request === undefined) {
      throw new Error("request_context_expected");
    }

    request.query = {
      coupon: "SAVE10",
      token: "[REDACTED]"
    };
    request.headers = {
      authorization: "[REDACTED]",
      "content-type": "application/json"
    };
    request.body = {
      amount: 42,
      password: "[REDACTED]"
    };

    const reproduction = buildReproduction(bundle);

    expect(reproduction.artifacts?.json_spec).toEqual({
      method: "POST",
      url: "https://example.invalid/checkout?coupon=SAVE10&token=%5BREDACTED%5D",
      headers: {
        authorization: "[REDACTED]",
        "content-type": "application/json"
      },
      body: {
        amount: 42,
        password: "[REDACTED]"
      }
    });
    expect(reproduction.artifacts?.curl).toContain("[REDACTED]");
    expect(reproduction.artifacts?.httpie).toContain("[REDACTED]");
    expect(reproduction.artifacts?.curl).not.toContain("super-secret");
    expect(reproduction.artifacts?.httpie).not.toContain("super-secret");
  });

  it("should preserve redacted plain-text payloads without leaking pre-redaction content", (): void => {
    const reproduction = buildReproduction(createBundleWithRedactedPlainTextRequestBody());

    expect(reproduction.artifacts).toEqual({
      curl:
        "curl -X PUT 'https://example.invalid/notes/incident-1?coupon=SAVE10' -H 'authorization: [REDACTED]' -H 'content-type: text/plain; charset=utf-8' -H 'x-trace: trace_redacted_plain_text' --data-raw 'apiKey=[REDACTED]; note=customer token removed'",
      httpie:
        "printf '%s' 'apiKey=[REDACTED]; note=customer token removed' | http PUT 'https://example.invalid/notes/incident-1?coupon=SAVE10' 'authorization:[REDACTED]' 'content-type:text/plain; charset=utf-8' 'x-trace:trace_redacted_plain_text'",
      json_spec: {
        method: "PUT",
        url: "https://example.invalid/notes/incident-1?coupon=SAVE10",
        headers: {
          authorization: "[REDACTED]",
          "content-type": "text/plain; charset=utf-8",
          "x-trace": "trace_redacted_plain_text"
        },
        body: "apiKey=[REDACTED]; note=customer token removed"
      }
    });
    expect(reproduction.artifacts?.curl).toContain("[REDACTED]");
    expect(reproduction.artifacts?.httpie).toContain("[REDACTED]");
    expect(reproduction.artifacts?.curl).not.toContain("live-secret-key");
    expect(reproduction.artifacts?.httpie).not.toContain("live-secret-key");
  });

  it("should preserve redacted form payloads without leaking pre-redaction content", (): void => {
    const reproduction = buildReproduction(createBundleWithRedactedFormRequestBody());

    expect(reproduction.artifacts).toEqual({
      curl:
        "curl -X POST 'https://example.invalid/sessions' -H 'accept: text/plain' -H 'authorization: [REDACTED]' -H 'content-type: application/x-www-form-urlencoded' --data-raw 'email=%5BREDACTED%5D&password=%5BREDACTED%5D&tags=urgent&tags=%5BREDACTED%5D'",
      httpie:
        "printf '%s' 'email=%5BREDACTED%5D&password=%5BREDACTED%5D&tags=urgent&tags=%5BREDACTED%5D' | http POST 'https://example.invalid/sessions' 'accept:text/plain' 'authorization:[REDACTED]' 'content-type:application/x-www-form-urlencoded'",
      json_spec: {
        method: "POST",
        url: "https://example.invalid/sessions",
        headers: {
          accept: "text/plain",
          authorization: "[REDACTED]",
          "content-type": "application/x-www-form-urlencoded"
        },
        body: {
          email: "[REDACTED]",
          password: "[REDACTED]",
          tags: ["urgent", "[REDACTED]"]
        }
      }
    });
    expect(reproduction.artifacts?.curl).toContain("%5BREDACTED%5D");
    expect(reproduction.artifacts?.httpie).toContain("%5BREDACTED%5D");
    expect(reproduction.artifacts?.curl).not.toContain("super-secret-password");
    expect(reproduction.artifacts?.httpie).not.toContain("super-secret-password");
  });

  it("should preserve nested redacted JSON values without leaking pre-redaction content", (): void => {
    const reproduction = buildReproduction(createBundleWithRedactedStructuredJsonRequestBody());

    expect(reproduction.artifacts).toEqual({
      curl:
        "curl -X POST 'https://example.invalid/imports/preview?draft=true' -H 'authorization: [REDACTED]' -H 'content-type: application/json' -H 'x-trace: trace_redacted_structured_json' --data-raw '{\"metadata\":{\"note\":\"[REDACTED]\\ncustomer-visible\",\"owner\":\"ops\"},\"retry\":{\"attempts\":2,\"enabled\":true},\"secrets\":{\"apiKey\":\"[REDACTED]\",\"nested\":{\"token\":\"[REDACTED]\"}},\"steps\":[{\"action\":\"confirm\",\"payload\":{\"code\":\"A-1\",\"password\":\"[REDACTED]\"}}]}'",
      httpie:
        "printf '%s' '{\"metadata\":{\"note\":\"[REDACTED]\\ncustomer-visible\",\"owner\":\"ops\"},\"retry\":{\"attempts\":2,\"enabled\":true},\"secrets\":{\"apiKey\":\"[REDACTED]\",\"nested\":{\"token\":\"[REDACTED]\"}},\"steps\":[{\"action\":\"confirm\",\"payload\":{\"code\":\"A-1\",\"password\":\"[REDACTED]\"}}]}' | http POST 'https://example.invalid/imports/preview?draft=true' 'authorization:[REDACTED]' 'content-type:application/json' 'x-trace:trace_redacted_structured_json'",
      json_spec: {
        method: "POST",
        url: "https://example.invalid/imports/preview?draft=true",
        headers: {
          authorization: "[REDACTED]",
          "content-type": "application/json",
          "x-trace": "trace_redacted_structured_json"
        },
        query: {
          draft: true
        },
        body: {
          metadata: {
            note: "[REDACTED]\ncustomer-visible",
            owner: "ops"
          },
          retry: {
            attempts: 2,
            enabled: true
          },
          secrets: {
            apiKey: "[REDACTED]",
            nested: {
              token: "[REDACTED]"
            }
          },
          steps: [
            {
              action: "confirm",
              payload: {
                code: "A-1",
                password: "[REDACTED]"
              }
            }
          ]
        }
      }
    });
    expect(reproduction.artifacts?.curl).toContain("[REDACTED]");
    expect(reproduction.artifacts?.httpie).toContain("[REDACTED]");
    expect(reproduction.artifacts?.curl).not.toContain("live-api-key");
    expect(reproduction.artifacts?.httpie).not.toContain("live-api-key");
  });

  it("should preserve redacted top-level JSON array values without leaking pre-redaction content", (): void => {
    const reproduction = buildReproduction(createBundleWithRedactedJsonArrayRequestBody());

    expect(reproduction.artifacts).toEqual({
      curl:
        "curl -X POST 'https://example.invalid/imports/batch?batch=preview' -H 'authorization: [REDACTED]' -H 'content-type: application/json' -H 'x-trace: trace_redacted_json_array' --data-raw '[{\"id\":\"evt-1\",\"note\":\"[REDACTED]\\ncustomer-visible\"},null,\"[REDACTED]\",{\"action\":\"confirm\",\"payload\":{\"password\":\"[REDACTED]\",\"tokens\":[\"[REDACTED]\",null,true]}},[\"nested\",\"[REDACTED]\"]]'",
      httpie:
        "printf '%s' '[{\"id\":\"evt-1\",\"note\":\"[REDACTED]\\ncustomer-visible\"},null,\"[REDACTED]\",{\"action\":\"confirm\",\"payload\":{\"password\":\"[REDACTED]\",\"tokens\":[\"[REDACTED]\",null,true]}},[\"nested\",\"[REDACTED]\"]]' | http POST 'https://example.invalid/imports/batch?batch=preview' 'authorization:[REDACTED]' 'content-type:application/json' 'x-trace:trace_redacted_json_array'",
      json_spec: {
        method: "POST",
        url: "https://example.invalid/imports/batch?batch=preview",
        headers: {
          authorization: "[REDACTED]",
          "content-type": "application/json",
          "x-trace": "trace_redacted_json_array"
        },
        body: [
          {
            id: "evt-1",
            note: "[REDACTED]\ncustomer-visible"
          },
          null,
          "[REDACTED]",
          {
            action: "confirm",
            payload: {
              password: "[REDACTED]",
              tokens: ["[REDACTED]", null, true]
            }
          },
          ["nested", "[REDACTED]"]
        ]
      }
    });
    expect(reproduction.artifacts?.curl).toContain("[REDACTED]");
    expect(reproduction.artifacts?.httpie).toContain("[REDACTED]");
    expect(reproduction.artifacts?.curl).not.toContain("live-token-value");
    expect(reproduction.artifacts?.httpie).not.toContain("live-token-value");
  });

  it("should preserve redacted top-level JSON scalar values without leaking pre-redaction content", (): void => {
    expect(buildReproduction(createBundleWithRedactedJsonScalarRequestBody(redactedJsonScalarStringFixtureInput)).artifacts).toEqual({
      curl:
        "curl -X POST 'https://example.invalid/imports/scalar?mode=scalar' -H 'authorization: [REDACTED]' -H 'content-type: application/json' -H 'x-trace: trace_redacted_json_scalar' --data-raw '\"[REDACTED]\\ncustomer-visible'\\''s value\"'",
      httpie:
        "printf '%s' '\"[REDACTED]\\ncustomer-visible'\\''s value\"' | http POST 'https://example.invalid/imports/scalar?mode=scalar' 'authorization:[REDACTED]' 'content-type:application/json' 'x-trace:trace_redacted_json_scalar'",
      json_spec: {
        method: "POST",
        url: "https://example.invalid/imports/scalar?mode=scalar",
        headers: {
          authorization: "[REDACTED]",
          "content-type": "application/json",
          "x-trace": "trace_redacted_json_scalar"
        },
        body: "[REDACTED]\ncustomer-visible's value"
      }
    });

    expect(buildReproduction(createBundleWithRedactedJsonScalarRequestBody(0)).artifacts).toEqual({
      curl:
        "curl -X POST 'https://example.invalid/imports/scalar?mode=scalar' -H 'authorization: [REDACTED]' -H 'content-type: application/json' -H 'x-trace: trace_redacted_json_scalar' --data-raw '0'",
      httpie:
        "printf '%s' '0' | http POST 'https://example.invalid/imports/scalar?mode=scalar' 'authorization:[REDACTED]' 'content-type:application/json' 'x-trace:trace_redacted_json_scalar'",
      json_spec: {
        method: "POST",
        url: "https://example.invalid/imports/scalar?mode=scalar",
        headers: {
          authorization: "[REDACTED]",
          "content-type": "application/json",
          "x-trace": "trace_redacted_json_scalar"
        },
        body: 0
      }
    });

    expect(buildReproduction(createBundleWithRedactedJsonScalarRequestBody(false)).artifacts).toEqual({
      curl:
        "curl -X POST 'https://example.invalid/imports/scalar?mode=scalar' -H 'authorization: [REDACTED]' -H 'content-type: application/json' -H 'x-trace: trace_redacted_json_scalar' --data-raw 'false'",
      httpie:
        "printf '%s' 'false' | http POST 'https://example.invalid/imports/scalar?mode=scalar' 'authorization:[REDACTED]' 'content-type:application/json' 'x-trace:trace_redacted_json_scalar'",
      json_spec: {
        method: "POST",
        url: "https://example.invalid/imports/scalar?mode=scalar",
        headers: {
          authorization: "[REDACTED]",
          "content-type": "application/json",
          "x-trace": "trace_redacted_json_scalar"
        },
        body: false
      }
    });

    expect(buildReproduction(createBundleWithRedactedJsonScalarRequestBody(null)).artifacts).toEqual({
      curl:
        "curl -X POST 'https://example.invalid/imports/scalar?mode=scalar' -H 'authorization: [REDACTED]' -H 'content-type: application/json' -H 'x-trace: trace_redacted_json_scalar' --data-raw 'null'",
      httpie:
        "printf '%s' 'null' | http POST 'https://example.invalid/imports/scalar?mode=scalar' 'authorization:[REDACTED]' 'content-type:application/json' 'x-trace:trace_redacted_json_scalar'",
      json_spec: {
        method: "POST",
        url: "https://example.invalid/imports/scalar?mode=scalar",
        headers: {
          authorization: "[REDACTED]",
          "content-type": "application/json",
          "x-trace": "trace_redacted_json_scalar"
        },
        body: null
      }
    });

    const stringArtifacts = buildReproduction(createBundleWithRedactedJsonScalarRequestBody(redactedJsonScalarStringFixtureInput)).artifacts;

    expect(stringArtifacts?.curl).toContain("[REDACTED]");
    expect(stringArtifacts?.httpie).toContain("[REDACTED]");
    expect(stringArtifacts?.curl).not.toContain("live-secret-token");
    expect(stringArtifacts?.httpie).not.toContain("live-secret-token");
  });

  it("should preserve redacted absent bodies without leaking pre-redaction content", (): void => {
    expect(buildReproduction(createBundleWithRedactedAbsentBodyRequestContext()).artifacts).toEqual({
      curl:
        "curl -X POST 'https://example.invalid/imports/empty-body?mode=redacted-absent' -H 'authorization: [REDACTED]' -H 'content-type: application/json' -H 'x-trace: trace_redacted_absent_body'",
      httpie:
        "http POST 'https://example.invalid/imports/empty-body?mode=redacted-absent' 'authorization:[REDACTED]' 'content-type:application/json' 'x-trace:trace_redacted_absent_body'",
      json_spec: {
        method: "POST",
        url: "https://example.invalid/imports/empty-body?mode=redacted-absent",
        headers: {
          authorization: "[REDACTED]",
          "content-type": "application/json",
          "x-trace": "trace_redacted_absent_body"
        },
        body: null
      }
    });

    const absentArtifacts = buildReproduction(createBundleWithRedactedAbsentBodyRequestContext()).artifacts;

    expect(absentArtifacts?.curl).toContain("[REDACTED]");
    expect(absentArtifacts?.httpie).toContain("[REDACTED]");
    expect(absentArtifacts?.curl).not.toContain("Bearer secret-token-value");
    expect(absentArtifacts?.httpie).not.toContain("Bearer secret-token-value");

    expect(absentArtifacts?.curl).not.toContain("--data-raw");
    expect(absentArtifacts?.httpie?.startsWith("http POST")).toBe(true);
    expect(buildReproduction(createBundleWithEmptyTextRequestBody()).artifacts?.curl).toContain("--data-raw ''");
    expect(buildReproduction(createBundleWithEmptyJsonStringRequestBody()).artifacts?.curl).toContain("--data-raw '\"\"'");
    expect(buildReproduction(createBundleWithEmptyJsonObjectRequestBody()).artifacts?.curl).toContain("--data-raw '{}' ".trim());
  });

  it("should preserve redacted empty structured JSON bodies without leaking pre-redaction content", (): void => {
    expect(buildReproduction(createBundleWithRedactedEmptyJsonObjectRequestBody()).artifacts).toEqual({
      curl:
        "curl -X POST 'https://example.invalid/imports/empty-body?mode=empty-object' -H 'authorization: [REDACTED]' -H 'content-type: application/json' -H 'x-trace: trace_redacted_empty_object' --data-raw '{}'",
      httpie:
        "printf '%s' '{}' | http POST 'https://example.invalid/imports/empty-body?mode=empty-object' 'authorization:[REDACTED]' 'content-type:application/json' 'x-trace:trace_redacted_empty_object'",
      json_spec: {
        method: "POST",
        url: "https://example.invalid/imports/empty-body?mode=empty-object",
        headers: {
          authorization: "[REDACTED]",
          "content-type": "application/json",
          "x-trace": "trace_redacted_empty_object"
        },
        body: {}
      }
    });

    expect(buildReproduction(createBundleWithRedactedEmptyJsonArrayRequestBody()).artifacts).toEqual({
      curl:
        "curl -X POST 'https://example.invalid/imports/empty-body?mode=empty-array' -H 'authorization: [REDACTED]' -H 'content-type: application/json' -H 'x-trace: trace_redacted_empty_array' --data-raw '[]'",
      httpie:
        "printf '%s' '[]' | http POST 'https://example.invalid/imports/empty-body?mode=empty-array' 'authorization:[REDACTED]' 'content-type:application/json' 'x-trace:trace_redacted_empty_array'",
      json_spec: {
        method: "POST",
        url: "https://example.invalid/imports/empty-body?mode=empty-array",
        headers: {
          authorization: "[REDACTED]",
          "content-type": "application/json",
          "x-trace": "trace_redacted_empty_array"
        },
        body: []
      }
    });

    const objectArtifacts = buildReproduction(createBundleWithRedactedEmptyJsonObjectRequestBody()).artifacts;

    expect(objectArtifacts?.curl).toContain("[REDACTED]");
    expect(objectArtifacts?.httpie).toContain("[REDACTED]");
    expect(objectArtifacts?.curl).not.toContain("Bearer secret-token-value");
    expect(objectArtifacts?.httpie).not.toContain("Bearer secret-token-value");
  });

  it("should keep redacted empty scalar bodies distinct from omitted and empty structured variants", (): void => {
    const requireUsableArtifacts = (
      artifacts: ReturnType<typeof buildReproduction>["artifacts"]
    ): Exclude<ReturnType<typeof buildReproduction>["artifacts"], null> & {
      httpie: string;
      json_spec: NonNullable<Exclude<ReturnType<typeof buildReproduction>["artifacts"], null>["json_spec"]>;
    } => {
      if (artifacts === null || artifacts.httpie === null || artifacts.json_spec === null) {
        throw new Error("expected_replay_artifacts");
      }

      return {
        ...artifacts,
        httpie: artifacts.httpie,
        json_spec: artifacts.json_spec
      };
    };

    const absentArtifacts = requireUsableArtifacts(buildReproduction(createBundleWithRedactedAbsentBodyRequestContext()).artifacts);
    const emptyTextArtifacts = requireUsableArtifacts(buildReproduction(createBundleWithRedactedEmptyTextRequestBody()).artifacts);
    const emptyJsonStringArtifacts = requireUsableArtifacts(
      buildReproduction(createBundleWithRedactedEmptyJsonStringRequestBody()).artifacts
    );
    const emptyObjectArtifacts = requireUsableArtifacts(buildReproduction(createBundleWithRedactedEmptyJsonObjectRequestBody()).artifacts);
    const emptyArrayArtifacts = requireUsableArtifacts(buildReproduction(createBundleWithRedactedEmptyJsonArrayRequestBody()).artifacts);

    expect(absentArtifacts.curl).not.toContain("--data-raw");
    expect(emptyTextArtifacts.curl).toContain("--data-raw ''");
    expect(emptyJsonStringArtifacts.curl).toContain("--data-raw '\"\"'");
    expect(emptyObjectArtifacts.curl).toContain("--data-raw '{}'");
    expect(emptyArrayArtifacts.curl).toContain("--data-raw '[]'");

    expect(absentArtifacts.httpie.startsWith("http POST")).toBe(true);
    expect(emptyTextArtifacts.httpie.startsWith("printf '%s' '' | http POST")).toBe(true);
    expect(emptyJsonStringArtifacts.httpie.startsWith("printf '%s' '\"\"' | http POST")).toBe(true);

    expect(absentArtifacts.json_spec.body).toBeNull();
    expect(emptyTextArtifacts.json_spec.body).toBe("");
    expect(emptyJsonStringArtifacts.json_spec.body).toBe("");
    expect(emptyObjectArtifacts.json_spec.body).toEqual({});
    expect(emptyArrayArtifacts.json_spec.body).toEqual([]);

    expect(emptyTextArtifacts.curl).toContain("x-note: [REDACTED] queued owner");
    expect(emptyJsonStringArtifacts.curl).toContain("x-note: [REDACTED] queued owner");
    expect(emptyTextArtifacts.httpie).toContain("x-note:[REDACTED] queued owner");
    expect(emptyJsonStringArtifacts.httpie).toContain("x-note:[REDACTED] queued owner");

    expect(emptyTextArtifacts.curl).toContain("[REDACTED]");
    expect(emptyJsonStringArtifacts.curl).toContain("[REDACTED]");
    expect(emptyTextArtifacts.httpie).toContain("[REDACTED]");
    expect(emptyJsonStringArtifacts.httpie).toContain("[REDACTED]");
    expect(emptyTextArtifacts.curl).not.toContain("Bearer live-secret-token");
    expect(emptyJsonStringArtifacts.curl).not.toContain("Bearer live-secret-token");

    expect(buildReproduction(createBundleWithAbsentBodyRequestContext()).artifacts?.curl).not.toContain("--data-raw");
    expect(buildReproduction(createBundleWithEmptyTextRequestBody()).artifacts?.curl).toContain("--data-raw ''");
    expect(buildReproduction(createBundleWithEmptyJsonStringRequestBody()).artifacts?.curl).toContain("--data-raw '\"\"'");
    expect(buildReproduction(createBundleWithEmptyJsonObjectRequestBody()).artifacts?.curl).toContain("--data-raw '{}'");
    expect(buildReproduction(createBundleWithEmptyJsonArrayRequestBody()).artifacts?.curl).toContain("--data-raw '[]'");
  });

  it("should keep redacted JSON null scalar payloads distinct from omitted and empty scalar variants", (): void => {
    const requireUsableArtifacts = (
      artifacts: ReturnType<typeof buildReproduction>["artifacts"]
    ): Exclude<ReturnType<typeof buildReproduction>["artifacts"], null> & {
      httpie: string;
      json_spec: NonNullable<Exclude<ReturnType<typeof buildReproduction>["artifacts"], null>["json_spec"]>;
    } => {
      if (artifacts === null || artifacts.httpie === null || artifacts.json_spec === null) {
        throw new Error("expected_replay_artifacts");
      }

      return {
        ...artifacts,
        httpie: artifacts.httpie,
        json_spec: artifacts.json_spec
      };
    };

    const absentArtifacts = requireUsableArtifacts(buildReproduction(createBundleWithRedactedAbsentBodyRequestContext()).artifacts);
    const emptyTextArtifacts = requireUsableArtifacts(buildReproduction(createBundleWithRedactedEmptyTextRequestBody()).artifacts);
    const emptyJsonStringArtifacts = requireUsableArtifacts(
      buildReproduction(createBundleWithRedactedEmptyJsonStringRequestBody()).artifacts
    );
    const nullScalarArtifacts = requireUsableArtifacts(buildReproduction(createBundleWithRedactedJsonNullScalarRequestBody()).artifacts);

    expect(absentArtifacts.curl).not.toContain("--data-raw");
    expect(emptyTextArtifacts.curl).toContain("--data-raw ''");
    expect(emptyJsonStringArtifacts.curl).toContain("--data-raw '\"\"'");
    expect(nullScalarArtifacts.curl).toContain("--data-raw 'null'");

    expect(absentArtifacts.httpie.startsWith("http POST")).toBe(true);
    expect(emptyTextArtifacts.httpie.startsWith("printf '%s' '' | http POST")).toBe(true);
    expect(emptyJsonStringArtifacts.httpie.startsWith("printf '%s' '\"\"' | http POST")).toBe(true);
    expect(nullScalarArtifacts.httpie.startsWith("printf '%s' 'null' | http POST")).toBe(true);

    expect(absentArtifacts.json_spec.body).toBeNull();
    expect(emptyTextArtifacts.json_spec.body).toBe("");
    expect(emptyJsonStringArtifacts.json_spec.body).toBe("");
    expect(nullScalarArtifacts.json_spec.body).toBeNull();

    expect(nullScalarArtifacts.curl).toContain("x-note: [REDACTED] null branch");
    expect(nullScalarArtifacts.httpie).toContain("x-note:[REDACTED] null branch");
    expect(nullScalarArtifacts.curl).toContain("[REDACTED]");
    expect(nullScalarArtifacts.httpie).toContain("[REDACTED]");
    expect(nullScalarArtifacts.curl).not.toContain("Bearer live-secret-token");
  });

  it("should preserve repeated redacted header arrays deterministically without leaking secrets", (): void => {
    const artifacts = buildReproduction(createBundleWithRedactedRepeatedHeaderArrayRequestContext()).artifacts;

    if (artifacts === null || artifacts.httpie === null || artifacts.json_spec === null) {
      throw new Error("expected_replay_artifacts");
    }

    expect(artifacts.curl).toContain("-H 'authorization: [REDACTED]'");
    expect(artifacts.curl).toContain("-H 'authorization: [REDACTED] fallback'");
    expect(artifacts.httpie).toContain("'authorization:[REDACTED]' 'authorization:[REDACTED] fallback'");

    expect(artifacts.curl).toContain("-H 'x-token: [REDACTED]'");
    expect(artifacts.curl).toContain("-H 'x-token: [REDACTED] secondary'");
    expect(artifacts.httpie).toContain("'x-token:[REDACTED]' 'x-token:[REDACTED] secondary'");

    expect(artifacts.json_spec.headers).toEqual({
      accept: "application/json",
      authorization: ["[REDACTED]", "[REDACTED] fallback"],
      "content-type": "application/json",
      "x-token": ["[REDACTED]", "[REDACTED] secondary"]
    });

    expect(artifacts.curl).toContain("--data-raw '{\"action\":\"replay\",\"status\":\"[REDACTED]\"}'");
    expect(artifacts.httpie).toContain("printf '%s' '{\"action\":\"replay\",\"status\":\"[REDACTED]\"}'");

    expect(artifacts.curl).toContain("[REDACTED]");
    expect(artifacts.httpie).toContain("[REDACTED]");
    expect(artifacts.curl).not.toContain("Bearer live-secret-token");
    expect(artifacts.httpie).not.toContain("Bearer live-secret-token");
    expect(artifacts.curl).not.toContain("live-token-123");
    expect(artifacts.httpie).not.toContain("live-token-123");
  });

  it("should preserve repeated redacted query arrays as sanitized deterministic URL params distinct from scalar query values", (): void => {
    const arrayArtifacts = buildReproduction(createBundleWithRedactedRepeatedQueryArrayRequestContext()).artifacts;
    const scalarArtifacts = buildReproduction(createBundleWithRedactedScalarQueryRequestContext()).artifacts;

    if (arrayArtifacts === null || arrayArtifacts.httpie === null || arrayArtifacts.json_spec === null) {
      throw new Error("expected_replay_artifacts");
    }
    if (scalarArtifacts === null || scalarArtifacts.httpie === null || scalarArtifacts.json_spec === null) {
      throw new Error("expected_replay_artifacts");
    }

    expect(arrayArtifacts.curl).toContain("https://example.invalid/imports/query-redaction?mode=redacted-query-array");
    expect(arrayArtifacts.httpie).toContain("https://example.invalid/imports/query-redaction?mode=redacted-query-array");
    expect(arrayArtifacts.curl).toContain("token=%5BREDACTED%5D");
    expect(arrayArtifacts.curl).toContain("token=%5BREDACTED%5D+fallback");
    expect(arrayArtifacts.httpie).toContain("token=%5BREDACTED%5D");
    expect(arrayArtifacts.httpie).toContain("token=%5BREDACTED%5D+fallback");

    expect(arrayArtifacts.curl).toContain("scope=%5BREDACTED%5D+tier");
    expect(arrayArtifacts.httpie).toContain("scope=%5BREDACTED%5D+tier");
    expect(arrayArtifacts.curl).toContain("scope=%5BREDACTED%5D+region");
    expect(arrayArtifacts.httpie).toContain("scope=%5BREDACTED%5D+region");

    expect(arrayArtifacts.curl).not.toContain("%00");
    expect(arrayArtifacts.curl).not.toContain("%09");
    expect(arrayArtifacts.curl).not.toContain("%0D");
    expect(arrayArtifacts.curl).not.toContain("%0A");
    expect(arrayArtifacts.httpie).not.toContain("%00");
    expect(arrayArtifacts.httpie).not.toContain("%09");
    expect(arrayArtifacts.httpie).not.toContain("%0D");
    expect(arrayArtifacts.httpie).not.toContain("%0A");

    expect(arrayArtifacts.curl).toContain("%5BREDACTED%5D");
    expect(arrayArtifacts.httpie).toContain("%5BREDACTED%5D");
    expect(arrayArtifacts.curl).not.toContain("live-token-123");
    expect(arrayArtifacts.httpie).not.toContain("live-token-123");

    expect(scalarArtifacts.curl).toContain("token=%5BREDACTED%5D");
    expect(scalarArtifacts.curl).not.toContain("token=%5BREDACTED%5D&token=%5BREDACTED%5D-fallback");
    expect(scalarArtifacts.curl).toContain("scope=%5BREDACTED%5D+tier");
    expect(scalarArtifacts.curl).not.toContain("scope=%5BREDACTED%5D+region");
  });

  it("should preserve repeated redacted mixed numeric and boolean query arrays as deterministic URL params distinct from scalar string query variants", (): void => {
    const arrayArtifacts = buildReproduction(createBundleWithRedactedRepeatedMixedScalarQueryArrayRequestContext()).artifacts;
    const scalarArtifacts = buildReproduction(createBundleWithRedactedScalarQueryRequestContext()).artifacts;

    if (arrayArtifacts === null || arrayArtifacts.httpie === null || arrayArtifacts.json_spec === null) {
      throw new Error("expected_replay_artifacts");
    }
    if (scalarArtifacts === null || scalarArtifacts.httpie === null || scalarArtifacts.json_spec === null) {
      throw new Error("expected_replay_artifacts");
    }

    expect(arrayArtifacts.curl).toContain("https://example.invalid/imports/query-redaction?mode=redacted-query-array-mixed");
    expect(arrayArtifacts.httpie).toContain("https://example.invalid/imports/query-redaction?mode=redacted-query-array-mixed");

    expect(arrayArtifacts.curl).toContain("scope=%5BREDACTED%5D+tier");
    expect(arrayArtifacts.curl).toContain("scope=1");
    expect(arrayArtifacts.curl).toContain("scope=true");
    expect(arrayArtifacts.httpie).toContain("scope=%5BREDACTED%5D+tier");
    expect(arrayArtifacts.httpie).toContain("scope=1");
    expect(arrayArtifacts.httpie).toContain("scope=true");

    expect(arrayArtifacts.curl).toContain("token=%5BREDACTED%5D");
    expect(arrayArtifacts.curl).toContain("token=0");
    expect(arrayArtifacts.curl).toContain("token=false");
    expect(arrayArtifacts.curl).toContain("token=%5BREDACTED%5D+fallback");
    expect(arrayArtifacts.httpie).toContain("token=%5BREDACTED%5D");
    expect(arrayArtifacts.httpie).toContain("token=0");
    expect(arrayArtifacts.httpie).toContain("token=false");
    expect(arrayArtifacts.httpie).toContain("token=%5BREDACTED%5D+fallback");

    expect(arrayArtifacts.curl).not.toContain("%00");
    expect(arrayArtifacts.curl).not.toContain("%09");
    expect(arrayArtifacts.curl).not.toContain("%0D");
    expect(arrayArtifacts.curl).not.toContain("%0A");
    expect(arrayArtifacts.httpie).not.toContain("%00");
    expect(arrayArtifacts.httpie).not.toContain("%09");
    expect(arrayArtifacts.httpie).not.toContain("%0D");
    expect(arrayArtifacts.httpie).not.toContain("%0A");

    expect(arrayArtifacts.curl).toContain("%5BREDACTED%5D");
    expect(arrayArtifacts.httpie).toContain("%5BREDACTED%5D");
    expect(arrayArtifacts.curl).not.toContain("live-token-123");
    expect(arrayArtifacts.httpie).not.toContain("live-token-123");
    expect(arrayArtifacts.json_spec.query).toEqual({
      mode: "redacted-query-array-mixed",
      scope: ["[REDACTED] tier", 1, true],
      token: ["[REDACTED]", 0, false, "[REDACTED] fallback"]
    });

    expect(scalarArtifacts.curl).toContain("mode=redacted-query-scalar");
    expect(scalarArtifacts.curl).not.toContain("token=0");
    expect(scalarArtifacts.curl).not.toContain("token=false");
    expect(scalarArtifacts.curl).not.toContain("scope=1");
    expect(scalarArtifacts.curl).not.toContain("scope=true");
  });

  it("should preserve repeated redacted string-literal query arrays as sanitized deterministic URL params while keeping them typed apart from numeric and boolean variants in json_spec", (): void => {
    const stringLiteralArtifacts = buildReproduction(createBundleWithRedactedRepeatedStringLiteralQueryArrayRequestContext()).artifacts;
    const mixedScalarArtifacts = buildReproduction(createBundleWithRedactedRepeatedMixedScalarQueryArrayRequestContext()).artifacts;

    if (stringLiteralArtifacts === null || stringLiteralArtifacts.httpie === null || stringLiteralArtifacts.json_spec === null) {
      throw new Error("expected_replay_artifacts");
    }
    if (mixedScalarArtifacts === null || mixedScalarArtifacts.httpie === null || mixedScalarArtifacts.json_spec === null) {
      throw new Error("expected_replay_artifacts");
    }

    expect(stringLiteralArtifacts.curl).toContain(
      "https://example.invalid/imports/query-redaction?mode=redacted-query-array-string-literals"
    );
    expect(stringLiteralArtifacts.httpie).toContain(
      "https://example.invalid/imports/query-redaction?mode=redacted-query-array-string-literals"
    );

    expect(stringLiteralArtifacts.curl).toContain("scope=%5BREDACTED%5D+tier");
    expect(stringLiteralArtifacts.curl).toContain("scope=1");
    expect(stringLiteralArtifacts.curl).toContain("scope=true");
    expect(stringLiteralArtifacts.httpie).toContain("scope=%5BREDACTED%5D+tier");
    expect(stringLiteralArtifacts.httpie).toContain("scope=1");
    expect(stringLiteralArtifacts.httpie).toContain("scope=true");

    expect(stringLiteralArtifacts.curl).toContain("token=%5BREDACTED%5D");
    expect(stringLiteralArtifacts.curl).toContain("token=0");
    expect(stringLiteralArtifacts.curl).toContain("token=false");
    expect(stringLiteralArtifacts.curl).toContain("token=%5BREDACTED%5D+fallback");
    expect(stringLiteralArtifacts.httpie).toContain("token=%5BREDACTED%5D");
    expect(stringLiteralArtifacts.httpie).toContain("token=0");
    expect(stringLiteralArtifacts.httpie).toContain("token=false");
    expect(stringLiteralArtifacts.httpie).toContain("token=%5BREDACTED%5D+fallback");

    expect(stringLiteralArtifacts.curl).not.toContain("%00");
    expect(stringLiteralArtifacts.curl).not.toContain("%09");
    expect(stringLiteralArtifacts.curl).not.toContain("%0D");
    expect(stringLiteralArtifacts.curl).not.toContain("%0A");
    expect(stringLiteralArtifacts.httpie).not.toContain("%00");
    expect(stringLiteralArtifacts.httpie).not.toContain("%09");
    expect(stringLiteralArtifacts.httpie).not.toContain("%0D");
    expect(stringLiteralArtifacts.httpie).not.toContain("%0A");

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

  it("should preserve repeated redacted signed and decimal string-literal query arrays while keeping them typed apart from numeric decimal variants in json_spec", (): void => {
    const stringLiteralArtifacts = buildReproduction(
      createBundleWithRedactedRepeatedSignedDecimalStringLiteralQueryArrayRequestContext()
    ).artifacts;
    const numericArtifacts = buildReproduction(createBundleWithRedactedRepeatedNumericDecimalQueryArrayRequestContext()).artifacts;

    if (stringLiteralArtifacts === null || stringLiteralArtifacts.httpie === null || stringLiteralArtifacts.json_spec === null) {
      throw new Error("expected_replay_artifacts");
    }
    if (numericArtifacts === null || numericArtifacts.httpie === null || numericArtifacts.json_spec === null) {
      throw new Error("expected_replay_artifacts");
    }

    expect(stringLiteralArtifacts.curl).toContain(
      "https://example.invalid/imports/query-redaction?mode=redacted-query-array-signed-decimal-strings"
    );
    expect(stringLiteralArtifacts.httpie).toContain(
      "https://example.invalid/imports/query-redaction?mode=redacted-query-array-signed-decimal-strings"
    );
    expect(stringLiteralArtifacts.curl).toContain("scope=%5BREDACTED%5D+tier");
    expect(stringLiteralArtifacts.curl).toContain("scope=3.14");
    expect(stringLiteralArtifacts.curl).toContain("scope=-0.5");
    expect(stringLiteralArtifacts.curl).toContain("token=%5BREDACTED%5D");
    expect(stringLiteralArtifacts.curl).toContain("token=-1");
    expect(stringLiteralArtifacts.curl).toContain("token=2.75");
    expect(stringLiteralArtifacts.curl).toContain("token=%5BREDACTED%5D+fallback");
    expect(stringLiteralArtifacts.curl).not.toContain("%00");
    expect(stringLiteralArtifacts.curl).not.toContain("%09");
    expect(stringLiteralArtifacts.curl).not.toContain("%0D");
    expect(stringLiteralArtifacts.curl).not.toContain("%0A");

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

  it("should preserve repeated redacted query arrays containing explicit null placeholders distinct from omitted and scalar string null query variants", (): void => {
    const nullArrayArtifacts = buildReproduction(createBundleWithRedactedRepeatedNullQueryArrayRequestContext()).artifacts;
    const omittedArtifacts = buildReproduction(createBundleWithRedactedOmittedQueryRequestContext()).artifacts;
    const scalarStringNullArtifacts = buildReproduction(createBundleWithRedactedNullStringScalarQueryRequestContext()).artifacts;

    if (nullArrayArtifacts === null || nullArrayArtifacts.httpie === null || nullArrayArtifacts.json_spec === null) {
      throw new Error("expected_replay_artifacts");
    }
    if (omittedArtifacts === null || omittedArtifacts.httpie === null || omittedArtifacts.json_spec === null) {
      throw new Error("expected_replay_artifacts");
    }
    if (
      scalarStringNullArtifacts === null ||
      scalarStringNullArtifacts.httpie === null ||
      scalarStringNullArtifacts.json_spec === null
    ) {
      throw new Error("expected_replay_artifacts");
    }

    expect(nullArrayArtifacts.curl).toContain("https://example.invalid/imports/query-redaction?mode=redacted-query-array-null");
    expect(nullArrayArtifacts.httpie).toContain("https://example.invalid/imports/query-redaction?mode=redacted-query-array-null");

    expect(nullArrayArtifacts.curl).toContain("token=%5BREDACTED%5D");
    expect(nullArrayArtifacts.curl).toContain("token=null");
    expect(nullArrayArtifacts.curl).toContain("token=%5BREDACTED%5D+fallback");
    expect(nullArrayArtifacts.httpie).toContain("token=%5BREDACTED%5D");
    expect(nullArrayArtifacts.httpie).toContain("token=null");
    expect(nullArrayArtifacts.httpie).toContain("token=%5BREDACTED%5D+fallback");

    expect(nullArrayArtifacts.curl).toContain("scope=null");
    expect(nullArrayArtifacts.curl).toContain("scope=%5BREDACTED%5D+tier");
    expect(nullArrayArtifacts.httpie).toContain("scope=null");
    expect(nullArrayArtifacts.httpie).toContain("scope=%5BREDACTED%5D+tier");

    expect(nullArrayArtifacts.curl).not.toContain("%00");
    expect(nullArrayArtifacts.curl).not.toContain("%09");
    expect(nullArrayArtifacts.curl).not.toContain("%0D");
    expect(nullArrayArtifacts.curl).not.toContain("%0A");
    expect(nullArrayArtifacts.json_spec.query).toEqual({
      mode: "redacted-query-array-null",
      scope: [null, "[REDACTED] tier"],
      token: ["[REDACTED]", null, "[REDACTED] fallback"]
    });
    expect(scalarStringNullArtifacts.json_spec.query).toEqual({
      mode: "redacted-query-scalar-null-string",
      scope: "null",
      token: "null"
    });

    expect(omittedArtifacts.curl).toContain("mode=redacted-query-omitted");
    expect(omittedArtifacts.curl).not.toContain("token=");
    expect(omittedArtifacts.curl).not.toContain("scope=");

    expect(scalarStringNullArtifacts.curl).toContain("mode=redacted-query-scalar-null-string");
    expect(scalarStringNullArtifacts.curl).toContain("token=null");
    expect(scalarStringNullArtifacts.curl).toContain("scope=null");
    expect(scalarStringNullArtifacts.curl).not.toContain("token=%5BREDACTED%5D");
    expect(scalarStringNullArtifacts.curl).not.toContain("scope=%5BREDACTED%5D+tier");
  });

  it("should preserve repeated redacted query arrays containing explicit empty-string placeholders distinct from omitted and scalar empty-string query variants", (): void => {
    const emptyStringArrayArtifacts = buildReproduction(createBundleWithRedactedRepeatedEmptyStringQueryArrayRequestContext()).artifacts;
    const omittedArtifacts = buildReproduction(createBundleWithRedactedOmittedQueryRequestContext()).artifacts;
    const scalarEmptyStringArtifacts = buildReproduction(createBundleWithRedactedEmptyStringScalarQueryRequestContext()).artifacts;

    if (
      emptyStringArrayArtifacts === null ||
      emptyStringArrayArtifacts.httpie === null ||
      emptyStringArrayArtifacts.json_spec === null
    ) {
      throw new Error("expected_replay_artifacts");
    }
    if (omittedArtifacts === null || omittedArtifacts.httpie === null || omittedArtifacts.json_spec === null) {
      throw new Error("expected_replay_artifacts");
    }
    if (
      scalarEmptyStringArtifacts === null ||
      scalarEmptyStringArtifacts.httpie === null ||
      scalarEmptyStringArtifacts.json_spec === null
    ) {
      throw new Error("expected_replay_artifacts");
    }

    expect(emptyStringArrayArtifacts.curl).toContain("https://example.invalid/imports/query-redaction?mode=redacted-query-array-empty-string");
    expect(emptyStringArrayArtifacts.httpie).toContain("https://example.invalid/imports/query-redaction?mode=redacted-query-array-empty-string");

    expect(emptyStringArrayArtifacts.curl).toContain("token=%5BREDACTED%5D");
    expect(emptyStringArrayArtifacts.curl).toContain("token=&token=%5BREDACTED%5D+fallback");
    expect(emptyStringArrayArtifacts.httpie).toContain("token=%5BREDACTED%5D");
    expect(emptyStringArrayArtifacts.httpie).toContain("token=&token=%5BREDACTED%5D+fallback");

    expect(emptyStringArrayArtifacts.curl).toContain("scope=&scope=%5BREDACTED%5D+tier");
    expect(emptyStringArrayArtifacts.httpie).toContain("scope=&scope=%5BREDACTED%5D+tier");

    expect(emptyStringArrayArtifacts.curl).not.toContain("%00");
    expect(emptyStringArrayArtifacts.curl).not.toContain("%09");
    expect(emptyStringArrayArtifacts.curl).not.toContain("%0D");
    expect(emptyStringArrayArtifacts.curl).not.toContain("%0A");

    expect(omittedArtifacts.curl).toContain("mode=redacted-query-omitted");
    expect(omittedArtifacts.curl).not.toContain("token=");
    expect(omittedArtifacts.curl).not.toContain("scope=");

    expect(scalarEmptyStringArtifacts.curl).toContain("mode=redacted-query-scalar-empty-string");
    expect(scalarEmptyStringArtifacts.curl).toContain("scope=&token=");
    expect(scalarEmptyStringArtifacts.curl).not.toContain("token=%5BREDACTED%5D");
    expect(scalarEmptyStringArtifacts.curl).not.toContain("scope=%5BREDACTED%5D+tier");
  });
});