import { afterEach, expect, it, vi } from "vitest";
import { createApiServer } from "../../../apps/api/src/server.js";
import { createBaseDependencies } from "../../helpers/api-capture-rule-ingestion.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const actor = "22222222-2222-4222-8222-222222222222";
const organization = "33333333-3333-4333-8333-333333333333";
const headers = { authorization: "Bearer dbundle_mem_test_token" };
const namespace = {
  project_id: projectId,
  namespace_revision: 1,
  key_fingerprint: `sha256:${"a".repeat(64)}`,
  activated_at: "2026-09-29T12:00:00.000Z",
  revoked_at: null
};
const change = {
  action: "configure",
  expected_revision: 0,
  idempotency_key: "44444444-4444-4444-8444-444444444444",
  key_fingerprint: namespace.key_fingerprint
} as const;
const preview = {
  project_id: projectId,
  action: "configure",
  expected_revision: 0,
  resulting_revision: 1,
  current_key_fingerprint: null,
  proposed_key_fingerprint: namespace.key_fingerprint,
  contexts_fenced: false,
  preview_hash: "b".repeat(64)
};
const apps: ReturnType<typeof createApiServer>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function setup(role: "owner" | "admin" | "member" = "owner", enabled = true) {
  const read = vi.fn().mockResolvedValue(namespace);
  const review = vi.fn().mockResolvedValue({ kind: "preview", preview });
  const apply = vi.fn().mockResolvedValue({ kind: "applied", namespace, replayed: false });
  const audit = vi.fn().mockResolvedValue(undefined);
  const app = createApiServer({
    ...createBaseDependencies(),
    memberAuth: {
      resolveMemberByTokenHash: vi.fn().mockResolvedValue({
        member_id: actor,
        organization_id: organization,
        role,
        revoked_at: null,
        expires_at: null
      })
    } as Parameters<typeof createApiServer>[0]["memberAuth"],
    projectManagement: {
      resolveProjectAccessForUser: vi.fn().mockResolvedValue({
        project_id: projectId,
        organization_id: organization,
        owner_user_id: actor,
        owner_email: "owner@example.test",
        relationship: role === "owner" ? "owned" : "shared",
        effective_role: role,
        organization_plan: "team",
        shared_access_suspended: false
      }),
      listProjectsForOrganization: vi.fn(),
      createProjectForOrganization: vi.fn(),
      updateProjectForOrganization: vi.fn(),
      deleteProjectForOrganization: vi.fn()
    } as Parameters<typeof createApiServer>[0]["projectManagement"],
    analyticsIdentityNamespace: { enabled, read, preview: review, apply },
    auditLogging: { createAuditLog: audit }
  });
  apps.push(app);
  return { app, read, review, apply, audit };
}

it("keeps namespace management disabled in default candidate composition", async () => {
  const { app, read, review, apply } = setup("owner", false);
  const path = `/v1/projects/${projectId}/analytics/identity-namespace`;
  expect((await app.inject({ method: "GET", url: path, headers })).statusCode).toBe(503);
  expect(
    (await app.inject({ method: "POST", url: `${path}/preview`, headers, payload: change }))
      .statusCode
  ).toBe(503);
  expect(
    (
      await app.inject({
        method: "POST",
        url: `${path}/apply`,
        headers,
        payload: { change, preview_hash: preview.preview_hash }
      })
    ).statusCode
  ).toBe(503);
  expect(read).not.toHaveBeenCalled();
  expect(review).not.toHaveBeenCalled();
  expect(apply).not.toHaveBeenCalled();
});

it("binds owner project and actor for read and reviewed revisioned change without a key", async () => {
  const { app, read, review, apply, audit } = setup();
  const path = `/v1/projects/${projectId}/analytics/identity-namespace`;
  const current = await app.inject({ method: "GET", url: path, headers });
  expect(current.statusCode).toBe(200);
  expect(current.json()).toEqual(namespace);
  expect(read).toHaveBeenCalledWith(actor, projectId);
  const reviewed = await app.inject({
    method: "POST",
    url: `${path}/preview`,
    headers,
    payload: change
  });
  expect(reviewed.statusCode).toBe(200);
  expect(reviewed.json()).toEqual(preview);
  expect(review).toHaveBeenCalledWith({
    actorUserId: actor,
    projectId,
    expectedRevision: 0,
    idempotencyKey: change.idempotency_key,
    action: "configure",
    keyFingerprint: namespace.key_fingerprint
  });
  const applied = await app.inject({
    method: "POST",
    url: `${path}/apply`,
    headers,
    payload: { change, preview_hash: preview.preview_hash }
  });
  expect(applied.statusCode).toBe(200);
  expect(applied.json()).toEqual({ namespace, replayed: false });
  expect(apply).toHaveBeenCalledWith({
    actorUserId: actor,
    projectId,
    expectedRevision: 0,
    idempotencyKey: change.idempotency_key,
    previewHash: preview.preview_hash,
    action: "configure",
    keyFingerprint: namespace.key_fingerprint
  });
  expect(audit).toHaveBeenCalledWith(
    expect.objectContaining({ action: "analytics_identity_namespace.configure", status: "success" })
  );
  expect(JSON.stringify(audit.mock.calls)).not.toContain(namespace.key_fingerprint);
});

it("rejects nonowners and invalid or stale changes before storage mutation", async () => {
  const path = `/v1/projects/${projectId}/analytics/identity-namespace`;
  const other = setup("admin");
  const denied = await other.app.inject({
    method: "POST",
    url: `${path}/apply`,
    headers,
    payload: { change, preview_hash: preview.preview_hash }
  });
  expect(denied.statusCode).toBe(403);
  expect(other.apply).not.toHaveBeenCalled();
  const owner = setup();
  const invalid = await owner.app.inject({
    method: "POST",
    url: `${path}/apply`,
    headers,
    payload: { change: { ...change, key: "raw-secret" }, preview_hash: preview.preview_hash }
  });
  expect(invalid.statusCode).toBe(400);
  owner.apply.mockResolvedValueOnce({ kind: "conflict" });
  const stale = await owner.app.inject({
    method: "POST",
    url: `${path}/apply`,
    headers,
    payload: { change, preview_hash: preview.preview_hash }
  });
  expect(stale.statusCode).toBe(409);
});
