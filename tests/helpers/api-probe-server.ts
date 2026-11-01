import { vi } from "vitest";

import { createApiServer } from "../../apps/api/src/server.ts";
import { mockedObject, type MockedMethods } from "./vitest.ts";

type ApiServerDependencies = Parameters<typeof createApiServer>[0];
type IngestionMetadataDependency = MockedMethods<ApiServerDependencies["ingestionMetadata"]>;
type CapturePolicyManagementDependency = MockedMethods<
  NonNullable<ApiServerDependencies["capturePolicyManagement"]>
>;
type BillingManagementDependency = MockedMethods<
  NonNullable<ApiServerDependencies["billingManagement"]>
>;
type ProbeManagementDependency = MockedMethods<
  NonNullable<ApiServerDependencies["probeManagement"]>
>;
type ProjectManagementDependency = MockedMethods<
  NonNullable<ApiServerDependencies["projectManagement"]>
>;
type MemberAuthDependency = MockedMethods<ApiServerDependencies["memberAuth"]>;

export function createProbeRouteServer(
  overrides: {
    ingestionMetadata?: IngestionMetadataDependency;
    capturePolicyManagement?: CapturePolicyManagementDependency;
    analyticsSettingsManagement?: ApiServerDependencies["analyticsSettingsManagement"];
    billingManagement?: Partial<BillingManagementDependency>;
    probeManagement?: ProbeManagementDependency;
    projectManagement?: Partial<ProjectManagementDependency>;
    operationalEmailDelivery?: ApiServerDependencies["operationalEmailDelivery"];
    memberAuth?: MemberAuthDependency;
    authRateLimiter?: ApiServerDependencies["authRateLimiter"];
  } = {}
): ReturnType<typeof createApiServer> {
  const billingManagement =
    overrides.billingManagement === undefined
      ? undefined
      : mockedObject<NonNullable<ApiServerDependencies["billingManagement"]>>({
          getBillingSummaryForOrganization:
            overrides.billingManagement.getBillingSummaryForOrganization,
          ...(overrides.billingManagement.getBillingSummaryForProject === undefined
            ? {}
            : {
                getBillingSummaryForProject: overrides.billingManagement.getBillingSummaryForProject
              }),
          createCheckoutLink:
            overrides.billingManagement.createCheckoutLink ?? vi.fn().mockResolvedValue(null),
          createPortalLink:
            overrides.billingManagement.createPortalLink ?? vi.fn().mockResolvedValue(null)
        });

  return createApiServer({
    ingestionPersistence: {
      persistAndEnqueue: vi.fn()
    },
    ...(overrides.authRateLimiter === undefined
      ? {}
      : { authRateLimiter: overrides.authRateLimiter }),
    ingestionMetadata:
      overrides.ingestionMetadata ??
      mockedObject<ApiServerDependencies["ingestionMetadata"]>({
        resolveProjectByTokenHash: vi
          .fn()
          .mockResolvedValue({ project_id: "proj_123", organization_plan: "free" })
      }),
    memberAuth:
      overrides.memberAuth ??
      mockedObject<ApiServerDependencies["memberAuth"]>({
        resolveMemberByTokenHash: vi
          .fn()
          .mockResolvedValue({ member_id: "usr_123", organization_id: "org_123" })
      }),
    tokenManagement: mockedObject<ApiServerDependencies["tokenManagement"]>({
      listProjectTokensForOrganization: vi.fn().mockResolvedValue([]),
      createProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      listMemberTokensForOrganization: vi.fn().mockResolvedValue([]),
      createMemberTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeMemberTokenForOrganization: vi.fn().mockResolvedValue(null)
    }),
    projectManagement: {
      resolveProjectAccessForUser:
        overrides.projectManagement?.resolveProjectAccessForUser ??
        vi.fn().mockResolvedValue({
          project_id: "00000000-0000-4000-8000-000000000001",
          organization_id: "org_owner",
          owner_user_id: "usr_owner",
          owner_email: "owner@example.com",
          relationship: "shared",
          sharing_state: "shared_with_you",
          effective_role: "member",
          organization_plan: "solo"
        }),
      listProjectsForOrganization: vi.fn().mockResolvedValue([]),
      createProjectForOrganization: vi.fn().mockResolvedValue(null),
      updateProjectForOrganization: vi.fn().mockResolvedValue(null),
      deleteProjectForOrganization: vi.fn().mockResolvedValue(null)
    },
    probeManagement:
      overrides.probeManagement ??
      mockedObject<NonNullable<ApiServerDependencies["probeManagement"]>>({
        listActiveProbesForProject: vi.fn().mockResolvedValue([]),
        listActiveProbesForProjectInOrganization: vi
          .fn()
          .mockResolvedValue({ organization_plan: "solo", activations: [] }),
        createProbeActivationForProjectInOrganization: vi.fn().mockResolvedValue({
          organization_plan: "solo",
          activation: {
            activation_id: "11111111-1111-4111-8111-111111111111",
            label_pattern: "checkout.*",
            service: "*",
            environment: "*",
            expires_at: "2026-03-11T01:00:00.000Z",
            trigger_expires_at: "2026-03-12T01:00:00.000Z"
          },
          trigger_token: "dbundle_probe_test"
        }),
        deactivateProbeActivationForProjectInOrganization: vi.fn().mockResolvedValue({
          organization_plan: "solo",
          deactivated: {
            activation_id: "11111111-1111-4111-8111-111111111111",
            deactivated_at: "2026-03-11T00:10:00.000Z"
          }
        })
      }),
    incidentRetrieval: {
      listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
      getIncidentForOrganization: vi.fn().mockResolvedValue(null),
      listIncidentLogsForOrganization: vi.fn().mockResolvedValue([])
    },
    objectStoreReader: {
      getObject: vi.fn()
    },
    webhookDelivery: {
      listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] })
    },
    operationalEmailDelivery: overrides.operationalEmailDelivery,
    capturePolicyManagement: overrides.capturePolicyManagement,
    analyticsSettingsManagement: overrides.analyticsSettingsManagement,
    billingManagement
  });
}
