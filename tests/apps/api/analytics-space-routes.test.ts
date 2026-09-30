import { afterEach, expect, it, vi } from "vitest";
import { createApiServer } from "../../../apps/api/src/server.js";
import type { ApiDependencies } from "../../../apps/api/src/api-types.js";
import { SESSION_COOKIE_NAME, buildCsrfToken } from "../../../packages/auth/src/index.js";
import type {
  AnalyticsSpaceChange,
  AnalyticsSpaceRecord,
  AnalyticsSpacePreview
} from "../../../packages/shared-types/src/index.js";
import {
  createIncidentRetrievalDependency,
  createObjectStoreReaderDependency,
  createTokenManagementDependency,
  createWebhookDeliveryDependency
} from "../../helpers/api-ingestion-dependencies.js";

const id = "11111111-1111-4111-8111-111111111111";
const actor = "22222222-2222-4222-8222-222222222222";
const organization = "33333333-3333-4333-8333-333333333333";
const headers = { authorization: "Bearer dbundle_mem_test_token" };
const change: AnalyticsSpaceChange = {
  action: "save",
  mutation: {
    organization_id: organization,
    display_name: "Product",
    mode: "portfolio",
    expected_revision: 0,
    idempotency_key: id,
    project_ids: [id]
  }
};
const space: AnalyticsSpaceRecord = {
  id,
  organization_id: organization,
  display_name: "Product",
  mode: "portfolio",
  revision: 1,
  project_ids: [id],
  created_at: "2026-09-28T00:00:00.000Z",
  archived: false
};
const preview: AnalyticsSpacePreview = {
  action: "save",
  space_id: null,
  preview_hash: "a".repeat(64),
  expected_revision: 0,
  resulting_revision: 1,
  added_project_ids: [id],
  removed_project_ids: [],
  mode_changed: false,
  display_name: "Product",
  mode: "portfolio",
  already_applied: false
};
const apps: ReturnType<typeof createApiServer>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  vi.unstubAllEnvs();
});
function createApp(overrides: Partial<ApiDependencies> = {}) {
  const management = {
    list: vi.fn().mockResolvedValue([space]),
    read: vi.fn().mockResolvedValue(space),
    preview: vi.fn().mockResolvedValue({ kind: "preview", preview }),
    apply: vi.fn().mockResolvedValue({ kind: "applied", space, replayed: false }),
    authorizeSnapshot: vi.fn()
  };
  const audit = vi.fn().mockResolvedValue(undefined);
  const app = createApiServer({
    ingestionPersistence: { persistAndEnqueue: vi.fn() },
    ingestionMetadata: { resolveProjectByTokenHash: vi.fn() },
    memberAuth: {
      resolveMemberByTokenHash: vi.fn().mockResolvedValue({
        member_id: actor,
        organization_id: organization,
        role: "owner",
        revoked_at: null,
        expires_at: null
      })
    },
    tokenManagement: createTokenManagementDependency(),
    incidentRetrieval: createIncidentRetrievalDependency(),
    objectStoreReader: createObjectStoreReaderDependency(),
    webhookDelivery: createWebhookDeliveryDependency(),
    analyticsSpaces: management,
    auditLogging: { createAuditLog: audit },
    ...overrides
  });
  apps.push(app);
  return { app, management, audit };
}
it("lists and reads spaces through the domain's complete-source authorization", async () => {
  const { app, management } = createApp();
  const listed = await app.inject({
    method: "GET",
    url: `/v1/analytics/spaces?organization_id=${organization}`,
    headers
  });
  expect(listed.statusCode).toBe(200);
  expect(listed.json()).toEqual({ spaces: [space] });
  expect(management.list).toHaveBeenCalledWith({
    actorUserId: actor,
    organizationId: organization
  });
  const read = await app.inject({ method: "GET", url: `/v1/analytics/spaces/${id}`, headers });
  expect(read.statusCode).toBe(200);
  expect(read.json()).toEqual({ space, replayed: false });
  management.read.mockResolvedValueOnce(null);
  expect(
    (await app.inject({ method: "GET", url: `/v1/analytics/spaces/${id}`, headers })).statusCode
  ).toBe(404);
});
it("previews without applying or auditing writes, then applies exactly the reviewed change", async () => {
  const { app, management, audit } = createApp();
  const response = await app.inject({
    method: "POST",
    url: "/v1/analytics/spaces/preview",
    headers,
    payload: change
  });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual(preview);
  expect(management.preview).toHaveBeenCalledWith({ actorUserId: actor, spaceId: null, change });
  expect(management.apply).not.toHaveBeenCalled();
  expect(audit).not.toHaveBeenCalled();
  const applied = await app.inject({
    method: "POST",
    url: "/v1/analytics/spaces/apply",
    headers,
    payload: { change, preview_hash: preview.preview_hash }
  });
  expect(applied.statusCode).toBe(200);
  expect(applied.json()).toEqual({ space, replayed: false });
  expect(management.apply).toHaveBeenCalledWith({
    actorUserId: actor,
    spaceId: null,
    change,
    previewHash: preview.preview_hash
  });
  expect(audit).toHaveBeenCalledWith(
    expect.objectContaining({
      action: "analytics_space.save",
      status: "success",
      target_id: id,
      metadata: { revision: 1, replayed: false }
    })
  );
  const archive = {
    action: "archive",
    mutation: { organization_id: organization, expected_revision: 1, idempotency_key: id }
  };
  management.apply.mockResolvedValueOnce({
    kind: "applied",
    space: { ...space, revision: 2, archived: true },
    replayed: false
  });
  expect(
    (
      await app.inject({
        method: "POST",
        url: `/v1/analytics/spaces/${id}/apply`,
        headers,
        payload: { change: archive, preview_hash: preview.preview_hash }
      })
    ).statusCode
  ).toBe(200);
  expect(audit).toHaveBeenLastCalledWith(
    expect.objectContaining({ action: "analytics_space.archive", status: "success" })
  );
});
it("fails closed for malformed bodies, unavailable dependencies and domain conflicts", async () => {
  const { app, management, audit } = createApp();
  const url = "/v1/analytics/spaces/apply";
  expect((await app.inject({ method: "POST", url, headers, payload: { change } })).statusCode).toBe(
    400
  );
  expect(management.apply).not.toHaveBeenCalled();
  for (const kind of ["conflict", "project_already_linked", "capacity_exceeded"]) {
    management.apply.mockResolvedValueOnce({ kind });
    const response = await app.inject({
      method: "POST",
      url,
      headers,
      payload: { change, preview_hash: preview.preview_hash }
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: `analytics_space_${kind}` });
  }
  expect(audit.mock.calls).toHaveLength(3);
  const unavailable = createApp({ analyticsSpaces: undefined }).app;
  expect(
    (await unavailable.inject({ method: "GET", url: `/v1/analytics/spaces/${id}`, headers }))
      .statusCode
  ).toBe(404);
  expect(
    (
      await app.inject({
        method: "GET",
        url: "/v1/analytics/spaces?organization_id=invalid",
        headers
      })
    ).statusCode
  ).toBe(400);
});
it("rejects non-member credentials, nonowners, CSRF failures and rate-limited requests before the domain", async () => {
  vi.stubEnv("SELFHOST_MODE", "false");
  const { app, management } = createApp();
  for (const authorization of [
    undefined,
    "Bearer dbundle_proj_client",
    "Bearer dbundle_anl_writer"
  ]) {
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/v1/analytics/spaces/preview",
          headers: authorization === undefined ? {} : { authorization },
          payload: change
        })
      ).statusCode
    ).toBe(401);
  }
  expect(management.preview).not.toHaveBeenCalled();
  const member = createApp({
    memberAuth: {
      resolveMemberByTokenHash: vi.fn().mockResolvedValue({
        member_id: actor,
        organization_id: organization,
        role: "member",
        revoked_at: null,
        expires_at: null
      })
    }
  });
  expect(
    (
      await member.app.inject({
        method: "POST",
        url: "/v1/analytics/spaces/preview",
        headers,
        payload: change
      })
    ).statusCode
  ).toBe(403);
  expect(member.management.preview).not.toHaveBeenCalled();
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/v1/analytics/spaces/apply",
        headers: { cookie: `${SESSION_COOKIE_NAME}=session-secret` },
        payload: { change, preview_hash: preview.preview_hash }
      })
    ).statusCode
  ).toBe(403);
  expect(management.apply).not.toHaveBeenCalled();
  const limited = createApp({
    authRateLimiter: {
      claimRequest: vi.fn().mockResolvedValue({ allowed: false, retry_after_ms: 1000 })
    }
  });
  const response = await limited.app.inject({
    method: "GET",
    url: `/v1/analytics/spaces/${id}`,
    headers
  });
  expect(response.statusCode).toBe(429);
  expect(response.headers["retry-after"]).toBe("1");
  expect(limited.management.read).not.toHaveBeenCalled();
});
it("supports an authorized browser session with CSRF and rejects unexpected fields", async () => {
  const { app, management } = createApp({
    webAuth: {
      requestEmailCode: vi.fn(),
      verifyEmailCode: vi.fn(),
      beginGithubAuth: vi.fn(),
      completeGithubAuth: vi.fn(),
      acceptInviteForSession: vi.fn(),
      revokeSessionByToken: vi.fn(),
      resolveSessionByToken: vi.fn().mockResolvedValue({
        session_id: id,
        user_id: actor,
        organization_id: organization,
        role: "owner",
        email: "owner@example.test",
        email_verified_at: "2026-09-28T00:00:00.000Z",
        created_at: "2026-09-28T00:00:00.000Z",
        expires_at: "2030-01-01T00:00:00.000Z",
        revoked_at: null
      })
    }
  });
  const sessionHeaders = {
    cookie: `${SESSION_COOKIE_NAME}=session-secret`,
    "x-csrf-token": buildCsrfToken("session-secret")
  };
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/v1/analytics/spaces/preview",
        headers: sessionHeaders,
        payload: change
      })
    ).statusCode
  ).toBe(200);
  expect(management.preview).toHaveBeenCalledOnce();
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/v1/analytics/spaces/preview",
        headers: sessionHeaders,
        payload: { ...change, actorUserId: id }
      })
    ).statusCode
  ).toBe(400);
});
