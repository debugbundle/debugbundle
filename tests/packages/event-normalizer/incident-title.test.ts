import { describe, expect, it } from "vitest";
import {
  deriveIncidentTitle,
  fingerprint,
  normalizeEvent
} from "../../../packages/event-normalizer/src/index.js";
import { createEventEnvelope } from "../../../packages/shared-types/src/index.js";
import { browserResourceEvent } from "../../helpers/browser-resource-fixtures.js";

describe("incident titles", () => {
  it.each([
    "at {dynamic}//io.undertow.servlet.handlers.FilterHandler$FilterChainImpl.doFilter(FilterHandler.java:{dynamic})",
    "at deployment.portal.war//io.example.Filter.doFilter(Filter.java:44)",
    "at io.example.Client.connect(Unknown Source)",
    "at io.example.Client.connect(Native Method)",
    "at handleCheckout (src/checkout.ts:12:3)",
    "at async handleCheckout (src/checkout.ts:{dynamic}:{dynamic})",
    "at https://app.example.com/assets/main.js:12:3",
    "at /srv/app/checkout.js:12:3",
    "at node:internal/process/task_queues:12:3"
  ])("removes recognized frames: %s", (frame) => {
    expect(
      deriveIncidentTitle({
        event_type: "backend_exception",
        normalized_message: `IllegalStateException: Failed to load patients ${frame}`
      })
    ).toBe("IllegalStateException: Failed to load patients");
    expect(
      deriveIncidentTitle({
        event_type: "backend_exception",
        normalized_message: frame
      })
    ).toBe("Backend exception");
  });

  it.each(["\n\t", "\r\n\t", "\\n    ", "\\r\\n\\t"])(
    "handles stack separators %j",
    (separator) => {
      expect(
        deriveIncidentTitle({
          event_type: "log_event",
          normalized_message: `Checkout failed${separator}at app.Checkout.run(Checkout.java:44)`
        })
      ).toBe("Checkout failed");
    }
  );

  it.each([
    "Order failed at checkout (attempt {dynamic})",
    "Reservation failed at seat (section:12)",
    "Request failed at checkout",
    "File C:\\new\\report.txt could not be opened"
  ])("preserves ordinary messages: %s", (message) => {
    expect(deriveIncidentTitle({ event_type: "log_event", normalized_message: message })).toBe(
      message
    );
  });

  it.each(["", "  ", '{"error":true}', "[1,2,3]", "backend_exception"])(
    "retains the human fallback for %j",
    (message) => {
      expect(
        deriveIncidentTitle({ event_type: "backend_exception", normalized_message: message })
      ).toBe("Backend exception");
    }
  );

  it("preserves explicit resource titles, including bracket-prefixed asset names", () => {
    const resource = normalizeEvent(
      browserResourceEvent({ url: "https://www.googletagmanager.com/gtm.js" })
    );
    expect(deriveIncidentTitle(resource)).toBe(resource.incident_title);
    expect(
      deriveIncidentTitle({
        event_type: "frontend_exception",
        normalized_message: "frontend_exception",
        incident_title: "[checkout].js failed to load"
      })
    ).toBe("[checkout].js failed to load");
  });

  it.each(["Request failed: ".repeat(30), "x".repeat(500), "😀".repeat(200)])(
    "bounds long titles without broken Unicode",
    (message) => {
      const title = deriveIncidentTitle({
        event_type: "backend_exception",
        normalized_message: message
      });
      expect(Array.from(title).length).toBeLessThanOrEqual(180);
      expect(title).toMatch(/…$/);
      expect(Buffer.from(title, "utf8").toString("utf8")).toBe(title);
    }
  );

  it("keeps titles at the limit intact and bounds explicit titles too", () => {
    const message = "x".repeat(180);
    expect(deriveIncidentTitle({ event_type: "log_event", normalized_message: message })).toBe(
      message
    );
    expect(
      deriveIncidentTitle({
        event_type: "frontend_exception",
        normalized_message: "fallback",
        incident_title: "x".repeat(200)
      })
    ).toHaveLength(180);
  });

  it("leaves complete normalized messages, payloads, and fingerprint versions unchanged", () => {
    const message = "Checkout failed at app.Checkout.run(Checkout.java:44)";
    const event = createEventEnvelope({
      event_type: "log_event",
      service: { name: "checkout", environment: "staging", runtime: "java", framework: null },
      payload: { level: "error", message, attributes: {} }
    });
    for (const version of ["v1", "v2", "v3"] as const) {
      const normalized = normalizeEvent(event, version);
      const before = structuredClone(normalized);
      const fingerprintBefore = fingerprint(normalized);
      expect(deriveIncidentTitle(normalized)).toBe("Checkout failed");
      expect(normalized).toEqual(before);
      expect(fingerprint(normalized)).toBe(fingerprintBefore);
      expect(normalized.normalized_message).toContain("Checkout.java");
      expect(normalized.payload).toMatchObject({ message });
    }
  });
});
