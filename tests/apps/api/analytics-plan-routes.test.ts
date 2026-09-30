import { afterEach, expect, it, vi } from "vitest";
import { createApiServer } from "../../../apps/api/src/server.js";
import type { ApiDependencies } from "../../../apps/api/src/api-types.js";
import { SESSION_COOKIE_NAME, buildCsrfToken } from "../../../packages/auth/src/index.js";
import {
  analyticsProjectPlanFixture,
  analyticsProjectPlanPreviewFixture,
  analyticsProjectPlanRecordFixture
} from "../../helpers/analytics-plan-fixtures.js";
import {
  createIncidentRetrievalDependency,
  createObjectStoreReaderDependency,
  createTokenManagementDependency,
  createWebhookDeliveryDependency
} from "../../helpers/api-ingestion-dependencies.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const actor = "22222222-2222-4222-8222-222222222222";
const organization = "33333333-3333-4333-8333-333333333333";
const headers = { authorization: "Bearer dbundle_mem_test_token" };
const plan = analyticsProjectPlanFixture(projectId);
const preview = analyticsProjectPlanPreviewFixture(projectId);
const record = analyticsProjectPlanRecordFixture(projectId);
const apps: ReturnType<typeof createApiServer>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  vi.unstubAllEnvs();
});

function createApp(
  input: { role?: "owner" | "admin" | "member"; overrides?: Partial<ApiDependencies> } = {}
) {
  const management = {
    read: vi.fn().mockResolvedValue(record),
    preview: vi.fn().mockResolvedValue({ kind: "preview", preview }),
    apply: vi.fn().mockResolvedValue({ kind: "applied", plan: record, replayed: false })
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
    analyticsPlans: management,
    auditLogging: { createAuditLog: audit },
    ...input.overrides
  });
  apps.push(app);
  return { app, management, audit };
}

it("reads the current plan and validates without writing", async () => {
  const { app, management } = createApp();
  const path = `/v1/projects/${projectId}/analytics/plan`;
  const current = await app.inject({ method: "GET", url: path, headers });
  expect(current.statusCode).toBe(200);
  expect(current.headers["cache-control"]).toContain("no-store");
  expect(current.json()).toEqual(record);
  expect(management.read).toHaveBeenCalledWith({ projectId, actorUserId: actor });

  const validated = await app.inject({
    method: "POST",
    url: `${path}/validate`,
    headers,
    payload: plan
  });
  expect(validated.statusCode).toBe(200);
  expect(validated.json()).toEqual({ valid: true });
  expect(management.preview).not.toHaveBeenCalled();
  expect(management.apply).not.toHaveBeenCalled();
});

it("returns observed current-revision producer counts without treating them as verification", async () => {
  const observed = {
    ...record,
    observations: [
      {
        event_name: "signup.completed",
        event_revision: 1,
        producer_kind: "server" as const,
        observed_count: "2",
        first_observed_on: "2026-09-29",
        last_observed_on: "2026-09-29"
      }
    ]
  };
  const { app, management } = createApp();
  management.read.mockResolvedValue(observed);
  const response = await app.inject({
    method: "GET",
    url: `/v1/projects/${projectId}/analytics/plan`,
    headers
  });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual(observed);
});

it("previews without writing and applies with bounded audit metadata", async () => {
  const { app, management, audit } = createApp();
  const path = `/v1/projects/${projectId}/analytics/plan`;
  const reviewed = await app.inject({
    method: "POST",
    url: `${path}/preview`,
    headers,
    payload: plan
  });
  expect(reviewed.statusCode).toBe(200);
  expect(reviewed.json()).toEqual(preview);
  expect(management.preview).toHaveBeenCalledWith({ actorUserId: actor, plan });
  expect(management.apply).not.toHaveBeenCalled();
  expect(audit).not.toHaveBeenCalled();

  const applied = await app.inject({
    method: "POST",
    url: `${path}/apply`,
    headers,
    payload: { plan, preview_hash: preview.preview_hash }
  });
  expect(applied.statusCode).toBe(200);
  expect(applied.json()).toEqual({ plan: record, replayed: false });
  expect(management.apply).toHaveBeenCalledWith({
    actorUserId: actor,
    plan,
    previewHash: preview.preview_hash
  });
  expect(audit).toHaveBeenCalledWith(
    expect.objectContaining({
      action: "analytics_plan.apply",
      target_type: "analytics_plan",
      target_id: projectId,
      status: "success",
      metadata: { project_id: projectId, revision: 1, catalog_revision: 1, replayed: false }
    })
  );
  expect(JSON.stringify(audit.mock.calls)).not.toContain("signup.completed");
});

it("rejects non-admin and non-member-token requests before reading or previewing plans", async () => {
  const path = `/v1/projects/${projectId}/analytics/plan`;
  const member = createApp({ role: "member" });
  expect((await member.app.inject({ method: "GET", url: path, headers })).statusCode).toBe(403);
  expect(member.management.read).not.toHaveBeenCalled();
  const admin = createApp({ role: "admin" });
  expect((await admin.app.inject({ method: "GET", url: path, headers })).statusCode).toBe(200);
  for (const authorization of [
    undefined,
    "Bearer dbundle_proj_client",
    "Bearer dbundle_anl_test"
  ]) {
    expect(
      (
        await admin.app.inject({
          method: "POST",
          url: `${path}/preview`,
          headers: authorization === undefined ? {} : { authorization },
          payload: plan
        })
      ).statusCode
    ).toBe(401);
  }
  expect(admin.management.preview).not.toHaveBeenCalled();
});

it("rejects cross-project and malformed plan requests before preview or apply", async () => {
  const path = `/v1/projects/${projectId}/analytics/plan`;
  const admin = createApp({ role: "admin" });
  const otherProjectPlan = {
    ...plan,
    scope: { kind: "project", project_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }
  };
  expect(
    (
      await admin.app.inject({
        method: "POST",
        url: `${path}/preview`,
        headers,
        payload: otherProjectPlan
      })
    ).statusCode
  ).toBe(400);
  expect(
    (await admin.app.inject({ method: "GET", url: "/v1/projects/bad/analytics/plan", headers }))
      .statusCode
  ).toBe(400);
  expect(
    (
      await admin.app.inject({
        method: "POST",
        url: `${path}/apply`,
        headers,
        payload: { plan, preview_hash: preview.preview_hash, extra: true }
      })
    ).statusCode
  ).toBe(400);
  expect(admin.management.preview).not.toHaveBeenCalled();
  expect(admin.management.apply).not.toHaveBeenCalled();
});

it("fails closed when plan management is unavailable", async () => {
  const path = `/v1/projects/${projectId}/analytics/plan`;
  const absent = createApp({ overrides: { analyticsPlans: undefined } });
  expect((await absent.app.inject({ method: "GET", url: path, headers })).statusCode).toBe(404);
});

it("returns fixed validation issues and maps revision conflicts without echoing submitted values", async () => {
  const { app, management, audit } = createApp();
  const path = `/v1/projects/${projectId}/analytics/plan`;
  const impossible = analyticsProjectPlanFixture(projectId);
  const goal = impossible.reports[0];
  if (goal?.kind !== "goal") throw new Error("goal fixture missing");
  goal.predicate = { field: "event_name", operator: "in", values: ["secret.unlisted"] };
  const validation = await app.inject({
    method: "POST",
    url: `${path}/validate`,
    headers,
    payload: impossible
  });
  expect(validation.statusCode).toBe(200);
  expect(validation.json()).toEqual({
    valid: false,
    issues: [{ code: "unknown_event", report_index: 0 }]
  });
  expect(validation.body).not.toContain("secret.unlisted");
  management.preview.mockResolvedValueOnce({ kind: "conflict" });
  const conflict = await app.inject({
    method: "POST",
    url: `${path}/preview`,
    headers,
    payload: plan
  });
  expect(conflict.statusCode).toBe(409);
  expect(conflict.json()).toEqual({ error: "analytics_plan_conflict" });
  management.apply.mockResolvedValueOnce({ kind: "conflict" });
  const failed = await app.inject({
    method: "POST",
    url: `${path}/apply`,
    headers,
    payload: { plan, preview_hash: preview.preview_hash }
  });
  expect(failed.statusCode).toBe(409);
  expect(audit).toHaveBeenCalledWith(
    expect.objectContaining({
      status: "failure",
      metadata: { project_id: projectId, reason: "conflict" }
    })
  );
  expect(JSON.stringify(audit.mock.calls)).not.toContain("signup.completed");
});

it("requires CSRF for browser plan changes and rejects oversized bodies before applying", async () => {
  const { app, management } = createApp({
    overrides: {
      webAuth: {
        requestEmailCode: vi.fn(),
        verifyEmailCode: vi.fn(),
        beginGithubAuth: vi.fn(),
        completeGithubAuth: vi.fn(),
        acceptInviteForSession: vi.fn(),
        revokeSessionByToken: vi.fn(),
        resolveSessionByToken: vi.fn().mockResolvedValue({
          session_id: projectId,
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
  const url = `/v1/projects/${projectId}/analytics/plan/apply`;
  const cookie = `${SESSION_COOKIE_NAME}=session-secret`;
  const payload = { plan, preview_hash: preview.preview_hash };
  const missingCsrf = await app.inject({ method: "POST", url, headers: { cookie }, payload });
  expect(missingCsrf.statusCode).toBe(403);
  expect(management.apply).not.toHaveBeenCalled();
  const accepted = await app.inject({
    method: "POST",
    url,
    headers: { cookie, "x-csrf-token": buildCsrfToken("session-secret") },
    payload
  });
  expect(accepted.statusCode).toBe(200);
  expect(management.apply).toHaveBeenCalledOnce();
  const oversized = await app.inject({
    method: "POST",
    url,
    headers,
    payload: { plan, preview_hash: preview.preview_hash, padding: "x".repeat(256 * 1024) }
  });
  expect(oversized.statusCode).toBe(413);
  expect(management.apply).toHaveBeenCalledOnce();
});
