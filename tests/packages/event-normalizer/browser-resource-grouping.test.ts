import { describe, expect, it } from "vitest";
import {
  buildEventFingerprintContext,
  fingerprint,
  fingerprintVersion,
  inferMatchedFields,
  normalizeEvent
} from "../../../packages/event-normalizer/src/index.js";
import { browserResourceEvent } from "../../helpers/browser-resource-fixtures.js";

describe("browser resource grouping", () => {
  it("preserves both legacy rule fingerprints without changing ordinary exception grouping", () => {
    const event = browserResourceEvent();
    const context = buildEventFingerprintContext(event, ["v1", "v2"]);
    expect(context.fingerprint.version).toBe("v3");
    expect(context.fingerprint_aliases).toEqual(
      ["v1", "v2"].map((version) => ({
        version,
        value: fingerprint(normalizeEvent(event, version as "v1" | "v2"))
      }))
    );
    const ordinary = { ...event, payload: { ...event.payload, browser_event: undefined } };
    expect(fingerprint(normalizeEvent(ordinary))).toBe(fingerprint(normalizeEvent(ordinary, "v2")));
    expect(fingerprintVersion(normalizeEvent(ordinary))).toBe("v2");
  });
  it("groups one concrete resource across routes and preserves route evidence", () => {
    const routes = ["/", "/login", "/auth/google/callback", "/dashboard"];
    const events = routes.map((route) => normalizeEvent(browserResourceEvent({ route })));
    expect(new Set(events.map(fingerprint)).size).toBe(1);
    expect(events.map((event) => event.route_template)).toEqual(routes);
    expect(inferMatchedFields(events[0]!)).not.toContain("route_template");
  });

  it("separates resource targets, element types and asset versions", () => {
    const inputs = [
      {},
      { url: "https://accounts.google.com/gsi/client" },
      { url: "https://app.example.com/assets/main-v1.js" },
      { url: "https://app.example.com/assets/main-v2.js" },
      { tag: "link" }
    ];
    expect(
      new Set(inputs.map((input) => fingerprint(normalizeEvent(browserResourceEvent(input))))).size
    ).toBe(inputs.length);
  });

  it("does not collapse resource errors without an identified target", () => {
    expect(fingerprint(normalizeEvent(browserResourceEvent({ url: null, route: "/a" })))).not.toBe(
      fingerprint(normalizeEvent(browserResourceEvent({ url: null, route: "/b" })))
    );
  });
});
