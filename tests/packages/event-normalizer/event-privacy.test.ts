import { describe, expect, it } from "vitest";
import { sanitizeEvent } from "../../../packages/event-normalizer/src/event-privacy.js";
import { createEventEnvelope } from "../../../packages/shared-types/src/index.js";

describe("event privacy projection", () => {
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
