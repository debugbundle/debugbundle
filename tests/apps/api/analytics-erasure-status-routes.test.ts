import { afterEach, expect, it, vi } from "vitest";
import { createApiServer } from "../../../apps/api/src/server.js";
import type { ApiDependencies } from "../../../apps/api/src/api-types.js";
import { createBaseDependencies } from "../../helpers/api-capture-rule-ingestion.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const actor = "22222222-2222-4222-8222-222222222222";
const taskId = "33333333-3333-4333-8333-333333333333";
const url = `/v1/projects/${projectId}/analytics/identity/erasures/${taskId}`;
const headers = { authorization: "Bearer dbundle_mem_test_token" };
const apps: ReturnType<typeof createApiServer>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function setup(role: "owner" | "member" = "owner", enabled = true) {
  const readStatus = vi.fn().mockResolvedValue({
    kind: "status",
    task: {
      protocol: "2026-09-analytics-erasure-01",
      task_id: taskId,
      project_id: projectId,
      cutoff_at: "2026-09-30T18:00:00.000Z",
      status: "pending",
      completed_at: null
    }
  });
  const app = createApiServer({
    ...createBaseDependencies(),
    memberAuth: {
      resolveMemberByTokenHash: vi.fn().mockResolvedValue({
        member_id: actor,
        organization_id: "44444444-4444-4444-8444-444444444444",
        role: "owner",
        revoked_at: null,
        expires_at: null
      })
    },
    projectManagement: {
      resolveProjectAccessForUser: vi.fn().mockResolvedValue({
        project_id: projectId,
        organization_id: "44444444-4444-4444-8444-444444444444",
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
    semanticAnalyticsSubjectErasure: {
      enabled,
      request: vi.fn(),
      readStatus
    }
  } satisfies ApiDependencies);
  apps.push(app);
  return { app, readStatus };
}

it("keeps member erasure status disabled by default", async () => {
  const { app, readStatus } = setup("owner", false);
  const response = await app.inject({ method: "GET", url, headers });
  expect(response.statusCode).toBe(503);
  expect(readStatus).not.toHaveBeenCalled();
});

it("reads only an authorized project's payload-free erasure status", async () => {
  const { app, readStatus } = setup();
  const response = await app.inject({ method: "GET", url, headers });
  expect(response.statusCode).toBe(200);
  expect(response.headers["cache-control"]).toBe("private, no-store");
  expect(response.json()).toMatchObject({ task_id: taskId, status: "pending" });
  expect(JSON.stringify(response.json())).not.toContain("subject_ref");
  expect(readStatus).toHaveBeenCalledWith({ actorUserId: actor, projectId, taskId });
  const denied = setup("member");
  expect((await denied.app.inject({ method: "GET", url, headers })).statusCode).toBe(403);
  expect(denied.readStatus).not.toHaveBeenCalled();
});
