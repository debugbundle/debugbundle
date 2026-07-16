import { describe, expect, it, vi } from "vitest";

import type { ApiDependencies } from "../../../apps/api/src/api-types.js";
import { createApiServer } from "../../../apps/api/src/server.js";
import type { AnalyticsSavedFunnel } from "../../../packages/shared-types/src/index.js";

const PROJECT_ID = "00000000-0000-0000-0000-000000000001";
const savedFunnel: AnalyticsSavedFunnel = {
  project_id: PROJECT_ID,
  funnel_key: "checkout",
  display_name: "Checkout",
  steps: [
    { step_key: "cart", display_name: "Cart" },
    { step_key: "payment", display_name: "Payment" }
  ],
  created_at: "2026-07-11T10:00:00.000Z",
  updated_at: "2026-07-11T10:00:00.000Z",
  archived_at: null
};

function createApp(
  input: {
    role?: "owner" | "admin" | "member";
    plan?: "free" | "solo" | "team";
    management?: ApiDependencies["analyticsSavedFunnels"];
    auditLogging?: ApiDependencies["auditLogging"];
  } = {}
) {
  return createApiServer({
    ingestionPersistence: { persistAndEnqueue: vi.fn() },
    ingestionMetadata: { resolveProjectByTokenHash: vi.fn() },
    memberAuth: {
      resolveMemberByTokenHash: vi.fn().mockResolvedValue({
        member_id: "usr_owner",
        organization_id: "org_123",
        role: "owner",
        revoked_at: null,
        expires_at: null
      })
    },
    tokenManagement: {
      listProjectTokensForOrganization: vi.fn().mockResolvedValue([]),
      createProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      listMemberTokensForOrganization: vi.fn().mockResolvedValue([]),
      createMemberTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeMemberTokenForOrganization: vi.fn().mockResolvedValue(null)
    },
    incidentRetrieval: {
      listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
      getIncidentForOrganization: vi.fn().mockResolvedValue(null),
      listIncidentLogsForOrganization: vi.fn().mockResolvedValue([])
    },
    objectStoreReader: { getObject: vi.fn() },
    webhookDelivery: { listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue(null) },
    projectManagement: {
      resolveProjectAccessForUser: vi.fn().mockResolvedValue({
        project_id: PROJECT_ID,
        organization_id: "org_123",
        owner_user_id: "usr_owner",
        owner_email: "owner@example.com",
        relationship: input.role === "member" ? "shared" : "owned",
        effective_role: input.role ?? "owner",
        organization_plan: input.plan ?? "solo"
      }),
      listProjectsForOrganization: vi.fn().mockResolvedValue([]),
      createProjectForOrganization: vi.fn(),
      updateProjectForOrganization: vi.fn(),
      deleteProjectForOrganization: vi.fn()
    },
    analyticsSavedFunnels: input.management,
    auditLogging: input.auditLogging
  });
}

describe("analytics saved funnel routes", () => {
  it("lists active saved funnels for authorized project members", async () => {
    const listSavedFunnelsForProject = vi.fn().mockResolvedValue([savedFunnel]);
    const app = createApp({
      role: "member",
      plan: "team",
      management: createManagement({ listSavedFunnelsForProject })
    });

    const response = await app.inject({
      method: "GET",
      url: `/v1/projects/${PROJECT_ID}/analytics/saved-funnels`,
      headers: { authorization: "Bearer dbundle_mem_test_token" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ funnels: [savedFunnel] });
    expect(listSavedFunnelsForProject).toHaveBeenCalledWith({
      organization_id: "org_123",
      project_id: PROJECT_ID
    });
  });

  it("creates, updates, and archives definitions for owners with audit records", async () => {
    const createAuditLog = vi.fn().mockResolvedValue(undefined);
    const management = createManagement({
      createSavedFunnelForProject: vi.fn().mockResolvedValue({
        status: "created",
        funnel: savedFunnel
      }),
      updateSavedFunnelForProject: vi.fn().mockResolvedValue({
        ...savedFunnel,
        display_name: "Primary checkout"
      }),
      archiveSavedFunnelForProject: vi.fn().mockResolvedValue({
        ...savedFunnel,
        archived_at: "2026-07-11T11:00:00.000Z"
      })
    });
    const app = createApp({ management, auditLogging: { createAuditLog } });
    const headers = { authorization: "Bearer dbundle_mem_test_token" };

    const created = await app.inject({
      method: "POST",
      url: `/v1/projects/${PROJECT_ID}/analytics/saved-funnels`,
      headers,
      payload: {
        funnel_key: "checkout",
        display_name: "Checkout",
        steps: savedFunnel.steps
      }
    });
    const updated = await app.inject({
      method: "PATCH",
      url: `/v1/projects/${PROJECT_ID}/analytics/saved-funnels/checkout`,
      headers,
      payload: { display_name: "Primary checkout" }
    });
    const archived = await app.inject({
      method: "DELETE",
      url: `/v1/projects/${PROJECT_ID}/analytics/saved-funnels/checkout`,
      headers
    });

    expect(created.statusCode).toBe(201);
    expect(updated.statusCode).toBe(200);
    expect(archived.statusCode).toBe(200);
    expect(createAuditLog.mock.calls.map((call) => (call[0] as { action: string }).action)).toEqual(
      [
        "analytics_saved_funnel.create",
        "analytics_saved_funnel.update",
        "analytics_saved_funnel.archive"
      ]
    );
  });

  it("allows a Free owner to create the included saved funnel", async () => {
    const createSavedFunnelForProject = vi.fn().mockResolvedValue({
      status: "created",
      funnel: savedFunnel
    });
    const app = createApp({
      plan: "free",
      management: createManagement({ createSavedFunnelForProject })
    });

    const response = await app.inject({
      method: "POST",
      url: `/v1/projects/${PROJECT_ID}/analytics/saved-funnels`,
      headers: { authorization: "Bearer dbundle_mem_test_token" },
      payload: {
        funnel_key: "checkout",
        display_name: "Checkout",
        steps: savedFunnel.steps
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ funnel: savedFunnel });
    expect(createSavedFunnelForProject).toHaveBeenCalledOnce();
  });

  it("rejects malformed input, members, unavailable storage, duplicates, and limits", async () => {
    const headers = { authorization: "Bearer dbundle_mem_test_token" };
    const url = `/v1/projects/${PROJECT_ID}/analytics/saved-funnels`;
    const payload = {
      funnel_key: "checkout",
      display_name: "Checkout",
      steps: savedFunnel.steps
    };
    const member = createApp({ role: "member", plan: "team", management: createManagement() });
    const unavailable = createApp();
    const duplicate = createApp({
      management: createManagement({
        createSavedFunnelForProject: vi.fn().mockResolvedValue({ status: "funnel_key_taken" })
      })
    });
    const limited = createApp({
      management: createManagement({
        createSavedFunnelForProject: vi.fn().mockResolvedValue({ status: "limit_reached" })
      })
    });

    await expect(member.inject({ method: "POST", url, headers, payload })).resolves.toMatchObject({
      statusCode: 403
    });
    await expect(
      unavailable.inject({ method: "POST", url, headers, payload })
    ).resolves.toMatchObject({ statusCode: 404 });
    await expect(
      duplicate.inject({ method: "POST", url, headers, payload })
    ).resolves.toMatchObject({ statusCode: 409 });
    await expect(limited.inject({ method: "POST", url, headers, payload })).resolves.toMatchObject({
      statusCode: 409
    });
    await expect(
      limited.inject({ method: "POST", url, headers, payload: { ...payload, steps: [] } })
    ).resolves.toMatchObject({ statusCode: 400 });
  });

  it("audits failed update and archive attempts", async () => {
    const createAuditLog = vi.fn().mockResolvedValue(undefined);
    const app = createApp({
      management: createManagement({
        updateSavedFunnelForProject: vi.fn().mockResolvedValue(null),
        archiveSavedFunnelForProject: vi.fn().mockResolvedValue(null)
      }),
      auditLogging: { createAuditLog }
    });
    const headers = { authorization: "Bearer dbundle_mem_test_token" };
    const itemUrl = `/v1/projects/${PROJECT_ID}/analytics/saved-funnels/missing`;

    const updated = await app.inject({
      method: "PATCH",
      url: itemUrl,
      headers,
      payload: { display_name: "Missing" }
    });
    const archived = await app.inject({ method: "DELETE", url: itemUrl, headers });

    expect(updated.statusCode).toBe(404);
    expect(archived.statusCode).toBe(404);
    expect(createAuditLog.mock.calls.map(([record]) => record as Record<string, unknown>)).toEqual([
      expect.objectContaining({
        action: "analytics_saved_funnel.update",
        status: "failure",
        metadata: expect.objectContaining({ reason: "not_found" })
      }),
      expect.objectContaining({
        action: "analytics_saved_funnel.archive",
        status: "failure",
        metadata: expect.objectContaining({ reason: "not_found" })
      })
    ]);
  });
});

function createManagement(
  overrides: Partial<NonNullable<ApiDependencies["analyticsSavedFunnels"]>> = {}
): NonNullable<ApiDependencies["analyticsSavedFunnels"]> {
  return {
    listSavedFunnelsForProject: vi.fn().mockResolvedValue([]),
    createSavedFunnelForProject: vi.fn(),
    updateSavedFunnelForProject: vi.fn(),
    archiveSavedFunnelForProject: vi.fn(),
    ...overrides
  };
}
