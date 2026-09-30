import { afterEach, expect, it, vi } from "vitest";
import { createApiServer } from "../../../apps/api/src/server.js";
import type { ApiDependencies } from "../../../apps/api/src/api-types.js";
import { SESSION_COOKIE_NAME, buildCsrfToken } from "../../../packages/auth/src/index.js";
import type {
  AnalyticsWriterChange,
  AnalyticsWriterRecord,
  AnalyticsWriterPreview
} from "../../../packages/shared-types/src/index.js";
import {
  createIncidentRetrievalDependency,
  createObjectStoreReaderDependency,
  createTokenManagementDependency,
  createWebhookDeliveryDependency
} from "../../helpers/api-ingestion-dependencies.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const actor = "22222222-2222-4222-8222-222222222222";
const organization = "33333333-3333-4333-8333-333333333333";
const writerId = "44444444-4444-4444-8444-444444444444";
const idempotencyKey = "55555555-5555-4555-8555-555555555555";
const headers = { authorization: "Bearer dbundle_mem_test_token" };
const plaintext = `dbundle_anl_${"A".repeat(43)}`;
const change: AnalyticsWriterChange = {
  action: "create",
  mutation: {
    kind: "server",
    display_name: "Billing worker",
    expires_in_days: 30,
    expected_revision: 0,
    idempotency_key: idempotencyKey
  }
};
const writer: AnalyticsWriterRecord = {
  id: writerId,
  project_id: projectId,
  kind: "server",
  display_name: "Billing worker",
  created_at: "2026-09-28T00:00:00.000Z",
  expires_at: "2026-10-28T00:00:00.000Z",
  revoked_at: null
};
const preview: AnalyticsWriterPreview = {
  project_id: projectId,
  preview_hash: "a".repeat(64),
  action: "create",
  expected_revision: 0,
  resulting_revision: 1,
  writer_id: null,
  kind: "server",
  display_name: "Billing worker",
  expires_in_days: 30,
  active_writers: 0,
  remaining_active_capacity: 9,
  already_applied: false
};

const apps: ReturnType<typeof createApiServer>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  vi.unstubAllEnvs();
});
function createApp(
  input: {
    role?: "owner" | "admin" | "member";
    overrides?: Partial<ApiDependencies>;
  } = {}
) {
  const management = {
    list: vi.fn().mockResolvedValue({ project_id: projectId, revision: 0, writers: [] }),
    preview: vi.fn().mockResolvedValue({ kind: "preview", preview }),
    apply: vi.fn().mockResolvedValue({
      kind: "applied",
      result: { disposition: "issued", revision: 1, replayed: false, writer, plaintext }
    }),
    resolveByTokenHash: vi.fn()
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
    projectManagement: {
      resolveProjectAccessForUser: vi.fn().mockResolvedValue({
        project_id: projectId,
        organization_id: organization,
        owner_user_id: actor,
        owner_email: "owner@example.test",
        relationship: input.role === "owner" || input.role === undefined ? "owned" : "shared",
        effective_role: input.role ?? "owner",
        organization_plan: "team",
        shared_access_suspended: false
      }),
      listProjectsForOrganization: vi.fn().mockResolvedValue([]),
      createProjectForOrganization: vi.fn(),
      updateProjectForOrganization: vi.fn(),
      deleteProjectForOrganization: vi.fn()
    },
    tokenManagement: createTokenManagementDependency(),
    incidentRetrieval: createIncidentRetrievalDependency(),
    objectStoreReader: createObjectStoreReaderDependency(),
    webhookDelivery: createWebhookDeliveryDependency(),
    analyticsWriters: management,
    auditLogging: { createAuditLog: audit },
    ...input.overrides
  });
  apps.push(app);
  return { app, management, audit };
}

it("lists metadata, previews without a write, issues once, audits safely, and replays without plaintext", async () => {
  const { app, management, audit } = createApp();
  const collection = `/v1/projects/${projectId}/analytics/writers`;
  const listed = await app.inject({ method: "GET", url: collection, headers });
  expect(listed.statusCode).toBe(200);
  expect(listed.headers["cache-control"]).toContain("no-store");
  expect(listed.json()).toEqual({ project_id: projectId, revision: 0, writers: [] });
  expect(management.list).toHaveBeenCalledWith({ projectId, actorUserId: actor });

  const reviewed = await app.inject({
    method: "POST",
    url: `${collection}/preview`,
    headers,
    payload: change
  });
  expect(reviewed.statusCode).toBe(200);
  expect(reviewed.json()).toEqual(preview);
  expect(management.apply).not.toHaveBeenCalled();
  expect(audit).not.toHaveBeenCalled();

  const issued = await app.inject({
    method: "POST",
    url: `${collection}/apply`,
    headers,
    payload: { change, preview_hash: preview.preview_hash }
  });
  expect(issued.statusCode).toBe(200);
  expect(issued.headers["cache-control"]).toContain("no-store");
  expect(issued.json()).toEqual({
    disposition: "issued",
    revision: 1,
    replayed: false,
    writer,
    plaintext
  });
  expect(management.apply).toHaveBeenCalledWith({
    projectId,
    actorUserId: actor,
    change,
    previewHash: preview.preview_hash
  });
  expect(audit).toHaveBeenCalledWith(
    expect.objectContaining({
      organization_id: organization,
      action: "analytics_writer.create",
      target_type: "analytics_writer",
      target_id: writerId,
      status: "success",
      metadata: { project_id: projectId, revision: 1, replayed: false, disposition: "issued" }
    })
  );
  expect(JSON.stringify(audit.mock.calls)).not.toContain(plaintext);

  management.apply.mockResolvedValueOnce({
    kind: "applied",
    result: { disposition: "secret_unavailable", revision: 1, replayed: true, writer }
  });
  const replay = await app.inject({
    method: "POST",
    url: `${collection}/apply`,
    headers,
    payload: { change, preview_hash: preview.preview_hash }
  });
  expect(replay.statusCode).toBe(200);
  expect(replay.json()).toEqual({
    disposition: "secret_unavailable",
    revision: 1,
    replayed: true,
    writer
  });
  expect(replay.body).not.toContain(plaintext);
});

it("permits a project admin but rejects member, project-token, unavailable and invalid requests", async () => {
  const admin = createApp({ role: "admin" });
  const collection = `/v1/projects/${projectId}/analytics/writers`;
  expect((await admin.app.inject({ method: "GET", url: collection, headers })).statusCode).toBe(
    200
  );
  const member = createApp({ role: "member" });
  expect((await member.app.inject({ method: "GET", url: collection, headers })).statusCode).toBe(
    403
  );
  expect(member.management.list).not.toHaveBeenCalled();
  for (const authorization of [undefined, "Bearer dbundle_proj_client", `Bearer ${plaintext}`]) {
    expect(
      (
        await admin.app.inject({
          method: "POST",
          url: `${collection}/preview`,
          headers: authorization === undefined ? {} : { authorization },
          payload: change
        })
      ).statusCode
    ).toBe(401);
  }
  expect(admin.management.preview).not.toHaveBeenCalled();
  expect(
    (await admin.app.inject({ method: "GET", url: "/v1/projects/bad/analytics/writers", headers }))
      .statusCode
  ).toBe(400);
  expect(
    (
      await admin.app.inject({
        method: "POST",
        url: `${collection}/apply`,
        headers,
        payload: { change, preview_hash: preview.preview_hash, unexpected: true }
      })
    ).statusCode
  ).toBe(400);
  const unavailable = createApp({ overrides: { analyticsWriters: undefined } });
  expect(
    (await unavailable.app.inject({ method: "GET", url: collection, headers })).statusCode
  ).toBe(404);
});

it("maps domain conflicts and revocation, audits fixed reasons, and applies the CSRF/rate gates", async () => {
  const { app, management, audit } = createApp();
  const collection = `/v1/projects/${projectId}/analytics/writers`;
  management.preview.mockResolvedValueOnce({ kind: "conflict" });
  const conflict = await app.inject({
    method: "POST",
    url: `${collection}/preview`,
    headers,
    payload: change
  });
  expect(conflict.statusCode).toBe(409);
  expect(conflict.json()).toEqual({ error: "analytics_writer_conflict" });

  const revoke: AnalyticsWriterChange = {
    action: "revoke",
    mutation: { writer_id: writerId, expected_revision: 1, idempotency_key: idempotencyKey }
  };
  const revokedWriter = { ...writer, revoked_at: "2026-09-28T12:00:00.000Z" };
  management.apply.mockResolvedValueOnce({
    kind: "applied",
    result: { disposition: "revoked", revision: 2, replayed: false, writer: revokedWriter }
  });
  const applied = await app.inject({
    method: "POST",
    url: `${collection}/apply`,
    headers,
    payload: { change: revoke, preview_hash: preview.preview_hash }
  });
  expect(applied.statusCode).toBe(200);
  expect(applied.json()).toEqual({
    disposition: "revoked",
    revision: 2,
    replayed: false,
    writer: revokedWriter
  });
  expect(audit).toHaveBeenCalledWith(
    expect.objectContaining({ action: "analytics_writer.revoke", status: "success" })
  );

  management.apply.mockResolvedValueOnce({ kind: "forbidden" });
  const denied = await app.inject({
    method: "POST",
    url: `${collection}/apply`,
    headers,
    payload: { change, preview_hash: preview.preview_hash }
  });
  expect(denied.statusCode).toBe(403);
  expect(audit).toHaveBeenCalledWith(
    expect.objectContaining({
      action: "analytics_writer.create",
      status: "failure",
      metadata: { project_id: projectId, reason: "forbidden" }
    })
  );

  const limited = createApp({
    overrides: {
      authRateLimiter: {
        claimRequest: vi.fn().mockResolvedValue({ allowed: false, retry_after_ms: 1000 })
      }
    }
  });
  expect((await limited.app.inject({ method: "GET", url: collection, headers })).statusCode).toBe(
    429
  );
  expect(limited.management.list).not.toHaveBeenCalled();

  const session = createApp({
    overrides: {
      webAuth: {
        requestEmailCode: vi.fn(),
        verifyEmailCode: vi.fn(),
        beginGithubAuth: vi.fn(),
        completeGithubAuth: vi.fn(),
        acceptInviteForSession: vi.fn(),
        revokeSessionByToken: vi.fn(),
        resolveSessionByToken: vi.fn().mockResolvedValue({
          session_id: writerId,
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
    }
  });
  const cookie = `${SESSION_COOKIE_NAME}=session-secret`;
  expect(
    (
      await session.app.inject({
        method: "POST",
        url: `${collection}/preview`,
        headers: { cookie },
        payload: change
      })
    ).statusCode
  ).toBe(403);
  expect(
    (
      await session.app.inject({
        method: "POST",
        url: `${collection}/preview`,
        headers: { cookie, "x-csrf-token": buildCsrfToken("session-secret") },
        payload: change
      })
    ).statusCode
  ).toBe(200);
});
