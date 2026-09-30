import { afterEach, expect, it, vi } from "vitest";
import { createApiServer } from "../../../apps/api/src/server.js";
import type { ApiDependencies } from "../../../apps/api/src/api-types.js";
import { analyticsSpacePlanFixture } from "../../helpers/analytics-plan-fixtures.js";
import {
  createIncidentRetrievalDependency,
  createObjectStoreReaderDependency,
  createTokenManagementDependency,
  createWebhookDeliveryDependency
} from "../../helpers/api-ingestion-dependencies.js";

const spaceId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const actor = "33333333-3333-4333-8333-333333333333";
const organization = "44444444-4444-4444-8444-444444444444";
const headers = { authorization: "Bearer dbundle_mem_test_token" };
const path = `/v1/analytics/spaces/${spaceId}/plan`;
const plan = { ...analyticsSpacePlanFixture(spaceId), reports: [] };
const sourceCatalogRevisions = [{ project_id: projectId, catalog_revision: 1 }];
const record = {
  space_id: spaceId,
  revision: 1,
  space_revision: 1,
  catalog: plan.catalog,
  reports: [],
  source_catalog_revisions: sourceCatalogRevisions,
  coverage: [
    {
      name: "signup.completed",
      project_ids: [projectId],
      source_entry_revisions: [{ project_id: projectId, entry_revision: 1 }]
    }
  ]
};
const preview = {
  space_id: spaceId,
  preview_hash: "a".repeat(64),
  expected_revision: 0,
  resulting_revision: 1,
  space_revision: 1,
  source_catalog_revisions: sourceCatalogRevisions,
  coverage: record.coverage,
  already_applied: false
};
const apps: ReturnType<typeof createApiServer>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function createApp(role: "owner" | "member" = "owner") {
  const management = {
    read: vi.fn().mockResolvedValue(record),
    preview: vi.fn().mockResolvedValue({ kind: "preview", preview }),
    apply: vi.fn().mockResolvedValue({ kind: "applied", plan: record, replayed: false })
  };
  const audit = vi.fn().mockResolvedValue(undefined);
  const dependencies: ApiDependencies = {
    ingestionPersistence: { persistAndEnqueue: vi.fn() },
    ingestionMetadata: { resolveProjectByTokenHash: vi.fn() },
    memberAuth: {
      resolveMemberByTokenHash: vi.fn().mockResolvedValue({
        member_id: actor,
        organization_id: organization,
        role,
        revoked_at: null,
        expires_at: null
      })
    },
    tokenManagement: createTokenManagementDependency(),
    incidentRetrieval: createIncidentRetrievalDependency(),
    objectStoreReader: createObjectStoreReaderDependency(),
    webhookDelivery: createWebhookDeliveryDependency(),
    analyticsSpacePlans: management,
    auditLogging: { createAuditLog: audit }
  };
  const app = createApiServer(dependencies);
  apps.push(app);
  return { app, management, audit };
}

it("reads, validates, previews and applies only a source-complete declaration", async () => {
  const { app, management, audit } = createApp();
  const current = await app.inject({ method: "GET", url: path, headers });
  expect(current.statusCode).toBe(200);
  expect(current.headers["cache-control"]).toContain("no-store");
  expect(current.json()).toEqual(record);
  expect(management.read).toHaveBeenCalledWith({ actorUserId: actor, spaceId });
  const validated = await app.inject({
    method: "POST",
    url: `${path}/validate`,
    headers,
    payload: plan
  });
  expect(validated.statusCode).toBe(200);
  expect(validated.json()).toEqual({ valid: true });
  const reviewed = await app.inject({
    method: "POST",
    url: `${path}/preview`,
    headers,
    payload: plan
  });
  expect(reviewed.statusCode).toBe(200);
  expect(reviewed.json()).toEqual(preview);
  expect(management.apply).not.toHaveBeenCalled();
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
      action: "analytics_space_plan.apply",
      status: "success",
      metadata: { revision: 1, replayed: false }
    })
  );
  expect(JSON.stringify(audit.mock.calls)).not.toContain("signup.completed");
});

it("rejects non-owner, wrong-space and nonempty report requests before applying", async () => {
  const member = createApp("member");
  expect((await member.app.inject({ method: "GET", url: path, headers })).statusCode).toBe(403);
  expect(member.management.read).not.toHaveBeenCalled();
  const owner = createApp();
  const wrongScope = { ...plan, scope: { kind: "space", space_id: projectId } };
  expect(
    (
      await owner.app.inject({
        method: "POST",
        url: `${path}/preview`,
        headers,
        payload: wrongScope
      })
    ).statusCode
  ).toBe(400);
  expect(
    (
      await owner.app.inject({
        method: "POST",
        url: `${path}/preview`,
        headers,
        payload: analyticsSpacePlanFixture(spaceId)
      })
    ).json()
  ).toEqual({ error: "analytics_space_plan_mode_unavailable" });
  expect(owner.management.preview).not.toHaveBeenCalled();
  expect(
    (
      await owner.app.inject({
        method: "POST",
        url: `${path}/apply`,
        headers,
        payload: { plan: analyticsSpacePlanFixture(spaceId), preview_hash: preview.preview_hash }
      })
    ).json()
  ).toEqual({ error: "analytics_space_plan_mode_unavailable" });
  expect(owner.management.apply).not.toHaveBeenCalled();
});
