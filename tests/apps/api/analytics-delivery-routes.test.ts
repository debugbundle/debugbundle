import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { createApiServer } from "../../../apps/api/src/server.js";
import { hashToken } from "../../../packages/auth/src/index.js";
import {
  AnalyticsDeliveryReceiptSchema,
  SemanticAnalyticsEventSchema
} from "../../../packages/shared-types/src/index.js";
import { createBaseDependencies } from "../../helpers/api-capture-rule-ingestion.js";
import { mockedObject } from "../../helpers/vitest.js";

const token = `dbundle_anl_${"A".repeat(43)}`;
const relayToken = `dbundle_anr_${"A".repeat(43)}`;
const projectId = "11111111-1111-4111-8111-111111111111";
const event = SemanticAnalyticsEventSchema.parse(
  JSON.parse(
    readFileSync(new URL("../../fixtures/analytics-semantic-event.json", import.meta.url), "utf8")
  )
);
const clientEvent = SemanticAnalyticsEventSchema.parse({
  ...event,
  sdk_name: "@debugbundle/sdk-browser",
  service: { ...event.service, runtime: "browser" },
  producer: { kind: "browser", stream_id: null, sequence: null },
  operation_id: null,
  correlation: { ...event.correlation, session_id: "55555555-5555-4555-8555-555555555555" },
  payload: {
    ...event.payload,
    purpose: "product_analytics",
    privacy: { mode: "strict", consent_granted: true }
  }
});
const apps: ReturnType<typeof createApiServer>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function createApp(
  enabled = true,
  requestTimeoutMs?: number,
  writerKind: "server" | "relay" = "server"
) {
  const claimEvents = vi.fn().mockResolvedValue({
    allowed: true,
    limit: 10_000,
    remaining: 9_999,
    retry_after_ms: 0
  });
  const getRateLimitPerMinute = vi.fn().mockResolvedValue(10_000);
  const resolveWriter = vi.fn().mockResolvedValue({
    writer_id: "33333333-3333-4333-8333-333333333333",
    project_id: projectId,
    organization_id: "22222222-2222-4222-8222-222222222222",
    issuer_user_id: "44444444-4444-4444-8444-444444444444",
    kind: writerKind,
    expires_at: "2099-01-01T00:00:00.000Z",
    revoked_at: null
  });
  const persist = vi.fn().mockResolvedValue({
    kind: "accepted",
    duplicate: false,
    receipt: {
      event_id: event.event_id,
      operation_id: event.operation_id,
      content_hash: `sha256:${"b".repeat(64)}`,
      accepted_at: "2026-09-28T12:00:00.000Z",
      expires_at: "2026-12-27T12:00:00.000Z"
    }
  });
  const app = createApiServer(
    {
      ...createBaseDependencies(),
      analyticsWriters: mockedObject<
        NonNullable<Parameters<typeof createApiServer>[0]["analyticsWriters"]>
      >({ resolveByTokenHash: resolveWriter }),
      ingestionRateLimiter: { claimEvents },
      semanticAnalyticsDelivery: { enabled, persist, getRateLimitPerMinute },
      semanticAnalyticsRelayDelivery: { enabled, persist, getRateLimitPerMinute }
    },
    requestTimeoutMs === undefined ? undefined : { requestTimeoutMs }
  );
  apps.push(app);
  return { app, resolveWriter, persist, claimEvents, getRateLimitPerMinute };
}

it("accepts only a relay writer and client event on the candidate relay endpoint", async () => {
  const { app, resolveWriter, persist } = createApp(true, undefined, "relay");
  persist.mockResolvedValueOnce({
    kind: "accepted",
    duplicate: false,
    receipt: {
      event_id: clientEvent.event_id,
      operation_id: null,
      content_hash: `sha256:${"b".repeat(64)}`,
      accepted_at: "2026-09-28T12:00:00.000Z",
      expires_at: "2026-12-27T12:00:00.000Z"
    }
  });
  const accepted = await app.inject({
    method: "POST",
    url: "/v1/analytics/relay/events",
    headers: { authorization: `Bearer ${relayToken}` },
    payload: { events: [clientEvent] }
  });
  expect(accepted.statusCode).toBe(200);
  expect(AnalyticsDeliveryReceiptSchema.parse(accepted.json())).toMatchObject({
    project_id: projectId,
    accepted: 1,
    rejected: 0,
    accepted_events: [{ index: 0, event_id: clientEvent.event_id }]
  });
  expect(resolveWriter).toHaveBeenCalledWith(hashToken(relayToken));
  expect(persist).toHaveBeenCalledWith({
    projectId,
    credentialHash: hashToken(relayToken),
    event: clientEvent
  });
  for (const headers of [
    { authorization: `Bearer ${token}` },
    { authorization: `Bearer ${relayToken}`, origin: "https://site.example" }
  ]) {
    const denied = await app.inject({
      method: "POST",
      url: "/v1/analytics/relay/events",
      headers,
      payload: { events: [clientEvent] }
    });
    expect(denied.statusCode).toBe(401);
  }
  const spoofed = await app.inject({
    method: "POST",
    url: "/v1/analytics/relay/events",
    headers: { authorization: `Bearer ${relayToken}` },
    payload: { events: [event] }
  });
  expect(spoofed.statusCode).toBe(200);
  expect(AnalyticsDeliveryReceiptSchema.parse(spoofed.json())).toMatchObject({
    accepted: 0,
    errors: [{ index: 0, reason: "source_not_authorized" }]
  });
  expect(persist).toHaveBeenCalledTimes(1);
});

it("keeps the relay endpoint closed in the default candidate composition", async () => {
  const { app, persist } = createApp(false, undefined, "relay");
  const response = await app.inject({
    method: "POST",
    url: "/v1/analytics/relay/events",
    headers: { authorization: `Bearer ${relayToken}` },
    payload: { events: [clientEvent] }
  });
  expect(response.statusCode).toBe(503);
  expect(persist).not.toHaveBeenCalled();
});

it("accepts one closed backend identity reference only on relay and rejects submitted subject hashes", async () => {
  const reference = {
    context_id: "55555555-5555-4555-8555-555555555555",
    producer_epoch: "66666666-6666-4666-8666-666666666666",
    binding_hash: `sha256:${"d".repeat(64)}`
  };
  const { app, persist } = createApp(true, undefined, "relay");
  persist.mockResolvedValueOnce({ kind: "rejected", reason: "identity_not_authorized" });
  const acceptedShape = await app.inject({
    method: "POST",
    url: "/v1/analytics/relay/events",
    headers: { authorization: `Bearer ${relayToken}` },
    payload: { events: [clientEvent], identity_context: reference }
  });
  expect(acceptedShape.statusCode).toBe(200);
  expect(persist).toHaveBeenCalledWith({
    projectId,
    credentialHash: hashToken(relayToken),
    event: clientEvent,
    identityContext: reference
  });
  const invalid = await app.inject({
    method: "POST",
    url: "/v1/analytics/relay/events",
    headers: { authorization: `Bearer ${relayToken}` },
    payload: { events: [clientEvent], identity_context: { ...reference, raw_user_id: "user" } }
  });
  expect(invalid.statusCode).toBe(400);
  const spoofed = await app.inject({
    method: "POST",
    url: "/v1/analytics/relay/events",
    headers: { authorization: `Bearer ${relayToken}` },
    payload: {
      events: [
        {
          ...clientEvent,
          correlation: {
            ...clientEvent.correlation,
            namespace_revision: 1,
            anonymous_id_hash: `sha256:${"a".repeat(64)}`
          },
          payload: { ...clientEvent.payload, privacy: { mode: "standard", consent_granted: true } }
        }
      ],
      identity_context: reference
    }
  });
  expect(spoofed.json()).toMatchObject({
    accepted: 0,
    errors: [{ index: 0, reason: "identity_not_authorized" }]
  });
  const server = createApp().app;
  const wrongRoute = await server.inject({
    method: "POST",
    url: "/v1/analytics/deliver",
    headers: { authorization: `Bearer ${token}` },
    payload: { events: [event], identity_context: reference }
  });
  expect(wrongRoute.statusCode).toBe(400);
});

it("binds a validated server bearer and returns a canonical indexed durable receipt", async () => {
  const { app, resolveWriter, persist } = createApp();
  const response = await app.inject({
    method: "POST",
    url: "/v1/analytics/deliver",
    headers: { authorization: `Bearer ${token}` },
    payload: { events: [event] }
  });
  expect(response.statusCode).toBe(200);
  expect(response.headers["cache-control"]).toBe("private, no-store");
  expect(AnalyticsDeliveryReceiptSchema.parse(response.json())).toMatchObject({
    project_id: projectId,
    submitted: 1,
    accepted: 1,
    rejected: 0,
    accepted_events: [{ index: 0, event_id: event.event_id, duplicate: false }]
  });
  expect(resolveWriter).toHaveBeenCalledWith(hashToken(token));
  expect(persist).toHaveBeenCalledWith({
    projectId,
    credentialHash: hashToken(token),
    event
  });
});

it("rejects relay, project and browser-Origin requests before persistence", async () => {
  const { app, persist } = createApp();
  for (const [authorization, origin] of [
    [`Bearer ${relayToken}`, undefined],
    ["Bearer dbundle_proj_test", undefined],
    [`Bearer ${token}`, "https://site.example"]
  ]) {
    const response = await app.inject({
      method: "POST",
      url: "/v1/analytics/deliver",
      headers: { authorization, ...(origin === undefined ? {} : { origin }) },
      payload: { events: [event] }
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "invalid_analytics_writer" });
  }
  expect(persist).not.toHaveBeenCalled();
});

it("bounds the batch and preserves each original index for terminal rejections", async () => {
  const { app, persist } = createApp();
  persist.mockResolvedValueOnce({ kind: "event_id_conflict" });
  persist.mockResolvedValueOnce({
    kind: "accepted",
    duplicate: false,
    receipt: {
      event_id: "00000000-0000-4000-8000-000000000902",
      operation_id: event.operation_id,
      content_hash: `sha256:${"b".repeat(64)}`,
      accepted_at: "2026-09-28T12:00:00.000Z",
      expires_at: "2026-12-27T12:00:00.000Z"
    }
  });
  const response = await app.inject({
    method: "POST",
    url: "/v1/analytics/deliver",
    headers: { authorization: `Bearer ${token}` },
    payload: { events: [event, { ...event, event_id: "00000000-0000-4000-8000-000000000902" }] }
  });
  expect(response.statusCode).toBe(200);
  expect(AnalyticsDeliveryReceiptSchema.parse(response.json())).toMatchObject({
    submitted: 2,
    accepted: 1,
    rejected: 1,
    errors: [{ index: 0, reason: "event_id_conflict" }],
    accepted_events: [{ index: 1 }]
  });
  const malformed = await app.inject({
    method: "POST",
    url: "/v1/analytics/deliver",
    headers: { authorization: `Bearer ${token}` },
    payload: { events: [] }
  });
  expect(malformed.statusCode).toBe(400);
  expect(malformed.json()).toEqual({ error: "invalid_payload" });
});

it("keeps the candidate route disabled even for a valid writer", async () => {
  const { app, persist, claimEvents } = createApp(false);
  const response = await app.inject({
    method: "POST",
    url: "/v1/analytics/deliver",
    headers: { authorization: `Bearer ${token}` },
    payload: { events: [event] }
  });
  expect(response.statusCode).toBe(503);
  expect(response.json()).toEqual({ error: "analytics_delivery_unavailable" });
  expect(persist).not.toHaveBeenCalled();
  expect(claimEvents).not.toHaveBeenCalled();
});

it("shares the writer token's ingestion rate claim and keeps a denied batch retryable", async () => {
  const { app, persist, claimEvents, getRateLimitPerMinute } = createApp();
  claimEvents.mockResolvedValueOnce({
    allowed: false,
    limit: 10_000,
    remaining: 0,
    retry_after_ms: 1_250
  });
  const response = await app.inject({
    method: "POST",
    url: "/v1/analytics/deliver",
    headers: { authorization: `Bearer ${token}` },
    payload: { events: [event, { ...event, event_id: "00000000-0000-4000-8000-000000000903" }] }
  });
  expect(response.statusCode).toBe(429);
  expect(response.headers["retry-after"]).toBe("2");
  expect(AnalyticsDeliveryReceiptSchema.parse(response.json())).toMatchObject({
    submitted: 2,
    accepted: 0,
    rejected: 2,
    errors: [
      { index: 0, reason: "rate_limited" },
      { index: 1, reason: "rate_limited" }
    ]
  });
  expect(getRateLimitPerMinute).toHaveBeenCalledWith(projectId);
  expect(claimEvents).toHaveBeenCalledWith({
    token_hash: hashToken(token),
    project_id: projectId,
    event_count: 2,
    limit: 10_000,
    now: expect.any(String)
  });
  expect(persist).not.toHaveBeenCalled();
});

it("claims only valid events and retains original error indexes when the rate limit denies", async () => {
  const { app, persist, claimEvents } = createApp();
  claimEvents.mockResolvedValueOnce({
    allowed: false,
    limit: 10_000,
    remaining: 0,
    retry_after_ms: 900
  });
  const response = await app.inject({
    method: "POST",
    url: "/v1/analytics/deliver",
    headers: { authorization: `Bearer ${token}` },
    payload: { events: [{ invalid: true }, event] }
  });
  expect(response.statusCode).toBe(429);
  expect(AnalyticsDeliveryReceiptSchema.parse(response.json())).toMatchObject({
    submitted: 2,
    accepted: 0,
    rejected: 2,
    errors: [
      { index: 0, reason: "invalid_event" },
      { index: 1, reason: "rate_limited" }
    ]
  });
  expect(claimEvents).toHaveBeenCalledWith(expect.objectContaining({ event_count: 1 }));
  expect(persist).not.toHaveBeenCalled();
});

it("does not start a protected write when rate policy or claim is unavailable", async () => {
  const { app, persist, claimEvents, getRateLimitPerMinute } = createApp();
  getRateLimitPerMinute.mockResolvedValueOnce(null);
  const request = {
    method: "POST" as const,
    url: "/v1/analytics/deliver",
    headers: { authorization: `Bearer ${token}` },
    payload: { events: [event] }
  };
  const missingPolicy = await app.inject(request);
  expect(missingPolicy.statusCode).toBe(503);
  expect(missingPolicy.json()).toEqual({ error: "analytics_delivery_unavailable" });
  expect(claimEvents).not.toHaveBeenCalled();
  claimEvents.mockRejectedValueOnce(new Error("limiter unavailable"));
  const unavailableClaim = await app.inject(request);
  expect(unavailableClaim.statusCode).toBe(503);
  expect(unavailableClaim.json()).toEqual({ error: "analytics_delivery_unavailable" });
  expect(persist).not.toHaveBeenCalled();
});

it("rejects an oversized HTTP body with a bounded canonical error", async () => {
  const { app, persist } = createApp();
  const response = await app.inject({
    method: "POST",
    url: "/v1/analytics/deliver",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    payload: JSON.stringify({ events: [event], padding: "x".repeat(256 * 1024) })
  });
  expect(response.statusCode).toBe(413);
  expect(response.json()).toEqual({ error: "payload_too_large" });
  expect(persist).not.toHaveBeenCalled();
});

it("rejects a deeply nested event without leaking a parser or stack error", async () => {
  const { app, persist } = createApp();
  const nested = `${"[".repeat(10_000)}0${"]".repeat(10_000)}`;
  const response = await app.inject({
    method: "POST",
    url: "/v1/analytics/deliver",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    payload: `{"events":[${nested}]}`
  });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({
    submitted: 1,
    accepted: 0,
    rejected: 1,
    errors: [{ index: 0, reason: "invalid_event" }]
  });
  expect(persist).not.toHaveBeenCalled();
});

it("reports an individual over-limit event at its original index", async () => {
  const { app, persist } = createApp();
  const oversized = { ...event, payload: { ...event.payload, name: "x".repeat(17_000) } };
  const response = await app.inject({
    method: "POST",
    url: "/v1/analytics/deliver",
    headers: { authorization: `Bearer ${token}` },
    payload: { events: [oversized] }
  });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({
    submitted: 1,
    accepted: 0,
    rejected: 1,
    errors: [{ index: 0, reason: "event_too_large" }]
  });
  expect(persist).not.toHaveBeenCalled();
});

it("stops the batch after the HTTP request times out", async () => {
  const { app, persist } = createApp(true, 10);
  persist.mockImplementationOnce(
    () => new Promise((resolve) => setTimeout(() => resolve({ kind: "event_id_conflict" }), 50))
  );
  const response = await app.inject({
    method: "POST",
    url: "/v1/analytics/deliver",
    headers: { authorization: `Bearer ${token}` },
    payload: { events: [event, { ...event, event_id: "00000000-0000-4000-8000-000000000903" }] }
  });
  expect(response.statusCode).toBe(503);
  expect(response.json()).toEqual({ error: "request_timeout" });
  await new Promise((resolve) => setTimeout(resolve, 70));
  expect(persist).toHaveBeenCalledTimes(1);
});
