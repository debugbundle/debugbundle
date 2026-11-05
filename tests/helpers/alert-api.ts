import { vi } from "vitest";
import { createApiServer } from "../../apps/api/src/server.ts";
import { mockedObject, type MockedMethods } from "./vitest.ts";

export type ApiServerDependencies = Parameters<typeof createApiServer>[0];
type AuthRateLimiterDependency = MockedMethods<
  NonNullable<ApiServerDependencies["authRateLimiter"]>
>;
type AuditLoggingDependency = MockedMethods<NonNullable<ApiServerDependencies["auditLogging"]>>;
type MemberAuthDependency = MockedMethods<ApiServerDependencies["memberAuth"]>;
type AlertManagementDependency = MockedMethods<
  NonNullable<ApiServerDependencies["alertManagement"]>
>;
type BillingManagementDependency = MockedMethods<
  NonNullable<ApiServerDependencies["billingManagement"]>
>;
type SlackManagementDependency = MockedMethods<
  NonNullable<ApiServerDependencies["slackManagement"]>
>;
type ProjectManagementDependency = MockedMethods<
  NonNullable<ApiServerDependencies["projectManagement"]>
>;

export const defaultProjectAccess = {
  project_id: "00000000-0000-4000-8000-000000000001",
  organization_id: "org_123",
  owner_user_id: "usr_owner",
  owner_email: "owner@example.com",
  relationship: "owned",
  effective_role: "owner",
  organization_plan: "team"
} as const;

export function createServer(
  overrides: {
    authRateLimiter?: Partial<AuthRateLimiterDependency>;
    auditLogging?: AuditLoggingDependency | undefined;
    memberAuth?: MemberAuthDependency | undefined;
    projectManagement?: ProjectManagementDependency | undefined;
    alertManagement?: AlertManagementDependency | undefined;
    billingManagement?: BillingManagementDependency | undefined;
    slackManagement?: SlackManagementDependency | undefined;
  } = {}
): ReturnType<typeof createApiServer> {
  const hasAlertManagementOverride = Object.prototype.hasOwnProperty.call(
    overrides,
    "alertManagement"
  );
  const hasSlackManagementOverride = Object.prototype.hasOwnProperty.call(
    overrides,
    "slackManagement"
  );

  return createApiServer({
    ingestionPersistence: {
      persistAndEnqueue: vi.fn()
    },
    ingestionMetadata: {
      resolveProjectByTokenHash: vi.fn()
    },
    ...(overrides.authRateLimiter === undefined
      ? {}
      : {
          authRateLimiter: {
            claimRequest:
              overrides.authRateLimiter.claimRequest ??
              vi.fn().mockResolvedValue({
                allowed: true,
                limit: 100,
                remaining: 99,
                retry_after_ms: 0
              })
          }
        }),
    memberAuth:
      overrides.memberAuth ??
      mockedObject<ApiServerDependencies["memberAuth"]>({
        resolveMemberByTokenHash: vi
          .fn()
          .mockResolvedValue({ member_id: "usr_123", organization_id: "org_123" })
      }),
    projectManagement:
      overrides.projectManagement ??
      mockedObject<NonNullable<ApiServerDependencies["projectManagement"]>>({
        resolveProjectAccessForUser: vi.fn().mockResolvedValue(defaultProjectAccess),
        listProjectsForUser: vi.fn().mockResolvedValue([]),
        createProjectForUser: vi.fn().mockResolvedValue(null),
        updateProjectForUser: vi.fn().mockResolvedValue(null),
        deleteProjectForUser: vi.fn().mockResolvedValue(null)
      }),
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
      listIncidentLogsForOrganization: vi.fn().mockResolvedValue([]),
      listServicesForOrganization: vi.fn().mockResolvedValue([])
    },
    objectStoreReader: {
      getObject: vi.fn()
    },
    webhookDelivery: {
      listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] })
    },
    ...(overrides.auditLogging === undefined ? {} : { auditLogging: overrides.auditLogging }),
    ...(overrides.billingManagement === undefined
      ? {}
      : { billingManagement: overrides.billingManagement }),
    alertManagement: hasAlertManagementOverride
      ? overrides.alertManagement
      : mockedObject<NonNullable<ApiServerDependencies["alertManagement"]>>({
          listAlertsForOrganization: vi.fn().mockResolvedValue([]),
          createAlertForOrganization: vi.fn().mockResolvedValue(null),
          updateAlertForOrganization: vi.fn().mockResolvedValue(null),
          deleteAlertForOrganization: vi.fn().mockResolvedValue(null)
        }),
    slackManagement: hasSlackManagementOverride
      ? overrides.slackManagement
      : mockedObject<NonNullable<ApiServerDependencies["slackManagement"]>>({
          listSlackDestinationsForProjectInOrganization: vi.fn().mockResolvedValue([]),
          getSlackDestinationForOrganization: vi.fn().mockResolvedValue(null),
          upsertSlackDestinationForOrganization: vi.fn().mockResolvedValue({
            slack_destination_id: "sd_123"
          }),
          deleteSlackDestinationForProjectInOrganization: vi.fn().mockResolvedValue(null)
        })
  });
}
