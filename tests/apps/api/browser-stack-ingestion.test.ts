import { expect, it } from "vitest";
import { redactEvent } from "../../../apps/api/src/api-helpers.js";
import { createEventEnvelope } from "../../../packages/shared-types/src/index.js";

it.each([
  [
    "at fn (https://user:secret@example.com/checkout?token=secret#state:12:24)",
    "at fn (https://example.com/checkout:12:24)"
  ],
  ["fn@http://localhost:3000/app.js?token=secret:3", "fn@http://localhost:3000/app.js:3"],
  ["at https://example.com/app.js?token=secret", "at https://example.com/app.js"],
  ["at http://[invalid]?token=secret:2:3", "at [unavailable-url]:2:3"],
  [
    "at fn (https://user:pa)secret@example.com/app.js?token=one)secret#state:12:24)",
    "at fn (https://example.com/app.js:12:24)"
  ],
  ["fn@https://example.com/app.js?token=one)secret:12:24", "fn@https://example.com/app.js:12:24"],
  ["at fn (https://example.com/app(1).js:12:24)", "at fn (https://example.com/app(1).js:12:24)"],
  ["at app.js:2:3", "at app.js:2:3"]
])("sanitizes legacy browser stack URLs before ingestion persistence: %s", (source, expected) => {
  const event = createEventEnvelope({
    event_type: "frontend_exception",
    sdk_version: "1.6.0",
    project_token: "dbundle_proj_test",
    service: { name: "web", environment: "production" },
    payload: {
      name: "Error",
      message: "Save failed",
      stack: source,
      route: "/checkout",
      browser: { name: "Chrome", version: "140" },
      breadcrumbs: []
    }
  });
  const captured = redactEvent(event);
  expect(captured.payload).toMatchObject({
    stack: expected,
    message: "Save failed",
    route: "/checkout"
  });
  expect(JSON.stringify(captured)).not.toContain("secret");
  expect(captured.project_token).toBeUndefined();
  expect(event.payload.stack).toBe(source);
});
