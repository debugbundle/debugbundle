import { describe, expect, it, vi } from "vitest";

import { createApiServer } from "../../../apps/api/src/server.ts";

function createServer(
  options: Parameters<typeof createApiServer>[1] = {}
): ReturnType<typeof createApiServer> {
  return createApiServer(
    {
      ingestionPersistence: {
        persistAndEnqueue: vi.fn()
      },
      ingestionMetadata: {
        resolveProjectByTokenHash: vi.fn()
      },
      memberAuth: {
        resolveMemberByTokenHash: vi.fn()
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
        getObject: vi.fn()
      },
      webhookDelivery: {
        listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] })
      }
    },
    options
  );
}

describe("api health routes", () => {
  it("should return health payload with status/version/uptime", async (): Promise<void> => {
    const app = createServer();

    const response = await app.inject({
      method: "GET",
      url: "/health"
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ status: string; version: string; uptime: number }>();
    expect(body.status).toBe("ok");
    expect(typeof body.version).toBe("string");
    expect(typeof body.uptime).toBe("number");
    expect(body.uptime).toBeGreaterThanOrEqual(0);
  });

  it("should return readiness probe payload", async (): Promise<void> => {
    const app = createServer();

    const response = await app.inject({
      method: "GET",
      url: "/ready"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ready" });
  });

  it("should return not-ready payload when readiness check fails", async (): Promise<void> => {
    const app = createServer({
      readinessCheck: vi.fn().mockRejectedValueOnce(new Error("redis_unreachable"))
    });

    const response = await app.inject({
      method: "GET",
      url: "/ready"
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      status: "not_ready",
      reason: "redis_unreachable"
    });
  });

  it("should return liveness probe payload", async (): Promise<void> => {
    const app = createServer();

    const response = await app.inject({
      method: "GET",
      url: "/live"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "live" });
  });

  it("should expose security.txt for the public API surface", async (): Promise<void> => {
    const app = createServer();

    const response = await app.inject({
      method: "GET",
      url: "/.well-known/security.txt"
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/plain");
    expect(response.body).toContain(
      "Contact: https://github.com/debugbundle/debugbundle/security/advisories/new"
    );
    expect(response.body).toContain(
      "Policy: https://github.com/debugbundle/debugbundle/security/policy"
    );
    expect(response.body).toContain(
      "Canonical: https://api.debugbundle.com/.well-known/security.txt"
    );
  });

  it("marks API responses as non-indexable", async (): Promise<void> => {
    const app = createServer();

    const response = await app.inject({
      method: "GET",
      url: "/health"
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-robots-tag"]).toBe("noindex, nofollow, noarchive");
  });

  it("marks unknown API routes as non-indexable", async (): Promise<void> => {
    const app = createServer();

    const response = await app.inject({
      method: "GET",
      url: "/missing-route"
    });

    expect(response.statusCode).toBe(404);
    expect(response.headers["x-robots-tag"]).toBe("noindex, nofollow, noarchive");
  });

  it("disallows crawler access through robots.txt on the API host", async (): Promise<void> => {
    const app = createServer();

    const response = await app.inject({
      method: "GET",
      url: "/robots.txt"
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/plain");
    expect(response.headers["x-robots-tag"]).toBe("noindex, nofollow, noarchive");
    expect(response.body).toContain("User-agent: *");
    expect(response.body).toContain("Disallow: /");
  });
});
