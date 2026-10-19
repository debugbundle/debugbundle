import { afterEach, expect, it, vi } from "vitest";
import { createApiServer } from "../../../apps/api/src/server.js";
import { buildPublicOpenApiSpec } from "../../../apps/api/src/openapi.js";
import type { ApiDependencies } from "../../../apps/api/src/api-types.js";
import { SESSION_COOKIE_NAME } from "../../../packages/auth/src/index.js";
import {
  createTokenManagementDependency,
  createIncidentRetrievalDependency,
  createObjectStoreReaderDependency,
  createWebhookDeliveryDependency
} from "../../helpers/api-ingestion-dependencies.js";
import { mockedObject } from "../../helpers/vitest.js";
const projectId = "10000000-0000-4000-8000-000000000001";
const get = vi.fn().mockResolvedValue({ settings: {} }),
  update = vi.fn().mockResolvedValue({ settings: {} });
function server(
  role: "owner" | "admin" | "member" = "owner",
  extra: Partial<ApiDependencies> = {},
  omitPreferences = false
) {
  return createApiServer({
    ingestionPersistence: { persistAndEnqueue: vi.fn() },
    ingestionMetadata: { resolveProjectByTokenHash: vi.fn() },
    memberAuth: {
      resolveMemberByTokenHash: vi.fn().mockResolvedValue({
        member_id: "user",
        organization_id: "home",
        role: role === "owner" ? "owner" : "member"
      })
    },
    tokenManagement: createTokenManagementDependency(),
    incidentRetrieval: createIncidentRetrievalDependency(),
    objectStoreReader: createObjectStoreReaderDependency(),
    webhookDelivery: createWebhookDeliveryDependency(),
    projectManagement: mockedObject<ApiDependencies["projectManagement"]>({
      resolveProjectAccessForUser: vi.fn().mockResolvedValue({
        project_id: projectId,
        organization_id: "project-org",
        effective_role: role
      })
    }),
    ...(omitPreferences ? {} : { notificationPreferences: { get, update } }),
    ...extra
  });
}
const headers = { authorization: "Bearer dbundle_mem_test" };
afterEach(() => vi.clearAllMocks());
it("scopes personal preferences to the authenticated user and shared project settings to the project account", async () => {
  const app = server("admin");
  try {
    expect(
      (await app.inject({ url: "/v1/account/notification-preferences", headers })).statusCode
    ).toBe(200);
    expect(get).toHaveBeenCalledWith(
      { audience: "personal", owner_id: "user", project_id: null },
      true
    );
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: `/v1/projects/${projectId}/notification-preferences?audience=shared`,
          headers,
          payload: { channels: { slack: "off" } }
        })
      ).statusCode
    ).toBe(200);
    expect(update).toHaveBeenCalledWith(
      { audience: "shared", owner_id: "project-org", project_id: projectId },
      { channels: { slack: "off" } }
    );
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/v1/account/notification-preferences/pause?audience=shared",
          headers,
          payload: { channels: ["slack"], until: null }
        })
      ).statusCode
    ).toBe(403);
  } finally {
    await app.close();
  }
});
it("allows personal settings to members but refuses shared writes and invalid daily channels", async () => {
  const app = server("member");
  try {
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/v1/projects/${projectId}/notification-preferences/pause`,
          headers,
          payload: { channels: ["email"], until: null }
        })
      ).statusCode
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: `/v1/projects/${projectId}/notification-preferences?audience=shared`,
          headers,
          payload: { channels: { email: "daily" } }
        })
      ).statusCode
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: "/v1/account/notification-preferences",
          headers,
          payload: { channels: { slack: "daily" } }
        })
      ).statusCode
    ).toBe(400);
  } finally {
    await app.close();
  }
});
it("rejects SDK tokens, unauthenticated writes and session mutations without CSRF", async () => {
  const app = server();
  try {
    for (const auth of [
      {},
      { authorization: "Bearer dbundle_proj_sdk" },
      { cookie: `${SESSION_COOKIE_NAME}=session` }
    ]) {
      expect([401, 403]).toContain(
        (
          await app.inject({
            method: "POST",
            url: "/v1/account/notification-preferences/resume",
            headers: auth,
            payload: { channels: ["email"] }
          })
        ).statusCode
      );
    }
    expect(update).not.toHaveBeenCalled();
  } finally {
    await app.close();
  }
});
it("documents every notification route", () => {
  const spec = buildPublicOpenApiSpec() as { paths: Record<string, Record<string, unknown>> };
  for (const scope of ["account", "projects/{id}"])
    for (const [suffix, method] of [
      ["", "get"],
      ["", "patch"],
      ["/pause", "post"],
      ["/resume", "post"]
    ]) {
      expect(spec.paths[`/v1/${scope}/notification-preferences${suffix}`]?.[method!]).toBeDefined();
    }
});

it("validates pause/resume bodies, handles unavailable stores and hides cross-project reads", async () => {
  const app = server();
  try {
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/v1/account/notification-preferences/resume",
          headers,
          payload: { channels: ["email"] }
        })
      ).statusCode
    ).toBe(200);
    expect(update).toHaveBeenLastCalledWith(
      { audience: "personal", owner_id: "user", project_id: null },
      { resume: { channels: ["email"] } }
    );
    for (const url of [
      "/v1/projects/not-a-uuid/notification-preferences",
      "/v1/account/notification-preferences?audience=invalid"
    ]) {
      expect((await app.inject({ url, headers })).statusCode).toBe(400);
    }
    update.mockRejectedValueOnce(new Error("notification_pause_must_be_future"));
    const result = await app.inject({
      method: "POST",
      url: "/v1/account/notification-preferences/pause",
      headers,
      payload: { channels: ["email"], until: "2020-01-01T00:00:00.000Z" }
    });
    expect(result.statusCode).toBe(400);
    expect(result.json()).toEqual({ error: "notification_pause_must_be_future" });
    update.mockRejectedValueOnce(new Error("private provider secret"));
    const failed = await app.inject({
      method: "PATCH",
      url: "/v1/account/notification-preferences",
      headers,
      payload: { channels: { email: "off" } }
    });
    expect(failed.statusCode).toBe(500);
    expect(failed.body).not.toContain("private provider secret");
  } finally {
    await app.close();
  }
  const absent = server("owner", {}, true);
  try {
    expect(
      (await absent.inject({ url: "/v1/account/notification-preferences", headers })).statusCode
    ).toBe(503);
  } finally {
    await absent.close();
  }
  const denied = server("owner", {
    projectManagement: mockedObject<ApiDependencies["projectManagement"]>({
      resolveProjectAccessForUser: vi.fn().mockResolvedValue(null)
    })
  });
  try {
    expect(
      (await denied.inject({ url: `/v1/projects/${projectId}/notification-preferences`, headers }))
        .statusCode
    ).toBe(404);
  } finally {
    await denied.close();
  }
});

it("accepts daily time and timezone at account and project scope and rejects invalid schedules", async () => {
  const app = server();
  try {
    for (const scope of ["account", `projects/${projectId}`]) {
      const payload = {
        channels: { email: "daily" },
        daily: { time: "08:30", timezone: "Europe/Ljubljana" }
      };
      expect(
        (
          await app.inject({
            method: "PATCH",
            url: `/v1/${scope}/notification-preferences`,
            headers,
            payload
          })
        ).statusCode
      ).toBe(200);
      expect(update).toHaveBeenLastCalledWith(expect.any(Object), payload);
      for (const daily of [
        { time: "25:00", timezone: "Europe/Ljubljana" },
        { time: "08:30", timezone: "Mars/Olympus" }
      ]) {
        update.mockClear();
        expect(
          (
            await app.inject({
              method: "PATCH",
              url: `/v1/${scope}/notification-preferences`,
              headers,
              payload: { daily }
            })
          ).statusCode
        ).toBe(400);
        expect(update).not.toHaveBeenCalled();
      }
    }
  } finally {
    await app.close();
  }
});
