import { vi } from "vitest";

import { createApiServer } from "../../apps/api/src/server.ts";
import { mockedObject, type MockedMethods } from "./vitest.ts";

type ApiServerDependencies = Parameters<typeof createApiServer>[0];
type AuthRateLimiterDependency = MockedMethods<
  NonNullable<ApiServerDependencies["authRateLimiter"]>
>;
type AuditLoggingDependency = MockedMethods<NonNullable<ApiServerDependencies["auditLogging"]>>;
type MemberAuthDependency = MockedMethods<ApiServerDependencies["memberAuth"]>;
type WebAuthDependency = MockedMethods<NonNullable<ApiServerDependencies["webAuth"]>>;
export type BillingManagementDependency = MockedMethods<
  NonNullable<ApiServerDependencies["billingManagement"]>
>;
type BillingAdminDependency = MockedMethods<NonNullable<ApiServerDependencies["billingAdmin"]>>;

export function createBillingServer(
  overrides: {
    authRateLimiter?: Partial<AuthRateLimiterDependency>;
    auditLogging?: AuditLoggingDependency | undefined;
    memberAuth?: Partial<MemberAuthDependency>;
    webAuth?: Partial<WebAuthDependency>;
    billingManagement?: BillingManagementDependency | undefined;
    billingAdmin?: Partial<BillingAdminDependency>;
  } = {}
): ReturnType<typeof createApiServer> {
  const hasBillingOverride = Object.prototype.hasOwnProperty.call(overrides, "billingManagement");
  const hasBillingAdminOverride = Object.prototype.hasOwnProperty.call(overrides, "billingAdmin");

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
                limit: 30,
                remaining: 29,
                retry_after_ms: 0
              })
          }
        }),
    memberAuth: {
      resolveMemberByTokenHash: vi.fn().mockResolvedValue(null),
      ...overrides.memberAuth
    } as ApiServerDependencies["memberAuth"],
    webAuth: mockedObject<NonNullable<ApiServerDependencies["webAuth"]>>({
      requestEmailCode: vi.fn(),
      verifyEmailCode: vi.fn(),
      beginGithubAuth: vi.fn(),
      completeGithubAuth: vi.fn(),
      acceptInviteForSession: vi.fn(),
      revokeSessionByToken: vi.fn(),
      resolveSessionByToken: vi.fn().mockResolvedValue(null),
      ...overrides.webAuth
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
      listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] }),
      retryDeliveryForOrganization: vi.fn().mockResolvedValue(null)
    },
    ...(overrides.auditLogging === undefined ? {} : { auditLogging: overrides.auditLogging }),
    ...(hasBillingOverride ? { billingManagement: overrides.billingManagement } : {}),
    ...(hasBillingAdminOverride
      ? {
          billingAdmin:
            overrides.billingAdmin === undefined
              ? undefined
              : {
                  isOperatorAllowed:
                    overrides.billingAdmin.isOperatorAllowed ?? vi.fn().mockReturnValue(false),
                  overrideOrganizationBilling:
                    overrides.billingAdmin.overrideOrganizationBilling ?? vi.fn()
                }
        }
      : {})
  });
}
