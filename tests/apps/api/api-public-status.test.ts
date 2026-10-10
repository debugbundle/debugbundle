import { afterEach, expect, it, vi } from "vitest";
import { createApiServer } from "../../../apps/api/src/server.ts";
import type { ApiDependencies } from "../../../apps/api/src/api-types.ts";
import { PublicStatusError } from "../../../packages/storage/src/public-status-store.js";
import { buildPublicOpenApiSpec } from "../../../apps/api/src/openapi.js";
import { SESSION_COOKIE_NAME } from "../../../packages/auth/src/index.js";
import { mockedObject } from "../../helpers/vitest.ts";
import {
  createTokenManagementDependency,
  createIncidentRetrievalDependency,
  createObjectStoreReaderDependency,
  createWebhookDeliveryDependency
} from "../../helpers/api-ingestion-dependencies.ts";
import {
  statusCheckId,
  statusPageFixture,
  statusProjectId,
  statusPublicId,
  statusSettings
} from "../../helpers/public-status.ts";
const memberAuth = {
  resolveMemberByTokenHash: vi
    .fn()
    .mockResolvedValue({ member_id: "owner", organization_id: "org" })
};
const store = {
  getPublicPage: vi.fn().mockResolvedValue(statusPageFixture()),
  getSettings: vi.fn().mockResolvedValue({ public_id: statusPublicId, settings: statusSettings }),
  saveSettings: vi.fn().mockResolvedValue({ public_id: statusPublicId, settings: statusSettings }),
  listOptions: vi.fn().mockResolvedValue({ projects: [], next_cursor: null }),
  preview: vi.fn().mockResolvedValue(statusPageFixture())
};
function server(
  role: "owner" | "admin" | "member" = "owner",
  extra: Partial<ApiDependencies> = {}
) {
  return createApiServer({
    ingestionPersistence: { persistAndEnqueue: vi.fn() },
    ingestionMetadata: { resolveProjectByTokenHash: vi.fn() },
    memberAuth,
    tokenManagement: createTokenManagementDependency(),
    incidentRetrieval: createIncidentRetrievalDependency(),
    objectStoreReader: createObjectStoreReaderDependency(),
    webhookDelivery: createWebhookDeliveryDependency(),
    projectManagement: mockedObject<ApiDependencies["projectManagement"]>({
      resolveProjectAccessForUser: vi.fn().mockResolvedValue({
        project_id: statusProjectId,
        organization_id: "org",
        owner_user_id: "owner",
        effective_role: role,
        organization_plan: "team"
      })
    }),
    publicStatusPages: store,
    authRateLimiter: {
      claimRequest: vi
        .fn()
        .mockResolvedValue({ allowed: true, limit: 120, remaining: 119, retry_after_ms: 0 })
    },
    publicStatusBaseUrl: "https://status.debugbundle.com",
    ...extra
  });
}
afterEach(() => {
  vi.clearAllMocks();
});
it("reads an anonymous, bounded projection without member auth or writes", async () => {
  const app = server();
  try {
    const response = await app.inject({ url: `/v1/public/status/${statusPublicId}` });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(statusPageFixture());
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(memberAuth.resolveMemberByTokenHash).not.toHaveBeenCalled();
    expect(store.saveSettings).not.toHaveBeenCalled();
  } finally {
    await app.close();
  }
});
it.each(["admin", "member"] as const)(
  "rejects %s publication and hides other-project configuration",
  async (role) => {
    const app = server(role);
    try {
      for (const suffix of ["", "/options", "/preview"]) {
        const response = await app.inject({
          method: suffix ? "GET" : "PUT",
          url: `/v1/projects/${statusProjectId}/status-page${suffix}`,
          headers: { authorization: "Bearer dbundle_mem_test" },
          ...(suffix ? {} : { payload: statusSettings })
        });
        expect(response.statusCode).toBe(403);
      }
      const response = await app.inject({
        url: `/v1/projects/${statusProjectId}/status-page`,
        headers: { authorization: "Bearer dbundle_mem_test" }
      });
      expect(response.json().access_mode).toBe("preview");
      expect(response.json().settings.projects).toEqual([
        { project_id: statusProjectId, check_ids: [] }
      ]);
      expect(response.json().public_url).toBe(`https://status.debugbundle.com/${statusPublicId}`);
    } finally {
      await app.close();
    }
  }
);
it("validates before owner mutation and shares a stable public URL", async () => {
  const app = server();
  try {
    const auth = { authorization: "Bearer dbundle_mem_test" };
    const invalid = await app.inject({
      method: "PUT",
      url: `/v1/projects/${statusProjectId}/status-page`,
      headers: auth,
      payload: {
        ...statusSettings,
        projects: [{ project_id: statusProjectId, check_ids: [statusCheckId, statusCheckId] }]
      }
    });
    expect(invalid.statusCode).toBe(400);
    expect(store.saveSettings).not.toHaveBeenCalled();
    const response = await app.inject({
      method: "PUT",
      url: `/v1/projects/${statusProjectId}/status-page`,
      headers: auth,
      payload: statusSettings
    });
    expect(response.statusCode).toBe(200);
    expect(store.saveSettings).toHaveBeenCalledWith(
      { project_id: statusProjectId, organization_id: "org", owner_user_id: "owner" },
      statusSettings
    );
  } finally {
    await app.close();
  }
});
it("fails closed on invalid public output and unavailable pages without diagnostic leakage", async () => {
  const app = server();
  try {
    store.getPublicPage.mockResolvedValueOnce({ ...statusPageFixture(), secret: "private-value" });
    const invalid = await app.inject({ url: `/v1/public/status/${statusPublicId}` });
    expect(invalid.statusCode).toBe(503);
    expect(invalid.body).not.toContain("private-value");
    store.getPublicPage.mockResolvedValueOnce(null);
    const missing = await app.inject({ url: `/v1/public/status/${statusPublicId}` });
    expect(missing.statusCode).toBe(404);
    const malformed = await app.inject({ url: "/v1/public/status/not-an-id" });
    expect(malformed.statusCode).toBe(404);
  } finally {
    await app.close();
  }
});
it("rate limits public reads before loading records", async () => {
  const app = server("owner", {
    authRateLimiter: {
      claimRequest: vi
        .fn()
        .mockResolvedValue({ allowed: false, limit: 120, remaining: 0, retry_after_ms: 1200 })
    }
  });
  try {
    const response = await app.inject({ url: `/v1/public/status/${statusPublicId}` });
    expect(response.statusCode).toBe(429);
    expect(response.headers["retry-after"]).toBe("2");
    expect(store.getPublicPage).not.toHaveBeenCalled();
  } finally {
    await app.close();
  }
});
it("fails closed when the public limiter is unavailable", async () => {
  const app = server("owner", { authRateLimiter: undefined });
  try {
    const response = await app.inject({ url: `/v1/public/status/${statusPublicId}` });
    expect(response.statusCode).toBe(503);
    expect(store.getPublicPage).not.toHaveBeenCalled();
  } finally {
    await app.close();
  }
});
it("uses trusted proxy IPs only when explicitly enabled and ignores forged earlier hops", async () => {
  for (const [enabled, expected] of [
    [false, "127.0.0.1"],
    [true, "203.0.113.10"]
  ] as const) {
    const claimRequest = vi
      .fn()
      .mockResolvedValue({ allowed: true, limit: 120, remaining: 119, retry_after_ms: 0 });
    const app = server("owner", {
      publicStatusTrustProxy: enabled,
      authRateLimiter: { claimRequest }
    });
    try {
      await app.inject({
        url: `/v1/public/status/${statusPublicId}`,
        headers: { "x-forwarded-for": "198.51.100.25, 203.0.113.10" }
      });
      expect(claimRequest).toHaveBeenCalledWith(
        expect.objectContaining({ ip: expected, bucket: "public-status-read" })
      );
      await app.inject({
        url: `/v1/public/status/${statusPublicId}`,
        headers: { "x-forwarded-for": "invalid-ip" }
      });
      expect(claimRequest).toHaveBeenLastCalledWith(expect.objectContaining({ ip: "127.0.0.1" }));
    } finally {
      await app.close();
    }
  }
});
it("grants the status origin only uncredentialed public GET CORS", async () => {
  const app = server();
  try {
    const origin = "https://status.debugbundle.com";
    const page = await app.inject({
      url: `/v1/public/status/${statusPublicId}`,
      headers: { origin }
    });
    expect(page.headers["access-control-allow-origin"]).toBe(origin);
    expect(page.headers["access-control-allow-credentials"]).toBeUndefined();
    const privateRoute = await app.inject({
      method: "OPTIONS",
      url: `/v1/projects/${statusProjectId}/status-page`,
      headers: { origin, "access-control-request-method": "PUT" }
    });
    expect(privateRoute.statusCode).toBe(403);
    expect(privateRoute.headers["access-control-allow-origin"]).toBeUndefined();
  } finally {
    await app.close();
  }
});
it("rejects unauthenticated, SDK-token and missing-CSRF publication without writes", async () => {
  const app = server();
  try {
    for (const headers of [
      {},
      { authorization: "Bearer dbundle_proj_sdk" },
      { cookie: `${SESSION_COOKIE_NAME}=session-secret` }
    ]) {
      const response = await app.inject({
        method: "PUT",
        url: `/v1/projects/${statusProjectId}/status-page`,
        headers,
        payload: statusSettings
      });
      expect([401, 403]).toContain(response.statusCode);
    }
    expect(store.saveSettings).not.toHaveBeenCalled();
  } finally {
    await app.close();
  }
});
it("audits denied/failed publication without exposing selections or provider errors", async () => {
  const createAuditLog = vi.fn();
  const app = server("owner", { auditLogging: { createAuditLog } });
  try {
    store.saveSettings.mockRejectedValueOnce(new PublicStatusError("invalid_selection"));
    const response = await app.inject({
      method: "PUT",
      url: `/v1/projects/${statusProjectId}/status-page`,
      headers: { authorization: "Bearer dbundle_mem_test" },
      payload: statusSettings
    });
    expect(response.statusCode).toBe(400);
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failure", metadata: { reason: "invalid_selection" } })
    );
    expect(JSON.stringify(createAuditLog.mock.calls)).not.toContain(statusCheckId);
    store.getPublicPage.mockRejectedValueOnce(new Error("private-database-password"));
    const page = await app.inject({ url: `/v1/public/status/${statusPublicId}` });
    expect(page.statusCode).toBe(503);
    expect(page.body).not.toContain("password");
  } finally {
    await app.close();
  }
});
it("documents anonymous and authenticated routes with strict minimized schemas", () => {
  const doc = buildPublicOpenApiSpec() as {
    paths: Record<string, Record<string, { security?: unknown }>>;
    components: { schemas: Record<string, { additionalProperties?: boolean }> };
  };
  expect(doc.paths["/v1/public/status/{publicId}"]?.["get"]?.security).toEqual([]);
  for (const path of [
    "/v1/projects/{id}/status-page",
    "/v1/projects/{id}/status-page/options",
    "/v1/projects/{id}/status-page/preview"
  ])
    expect(doc.paths[path]?.["get"]?.security).toBeTruthy();
  expect(doc.paths["/v1/projects/{id}/status-page"]?.["put"]?.security).toBeTruthy();
  expect(doc.components.schemas["PublicStatusPage"]?.additionalProperties).toBe(false);
});
