import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiServer } from "../../../apps/api/src/server.js";
import { createDefaultAnalyticsDependencies } from "../../../apps/api/src/default-analytics-dependencies.js";
import { hashToken } from "../../../packages/auth/src/index.js";
import { SemanticAnalyticsEventSchema } from "../../../packages/shared-types/src/index.js";
import type {
  ObjectStoreClient,
  Queryable,
  QueueClient
} from "../../../packages/storage/src/index.js";
import {
  createAnalyticsEvent,
  createDebugEvent,
  createSettings
} from "../../helpers/api-analytics-ingestion-fixtures.js";
import { createBaseDependencies } from "../../helpers/api-capture-rule-ingestion.js";
import { mockedObject } from "../../helpers/vitest.js";

type Dependencies = Parameters<typeof createApiServer>[0];
const PROJECT_ID = "00000000-0000-4000-8000-000000000123";
const PROJECT_BEARER = "dbundle_proj_test";
const apps: ReturnType<typeof createApiServer>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function createSemanticClientEvent() {
  const server = JSON.parse(
    readFileSync(new URL("../../fixtures/analytics-semantic-event.json", import.meta.url), "utf8")
  ) as Record<string, unknown>;
  return SemanticAnalyticsEventSchema.parse({
    ...server,
    event_id: "00000000-0000-4000-8000-000000000911",
    sdk_name: "@debugbundle/sdk-browser",
    service: { name: "web", runtime: "browser", framework: null, environment: "test" },
    producer: { kind: "browser", stream_id: null, sequence: null },
    operation_id: null,
    correlation: {
      ...(server["correlation"] as object),
      session_id: "00000000-0000-4000-8000-000000000912"
    },
    payload: {
      ...(server["payload"] as object),
      purpose: "product_analytics",
      privacy: { mode: "strict", consent_granted: true },
      financial: null,
      money: null
    }
  });
}

function createApp(input: {
  delivery: NonNullable<Dependencies["semanticAnalyticsClientDelivery"]>;
  persistAndEnqueue?: Dependencies["ingestionPersistence"]["persistAndEnqueue"];
  persistAnalyticsAndEnqueue?: NonNullable<
    Dependencies["ingestionPersistence"]["persistAnalyticsAndEnqueue"]
  >;
  claimEvents?: NonNullable<Dependencies["ingestionRateLimiter"]>["claimEvents"];
  allowedOrigins?: string[];
  billingManagement?: Dependencies["billingManagement"];
  analyticsUsage?: Dependencies["analyticsUsage"];
}) {
  const base = createBaseDependencies({
    resolveProjectByTokenHash: vi.fn().mockResolvedValue({
      project_id: PROJECT_ID,
      organization_id: "org_123",
      organization_plan: "team",
      allowed_origins: input.allowedOrigins ?? []
    })
  });
  const app = createApiServer({
    ...base,
    ingestionPersistence: {
      persistAndEnqueue: input.persistAndEnqueue ?? base.ingestionPersistence.persistAndEnqueue,
      ...(input.persistAnalyticsAndEnqueue === undefined
        ? {}
        : { persistAnalyticsAndEnqueue: input.persistAnalyticsAndEnqueue })
    },
    analyticsSettingsManagement: {
      getAnalyticsSettingsForProject: vi.fn().mockResolvedValue(createSettings()),
      updateAnalyticsSettingsForProject: vi.fn()
    },
    semanticAnalyticsClientDelivery: input.delivery,
    ...(input.claimEvents === undefined
      ? {}
      : { ingestionRateLimiter: { claimEvents: input.claimEvents } }),
    ...(input.billingManagement === undefined
      ? {}
      : { billingManagement: input.billingManagement }),
    ...(input.analyticsUsage === undefined ? {} : { analyticsUsage: input.analyticsUsage })
  });
  apps.push(app);
  return app;
}

describe("opted-in semantic client ingestion", () => {
  it("keeps both composed semantic delivery dependencies disabled", () => {
    const dependencies = createDefaultAnalyticsDependencies({
      db: { query: vi.fn() } as unknown as Queryable,
      queue: { enqueue: vi.fn() } as unknown as QueueClient,
      objectStore: mockedObject<Pick<ObjectStoreClient, "putObject">>({ putObject: vi.fn() })
    });
    expect(dependencies.semanticAnalyticsDelivery.enabled).toBe(false);
    expect(dependencies.semanticAnalyticsClientDelivery.enabled).toBe(false);
  });

  it("keeps the composed V2 client lane closed even when the event is valid", async () => {
    const persist = vi.fn();
    const app = createApp({ delivery: { enabled: false, persist } });
    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: { authorization: `Bearer ${PROJECT_BEARER}` },
      payload: { events: [createSemanticClientEvent()] }
    });
    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({
      accepted: 0,
      rejected: 1,
      errors: [{ index: 0, reason: "analytics_invalid_event" }]
    });
    expect(persist).not.toHaveBeenCalled();
  });

  it("preserves mixed V1 and V2 indexes through current project-token handoff", async () => {
    const persistAndEnqueue = vi.fn().mockResolvedValue({ object_key: "raw-events/p/k.json.gz" });
    const persistAnalyticsAndEnqueue = vi
      .fn()
      .mockResolvedValue({ object_key: "analytics-events/p/k.json.gz" });
    const client = createSemanticClientEvent();
    const persist = vi.fn().mockResolvedValue({
      kind: "accepted",
      duplicate: false,
      receipt: {
        event_id: client.event_id,
        operation_id: null,
        content_hash: `sha256:${"b".repeat(64)}`,
        accepted_at: "2026-09-29T00:00:00.000Z",
        expires_at: "2026-12-28T00:00:00.000Z"
      }
    });
    const claimEvents = vi.fn().mockResolvedValue({ allowed: true });
    const app = createApp({
      persistAndEnqueue,
      persistAnalyticsAndEnqueue,
      claimEvents,
      delivery: { enabled: true, persist }
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: { authorization: `Bearer ${PROJECT_BEARER}` },
      payload: {
        events: [
          createDebugEvent(),
          client,
          createAnalyticsEvent({ eventId: "10000000-0000-4000-8000-000000000008" }),
          {
            ...client,
            event_id: "00000000-0000-4000-8000-000000000913",
            producer: { kind: "server", stream_id: null, sequence: null }
          }
        ]
      }
    });
    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({
      accepted: 3,
      rejected: 1,
      errors: [{ index: 3, reason: "analytics_invalid_event" }]
    });
    expect(persistAndEnqueue).toHaveBeenCalledOnce();
    expect(persistAnalyticsAndEnqueue).toHaveBeenCalledOnce();
    expect(claimEvents).toHaveBeenCalledWith(expect.objectContaining({ event_count: 3 }));
    expect(persist).toHaveBeenCalledExactlyOnceWith({
      projectId: PROJECT_ID,
      credentialHash: hashToken(PROJECT_BEARER),
      event: client
    });
  });

  it("does not lose a pending V2 event when V1 analytics exhausts its quota", async () => {
    const persist = vi.fn().mockResolvedValue({ kind: "event_id_conflict" });
    const app = createApp({
      persistAnalyticsAndEnqueue: vi.fn(),
      billingManagement: mockedObject<NonNullable<Dependencies["billingManagement"]>>({
        getBillingSummaryForOrganization: vi.fn().mockResolvedValue({
          capacity_units: { total: 15 },
          usage_window: {
            starts_at: "2026-09-01T00:00:00.000Z",
            ends_at: "2026-10-01T00:00:00.000Z"
          }
        })
      }),
      analyticsUsage: {
        getAnalyticsUsageForOrganization: vi.fn(),
        claimAnalyticsUsageForOrganization: vi.fn().mockResolvedValue({
          allowed: false,
          metric: "monthly_analytics_events",
          used: 3_750_000,
          limit: 3_750_000
        }),
        releaseAnalyticsUsageForOrganization: vi.fn()
      },
      delivery: { enabled: true, persist }
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: { authorization: `Bearer ${PROJECT_BEARER}` },
      payload: {
        events: [
          createAnalyticsEvent({ eventId: "10000000-0000-4000-8000-000000000008" }),
          createSemanticClientEvent()
        ]
      }
    });
    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({
      accepted: 0,
      rejected: 2,
      errors: [
        { index: 0, reason: "analytics_quota_exceeded" },
        { index: 1, reason: "event_id_conflict" }
      ]
    });
    expect(persist).toHaveBeenCalledOnce();
  });

  it("rejects a server producer on the project-token client lane", async () => {
    const persist = vi.fn();
    const app = createApp({ delivery: { enabled: true, persist } });
    const server = SemanticAnalyticsEventSchema.parse(
      JSON.parse(
        readFileSync(
          new URL("../../fixtures/analytics-semantic-event.json", import.meta.url),
          "utf8"
        )
      )
    );
    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: { authorization: `Bearer ${PROJECT_BEARER}` },
      payload: { events: [server] }
    });
    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({
      accepted: 0,
      rejected: 1,
      errors: [{ index: 0, reason: "source_not_authorized" }]
    });
    expect(persist).not.toHaveBeenCalled();
  });

  it("applies project Origin restrictions before a V2 handoff", async () => {
    const persist = vi.fn();
    const app = createApp({
      delivery: { enabled: true, persist },
      allowedOrigins: ["https://app.example"]
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: {
        authorization: `Bearer ${PROJECT_BEARER}`,
        origin: "https://other.example"
      },
      payload: { events: [createSemanticClientEvent()] }
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      errors: [{ index: -1, reason: "origin_not_allowed" }]
    });
    expect(persist).not.toHaveBeenCalled();
  });

  it("shares the project-token rate limit with V1 debug events", async () => {
    const persist = vi.fn();
    const persistAndEnqueue = vi.fn();
    const claimEvents = vi.fn().mockResolvedValue({ allowed: false, retry_after_ms: 1000 });
    const app = createApp({
      delivery: { enabled: true, persist },
      persistAndEnqueue,
      claimEvents
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: { authorization: `Bearer ${PROJECT_BEARER}` },
      payload: { events: [createDebugEvent(), createSemanticClientEvent()] }
    });
    expect(response.statusCode).toBe(429);
    expect(response.json()).toMatchObject({
      accepted: 0,
      rejected: 2,
      errors: [
        { index: 0, reason: "rate_limited" },
        { index: 1, reason: "rate_limited" }
      ]
    });
    expect(claimEvents).toHaveBeenCalledWith(expect.objectContaining({ event_count: 2 }));
    expect(persist).not.toHaveBeenCalled();
    expect(persistAndEnqueue).not.toHaveBeenCalled();
  });

  it("does not turn a transient handoff failure into an accepted ACK", async () => {
    const persist = vi.fn().mockRejectedValue(new Error("s3 unavailable"));
    const app = createApp({ delivery: { enabled: true, persist } });
    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: { authorization: `Bearer ${PROJECT_BEARER}` },
      payload: { events: [createSemanticClientEvent()] }
    });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: "analytics_delivery_unavailable" });
  });
});
