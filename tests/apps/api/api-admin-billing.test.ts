import { describe, expect, it, vi } from "vitest";

import { createApiServer } from "../../../apps/api/src/server.ts";

type ApiServerDependencies = Parameters<typeof createApiServer>[0];

function createServer(overrides: {
  auditLogging?: ApiServerDependencies["auditLogging"];
  billingAdmin?: ApiServerDependencies["billingAdmin"];
  memberAuth?: Partial<ApiServerDependencies["memberAuth"]>;
} = {}): ReturnType<typeof createApiServer> {
  return createApiServer({
    ingestionPersistence: {
      persistAndEnqueue: vi.fn()
    },
    ingestionMetadata: {
      resolveProjectByTokenHash: vi.fn()
    },
    memberAuth: {
      resolveMemberByTokenHash: vi.fn().mockResolvedValue(null),
      ...overrides.memberAuth
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
      listIncidentLogsForOrganization: vi.fn().mockResolvedValue([]),
      listServicesForOrganization: vi.fn().mockResolvedValue([])
    },
    objectStoreReader: {
      getObject: vi.fn()
    },
    webhookDelivery: {
      listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] }),
      retryDeliveryForOrganization: vi.fn().mockResolvedValue(null)
    },
    ...(overrides.auditLogging === undefined ? {} : { auditLogging: overrides.auditLogging }),
    ...(overrides.billingAdmin === undefined ? {} : { billingAdmin: overrides.billingAdmin })
  });
}

describe("api admin billing routes", () => {
  it("should apply internal billing overrides for configured operators and audit the change", async (): Promise<void> => {
    const createAuditLog = vi.fn().mockResolvedValue(undefined);
    const billing = {
      plan: "team",
      stripe_customer_id: null,
      active_projects: 1,
      capacity_units: {
        total: 114,
        included: 15,
        additional_purchased: 99,
        pending_reduction: null
      },
      usage_window: {
        starts_at: "2026-06-01T00:00:00.000Z",
        ends_at: "2026-07-01T00:00:00.000Z"
      },
      allowances: {
        monthly_bundle_requests: { used: 0, limit: 114000 },
        monthly_raw_ingested_events: { used: 0, limit: 1140000 },
        retained_bundle_cap: { used: 0, limit: 45600 },
        monthly_remote_activations: { used: 0, limit: 5700 },
        monthly_alert_deliveries: { used: 0, limit: 34200 },
        monthly_webhook_deliveries: { used: 0, limit: 114000 }
      }
    };
    const overrideOrganizationBilling = vi.fn().mockResolvedValue(billing);
    const app = createServer({
      auditLogging: { createAuditLog },
      billingAdmin: {
        isOperatorAllowed: ({ email }) => email === "owen@example.com",
        overrideOrganizationBilling
      },
      memberAuth: {
        resolveMemberByTokenHash: vi.fn().mockResolvedValue({
          member_id: "usr_operator",
          organization_id: "org_operator",
          email: "owen@example.com",
          role: "owner"
        })
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/admin/billing/override",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        organization_id: "00000000-0000-4000-8000-000000000123",
        plan: "team",
        additional_capacity_units: 99,
        reason: "Internal launch testing account"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ billing });
    expect(overrideOrganizationBilling).toHaveBeenCalledWith({
      organization_id: "00000000-0000-4000-8000-000000000123",
      plan: "team",
      additional_capacity_units: 99,
      now: expect.any(String)
    });
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: "00000000-0000-4000-8000-000000000123",
        actor_user_id: "usr_operator",
        action: "billing.admin_override",
        status: "success",
        metadata: expect.objectContaining({
          plan: "team",
          additional_capacity_units: 99,
          reason: "Internal launch testing account"
        })
      })
    );
  });

  it("should reject billing overrides from non-operator accounts", async (): Promise<void> => {
    const overrideOrganizationBilling = vi.fn();
    const app = createServer({
      billingAdmin: {
        isOperatorAllowed: () => false,
        overrideOrganizationBilling
      },
      memberAuth: {
        resolveMemberByTokenHash: vi.fn().mockResolvedValue({
          member_id: "usr_regular",
          organization_id: "org_regular",
          email: "regular@example.com",
          role: "owner"
        })
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/admin/billing/override",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        organization_id: "00000000-0000-4000-8000-000000000123",
        plan: "team",
        additional_capacity_units: 99,
        reason: "Internal launch testing account"
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "forbidden" });
    expect(overrideOrganizationBilling).not.toHaveBeenCalled();
  });
});
