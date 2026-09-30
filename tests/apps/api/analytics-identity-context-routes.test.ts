import { afterEach, expect, it, vi } from "vitest";
import { createApiServer } from "../../../apps/api/src/server.js";
import { hashToken } from "../../../packages/auth/src/index.js";
import {
  AnalyticsIdentityContextSchema,
  AnalyticsIdentityRevocationSchema,
  AnalyticsSubjectErasureReceiptSchema
} from "../../../packages/shared-types/src/index.js";
import { createBaseDependencies } from "../../helpers/api-capture-rule-ingestion.js";
import { mockedObject } from "../../helpers/vitest.js";

const token = `dbundle_anr_${"A".repeat(43)}`;
const serverToken = `dbundle_anl_${"A".repeat(43)}`;
const projectId = "11111111-1111-4111-8111-111111111111";
const writerId = "33333333-3333-4333-8333-333333333333";
const contextId = "55555555-5555-4555-8555-555555555555";
const epoch = "66666666-6666-4666-8666-666666666666";
const key = "77777777-7777-4777-8777-777777777777";
const bindingHash = `sha256:${"a".repeat(64)}`;
const anonymousHash = `sha256:${"b".repeat(64)}`;
const context = AnalyticsIdentityContextSchema.parse({
  protocol: "2026-09-analytics-identity-01",
  context_id: contextId,
  project_id: projectId,
  scope: { kind: "project", project_id: projectId },
  scope_revision: 1,
  namespace_revision: 1,
  producer_epoch: epoch,
  anonymous_id_hash: anonymousHash,
  user_id_hash: null,
  account_id_hash: null,
  privacy_mode: "custom",
  consent_granted: true,
  issued_at: "2026-09-29T12:00:00.000Z",
  expires_at: "2026-09-29T12:04:00.000Z"
});
const createBody = {
  producer_epoch: epoch,
  binding_hash: bindingHash,
  namespace_revision: 1,
  anonymous_id_hash: anonymousHash,
  consent_granted: true,
  idempotency_key: key
};
const associateBody = {
  context_id: contextId,
  ...createBody,
  user_id_hash: `sha256:${"c".repeat(64)}`,
  account_id_hash: null
};
const revokeBody = {
  context_id: contextId,
  producer_epoch: epoch,
  binding_hash: bindingHash,
  idempotency_key: key
};
const erasureBody = {
  namespace_revision: 1,
  subject_kind: "user" as const,
  subject_ref: `sha256:${"c".repeat(64)}`,
  idempotency_key: key
};
const apps: ReturnType<typeof createApiServer>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function setup(enabled: boolean, writerKind: "relay" | "server" = "relay") {
  const resolveByTokenHash = vi.fn().mockResolvedValue({
    writer_id: writerId,
    project_id: projectId,
    organization_id: "22222222-2222-4222-8222-222222222222",
    issuer_user_id: "44444444-4444-4444-8444-444444444444",
    kind: writerKind,
    expires_at: "2099-01-01T00:00:00.000Z",
    revoked_at: null
  });
  const create = vi.fn().mockResolvedValue({ kind: "created", context, replayed: false });
  const associate = vi.fn().mockResolvedValue({ kind: "associated", context, replayed: false });
  const revoke = vi.fn().mockResolvedValue({
    kind: "revoked",
    receipt: {
      protocol: "2026-09-analytics-identity-01",
      context_id: contextId,
      producer_epoch: epoch,
      revoked_at: "2026-09-29T12:01:00.000Z",
      replayed: false
    }
  });
  const requestErasure = vi.fn().mockResolvedValue({
    kind: "accepted",
    receipt: {
      protocol: "2026-09-analytics-erasure-01",
      task_id: contextId,
      cutoff_at: "2026-09-29T12:01:00.000Z",
      status: "pending",
      replayed: false
    }
  });
  const audit = vi.fn().mockResolvedValue(undefined);
  const app = createApiServer({
    ...createBaseDependencies(),
    auditLogging: { createAuditLog: audit },
    analyticsWriters: mockedObject<
      NonNullable<Parameters<typeof createApiServer>[0]["analyticsWriters"]>
    >({ resolveByTokenHash }),
    semanticAnalyticsIdentityContexts: { enabled, create, associate, revoke },
    semanticAnalyticsSubjectErasure: { enabled, request: requestErasure, readStatus: vi.fn() }
  });
  apps.push(app);
  return { app, resolveByTokenHash, create, associate, revoke, requestErasure, audit };
}

it("keeps all relay identity lifecycle routes disabled in the default candidate", async () => {
  const { app, create, associate, revoke } = setup(false);
  for (const [url, body] of [
    ["/v1/analytics/identity/contexts", createBody],
    [`/v1/analytics/identity/contexts/${contextId}/associate`, associateBody],
    ["/v1/analytics/identity/contexts/revoke", revokeBody]
  ] as const) {
    const response = await app.inject({
      method: "POST",
      url,
      headers: { authorization: `Bearer ${token}` },
      payload: body
    });
    expect(response.statusCode).toBe(503);
  }
  expect(create).not.toHaveBeenCalled();
  expect(associate).not.toHaveBeenCalled();
  expect(revoke).not.toHaveBeenCalled();
});

it("keeps erasure closed until enabled, then accepts the relay-owned closed request", async () => {
  const disabled = setup(false);
  const url = "/v1/analytics/identity/erasures";
  const headers = { authorization: `Bearer ${token}` };
  expect(
    (await disabled.app.inject({ method: "POST", url, headers, payload: erasureBody })).statusCode
  ).toBe(503);
  expect(disabled.requestErasure).not.toHaveBeenCalled();

  const { app, requestErasure, audit } = setup(true);
  const accepted = await app.inject({ method: "POST", url, headers, payload: erasureBody });
  expect(accepted.statusCode).toBe(202);
  expect(AnalyticsSubjectErasureReceiptSchema.parse(accepted.json()).status).toBe("pending");
  expect(requestErasure).toHaveBeenCalledWith(hashToken(token), erasureBody);
  expect(accepted.headers["cache-control"]).toBe("private, no-store");
  expect(audit).toHaveBeenCalledWith(
    expect.objectContaining({ action: "analytics_identity_context.erase", status: "success" })
  );
  expect(JSON.stringify(audit.mock.calls)).not.toContain(erasureBody.subject_ref);
  for (const forbiddenHeaders of [
    { authorization: `Bearer ${serverToken}` },
    { ...headers, origin: "https://site.example" }
  ]) {
    expect(
      (await app.inject({ method: "POST", url, headers: forbiddenHeaders, payload: erasureBody }))
        .statusCode
    ).toBe(401);
  }
  expect(
    (
      await app.inject({
        method: "POST",
        url,
        headers,
        payload: { ...erasureBody, project_id: projectId }
      })
    ).statusCode
  ).toBe(400);
  expect(
    (
      await app.inject({
        method: "POST",
        url,
        headers,
        payload: { ...erasureBody, padding: "x".repeat(5000) }
      })
    ).statusCode
  ).toBe(413);
  expect(requestErasure).toHaveBeenCalledTimes(1);
});

it("accepts a server writer only for protected subject erasure, not relay context lifecycle", async () => {
  const { app, requestErasure, create } = setup(true, "server");
  const headers = { authorization: `Bearer ${serverToken}` };
  const erased = await app.inject({
    method: "POST",
    url: "/v1/analytics/identity/erasures",
    headers,
    payload: erasureBody
  });
  expect(erased.statusCode).toBe(202);
  expect(requestErasure).toHaveBeenCalledWith(hashToken(serverToken), erasureBody);
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/v1/analytics/identity/contexts",
        headers,
        payload: createBody
      })
    ).statusCode
  ).toBe(401);
  expect(create).not.toHaveBeenCalled();
});

it("binds a relay bearer and closed requests to create, associate and revoke", async () => {
  const { app, resolveByTokenHash, create, associate, revoke, audit } = setup(true);
  const headers = { authorization: `Bearer ${token}` };
  const created = await app.inject({
    method: "POST",
    url: "/v1/analytics/identity/contexts",
    headers,
    payload: createBody
  });
  expect(created.statusCode).toBe(200);
  expect(AnalyticsIdentityContextSchema.parse(created.json())).toEqual(context);
  expect(create).toHaveBeenCalledWith(hashToken(token), createBody);
  expect(resolveByTokenHash).toHaveBeenCalledWith(hashToken(token));
  const associated = await app.inject({
    method: "POST",
    url: `/v1/analytics/identity/contexts/${contextId}/associate`,
    headers,
    payload: associateBody
  });
  expect(associated.statusCode).toBe(200);
  expect(associate).toHaveBeenCalledWith(hashToken(token), associateBody);
  const revoked = await app.inject({
    method: "POST",
    url: "/v1/analytics/identity/contexts/revoke",
    headers,
    payload: revokeBody
  });
  expect(revoked.statusCode).toBe(200);
  expect(AnalyticsIdentityRevocationSchema.parse(revoked.json()).context_id).toBe(contextId);
  expect(revoke).toHaveBeenCalledWith(hashToken(token), revokeBody);
  expect(revoked.headers["cache-control"]).toBe("private, no-store");
  expect(audit).toHaveBeenCalledTimes(3);
  expect(audit).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({ action: "analytics_identity_context.create" })
  );
  expect(audit).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ action: "analytics_identity_context.associate" })
  );
  expect(audit).toHaveBeenNthCalledWith(
    3,
    expect.objectContaining({ action: "analytics_identity_context.revoke" })
  );
  for (const [record] of audit.mock.calls) {
    expect(JSON.stringify(record)).not.toContain(anonymousHash);
    expect(JSON.stringify(record)).not.toContain(bindingHash);
    expect(JSON.stringify(record)).not.toContain(contextId);
  }
});

it("rejects browser origins, wrong writers, mismatched paths and extra fields", async () => {
  const { app, create, associate } = setup(true);
  for (const headers of [
    { authorization: `Bearer ${serverToken}` },
    { authorization: `Bearer ${token}`, origin: "https://site.example" }
  ]) {
    const denied = await app.inject({
      method: "POST",
      url: "/v1/analytics/identity/contexts",
      headers,
      payload: createBody
    });
    expect(denied.statusCode).toBe(401);
  }
  const extra = await app.inject({
    method: "POST",
    url: "/v1/analytics/identity/contexts",
    headers: { authorization: `Bearer ${token}` },
    payload: { ...createBody, user_id_hash: associateBody.user_id_hash }
  });
  expect(extra.statusCode).toBe(400);
  const mismatch = await app.inject({
    method: "POST",
    url: "/v1/analytics/identity/contexts/88888888-8888-4888-8888-888888888888/associate",
    headers: { authorization: `Bearer ${token}` },
    payload: associateBody
  });
  expect(mismatch.statusCode).toBe(400);
  expect(create).not.toHaveBeenCalled();
  expect(associate).not.toHaveBeenCalled();
  const oversized = await app.inject({
    method: "POST",
    url: "/v1/analytics/identity/contexts",
    headers: { authorization: `Bearer ${token}` },
    payload: { ...createBody, padding: "x".repeat(5000) }
  });
  expect(oversized.statusCode).toBe(413);
});
