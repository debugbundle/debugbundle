import { vi } from "vitest";

import { createApiServer } from "../../apps/api/src/server.ts";
import { mockedObject, type MockedMethods } from "./vitest.ts";

type ApiServerDependencies = Parameters<typeof createApiServer>[0];
type WebhookDeliveryDependency = MockedMethods<ApiServerDependencies["webhookDelivery"]>;
type MemberAuthDependency = MockedMethods<ApiServerDependencies["memberAuth"]>;
type IncidentRetrievalDependency = MockedMethods<ApiServerDependencies["incidentRetrieval"]>;
type ObjectStoreReaderDependency = MockedMethods<ApiServerDependencies["objectStoreReader"]>;
type TokenManagementDependency = MockedMethods<ApiServerDependencies["tokenManagement"]>;
type ProbeManagementDependency = MockedMethods<
  NonNullable<ApiServerDependencies["probeManagement"]>
>;
type IngestionRateLimiterDependency = MockedMethods<
  NonNullable<ApiServerDependencies["ingestionRateLimiter"]>
>;
type BillingManagementDependency = MockedMethods<
  NonNullable<ApiServerDependencies["billingManagement"]>
>;
type ProjectManagementDependency = MockedMethods<
  NonNullable<ApiServerDependencies["projectManagement"]>
>;
type AccountAnalyticsDependency = MockedMethods<
  NonNullable<ApiServerDependencies["accountAnalytics"]>
>;
type IngestionRejectionDiagnosticsDependency = MockedMethods<
  NonNullable<ApiServerDependencies["ingestionRejectionDiagnostics"]>
>;

export function createWebhookDeliveryDependency(): WebhookDeliveryDependency {
  return mockedObject<ApiServerDependencies["webhookDelivery"]>({
    listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] })
  });
}

export function createMemberAuthDependency(): MemberAuthDependency {
  return mockedObject<ApiServerDependencies["memberAuth"]>({
    resolveMemberByTokenHash: vi
      .fn()
      .mockResolvedValue({ member_id: "mem_123", organization_id: "org_123" })
  });
}

export function createIncidentRetrievalDependency(): IncidentRetrievalDependency {
  return mockedObject<ApiServerDependencies["incidentRetrieval"]>({
    listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
    getIncidentForOrganization: vi.fn().mockResolvedValue(null),
    listServicesForOrganization: vi.fn().mockResolvedValue([]),
    listIncidentLogsForOrganization: vi.fn().mockResolvedValue([])
  });
}

export function createObjectStoreReaderDependency(): ObjectStoreReaderDependency {
  return mockedObject<ApiServerDependencies["objectStoreReader"]>({
    getObject: vi.fn().mockRejectedValue(new Error("s3_object_not_found"))
  });
}

export function createTokenManagementDependency(): TokenManagementDependency {
  return mockedObject<ApiServerDependencies["tokenManagement"]>({
    listProjectTokensForOrganization: vi.fn().mockResolvedValue([]),
    createProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
    revokeProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
    listMemberTokensForOrganization: vi.fn().mockResolvedValue([]),
    createMemberTokenForOrganization: vi.fn().mockResolvedValue(null),
    revokeMemberTokenForOrganization: vi.fn().mockResolvedValue(null)
  });
}

export function createProjectManagementDependency(): ProjectManagementDependency {
  return mockedObject<NonNullable<ApiServerDependencies["projectManagement"]>>({
    resolveProjectAccessForUser: vi.fn().mockResolvedValue({
      project_id: "00000000-0000-4000-8000-000000000001",
      organization_id: "org_123",
      owner_user_id: "usr_owner",
      owner_email: "owner@example.com",
      relationship: "owned",
      effective_role: "owner",
      organization_plan: "team"
    }),
    listProjectsForUser: vi.fn().mockResolvedValue([]),
    createProjectForUser: vi.fn().mockResolvedValue(null),
    updateProjectForUser: vi.fn().mockResolvedValue(null),
    deleteProjectForUser: vi.fn().mockResolvedValue(null)
  });
}

export function createProbeManagementDependency(
  overrides: {
    listActiveProbesForProject?: ProbeManagementDependency["listActiveProbesForProject"];
  } = {}
): ProbeManagementDependency {
  return mockedObject<NonNullable<ApiServerDependencies["probeManagement"]>>({
    listActiveProbesForProject:
      overrides.listActiveProbesForProject ?? vi.fn().mockResolvedValue([]),
    listActiveProbesForProjectInOrganization: vi
      .fn()
      .mockResolvedValue({ organization_plan: "solo", activations: [] }),
    createProbeActivationForProjectInOrganization: vi.fn().mockResolvedValue(null),
    deactivateProbeActivationForProjectInOrganization: vi.fn().mockResolvedValue(null)
  });
}

export function createIngestionRateLimiterDependency(
  overrides: {
    claimEvents?: IngestionRateLimiterDependency["claimEvents"];
  } = {}
): IngestionRateLimiterDependency {
  return mockedObject<NonNullable<ApiServerDependencies["ingestionRateLimiter"]>>({
    claimEvents:
      overrides.claimEvents ??
      vi.fn().mockResolvedValue({
        allowed: true,
        limit: 1_000,
        remaining: 999,
        retry_after_ms: 0
      })
  });
}

export function createBillingManagementDependency(
  overrides: {
    getBillingSummaryForOrganization?: BillingManagementDependency["getBillingSummaryForOrganization"];
    incrementOrgUsageCounter?: BillingManagementDependency["incrementOrgUsageCounter"];
    incrementProjectUsageCounter?: BillingManagementDependency["incrementProjectUsageCounter"];
  } = {}
): BillingManagementDependency {
  return mockedObject<NonNullable<ApiServerDependencies["billingManagement"]>>({
    getBillingSummaryForOrganization:
      overrides.getBillingSummaryForOrganization ??
      vi.fn().mockResolvedValue({
        usage_window: {
          starts_at: "2026-03-01T00:00:00.000Z",
          ends_at: "2026-04-01T00:00:00.000Z"
        },
        allowances: {
          monthly_bundle_requests: { used: 0, limit: 25 },
          monthly_raw_ingested_events: {
            used: 0,
            limit: 750
          },
          retained_bundle_cap: { used: 0, limit: 5 },
          monthly_remote_activations: { used: 0, limit: 0 },
          monthly_alert_deliveries: { used: 0, limit: 25 },
          monthly_webhook_deliveries: { used: 0, limit: 100 }
        }
      }),
    incrementOrgUsageCounter:
      overrides.incrementOrgUsageCounter ?? vi.fn().mockResolvedValue(undefined),
    incrementProjectUsageCounter:
      overrides.incrementProjectUsageCounter ?? vi.fn().mockResolvedValue(undefined),
    createCheckoutLink: vi.fn().mockResolvedValue(null),
    createPortalLink: vi.fn().mockResolvedValue(null)
  });
}

export function createAccountAnalyticsDependency(
  overrides: {
    recordMetricDeltas?: AccountAnalyticsDependency["recordMetricDeltas"];
  } = {}
): AccountAnalyticsDependency {
  return mockedObject<NonNullable<ApiServerDependencies["accountAnalytics"]>>({
    recordMetricDeltas: overrides.recordMetricDeltas ?? vi.fn().mockResolvedValue("recorded")
  });
}

export function createIngestionRejectionDiagnosticsDependency(
  overrides: {
    recordRejectedDiagnostics?: IngestionRejectionDiagnosticsDependency["recordRejectedDiagnostics"];
  } = {}
): IngestionRejectionDiagnosticsDependency {
  return mockedObject<NonNullable<ApiServerDependencies["ingestionRejectionDiagnostics"]>>({
    recordRejectedDiagnostics:
      overrides.recordRejectedDiagnostics ?? vi.fn().mockResolvedValue(undefined)
  });
}
