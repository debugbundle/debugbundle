import { afterEach, describe, expect, it, vi } from "vitest";
import { once } from "node:events";
import { createServer } from "node:http";

import { createHostedDogfoodingTransport } from "../../../apps/worker/src/dogfooding.js";
import { createAlertTransport } from "../../../apps/worker/src/worker-alert-transports.js";
import { createLifecycleWebhookTransport } from "../../../apps/worker/src/worker-notifications.js";
import { createWeeklyReportTransport } from "../../../apps/worker/src/worker-weekly-reports.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("closes a real streaming HTTP response once webhook status is known", async () => {
  let resolveClosed: (() => void) | undefined;
  const responseClosed = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });
  const server = createServer((request, response) => {
    request.resume();
    response.once("close", () => resolveClosed?.());
    response.writeHead(200, { "content-type": "text/plain" });
    response.write("response intentionally left open");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    if (address === null || typeof address === "string") throw new Error("missing_test_port");
    await createLifecycleWebhookTransport({ timeoutMs: 1000 }).deliver({
      target_url: `http://127.0.0.1:${address.port}/hook`,
      signing_secret: "test-only",
      payload: {}
    } as never);
    await Promise.race([
      responseClosed,
      new Promise<never>((_resolve, reject) => {
        deadline = setTimeout(() => reject(new Error("response_connection_not_released")), 2000);
      })
    ]);
  } finally {
    clearTimeout(deadline);
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});

const deliveries = [
  [
    "alert",
    () =>
      createAlertTransport({ timeoutMs: 1000, emailTransport: null }).deliver({
        channel: "webhook",
        config: { target_url: "https://example.test/hook" },
        payload: {}
      } as never)
  ],
  [
    "lifecycle",
    () =>
      createLifecycleWebhookTransport({ timeoutMs: 1000 }).deliver({
        target_url: "https://example.test/hook",
        signing_secret: "test-only",
        payload: {}
      } as never)
  ],
  [
    "weekly",
    () =>
      createWeeklyReportTransport({ emailTransport: null }).deliver({
        channel: { channel: "slack", config: { webhook_url: "https://example.test/hook" } },
        report: {
          project_id: "project-test",
          project_name: "Test",
          window_start: "2026-09-01T00:00:00Z",
          window_end: "2026-09-08T00:00:00Z",
          bundle_counts: { failure: 0, improvement: 0 },
          new_incidents: 0,
          resolved_incidents: 0,
          opened_incidents_resolved: 0,
          regressions: 0,
          top_spiking_incidents: []
        }
      } as never)
  ],
  [
    "dogfooding",
    () =>
      createHostedDogfoodingTransport("test-only")({
        endpoint: "https://example.test/events",
        headers: {},
        events: [],
        timeout_ms: 1000
      } as never)
  ]
] as const;

describe.each(deliveries)("%s HTTP resource cleanup", (name, deliver) => {
  it.each([200, 503])(
    "releases the fetch after status %i without changing the outcome",
    async (status) => {
      vi.useFakeTimers();
      const signals: AbortSignal[] = [];
      vi.stubGlobal(
        "fetch",
        vi.fn((_url: unknown, init: RequestInit) => {
          if (init.signal !== null && init.signal !== undefined) signals.push(init.signal);
          return Promise.resolve(new Response("unused response body", { status }));
        })
      );

      if (name === "dogfooding") {
        await expect(deliver()).resolves.toEqual({ status });
      } else if (status === 200) {
        await expect(deliver()).resolves.toBeUndefined();
      } else {
        await expect(deliver()).rejects.toThrow("503");
      }
      expect(signals).toHaveLength(1);
      expect(signals[0]?.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    }
  );
});
