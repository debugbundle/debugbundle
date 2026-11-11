import { vi } from "vitest";
import { createApiServer } from "../../apps/api/src/server.js";
import { mockedObject, type MockedMethods } from "./vitest.js";

export type ApiServerDependencies = Parameters<typeof createApiServer>[0];
export type AuthRateLimiterDependency = MockedMethods<
  NonNullable<ApiServerDependencies["authRateLimiter"]>
>;
export type AuditLoggingDependency = MockedMethods<
  NonNullable<ApiServerDependencies["auditLogging"]>
>;
export type MemberAuthDependency = MockedMethods<ApiServerDependencies["memberAuth"]>;
export type WebAuthDependency = MockedMethods<NonNullable<ApiServerDependencies["webAuth"]>>;
export type TokenManagementDependency = MockedMethods<ApiServerDependencies["tokenManagement"]>;
export type ProjectManagementDependency = MockedMethods<
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

export function createTokenApiServer(
  overrides: {
    authRateLimiter?: Partial<AuthRateLimiterDependency>;
    auditLogging?: Partial<AuditLoggingDependency>;
    memberAuth?: MemberAuthDependency;
    webAuth?: Partial<WebAuthDependency>;
    projectManagement?: ProjectManagementDependency;
    tokenManagement?: TokenManagementDependency;
    organizationManagement?: ApiServerDependencies["organizationManagement"];
    referrals?: ApiServerDependencies["referrals"];
    reportDefinitions?: ApiServerDependencies["reportDefinitions"];
    reportAllowance?: ApiServerDependencies["reportAllowance"];
    reportRuns?: ApiServerDependencies["reportRuns"];
    improvementReviews?: ApiServerDependencies["improvementReviews"];
    improvementReviewsEnabled?: boolean;
    reportGenerationEnabled?: boolean;
    reportContent?: ApiServerDependencies["reportContent"];
    reportPdf?: ApiServerDependencies["reportPdf"];
    reportEmail?: ApiServerDependencies["reportEmail"];
    reportDashboardBaseUrl?: string;
    organizationEmails?: ApiServerDependencies["organizationEmails"];
    incidentRetrieval?: Partial<ApiServerDependencies["incidentRetrieval"]>;
    objectStoreReader?: ApiServerDependencies["objectStoreReader"];
    accountManagement?: ApiServerDependencies["accountManagement"];
  } = {}
): ReturnType<typeof createApiServer> {
  return createApiServer({
    ...(overrides.accountManagement === undefined
      ? {}
      : { accountManagement: overrides.accountManagement }),
    ...(overrides.reportPdf === undefined ? {} : { reportPdf: overrides.reportPdf }),
    ...(overrides.reportAllowance === undefined
      ? {}
      : { reportAllowance: overrides.reportAllowance }),
    ...(overrides.reportEmail === undefined ? {} : { reportEmail: overrides.reportEmail }),
    ...(overrides.reportDashboardBaseUrl === undefined
      ? {}
      : { reportDashboardBaseUrl: overrides.reportDashboardBaseUrl }),
    ...(overrides.reportContent === undefined ? {} : { reportContent: overrides.reportContent }),
    ...(overrides.reportGenerationEnabled === undefined
      ? {}
      : { reportGenerationEnabled: overrides.reportGenerationEnabled }),
    ...(overrides.reportRuns === undefined ? {} : { reportRuns: overrides.reportRuns }),
    ...(overrides.reportDefinitions === undefined
      ? {}
      : { reportDefinitions: overrides.reportDefinitions }),
    ...(overrides.referrals === undefined ? {} : { referrals: overrides.referrals }),
    ...(overrides.organizationManagement === undefined
      ? {}
      : { organizationManagement: overrides.organizationManagement }),
    ...(overrides.organizationEmails === undefined
      ? {}
      : { organizationEmails: overrides.organizationEmails }),
    ...(overrides.improvementReviews === undefined
      ? {}
      : { improvementReviews: overrides.improvementReviews }),
    ...(overrides.improvementReviewsEnabled === undefined
      ? {}
      : { improvementReviewsEnabled: overrides.improvementReviewsEnabled }),
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
    webAuth: mockedObject<NonNullable<ApiServerDependencies["webAuth"]>>({
      requestEmailCode: vi.fn(),
      verifyEmailCode: vi.fn(),
      beginGithubAuth: vi.fn(),
      completeGithubAuth: vi.fn(),
      acceptInviteForSession: vi.fn(),
      resolveSessionByToken: vi.fn().mockResolvedValue(null),
      revokeSessionByToken: vi.fn().mockResolvedValue(false),
      ...overrides.webAuth
    }),
    tokenManagement:
      overrides.tokenManagement ??
      mockedObject<ApiServerDependencies["tokenManagement"]>({
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
      ...overrides.incidentRetrieval
    },
    objectStoreReader: {
      getObject: vi.fn(),
      ...overrides.objectStoreReader
    },
    webhookDelivery: {
      listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] }),
      retryDeliveryForOrganization: vi.fn().mockResolvedValue(null)
    },
    ...(overrides.auditLogging === undefined
      ? {}
      : {
          auditLogging: {
            createAuditLog:
              overrides.auditLogging.createAuditLog ?? vi.fn().mockResolvedValue(undefined)
          }
        })
  });
}
