import { afterEach, describe, expect, it, vi } from "vitest";

import type { ApiDependencies } from "../../../apps/api/src/server.ts";
import { createApiServer } from "../../../apps/api/src/server.ts";
import {
  isObjectNotFoundError,
  parseImprovementsCursor,
  parseIncidentsCursor,
  parseLogsCursor,
  redactEvent,
  requireMemberAuth,
  serializeCursorTimestamp
} from "../../../apps/api/src/api-helpers.ts";
import { createEventEnvelope } from "../../../packages/shared-types/src/index.js";

function createDependencies(): ApiDependencies {
  return {
    ingestionPersistence: {
      persistAndEnqueue: vi.fn()
    },
    ingestionMetadata: {
      resolveProjectByTokenHash: vi.fn()
    },
    memberAuth: {
      resolveMemberByTokenHash: vi
        .fn()
        .mockResolvedValue({ member_id: "mem_123", organization_id: "org_123" })
    },
    tokenManagement: {
      listProjectTokensForOrganization: vi.fn().mockResolvedValue([]),
      createProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      listMemberTokensForOrganization: vi.fn().mockResolvedValue([]),
      createMemberTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeMemberTokenForOrganization: vi.fn().mockResolvedValue(null)
    },
    incidentRetrieval: {
      listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
      getIncidentForOrganization: vi.fn().mockResolvedValue(null),
      listServicesForOrganization: vi.fn().mockResolvedValue([]),
      listIncidentLogsForOrganization: vi.fn().mockResolvedValue([])
    },
    objectStoreReader: {
      getObject: vi.fn().mockRejectedValue(new Error("s3_object_not_found"))
    },
    webhookDelivery: {
      listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] })
    }
  };
}

describe("api helpers", () => {
  it("should parse valid logs cursor and reject malformed values", (): void => {
    expect(parseLogsCursor(undefined)).toBeNull();
    expect(parseLogsCursor("bad-cursor")).toBeNull();
    expect(parseLogsCursor("|evt")).toBeNull();
    expect(parseLogsCursor("2026-03-11T00:10:00.000Z|")).toBeNull();

    const parsed = parseLogsCursor("2026-03-11T00:10:00.000Z|550e8400-e29b-41d4-a716-446655440001");
    expect(parsed).toEqual({
      occurred_at: "2026-03-11T00:10:00.000Z",
      event_id: "550e8400-e29b-41d4-a716-446655440001"
    });

    const parsedPostgresTimestamp = parseLogsCursor(
      "2026-03-11 00:10:00.000+00|550e8400-e29b-41d4-a716-446655440001"
    );
    expect(parsedPostgresTimestamp).toEqual({
      occurred_at: "2026-03-11T00:10:00.000Z",
      event_id: "550e8400-e29b-41d4-a716-446655440001"
    });
  });

  it("should parse incident and improvement cursors from ISO and Postgres timestamp formats", (): void => {
    const incidentCursorId = "550e8400-e29b-41d4-a716-446655440122";

    expect(parseIncidentsCursor(`2026-03-11T00:09:00.000Z|${incidentCursorId}`)).toEqual({
      last_seen_at: "2026-03-11T00:09:00.000Z",
      incident_id: incidentCursorId
    });
    expect(parseIncidentsCursor(`2026-03-11 00:09:00.000+00|${incidentCursorId}`)).toEqual({
      last_seen_at: "2026-03-11T00:09:00.000Z",
      incident_id: incidentCursorId
    });

    expect(parseImprovementsCursor("2026-05-18T12:45:00.000Z|imp_cursor")).toEqual({
      last_detected_at: "2026-05-18T12:45:00.000Z",
      improvement_id: "imp_cursor"
    });
    expect(parseImprovementsCursor("2026-05-18 12:45:00.000+00|imp_cursor")).toEqual({
      last_detected_at: "2026-05-18T12:45:00.000Z",
      improvement_id: "imp_cursor"
    });
  });

  it("should serialize cursor timestamps to ISO", (): void => {
    expect(serializeCursorTimestamp("2026-03-11T00:10:00.000Z")).toBe("2026-03-11T00:10:00.000Z");
    expect(serializeCursorTimestamp("2026-03-11 00:10:00.000+00")).toBe("2026-03-11T00:10:00.000Z");
  });

  it("should classify not-found object errors", (): void => {
    expect(isObjectNotFoundError(new Error("s3_object_not_found"))).toBe(true);
    expect(isObjectNotFoundError(new Error("boom"))).toBe(false);
    expect(isObjectNotFoundError("s3_object_not_found")).toBe(false);
  });

  it("should resolve member auth context through bearer token", async (): Promise<void> => {
    const dependencies = createDependencies();

    const missing = await requireMemberAuth({}, dependencies);
    expect(missing).toBeNull();

    const resolved = await requireMemberAuth(
      { authorization: "Bearer dbundle_mem_test" },
      dependencies
    );
    expect(resolved).toEqual({ member_id: "mem_123", organization_id: "org_123" });
  });

  it("should redact sensitive payload values while preserving valid event shape", (): void => {
    const event = createEventEnvelope({
      event_type: "request_event",
      service: {
        name: "checkout-api",
        environment: "production",
        runtime: "node",
        framework: "fastify"
      },
      payload: {
        method: "POST",
        path: "/checkout",
        route_template: "/checkout",
        query: {},
        headers: {
          authorization: "Bearer secret"
        },
        body: {
          password: "super-secret"
        },
        response_status: 500,
        duration_ms: 42
      }
    });

    const redacted = redactEvent(event);

    expect(redacted.event_type).toBe("request_event");
    if (redacted.event_type !== "request_event") {
      throw new Error("expected_request_event_after_redaction");
    }

    expect(redacted.payload.headers["authorization"]).toContain("[REDACTED]");
    expect(JSON.stringify(redacted.payload.body)).toContain("[REDACTED]");
  });
});

describe("api server version context", () => {
  const originalVersion = process.env["npm_package_version"];

  afterEach(() => {
    if (originalVersion === undefined) {
      delete process.env["npm_package_version"];
      return;
    }

    process.env["npm_package_version"] = originalVersion;
  });

  it("should use package version from environment when present", async (): Promise<void> => {
    process.env["npm_package_version"] = "9.9.9";
    const app = createApiServer(createDependencies());

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ version: string }>();
    expect(body.version).toBe("9.9.9");
  });

  it("should fallback to default version when env is missing", async (): Promise<void> => {
    delete process.env["npm_package_version"];
    const app = createApiServer(createDependencies());

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ version: string }>();
    expect(body.version).toBe("0.1.0");
  });

  it("should allow credentialed browser requests from the configured app origin", async (): Promise<void> => {
    const app = createApiServer(createDependencies(), {
      dogfoodingEnv: {
        APP_BASE_URL: "https://app.debugbundle.com/dashboard"
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/health",
      headers: {
        origin: "https://app.debugbundle.com"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe("https://app.debugbundle.com");
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    expect(response.headers["access-control-expose-headers"]).toBe(
      "X-DebugBundle-Generation-Id"
    );
    expect(response.headers["vary"]).toContain("Origin");
  });

  it("should answer CORS preflight requests for the configured app origin", async (): Promise<void> => {
    const app = createApiServer(createDependencies(), {
      dogfoodingEnv: {
        APP_BASE_URL: "https://app.debugbundle.com"
      }
    });

    const response = await app.inject({
      method: "OPTIONS",
      url: "/v1/auth/session",
      headers: {
        origin: "https://app.debugbundle.com",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type,x-csrf-token,x-debugbundle-trace-id"
      }
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("https://app.debugbundle.com");
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    expect(response.headers["access-control-allow-methods"]).toContain("POST");
    expect(response.headers["access-control-allow-headers"]).toContain("X-CSRF-Token");
    expect(response.headers["access-control-allow-headers"]).toContain("X-DebugBundle-Analytics-Config");
    expect(response.headers["access-control-allow-headers"]).toContain("X-Debugbundle-Trace-Id");
    expect(response.headers["vary"]).toContain("Origin");
    expect(response.headers["vary"]).toContain("Access-Control-Request-Method");
    expect(response.headers["vary"]).toContain("Access-Control-Request-Headers");
  });

  it("should allow credentialed browser requests from the configured public-site origin", async (): Promise<void> => {
    const app = createApiServer(createDependencies(), {
      dogfoodingEnv: {
        APP_BASE_URL: "https://app.debugbundle.com",
        PUBLIC_SITE_URL: "https://debugbundle.com/docs"
      }
    });

    const response = await app.inject({
      method: "OPTIONS",
      url: "/v1/events",
      headers: {
        origin: "https://debugbundle.com",
        "access-control-request-method": "POST",
        "access-control-request-headers": "authorization,content-type"
      }
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("https://debugbundle.com");
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    expect(response.headers["vary"]).toContain("Origin");
  });

  it("should answer SDK project-token route preflights from static-site origins without credentialed CORS", async (): Promise<void> => {
    const app = createApiServer(createDependencies(), {
      dogfoodingEnv: {
        APP_BASE_URL: "https://app.debugbundle.com"
      }
    });

    const response = await app.inject({
      method: "OPTIONS",
      url: "/v1/events",
      headers: {
        origin: "https://static.example.com",
        "access-control-request-method": "POST",
        "access-control-request-headers": "authorization,content-type"
      }
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("https://static.example.com");
    expect(response.headers["access-control-allow-credentials"]).toBeUndefined();
    expect(response.headers["access-control-allow-methods"]).toContain("POST");
    expect(response.headers["access-control-allow-headers"]).toContain("Authorization");
    expect(response.headers["vary"]).toContain("Origin");
  });

  it("should reject preflight requests from unapproved origins", async (): Promise<void> => {
    const app = createApiServer(createDependencies(), {
      dogfoodingEnv: {
        APP_BASE_URL: "https://app.debugbundle.com"
      }
    });

    const response = await app.inject({
      method: "OPTIONS",
      url: "/v1/auth/session",
      headers: {
        origin: "https://evil.example.com",
        "access-control-request-method": "POST"
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: "cors_origin_not_allowed"
    });
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    expect(response.headers["vary"]).toContain("Origin");
  });
});
