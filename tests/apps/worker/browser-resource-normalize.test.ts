import { gzipSync } from "node:zlib";
import { expect, it, vi } from "vitest";
import { processNextNormalizeEventsJob } from "../../../apps/worker/src/processor-normalize.js";
import { normalizeEvent } from "../../../packages/event-normalizer/src/index.js";
import { buildAlertNotificationContext } from "../../../apps/worker/src/processor-shared.js";
import { browserResourceEvent } from "../../helpers/browser-resource-fixtures.js";

it("carries resource identity, title, severity and a sanitized route into durable grouping", async () => {
  const event = browserResourceEvent({ route: "/e/aBcdEF12gh34IJ56?token=secret" });
  const queue = {
    dequeue: vi
      .fn()
      .mockResolvedValue({ project_id: "proj_test", event_id: event.event_id, object_key: "raw" }),
    enqueue: vi.fn().mockResolvedValue(undefined)
  };
  await processNextNormalizeEventsJob({
    queue,
    objectStore: { getObject: vi.fn().mockResolvedValue(gzipSync(JSON.stringify(event))) },
    processedEventStore: { upsertProcessedEvent: vi.fn().mockResolvedValue(undefined) }
  });
  expect(queue.enqueue).toHaveBeenCalledWith(
    "group-incident",
    expect.objectContaining({
      fingerprint_version: "v3",
      incident_title: "Google Tag Manager script failed to load",
      normalized_message: "Browser resource load error",
      resource_route: "/e/{param}",
      severity: "medium"
    })
  );
  expect(JSON.stringify(queue.enqueue.mock.calls)).not.toMatch(/secret|aBcdEF12/);
});

it("coalesces different resource paths from the same browser page session", () => {
  const first = browserResourceEvent({
    url: "https://app.example.com/assets/app-123.js",
    page: "https://app.example.com/gallery?token=secret",
    tag: "link"
  });
  const second = browserResourceEvent({
    url: "https://app.example.com/assets/app-456.css",
    page: "https://app.example.com/gallery?token=other",
    tag: "link"
  });
  first.correlation = {
    request_id: null,
    trace_id: null,
    session_id: "browser-session",
    user_id_hash: null
  };
  second.correlation = {
    request_id: null,
    trace_id: null,
    session_id: "browser-session",
    user_id_hash: null
  };
  const firstContext = buildAlertNotificationContext({
    projectId: "proj_test",
    event: first,
    normalized: normalizeEvent(first),
    fingerprint: "first"
  });
  const secondContext = buildAlertNotificationContext({
    projectId: "proj_test",
    event: second,
    normalized: normalizeEvent(second),
    fingerprint: "second"
  });

  expect(firstContext.coalescing_key).toBe(secondContext.coalescing_key);
  expect(firstContext.notification_key).not.toBe(secondContext.notification_key);
  expect(firstContext.coalescing_window_seconds).toBe(10);
  expect(JSON.stringify(firstContext)).not.toContain("browser-session");
  expect(JSON.stringify(firstContext)).not.toContain("secret");

  second.correlation = {
    request_id: null,
    trace_id: null,
    session_id: "another-session",
    user_id_hash: null
  };
  expect(
    buildAlertNotificationContext({
      projectId: "proj_test",
      event: second,
      normalized: normalizeEvent(second),
      fingerprint: "second"
    }).coalescing_key
  ).not.toBe(firstContext.coalescing_key);
});

it("keeps path-specific alert keys when a browser event has no page identity", () => {
  const event = browserResourceEvent({
    url: "https://app.example.com/assets/app-123.js",
    page: ""
  });
  event.correlation = {
    request_id: null,
    trace_id: null,
    session_id: "browser-session",
    user_id_hash: null
  };
  const context = buildAlertNotificationContext({
    projectId: "proj_test",
    event,
    normalized: { ...normalizeEvent(event), route_template: null },
    fingerprint: "resource-fingerprint"
  });

  expect(context.coalescing_window_seconds).toBeUndefined();
});

it("separates later page loads and page origins even when workers process a backlog", () => {
  const event = browserResourceEvent({ page: "https://app.example.com/gallery" });
  event.correlation = { request_id: null, trace_id: null, session_id: "session", user_id_hash: null };
  event.occurred_at = "2026-09-22T10:00:00.000Z";
  const context = () => buildAlertNotificationContext({ projectId: "project", event, normalized: normalizeEvent(event), fingerprint: "resource" });
  const first = context();
  event.occurred_at = "2026-09-22T10:01:00.000Z";
  expect(context().coalescing_key).not.toBe(first.coalescing_key);
  expect(context().notification_key).toBe(first.notification_key);
  event.occurred_at = "2026-09-22T10:00:00.000Z";
  event.payload.browser_event!.page!.url = "https://another.example.com/gallery";
  expect(context().coalescing_key).not.toBe(first.coalescing_key);
  expect(context().notification_key).toBe(first.notification_key);
});

it("does not coalesce visible asset failures with hidden speculative loads", () => {
  const event = browserResourceEvent({ url: "https://app.example.com/a.js", page: "https://app.example.com/", tag: "link", visibilityState: "hidden", readyState: "interactive", attributes: { rel: "modulepreload" } });
  event.correlation = { request_id: null, trace_id: null, session_id: "s", user_id_hash: null };
  const context = () => buildAlertNotificationContext({ projectId: "p", event, normalized: normalizeEvent(event), fingerprint: "f" });
  const hidden = context();
  event.payload.browser_event!.page!.visibility_state = "visible";
  expect(context().coalescing_key).not.toBe(hidden.coalescing_key);
});
