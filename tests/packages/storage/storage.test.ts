import { describe, expect, it, vi } from "vitest";

import {
  buildAnalyticsRawEventObjectKey,
  buildBundleObjectKey,
  buildRawEventObjectKey,
  buildReproductionObjectKey,
  createMemberAuthService,
  createIngestionPersistenceService
} from "../../../packages/storage/src/index.js";
import { createEventEnvelope } from "../../../packages/shared-types/src/index.js";

describe("storage wiring", () => {
  it("should build raw event object key matching contract path", (): void => {
    const key = buildRawEventObjectKey({
      projectId: "proj_123",
      eventId: "550e8400-e29b-41d4-a716-446655440000",
      occurredAt: new Date("2026-03-10T13:45:27.000Z")
    });

    expect(key).toBe("raw-events/proj_123/2026/03/10/13/550e8400-e29b-41d4-a716-446655440000.json.gz");
  });

  it("should build raw analytics event object key matching contract path", (): void => {
    const key = buildAnalyticsRawEventObjectKey({
      projectId: "proj_123",
      eventId: "550e8400-e29b-41d4-a716-446655440000",
      occurredAt: new Date("2026-03-10T13:45:27.000Z")
    });

    expect(key).toBe("analytics-events/proj_123/2026/03/10/13/550e8400-e29b-41d4-a716-446655440000.json.gz");
  });

  it("should build bundle and reproduction keys", (): void => {
    expect(buildBundleObjectKey("proj_123", "inc_42")).toBe("bundles/proj_123/inc_42/bundle.json.gz");
    expect(buildReproductionObjectKey("proj_123", "inc_42")).toBe(
      "reproductions/proj_123/inc_42/reproduction.json.gz"
    );
  });

  it("should persist raw event and enqueue processing job", async (): Promise<void> => {
    const putObject = vi.fn().mockResolvedValue(undefined);
    const enqueue = vi.fn().mockResolvedValue(undefined);

    const service = createIngestionPersistenceService({
      objectStore: { putObject },
      queue: { enqueue }
    });

    const event = createEventEnvelope({
      event_type: "log_event",
      service: {
        name: "checkout-api",
        environment: "production",
        runtime: "node",
        framework: "fastify"
      },
      payload: {
        level: "error",
        message: "boom",
        attributes: {}
      }
    });

    await service.persistAndEnqueue(event, "proj_123");

    expect(putObject).toHaveBeenCalledOnce();
    const enqueued = enqueue.mock.calls[0]?.[1] as { object_key: string };
    expect(enqueue).toHaveBeenCalledWith("normalize-events", {
      project_id: "proj_123",
      event_id: event.event_id,
      object_key: enqueued.object_key
    });
    expect(enqueued.object_key).toContain(`raw-events/proj_123/`);
  });

  it("should persist raw analytics events and enqueue analytics aggregation jobs", async (): Promise<void> => {
    const putObject = vi.fn().mockResolvedValue(undefined);
    const enqueue = vi.fn().mockResolvedValue(undefined);

    const service = createIngestionPersistenceService({
      objectStore: { putObject },
      queue: { enqueue }
    });
    const event = {
      schema_version: "2026-07-analytics-01",
      event_id: "550e8400-e29b-41d4-a716-446655440000",
      event_type: "analytics_event",
      occurred_at: "2026-03-10T13:45:27.000Z",
      sdk_name: "@debugbundle/sdk-browser",
      sdk_version: "1.0.0",
      service: {
        name: "web",
        runtime: "browser",
        framework: "react",
        environment: "production"
      },
      correlation: {
        session_id: "sess_123",
        visitor_id_hash: null,
        user_id_hash: null,
        trace_id: null,
        deploy_id: null
      },
      payload: {
        kind: "page_view",
        privacy: { mode: "strict", consent_granted: false },
        route: {
          path: "/pricing",
          normalized_path: "/pricing",
          title: "Pricing"
        },
        dimensions: {
          auth_state: "anonymous",
          device_type: "desktop",
          browser_family: "Chrome",
          browser_major: 125,
          os_family: "macOS",
          os_major: 14,
          language: "en",
          locale: "en-US",
          viewport_bucket: "large",
          referrer_domain: null,
          utm_source: null,
          utm_medium: null,
          utm_campaign: null,
          country_code: null,
          region_code: null
        },
        custom_dimensions: {}
      }
    } as const;

    await service.persistAnalyticsAndEnqueue(event, "proj_123");

    expect(putObject).toHaveBeenCalledOnce();
    const enqueued = enqueue.mock.calls[0]?.[1] as { object_key: string };
    expect(enqueue).toHaveBeenCalledWith("aggregate-analytics-events", {
      project_id: "proj_123",
      event_id: event.event_id,
      object_key: enqueued.object_key
    });
    expect(enqueued.object_key).toContain("analytics-events/proj_123/");
  });

  it("should resolve member token through hashed lookup", async (): Promise<void> => {
    const resolveMemberByTokenHash = vi.fn().mockResolvedValue({
      member_id: "mem_123",
      organization_id: "org_123"
    });

    const service = createMemberAuthService({
      resolveMemberByTokenHash
    });

    const resolved = await service.resolveMemberFromToken("dbundle_mem_secret");

    expect(resolved).toEqual({ member_id: "mem_123", organization_id: "org_123" });
    expect(resolveMemberByTokenHash).toHaveBeenCalledOnce();
    const tokenHashArg = resolveMemberByTokenHash.mock.calls[0]?.[0] as string;
    expect(tokenHashArg).toHaveLength(64);
  });
});
