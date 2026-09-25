import { describe, expect, it, vi } from "vitest";

import { createPostgresAlertGroupInspectionStore } from "../../../packages/storage/src/alert-group-inspection.js";

const projectId = "00000000-0000-4000-8000-000000000001";
const organizationId = "00000000-0000-4000-8000-000000000002";
const groupId = "00000000-0000-4000-8000-000000000003";
const incidentId = "00000000-0000-4000-8000-000000000004";
const memberId = "00000000-0000-4000-8000-000000000005";
const createdAt = "2026-09-24 10:00:00+00";

function directRow(overrides: Record<string, unknown> = {}) {
  return {
    group_id: groupId, kind: "direct", project_id: projectId,
    alert_id: memberId, root_incident_id: incidentId, channel: "slack",
    status: "delivered", member_count: "2", created_at: createdAt,
    delivered_at: createdAt, ...overrides
  };
}

function emailRow(overrides: Record<string, unknown> = {}) {
  return directRow({
    kind: "email_digest", alert_id: null, root_incident_id: null,
    channel: "email", status: "pending", delivered_at: null, ...overrides
  });
}

function storeWithRows(...results: unknown[][]) {
  const query = vi.fn();
  for (const rows of results) query.mockResolvedValueOnce({ rows });
  return { store: createPostgresAlertGroupInspectionStore({ query }), query };
}

describe("alert group inspection read model", () => {
  it("rejects a project outside the organization before reading any group", async () => {
    const { store, query } = storeWithRows([{ allowed: false }]);
    expect(await store.listGroupsForOrganization({
      organization_id: organizationId, project_id: projectId, limit: 10
    })).toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("returns a bounded keyset page of direct and email groups", async () => {
    const { store, query } = storeWithRows(
      [{ allowed: true }], [directRow(), emailRow({ group_id: memberId })]
    );
    const page = await store.listGroupsForOrganization({
      organization_id: organizationId, project_id: projectId, limit: 1,
      before: { created_at: createdAt, id: incidentId }
    });
    expect(page?.groups).toEqual([{ ...directRow(), member_count: 2 }]);
    expect(page?.next_cursor).toEqual({ created_at: createdAt, id: groupId });
    expect(query.mock.calls[1]?.[1]).toEqual([projectId, createdAt, incidentId, 2, organizationId]);
    expect(query.mock.calls[1]?.[0]).toContain("root.project_id = d.project_id");
  });

  it("uses a bounded default page size and terminates the cursor at the last page", async () => {
    const { store, query } = storeWithRows([{ allowed: true }], [emailRow()]);
    const page = await store.listGroupsForOrganization({
      organization_id: organizationId, project_id: projectId, limit: Number.NaN
    });
    expect(page?.groups[0]?.member_count).toBe(2);
    expect(page?.next_cursor).toBeNull();
    expect(query.mock.calls[1]?.[1]).toEqual([projectId, null, null, 51, organizationId]);
  });

  it("hides absent groups and returns a historical direct root when no members exist", async () => {
    const missing = storeWithRows([]);
    expect(await missing.store.getGroupForOrganization({
      organization_id: organizationId, project_id: projectId,
      kind: "direct", group_id: groupId, limit: 10
    })).toBeNull();

    const legacy = storeWithRows([directRow({ member_count: "1" })], []);
    const result = await legacy.store.getGroupForOrganization({
      organization_id: organizationId, project_id: projectId,
      kind: "direct", group_id: groupId, limit: 10
    });
    expect(result?.members).toEqual([{
      incident_id: incidentId, condition_type: "legacy", created_at: createdAt
    }]);
    expect(result?.next_cursor).toBeNull();
    expect(legacy.query.mock.calls[0]?.[0]).toContain("root.project_id = d.project_id");
  });

  it("paginates direct membership without reintroducing a legacy root", async () => {
    const row = { id: memberId, incident_id: incidentId, condition_type: "new_incident", created_at: createdAt };
    const { store, query } = storeWithRows([directRow()], [row, { ...row, id: groupId }]);
    const result = await store.getGroupForOrganization({
      organization_id: organizationId, project_id: projectId,
      kind: "direct", group_id: groupId, limit: 1,
      after: { created_at: createdAt, id: incidentId }
    });
    expect(result?.members).toEqual([{
      incident_id: incidentId, condition_type: "new_incident", created_at: createdAt
    }]);
    expect(result?.next_cursor).toEqual({ created_at: createdAt, id: memberId });
    expect(query.mock.calls[1]?.[1]).toEqual([groupId, createdAt, incidentId, 2, projectId, organizationId]);
    expect(query.mock.calls[1]?.[0]).toContain("p.organization_id = $6::uuid");
  });

  it("reads email digest members through the same safe page contract", async () => {
    const { store, query } = storeWithRows([emailRow()], [{
      id: memberId, incident_id: incidentId, condition_type: "severity_threshold", created_at: createdAt
    }]);
    const result = await store.getGroupForOrganization({
      organization_id: organizationId, project_id: projectId,
      kind: "email_digest", group_id: groupId, limit: 999
    });
    expect(result?.group).toEqual({ ...emailRow(), member_count: 2 });
    expect(result?.members).toEqual([{
      incident_id: incidentId, condition_type: "severity_threshold", created_at: createdAt
    }]);
    expect(result?.next_cursor).toBeNull();
    expect(query.mock.calls[1]?.[1]).toEqual([groupId, null, null, 101, projectId, organizationId]);
  });
});
