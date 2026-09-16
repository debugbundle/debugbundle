import { vi } from "vitest";
import type { createApiServer } from "../../apps/api/src/server.js";
import { mockedObject, type MockedMethods } from "./vitest.js";

type ApiServerDependencies = Parameters<typeof createApiServer>[0];
type CapturePolicyManagementDependency = MockedMethods<
  NonNullable<ApiServerDependencies["capturePolicyManagement"]>
>;
type CaptureRuleManagementDependency = MockedMethods<
  NonNullable<ApiServerDependencies["captureRuleManagement"]>
>;
type AccountAnalyticsDependency = MockedMethods<
  NonNullable<ApiServerDependencies["accountAnalytics"]>
>;

export function createBaseDependencies(
  overrides: {
    persistAndEnqueue?: ApiServerDependencies["ingestionPersistence"]["persistAndEnqueue"];
    resolveProjectByTokenHash?: ApiServerDependencies["ingestionMetadata"]["resolveProjectByTokenHash"];
    capturePolicyManagement?: CapturePolicyManagementDependency;
    captureRuleManagement?: CaptureRuleManagementDependency;
    accountAnalytics?: AccountAnalyticsDependency;
    billingManagement?: ApiServerDependencies["billingManagement"];
  } = {}
): Parameters<typeof createApiServer>[0] {
  return {
    ingestionPersistence: {
      persistAndEnqueue:
        overrides.persistAndEnqueue ??
        vi.fn().mockResolvedValue({ object_key: "raw-events/p/k.json.gz" })
    },
    ingestionMetadata: {
      resolveProjectByTokenHash:
        overrides.resolveProjectByTokenHash ??
        vi
          .fn()
          .mockResolvedValue({
            project_id: "proj_123",
            organization_id: "org_123",
            organization_plan: "free"
          })
    },
    memberAuth: {
      resolveMemberByTokenHash: vi
        .fn()
        .mockResolvedValue({ member_id: "mem_123", organization_id: "org_123" })
    } as ApiServerDependencies["memberAuth"],
    tokenManagement: mockedObject<ApiServerDependencies["tokenManagement"]>({
      listProjectTokensForOrganization: vi.fn().mockResolvedValue([]),
      createProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      listMemberTokensForOrganization: vi.fn().mockResolvedValue([]),
      createMemberTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeMemberTokenForOrganization: vi.fn().mockResolvedValue(null)
    }),
    incidentRetrieval: {
      listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
      getIncidentForOrganization: vi.fn().mockResolvedValue(null),
      listIncidentLogsForOrganization: vi.fn().mockResolvedValue([])
    },
    objectStoreReader: { getObject: vi.fn() },
    webhookDelivery: {
      listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] })
    },
    ...(overrides.capturePolicyManagement !== undefined
      ? { capturePolicyManagement: overrides.capturePolicyManagement }
      : {}),
    ...(overrides.captureRuleManagement !== undefined
      ? { captureRuleManagement: overrides.captureRuleManagement }
      : {}),
    ...(overrides.accountAnalytics !== undefined
      ? { accountAnalytics: overrides.accountAnalytics }
      : {}),
    ...(overrides.billingManagement !== undefined
      ? { billingManagement: overrides.billingManagement }
      : {})
  };
}
