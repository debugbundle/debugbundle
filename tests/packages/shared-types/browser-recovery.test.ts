import { expect, it } from "vitest";
import {
  readBrowserRecoveryFailure,
  browserRecoveryFailureFromEvent
} from "../../../packages/shared-types/src/browser-recovery.js";
import { createEventEnvelope } from "../../../packages/shared-types/src/index.js";

it.each(["refresh", "renew", "recover", "recovery", "retry", "presign", "signed-url"])(
  "recognizes explicit %s endpoint evidence",
  (part) => {
    expect(
      readBrowserRecoveryFailure({
        path: `/api/${part}?token=secret#fragment`,
        method: "post",
        status: 404
      })
    ).toEqual({ path: `/api/${part}`, method: "POST", status_code: 404 });
  }
);
it.each([
  "https://external.example/refresh",
  "//external/refresh",
  "/api\\refresh",
  "/refresh\n",
  "/favicon.ico",
  "/" + "a".repeat(4097),
  "/refresh/" + "a".repeat(1024),
  null
])("rejects unsafe or unrelated paths %s", (path) => {
  expect(readBrowserRecoveryFailure({ path, method: "GET", status: 404 })).toBeNull();
});
it.each(["", "GET\n", "a".repeat(33), null])("rejects malformed methods %s", (method) => {
  expect(readBrowserRecoveryFailure({ path: "/refresh", method, status: 404 })).toBeNull();
});
it.each([200, 600, 404.5, "404"])("rejects non-failure status %s", (status) => {
  expect(readBrowserRecoveryFailure({ path: "/refresh", method: "GET", status })).toBeNull();
});
it("accepts an explicit failed standalone network breadcrumb and ignores other breadcrumb types", () => {
  const event = createEventEnvelope({
    event_type: "frontend_breadcrumb",
    service: { name: "web", environment: "production" },
    payload: {
      breadcrumb_type: "network_request",
      data: { url: "/refresh", method: "GET", status: 503 }
    }
  });
  expect(browserRecoveryFailureFromEvent(event)?.status_code).toBe(503);
  event.payload.breadcrumb_type = "click";
  expect(browserRecoveryFailureFromEvent(event)).toBeNull();
});
