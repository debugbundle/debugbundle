import { describe, expect, it } from "vitest";
import { sanitizeEvent } from "../../../packages/event-normalizer/src/event-privacy.js";
import { createEventEnvelope } from "../../../packages/shared-types/src/index.js";

describe("event privacy projection", () => {
  it("drops oversized added evidence after redaction while preserving the original admissible exception", () => {
    const event = createEventEnvelope({
      event_type: "frontend_exception",
      service: { name: "web", environment: "test" },
      payload: {
        name: "Error",
        message: "original failure",
        stack: "Error: original failure",
        browser: { name: "Browser", version: "1" },
        exception_evidence: {
          version: 1,
          runtime: "browser",
          root_id: 0,
          truncated: false,
          unavailable_reason: null,
          nodes: [
            {
              id: 0,
              name: "Error",
              message: "token=x ".repeat(256),
              stack: null,
              trace_origin: "unknown",
              parsing_status: "unparsed",
              frames: [],
              relationships: []
            }
          ]
        }
      }
    });
    const safe = sanitizeEvent(event);
    expect(safe.payload).toMatchObject({
      name: "Error",
      message: "original failure",
      stack: "Error: original failure"
    });
    expect(safe.payload).not.toHaveProperty("exception_evidence");
    expect(safe.context?.["evidence_limits"]).toMatchObject({
      version: 1,
      exception_evidence: "budget_exceeded"
    });
  });
  it("sanitises all structured exception stacks and locations before retention", () => {
    const event = createEventEnvelope({
      event_type: "frontend_exception",
      service: { name: "web", environment: "test" },
      payload: {
        name: "Error",
        message: "failed",
        stack: "Error: failed",
        browser: { name: "Browser", version: "1" },
        exception_evidence: {
          version: 1,
          runtime: "browser",
          root_id: 0,
          truncated: false,
          unavailable_reason: null,
          nodes: [
            {
              id: 0,
              name: "Error",
              message: "password=SYNTHETIC_SECRET",
              stack:
                "run@https://user:SYNTHETIC_SECRET@example.test/app.js?ordinary=SYNTHETIC_SECRET:12:3",
              trace_origin: "throw",
              parsing_status: "parsed",
              relationships: [],
              frames: [
                {
                  function: "run",
                  file: "https://user:SYNTHETIC_SECRET@example.test/app.js?ordinary=SYNTHETIC_SECRET",
                  line: 12,
                  column: 3,
                  classification: "unknown"
                }
              ]
            }
          ]
        }
      }
    });
    const result = sanitizeEvent(event);
    expect(JSON.stringify(result)).not.toContain("SYNTHETIC_SECRET");
    expect(JSON.stringify(result)).not.toContain("ordinary=");
    expect(JSON.stringify(result)).toContain("app.js:12:3");
  });
  it("retains browser stack locations and trace IDs while removing credentials before normalization", () => {
    const event = createEventEnvelope({
      event_type: "frontend_exception",
      service: { name: "web", environment: "test" },
      correlation: { trace_id: "trace-safe" },
      project_token: "dbundle_proj_SYNTHETIC_SECRET",
      context: { note: "password=SYNTHETIC_SECRET" },
      payload: {
        name: "Error",
        message: "Checkout failed",
        stack:
          "Error: Checkout failed\n    at checkout (https://example.test/app.js?token=SYNTHETIC_SECRET:42:1)",
        route: "/checkout",
        browser: { name: "Chrome", version: "1" }
      }
    });
    const safe = sanitizeEvent(event);
    expect(safe.correlation?.trace_id).toBe("trace-safe");
    expect(safe).not.toHaveProperty("project_token");
    expect(JSON.stringify(safe)).not.toContain("SYNTHETIC_SECRET");
    expect(JSON.stringify(safe)).toContain("example.test/app.js");
    expect(JSON.stringify(event)).toContain("SYNTHETIC_SECRET");
  });
});
