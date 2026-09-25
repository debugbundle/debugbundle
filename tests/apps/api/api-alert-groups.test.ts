import { describe, expect, it, vi } from "vitest";

import { createApiServer } from "../../../apps/api/src/server.js";
import type { ApiDependencies } from "../../../apps/api/src/api-types.js";
import { mockedObject } from "../../helpers/vitest.js";

const projectId = "00000000-0000-4000-8000-000000000001";
const groupId = "00000000-0000-4000-8000-000000000002";
const memberId = "00000000-0000-4000-8000-000000000003";
const organizationId = "00000000-0000-4000-8000-000000000004";
const createdAt = "2026-09-24T10:00:00.000Z";

function createServer(input: {
  authorized?: boolean;
  groups?: Awaited<ReturnType<NonNullable<ApiDependencies["alertGroupInspection"]>["listGroupsForOrganization"]>>;
  detail?: Awaited<ReturnType<NonNullable<ApiDependencies["alertGroupInspection"]>["getGroupForOrganization"]>>;
} = {}) {
  const listGroupsForOrganization = vi.fn().mockResolvedValue(input.groups ?? { groups: [], next_cursor: null });
  const getGroupForOrganization = vi.fn().mockResolvedValue(input.detail ?? null);
  const app = createApiServer({
    ingestionPersistence: { persistAndEnqueue: vi.fn() },
    ingestionMetadata: { resolveProjectByTokenHash: vi.fn() },
    memberAuth: mockedObject<ApiDependencies["memberAuth"]>({
      resolveMemberByTokenHash: vi.fn().mockResolvedValue(input.authorized === false ? null : {
        member_id: memberId, organization_id: organizationId
      })
    }),
    projectManagement: mockedObject<NonNullable<ApiDependencies["projectManagement"]>>({
      resolveProjectAccessForUser: vi.fn().mockResolvedValue({
        project_id: projectId, organization_id: organizationId,
        owner_user_id: memberId, owner_email: "owner@example.com",
        relationship: "owned", effective_role: "owner", organization_plan: "team"
      })
    }),
    tokenManagement: mockedObject<ApiDependencies["tokenManagement"]>({}),
    incidentRetrieval: mockedObject<ApiDependencies["incidentRetrieval"]>({}),
    objectStoreReader: { getObject: vi.fn() },
    webhookDelivery: mockedObject<ApiDependencies["webhookDelivery"]>({}),
    alertGroupInspection: { listGroupsForOrganization, getGroupForOrganization }
  });
  return { app, listGroupsForOrganization, getGroupForOrganization };
}

describe("project-scoped alert group inspection", () => {
  it("rejects missing member access and malformed cursors before querying storage", async () => {
    const unauthenticated = createServer({ authorized: false });
    const denied = await unauthenticated.app.inject({
      method: "GET", url: `/v1/alert-groups?project_id=${projectId}`
    });
    expect(denied.statusCode).toBe(401);
    expect(unauthenticated.listGroupsForOrganization).not.toHaveBeenCalled();
    await unauthenticated.app.close();

    const authorized = createServer();
    const malformed = await authorized.app.inject({
      method: "GET", url: `/v1/alert-groups?project_id=${projectId}&cursor=invalid`
    });
    expect(malformed.statusCode).toBe(400);
    expect(authorized.listGroupsForOrganization).not.toHaveBeenCalled();
    await authorized.app.close();
  });

  it("lists safe group metadata and applies the cursor to the same project", async () => {
    const group = {
      group_id: groupId, kind: "direct" as const, project_id: projectId, alert_id: memberId,
      root_incident_id: memberId, channel: "slack" as const, status: "delivered" as const,
      member_count: 100, created_at: createdAt, delivered_at: createdAt
    };
    const { app, listGroupsForOrganization } = createServer({
      groups: { groups: [group], next_cursor: { created_at: createdAt, id: groupId } }
    });
    const first = await app.inject({
      method: "GET", url: `/v1/alert-groups?project_id=${projectId}&limit=1`,
      headers: { authorization: "Bearer dbundle_mem_test" }
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().groups).toEqual([group]);
    expect(first.json()).not.toHaveProperty("payload");
    const cursor = first.json().next_cursor as string;
    const next = await app.inject({
      method: "GET", url: `/v1/alert-groups?project_id=${projectId}&limit=1&cursor=${cursor}`,
      headers: { authorization: "Bearer dbundle_mem_test" }
    });
    expect(next.statusCode).toBe(200);
    expect(listGroupsForOrganization).toHaveBeenLastCalledWith({
      organization_id: organizationId, project_id: projectId, limit: 1,
      before: { created_at: createdAt, id: groupId }
    });
    await app.close();
  });

  it("returns only a scoped group's safe members and hides missing groups", async () => {
    const group = {
      group_id: groupId, kind: "email_digest" as const, project_id: projectId,
      alert_id: null, root_incident_id: null, channel: "email" as const,
      status: "pending" as const, member_count: 1, created_at: createdAt, delivered_at: null
    };
    const { app, getGroupForOrganization } = createServer({
      detail: { group, members: [{ incident_id: memberId, condition_type: "new_incident", created_at: createdAt }], next_cursor: null }
    });
    const response = await app.inject({
      method: "GET", url: `/v1/alert-groups/email_digest/${groupId}?project_id=${projectId}`,
      headers: { authorization: "Bearer dbundle_mem_test" }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ group, members: [{ incident_id: memberId, condition_type: "new_incident", created_at: createdAt }], next_cursor: null });
    expect(getGroupForOrganization).toHaveBeenCalledWith(expect.objectContaining({
      organization_id: organizationId, project_id: projectId, kind: "email_digest", group_id: groupId
    }));
    await app.close();
  });
});
