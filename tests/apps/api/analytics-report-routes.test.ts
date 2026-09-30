import { afterEach, expect, it, vi } from "vitest";
import { createApiServer } from "../../../apps/api/src/server.js";
import type { ApiDependencies } from "../../../apps/api/src/api-types.js";
import { evaluateOrderedFunnel } from "../../../packages/analytics-engine/src/ordered-funnel.js";
import {
  createIncidentRetrievalDependency,
  createObjectStoreReaderDependency,
  createTokenManagementDependency,
  createWebhookDeliveryDependency
} from "../../helpers/api-ingestion-dependencies.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const actor = "22222222-2222-4222-8222-222222222222";
const organization = "33333333-3333-4333-8333-333333333333";
const path = `/v1/analytics/scopes/project/${projectId}/reports/query`;
const headers = { authorization: "Bearer dbundle_mem_test_token" };
const query = {
  report_key: "signup_funnel",
  from: "2026-09-28T00:00:00.000Z",
  to: "2026-09-29T00:00:00.000Z"
};
const apps: ReturnType<typeof createApiServer>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function createApp(
  role: "owner" | "admin" | "member" = "owner",
  enabled = true,
  recoveryEnabled = false
) {
  const reportResult = {
    kind: "report",
    report: { status: "unavailable", reason: "insufficient_history" },
    evidence: {
      pending_events: "0",
      failed_events: "0",
      lost_events: "0",
      excluded_events: "0",
      erasure_tasks: "0",
      source_coverage: "unverified"
    }
  };
  const read = vi.fn().mockResolvedValue(reportResult);
  const readRecent = vi.fn().mockResolvedValue(reportResult);
  const retry = vi.fn().mockResolvedValue({ kind: "queued" });
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
        relationship: role === "owner" ? "owned" : "shared",
        effective_role: role,
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
    semanticAnalyticsReports: { enabled, read, readRecent },
    semanticAnalyticsJobRecovery: { enabled: recoveryEnabled, retry }
  } satisfies ApiDependencies);
  apps.push(app);
  return { app, read, readRecent, retry };
}

it("keeps event recovery disabled and requeues only a current owner/admin request", async () => {
  const eventId = "55555555-5555-4555-8555-555555555555";
  const url = `/v1/projects/${projectId}/analytics/events/${eventId}/retry`;
  const disabled = createApp();
  expect((await disabled.app.inject({ method: "POST", url, headers })).statusCode).toBe(503);
  expect(disabled.retry).not.toHaveBeenCalled();
  const { app, retry } = createApp("owner", true, true);
  const queued = await app.inject({ method: "POST", url, headers });
  expect(queued.statusCode).toBe(202);
  expect(queued.headers["cache-control"]).toBe("private, no-store");
  expect(queued.json()).toEqual({ project_id: projectId, event_id: eventId, status: "queued" });
  expect(retry).toHaveBeenCalledWith({ actorUserId: actor, projectId, eventId });
  expect((await app.inject({ method: "POST", url, headers, payload: {} })).statusCode).toBe(400);
  retry.mockResolvedValueOnce({ kind: "unavailable" });
  expect((await app.inject({ method: "POST", url, headers })).statusCode).toBe(409);
  const denied = createApp("member", true, true);
  expect((await denied.app.inject({ method: "POST", url, headers })).statusCode).toBe(403);
  expect(denied.retry).not.toHaveBeenCalled();
});

it("uses a server-clock recent window without accepting a client timestamp", async () => {
  const { app, read, readRecent } = createApp();
  const response = await app.inject({
    method: "POST",
    url: path,
    headers,
    payload: { report_key: query.report_key, last: "7d" }
  });
  expect(response.statusCode).toBe(200);
  expect(readRecent).toHaveBeenCalledWith({
    actorUserId: actor,
    projectId,
    reportKey: query.report_key,
    last: "7d"
  });
  expect(read).not.toHaveBeenCalled();
  for (const payload of [
    { report_key: query.report_key, last: "1d" },
    { report_key: query.report_key, last: "7d", from: query.from }
  ]) {
    expect((await app.inject({ method: "POST", url: path, headers, payload })).statusCode).toBe(
      400
    );
  }
});

it("queries only an authorized project with a bounded report key and time range", async () => {
  const { app, read } = createApp();
  const response = await app.inject({ method: "POST", url: path, headers, payload: query });
  expect(response.statusCode).toBe(200);
  expect(response.headers["cache-control"]).toContain("no-store");
  expect(response.json()).toEqual({
    kind: "report",
    report: { status: "unavailable", reason: "insufficient_history" },
    evidence: {
      pending_events: "0",
      failed_events: "0",
      lost_events: "0",
      excluded_events: "0",
      erasure_tasks: "0",
      source_coverage: "unverified"
    }
  });
  expect(read).toHaveBeenCalledWith({
    actorUserId: actor,
    projectId,
    reportKey: query.report_key,
    from: query.from,
    to: query.to
  });
  for (const payload of [
    { ...query, extra: "x" },
    { ...query, to: "2027-01-01T00:00:00.000Z" }
  ]) {
    expect((await app.inject({ method: "POST", url: path, headers, payload })).statusCode).toBe(
      400
    );
  }
  expect(read).toHaveBeenCalledTimes(1);
});

it("fails closed for missing authority, non-admin roles and disabled report service", async () => {
  const { app, read } = createApp();
  expect((await app.inject({ method: "POST", url: path, payload: query })).statusCode).toBe(401);
  expect(
    (
      await app.inject({
        method: "POST",
        url: path.replace("/project/", "/space/"),
        headers,
        payload: query
      })
    ).statusCode
  ).toBe(404);
  expect(read).not.toHaveBeenCalled();
  const member = createApp("member");
  expect(
    (await member.app.inject({ method: "POST", url: path, headers, payload: query })).statusCode
  ).toBe(403);
  expect(member.read).not.toHaveBeenCalled();
  const disabled = createApp("owner", false);
  expect(
    (await disabled.app.inject({ method: "POST", url: path, headers, payload: query })).statusCode
  ).toBe(503);
  expect(disabled.read).not.toHaveBeenCalled();
});

it("rejects a report from another scope or falsely exact unverified coverage", async () => {
  const report = evaluateOrderedFunnel(
    {
      subject: "session",
      scope: { kind: "project", project_id: projectId },
      scope_revision: 1,
      definition_key: query.report_key,
      definition_revision: 1,
      step_keys: ["entry", "success"],
      conversion_window_seconds: 3600,
      from: query.from,
      to: query.to,
      observation_cutoff: "2026-09-29T12:00:00.000Z",
      watermark: "2026-09-29T12:00:00.000Z",
      available_from: query.from,
      definition_effective_from: query.from,
      sample_rate: 1,
      incomplete: true
    },
    []
  );
  expect(report.status).toBe("available");
  if (report.status !== "available") return;
  const { app, read } = createApp();
  const evidence = {
    pending_events: "0",
    failed_events: "0",
    lost_events: "0",
    excluded_events: "0",
    erasure_tasks: "0",
    source_coverage: "unverified"
  };
  read.mockResolvedValueOnce({ kind: "report", report, evidence });
  expect(
    (await app.inject({ method: "POST", url: path, headers, payload: query })).statusCode
  ).toBe(200);
  read.mockResolvedValueOnce({
    kind: "report",
    report: { ...report, scope: { kind: "project", project_id: organization } },
    evidence
  });
  expect(
    (await app.inject({ method: "POST", url: path, headers, payload: query })).statusCode
  ).toBe(503);
  read.mockResolvedValueOnce({
    kind: "report",
    report: { ...report, quality: "exact", quality_reasons: [] },
    evidence
  });
  expect(
    (await app.inject({ method: "POST", url: path, headers, payload: query })).statusCode
  ).toBe(503);
  read.mockResolvedValueOnce({
    kind: "report",
    report: { ...report, quality: "exact", quality_reasons: [] },
    evidence: { ...evidence, source_coverage: "verified", excluded_events: "1" }
  });
  expect(
    (await app.inject({ method: "POST", url: path, headers, payload: query })).statusCode
  ).toBe(503);
  read.mockResolvedValueOnce({
    kind: "report",
    report: { ...report, quality: "exact", quality_reasons: [] },
    evidence: { ...evidence, source_coverage: "verified", erasure_tasks: "1" }
  });
  expect(
    (await app.inject({ method: "POST", url: path, headers, payload: query })).statusCode
  ).toBe(503);
  read.mockResolvedValueOnce({
    kind: "report",
    report: { ...report, quality: "exact", quality_reasons: [] },
    evidence: { ...evidence, source_coverage: "verified", failed_events: "1" }
  });
  expect(
    (await app.inject({ method: "POST", url: path, headers, payload: query })).statusCode
  ).toBe(503);
  read.mockResolvedValueOnce({
    kind: "report",
    report,
    evidence: { ...evidence, failed_events: "1" }
  });
  expect(
    (await app.inject({ method: "POST", url: path, headers, payload: query })).statusCode
  ).toBe(503);
});
