import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createApiServer } from "../../../apps/api/src/server.ts";
import { GITHUB_APP_INSTALL_STATE_COOKIE_NAME, SESSION_COOKIE_NAME } from "../../../packages/auth/src/index.js";
import { mockedObject, type MockedMethods } from "../../helpers/vitest.ts";

type ApiServerDependencies = Parameters<typeof createApiServer>[0];
type MemberAuthDependency = MockedMethods<ApiServerDependencies["memberAuth"]>;
type WebAuthDependency = MockedMethods<NonNullable<ApiServerDependencies["webAuth"]>>;
type ProjectManagementDependency = MockedMethods<NonNullable<ApiServerDependencies["projectManagement"]>>;
type BillingManagementDependency = MockedMethods<NonNullable<ApiServerDependencies["billingManagement"]>>;
type GitHubManagementDependency = MockedMethods<NonNullable<ApiServerDependencies["githubManagement"]>>;

const InstallUrlResponseSchema = z.object({
  install_url: z.string().url()
});

function createServer(overrides: {
  memberAuth?: MemberAuthDependency;
  webAuth?: Partial<WebAuthDependency>;
  projectManagement?: Partial<ProjectManagementDependency>;
  billingManagement?: Partial<BillingManagementDependency>;
  githubManagement?: Partial<GitHubManagementDependency>;
  authRateLimiter?: ApiServerDependencies["authRateLimiter"];
} = {}) {
  return createApiServer({
    ingestionPersistence: { persistAndEnqueue: vi.fn() },
    ingestionMetadata: { resolveProjectByTokenHash: vi.fn() },
    ...(overrides.authRateLimiter === undefined
      ? {}
      : { authRateLimiter: overrides.authRateLimiter }),
    memberAuth:
      overrides.memberAuth ??
      mockedObject<ApiServerDependencies["memberAuth"]>({
        resolveMemberByTokenHash: vi.fn().mockResolvedValue({
          member_id: "usr_123",
          organization_id: "org_123",
          role: "owner"
        })
      }),
    ...(overrides.webAuth === undefined
      ? {}
      : {
          webAuth: mockedObject<NonNullable<ApiServerDependencies["webAuth"]>>({
            requestEmailCode: vi.fn(),
            verifyEmailCode: vi.fn(),
            beginGithubAuth: vi.fn(),
            completeGithubAuth: vi.fn(),
            acceptInviteForSession: vi.fn(),
            revokeSessionByToken: vi.fn(),
            ...overrides.webAuth
          })
        }),
    tokenManagement: mockedObject<ApiServerDependencies["tokenManagement"]>({
      listProjectTokensForOrganization: vi.fn(),
      createProjectTokenForOrganization: vi.fn(),
      revokeProjectTokenForOrganization: vi.fn(),
      listMemberTokensForOrganization: vi.fn(),
      createMemberTokenForOrganization: vi.fn(),
      revokeMemberTokenForOrganization: vi.fn()
    }),
    incidentRetrieval: {
      listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
      getIncidentForOrganization: vi.fn().mockResolvedValue(null),
      listIncidentLogsForOrganization: vi.fn().mockResolvedValue([]),
      listServicesForOrganization: vi.fn().mockResolvedValue([])
    },
    objectStoreReader: { getObject: vi.fn() },
    webhookDelivery: { listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] }) },
    projectManagement: mockedObject<NonNullable<ApiServerDependencies["projectManagement"]>>({
      resolveProjectAccessForUser: vi.fn().mockResolvedValue({
        project_id: "00000000-0000-4000-8000-000000000001",
        organization_id: "org_123",
        owner_user_id: "usr_123",
        owner_email: "owner@example.com",
        relationship: "owned",
        effective_role: "owner",
        organization_plan: "solo"
      }),
      listProjectsForOrganization: vi.fn().mockResolvedValue([]),
      createProjectForOrganization: vi.fn(),
      updateProjectForOrganization: vi.fn(),
      deleteProjectForOrganization: vi.fn(),
      ...overrides.projectManagement
    }),
    billingManagement: mockedObject<NonNullable<ApiServerDependencies["billingManagement"]>>({
      getBillingSummaryForOrganization: vi.fn().mockResolvedValue({ plan: "solo" }),
      getBillingSummaryForProject: vi.fn().mockResolvedValue({ plan: "solo" }),
      createCheckoutLink: vi.fn(),
      createPortalLink: vi.fn(),
      increaseCapacity: vi.fn(),
      scheduleCapacityReduction: vi.fn(),
      cancelCapacityReduction: vi.fn(),
      ...overrides.billingManagement
    }),
    githubManagement: mockedObject<NonNullable<ApiServerDependencies["githubManagement"]>>({
        getInstallUrl: vi.fn().mockResolvedValue("https://github.com/apps/debugbundle-automation/installations/new"),
        getInstallationForOrganization: vi.fn().mockResolvedValue({
          id: "ghi_1",
          installation_id: 123,
          account_login: "debugbundle",
          account_type: "Organization",
          status: "active",
          created_at: "2026-03-26T00:00:00.000Z",
          updated_at: "2026-03-26T00:00:00.000Z"
        }),
        disconnectInstallationForOrganization: vi.fn().mockResolvedValue(true),
        listRepositoriesForOrganization: vi.fn().mockResolvedValue([]),
        getProjectRepoForOrganization: vi.fn().mockResolvedValue(null),
        listProjectDeliveriesForOrganization: vi.fn().mockResolvedValue([]),
        retryProjectDeliveryForOrganization: vi.fn().mockResolvedValue(null),
        setProjectRepoForOrganization: vi.fn().mockResolvedValue({
          id: "pgr_1",
          project_id: "proj_1",
          installation_id: "ghi_1",
          repo_owner: "debugbundle",
          repo_name: "app",
          default_branch: "main",
          created_at: "2026-03-26T00:00:00.000Z",
          updated_at: "2026-03-26T00:00:00.000Z"
        }),
        removeProjectRepoForOrganization: vi.fn().mockResolvedValue(true),
        listProjectRulesForOrganization: vi.fn().mockResolvedValue([]),
        getProjectRuleForOrganization: vi.fn().mockResolvedValue(null),
        createProjectRuleForOrganization: vi.fn().mockResolvedValue(null),
        updateProjectRuleForOrganization: vi.fn().mockResolvedValue(null),
        deleteProjectRuleForOrganization: vi.fn().mockResolvedValue(false),
        completeGithubInstallationForOrganization: vi.fn().mockResolvedValue({
          id: "ghi_1",
          installation_id: 123,
          account_login: "debugbundle",
          account_type: "Organization",
          status: "active",
          created_at: "2026-03-26T00:00:00.000Z",
          updated_at: "2026-03-26T00:00:00.000Z"
        }),
        verifyWebhookSignature: vi.fn().mockReturnValue(true),
        processWebhook: vi.fn().mockResolvedValue(undefined),
      ...overrides.githubManagement
    })
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("api github routes", () => {
  it("lists installation status for authenticated callers on solo tiers", async () => {
    const githubManagement = {
      getInstallationForOrganization: vi.fn().mockResolvedValue({
        id: "ghi_1",
        installation_id: 123,
        account_login: "debugbundle",
        account_type: "Organization",
        status: "active",
        created_at: "2026-03-26T00:00:00.000Z",
        updated_at: "2026-03-26T00:00:00.000Z"
      }),
      disconnectInstallationForOrganization: vi.fn(),
      listRepositoriesForOrganization: vi.fn(),
      getProjectRepoForOrganization: vi.fn(),
      listProjectDeliveriesForOrganization: vi.fn().mockResolvedValue([]),
      retryProjectDeliveryForOrganization: vi.fn().mockResolvedValue(null),
      listProjectRulesForOrganization: vi.fn().mockResolvedValue([]),
      getProjectRuleForOrganization: vi.fn().mockResolvedValue(null),
      createProjectRuleForOrganization: vi.fn().mockResolvedValue(null),
      updateProjectRuleForOrganization: vi.fn().mockResolvedValue("rule_not_found"),
      deleteProjectRuleForOrganization: vi.fn().mockResolvedValue(false),
      setProjectRepoForOrganization: vi.fn(),
      removeProjectRepoForOrganization: vi.fn(),
      completeGithubInstallationForOrganization: vi.fn(),
      verifyWebhookSignature: vi.fn(),
      processWebhook: vi.fn()
    };
    const app = createServer({ githubManagement });

    const response = await app.inject({
      method: "GET",
      url: "/v1/github/installation",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().installation.account_login).toBe("debugbundle");
    expect(githubManagement.getInstallationForOrganization).toHaveBeenCalledWith({ organization_id: "org_123" });
  });

  it("returns a null installation when no github app is connected yet", async () => {
    const githubManagement = {
      getInstallationForOrganization: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({ githubManagement });

    const response = await app.inject({
      method: "GET",
      url: "/v1/github/installation",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ installation: null });
    expect(githubManagement.getInstallationForOrganization).toHaveBeenCalledWith({ organization_id: "org_123" });
  });

  it("returns the GitHub App install URL for authenticated callers on solo tiers", async () => {
    vi.stubEnv("GITHUB_APP_STATE_SECRET", "github-app-state-secret");
    const githubManagement = {
      getInstallUrl: vi.fn().mockResolvedValue("https://github.com/apps/debugbundle-automation/installations/new")
    };
    const app = createServer({ githubManagement });

    const response = await app.inject({
      method: "GET",
      url: "/v1/github/app/install-url",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    const responseBody = InstallUrlResponseSchema.parse(response.json());
    const installUrl = new URL(responseBody.install_url);
    expect(installUrl.origin).toBe("https://github.com");
    expect(installUrl.pathname).toBe("/apps/debugbundle-automation/installations/new");
    expect(installUrl.searchParams.get("state")).toEqual(expect.any(String));
    expect(githubManagement.getInstallUrl).toHaveBeenCalledTimes(1);
    expect(String(response.headers["set-cookie"])).toContain(`${GITHUB_APP_INSTALL_STATE_COOKIE_NAME}=`);
  });

  it("rejects github installation routes when the organization tier lacks access", async () => {
    const app = createServer({
      billingManagement: {
        getBillingSummaryForOrganization: vi.fn().mockResolvedValue({ plan: "free" }),
        createCheckoutLink: vi.fn(),
        createPortalLink: vi.fn()
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/github/installation",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "upgrade_required" });
  });

  it("sets project repo assignments and completes installation callbacks", async () => {
    vi.stubEnv("GITHUB_APP_STATE_SECRET", "github-app-state-secret");
    const projectId = "00000000-0000-4000-8000-000000000001";
    const githubManagement = {
      getInstallationForOrganization: vi.fn(),
      disconnectInstallationForOrganization: vi.fn(),
      listRepositoriesForOrganization: vi.fn(),
      getProjectRepoForOrganization: vi.fn(),
      listProjectDeliveriesForOrganization: vi.fn().mockResolvedValue([]),
      retryProjectDeliveryForOrganization: vi.fn().mockResolvedValue(null),
      listProjectRulesForOrganization: vi.fn().mockResolvedValue([]),
      getProjectRuleForOrganization: vi.fn().mockResolvedValue(null),
      createProjectRuleForOrganization: vi.fn().mockResolvedValue(null),
      updateProjectRuleForOrganization: vi.fn().mockResolvedValue("rule_not_found"),
      deleteProjectRuleForOrganization: vi.fn().mockResolvedValue(false),
      setProjectRepoForOrganization: vi.fn().mockResolvedValue({
        id: "pgr_1",
        project_id: projectId,
        installation_id: "ghi_1",
        repo_owner: "debugbundle",
        repo_name: "app",
        default_branch: "main",
        created_at: "2026-03-26T00:00:00.000Z",
        updated_at: "2026-03-26T00:00:00.000Z"
      }),
      removeProjectRepoForOrganization: vi.fn(),
      completeGithubInstallationForOrganization: vi.fn().mockResolvedValue({ id: "ghi_1" }),
      verifyWebhookSignature: vi.fn(),
      processWebhook: vi.fn()
    };
    const app = createServer({
      githubManagement,
      webAuth: {
        resolveSessionByToken: vi.fn().mockResolvedValue({
          session_id: "ses_123",
          user_id: "usr_123",
          organization_id: "org_123"
        })
      }
    });

    const repoResponse = await app.inject({
      method: "PUT",
      url: `/v1/projects/${projectId}/github/repo`,
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        owner: "debugbundle",
        repo: "app"
      }
    });
    const installUrlResponse = await app.inject({
      method: "GET",
      url: `/v1/github/app/install-url?return_to=${encodeURIComponent(`/projects/${projectId}/github`)}&project_id=${projectId}`,
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      cookies: {
        [SESSION_COOKIE_NAME]: "dbundle_session"
      }
    });
    const installUrlResponseBody = InstallUrlResponseSchema.parse(installUrlResponse.json());
    const installUrlFromResponse = new URL(installUrlResponseBody.install_url);
    const installState = installUrlFromResponse.searchParams.get("state");

    expect(installUrlResponse.statusCode).toBe(200);
    expect(installUrlFromResponse.origin).toBe("https://github.com");
    expect(installUrlFromResponse.pathname).toBe("/apps/debugbundle-automation/installations/new");
    expect(installState).toEqual(expect.any(String));
    expect(String(installUrlResponse.headers["set-cookie"])).toContain(`${GITHUB_APP_INSTALL_STATE_COOKIE_NAME}=`);

    const callbackResponse = await app.inject({
      method: "GET",
      url: `/v1/github/app/callback?installation_id=123&state=${encodeURIComponent(installState ?? "")}`,
      cookies: {
        [GITHUB_APP_INSTALL_STATE_COOKIE_NAME]: installState ?? ""
      }
    });

    expect(repoResponse.statusCode).toBe(200);
    expect(repoResponse.json().repo.repo_name).toBe("app");
    expect(githubManagement.setProjectRepoForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      project_id: projectId,
      created_by_user_id: "usr_123",
      owner: "debugbundle",
      repo: "app"
    });
    expect(callbackResponse.statusCode).toBe(302);
    expect(callbackResponse.headers.location).toBe(`http://localhost:5291/projects/${projectId}/github`);
    expect(String(callbackResponse.headers["set-cookie"])).toContain(`${GITHUB_APP_INSTALL_STATE_COOKIE_NAME}=;`);
    expect(githubManagement.completeGithubInstallationForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      installation_id: 123
    });
  });

  it("returns a null project repo when no repository is assigned yet", async () => {
    const projectId = "00000000-0000-4000-8000-000000000001";
    const githubManagement = {
      getProjectRepoForOrganization: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({ githubManagement });

    const response = await app.inject({
      method: "GET",
      url: `/v1/projects/${projectId}/github/repo`,
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ repo: null });
    expect(githubManagement.getProjectRepoForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      project_id: projectId
    });
  });

  it("rejects github installation callbacks with invalid signed state", async () => {
    vi.stubEnv("GITHUB_APP_STATE_SECRET", "github-app-state-secret");
    const githubManagement = {
      completeGithubInstallationForOrganization: vi.fn()
    };
    const app = createServer({
      githubManagement,
      webAuth: {
        resolveSessionByToken: vi.fn().mockResolvedValue({
          session_id: "ses_123",
          user_id: "usr_123",
          organization_id: "org_123"
        })
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/github/app/callback?installation_id=123&state=not-a-valid-state",
      cookies: {
        [GITHUB_APP_INSTALL_STATE_COOKIE_NAME]: "not-a-valid-state"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "invalid_state" });
    expect(githubManagement.completeGithubInstallationForOrganization).not.toHaveBeenCalled();
  });

  it("blocks non-owner members from github mutation routes", async () => {
    const projectId = "00000000-0000-4000-8000-000000000001";
    const githubManagement = {
      getInstallationForOrganization: vi.fn(),
      disconnectInstallationForOrganization: vi.fn().mockResolvedValue(true),
      listRepositoriesForOrganization: vi.fn(),
      getProjectRepoForOrganization: vi.fn(),
      listProjectDeliveriesForOrganization: vi.fn().mockResolvedValue([]),
      retryProjectDeliveryForOrganization: vi.fn().mockResolvedValue(null),
      setProjectRepoForOrganization: vi.fn().mockResolvedValue(null),
      removeProjectRepoForOrganization: vi.fn().mockResolvedValue(true),
      listProjectRulesForOrganization: vi.fn().mockResolvedValue([]),
      getProjectRuleForOrganization: vi.fn().mockResolvedValue(null),
      createProjectRuleForOrganization: vi.fn().mockResolvedValue(null),
      updateProjectRuleForOrganization: vi.fn().mockResolvedValue(null),
      deleteProjectRuleForOrganization: vi.fn().mockResolvedValue(true),
      completeGithubInstallationForOrganization: vi.fn(),
      verifyWebhookSignature: vi.fn(),
      processWebhook: vi.fn()
    };
    const app = createServer({
      memberAuth: {
        resolveMemberByTokenHash: vi.fn().mockResolvedValue({
          member_id: "usr_123",
          organization_id: "org_123",
          role: "member"
        })
      },
      projectManagement: {
        resolveProjectAccessForUser: vi.fn().mockResolvedValue({
          project_id: projectId,
          organization_id: "org_123",
          owner_user_id: "usr_owner",
          owner_email: "owner@example.com",
          relationship: "shared",
          effective_role: "member",
          organization_plan: "solo"
        }),
        listProjectsForOrganization: vi.fn().mockResolvedValue([]),
        createProjectForOrganization: vi.fn(),
        updateProjectForOrganization: vi.fn(),
        deleteProjectForOrganization: vi.fn()
      },
      githubManagement
    });

    const installationDelete = await app.inject({
      method: "DELETE",
      url: "/v1/github/installation",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });
    const repoPut = await app.inject({
      method: "PUT",
      url: `/v1/projects/${projectId}/github/repo`,
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        owner: "debugbundle",
        repo: "app"
      }
    });
    const repoDelete = await app.inject({
      method: "DELETE",
      url: `/v1/projects/${projectId}/github/repo`,
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });
    const createRule = await app.inject({
      method: "POST",
      url: `/v1/projects/${projectId}/github/rules`,
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        name: "High severity incidents",
        event_types: ["bundle.created"],
        environments: ["production"],
        services: ["checkout-api"],
        severity_min: "high",
        bundle_type: "failure",
        incident_status: "new_only",
        cooldown_seconds: 300,
        enabled: true
      }
    });

    expect(installationDelete.statusCode).toBe(403);
    expect(installationDelete.json()).toEqual({ error: "forbidden" });
    expect(repoPut.statusCode).toBe(403);
    expect(repoPut.json()).toEqual({ error: "forbidden" });
    expect(repoDelete.statusCode).toBe(403);
    expect(repoDelete.json()).toEqual({ error: "forbidden" });
    expect(createRule.statusCode).toBe(201);

    expect(githubManagement.disconnectInstallationForOrganization).not.toHaveBeenCalled();
    expect(githubManagement.setProjectRepoForOrganization).not.toHaveBeenCalled();
    expect(githubManagement.removeProjectRepoForOrganization).not.toHaveBeenCalled();
    expect(githubManagement.createProjectRuleForOrganization).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: "org_123",
        project_id: projectId,
        created_by_user_id: "usr_123"
      })
    );
  });

  it("lists, creates, updates, and deletes github rules", async () => {
    const projectId = "00000000-0000-4000-8000-000000000001";
    const ruleId = "11111111-1111-4111-8111-111111111111";
    const githubManagement = {
      getInstallationForOrganization: vi.fn(),
      disconnectInstallationForOrganization: vi.fn(),
      listRepositoriesForOrganization: vi.fn(),
      getProjectRepoForOrganization: vi.fn(),
      setProjectRepoForOrganization: vi.fn(),
      removeProjectRepoForOrganization: vi.fn(),
      listProjectDeliveriesForOrganization: vi.fn().mockResolvedValue([]),
      retryProjectDeliveryForOrganization: vi.fn().mockResolvedValue(null),
      listProjectRulesForOrganization: vi.fn().mockResolvedValue([
        {
          rule_id: ruleId,
          project_id: projectId,
          name: "High severity incidents",
          enabled: true,
          event_types: ["bundle.created", "bundle.reopened"],
          environments: ["production"],
          services: ["checkout-api"],
          severity_min: "high",
          bundle_type: "failure",
          incident_status: "new_or_reopened",
          cooldown_seconds: 300,
          created_at: "2026-03-26T00:00:00.000Z",
          updated_at: "2026-03-26T00:00:00.000Z"
        }
      ]),
      getProjectRuleForOrganization: vi.fn().mockResolvedValue(null),
      createProjectRuleForOrganization: vi.fn().mockResolvedValue({
        rule_id: ruleId,
        project_id: projectId,
        name: "High severity incidents",
        enabled: true,
        event_types: ["bundle.created", "bundle.reopened"],
        environments: ["production"],
        services: ["checkout-api"],
        severity_min: "high",
        bundle_type: "failure",
        incident_status: "new_or_reopened",
        cooldown_seconds: 300,
        created_at: "2026-03-26T00:00:00.000Z",
        updated_at: "2026-03-26T00:00:00.000Z"
      }),
      updateProjectRuleForOrganization: vi.fn().mockResolvedValue({
        rule_id: ruleId,
        project_id: projectId,
        name: "Critical incidents only",
        enabled: false,
        event_types: ["bundle.created"],
        environments: ["production", "staging"],
        services: [],
        severity_min: "critical",
        bundle_type: "failure",
        incident_status: "new_only",
        cooldown_seconds: 900,
        created_at: "2026-03-26T00:00:00.000Z",
        updated_at: "2026-03-26T00:05:00.000Z"
      }),
      deleteProjectRuleForOrganization: vi.fn().mockResolvedValue(true),
      completeGithubInstallationForOrganization: vi.fn(),
      verifyWebhookSignature: vi.fn(),
      processWebhook: vi.fn()
    };
    const app = createServer({ githubManagement });

    const listResponse = await app.inject({
      method: "GET",
      url: `/v1/projects/${projectId}/github/rules`,
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });
    const createResponse = await app.inject({
      method: "POST",
      url: `/v1/projects/${projectId}/github/rules`,
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        name: "High severity incidents",
        event_types: ["bundle.created", "bundle.reopened"],
        environments: ["production"],
        services: ["checkout-api"],
        severity_min: "high",
        bundle_type: "failure",
        incident_status: "new_or_reopened",
        cooldown_seconds: 300,
        enabled: true
      }
    });
    const updateResponse = await app.inject({
      method: "PATCH",
      url: `/v1/projects/${projectId}/github/rules/${ruleId}`,
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        name: "Critical incidents only",
        severity_min: "critical",
        incident_status: "new_only",
        cooldown_seconds: 900,
        enabled: false
      }
    });
    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/v1/projects/${projectId}/github/rules/${ruleId}`,
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual({
      rules: [
        expect.objectContaining({
          rule_id: ruleId,
          name: "High severity incidents"
        })
      ]
    });
    expect(createResponse.statusCode).toBe(201);
    expect(updateResponse.statusCode).toBe(200);
    expect(deleteResponse.statusCode).toBe(204);
    expect(githubManagement.createProjectRuleForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      project_id: projectId,
      created_by_user_id: "usr_123",
      name: "High severity incidents",
      enabled: true,
      event_types: ["bundle.created", "bundle.reopened"],
      environments: ["production"],
      services: ["checkout-api"],
      severity_min: "high",
      bundle_type: "failure",
      incident_status: "new_or_reopened",
      cooldown_seconds: 300
    });
    expect(githubManagement.updateProjectRuleForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      project_id: projectId,
      rule_id: ruleId,
      actor_user_id: "usr_123",
      actor_role: "owner",
      name: "Critical incidents only",
      enabled: false,
      severity_min: "critical",
      incident_status: "new_only",
      cooldown_seconds: 900
    });
  });

  it("lists and retries github deliveries", async () => {
    const projectId = "00000000-0000-4000-8000-000000000001";
    const deliveryId = "22222222-2222-4222-8222-222222222222";
    const githubManagement = {
      getInstallationForOrganization: vi.fn(),
      disconnectInstallationForOrganization: vi.fn(),
      listRepositoriesForOrganization: vi.fn(),
      getProjectRepoForOrganization: vi.fn(),
      setProjectRepoForOrganization: vi.fn(),
      removeProjectRepoForOrganization: vi.fn(),
      listProjectRulesForOrganization: vi.fn().mockResolvedValue([]),
      getProjectRuleForOrganization: vi.fn().mockResolvedValue(null),
      createProjectRuleForOrganization: vi.fn().mockResolvedValue(null),
      updateProjectRuleForOrganization: vi.fn().mockResolvedValue("rule_not_found"),
      deleteProjectRuleForOrganization: vi.fn().mockResolvedValue(false),
      listProjectDeliveriesForOrganization: vi.fn().mockResolvedValue([
        {
          delivery_id: deliveryId,
          rule_id: "11111111-1111-4111-8111-111111111111",
          rule_name: "High severity incidents",
          incident_id: "33333333-3333-4333-8333-333333333333",
          improvement_id: null,
          target_title: "TypeError in checkout",
          status: "failed",
          attempt_count: 2,
          last_attempt_at: "2026-03-26T00:10:00.000Z",
          last_error: "Repository not found",
          github_status_code: 404,
          created_at: "2026-03-26T00:00:00.000Z"
        }
      ]),
      retryProjectDeliveryForOrganization: vi.fn().mockResolvedValue({
        delivery_id: deliveryId,
        rule_id: "11111111-1111-4111-8111-111111111111",
        rule_name: "High severity incidents",
        incident_id: "33333333-3333-4333-8333-333333333333",
        improvement_id: null,
        target_title: "TypeError in checkout",
        status: "retrying",
        attempt_count: 2,
        last_attempt_at: "2026-03-26T00:10:00.000Z",
        last_error: null,
        github_status_code: null,
        created_at: "2026-03-26T00:00:00.000Z"
      }),
      completeGithubInstallationForOrganization: vi.fn(),
      verifyWebhookSignature: vi.fn(),
      processWebhook: vi.fn()
    };
    const app = createServer({ githubManagement });

    const listResponse = await app.inject({
      method: "GET",
      url: `/v1/projects/${projectId}/github/deliveries?status=failed&limit=5`,
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });
    const retryResponse = await app.inject({
      method: "POST",
      url: `/v1/projects/${projectId}/github/deliveries/${deliveryId}/retry`,
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual({
      deliveries: [
        expect.objectContaining({
          delivery_id: deliveryId,
          status: "failed"
        })
      ]
    });
    expect(retryResponse.statusCode).toBe(200);
    expect(retryResponse.json()).toEqual({
      delivery: expect.objectContaining({
        delivery_id: deliveryId,
        status: "retrying"
      })
    });
    expect(githubManagement.listProjectDeliveriesForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      project_id: projectId,
      status: "failed",
      limit: 5
    });
    expect(githubManagement.retryProjectDeliveryForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      project_id: projectId,
      delivery_id: deliveryId,
      actor_user_id: "usr_123",
      actor_role: "owner"
    });
  });

  it("should rate limit github management reads per member", async (): Promise<void> => {
    const claimRequest = vi.fn().mockResolvedValue({
      allowed: false,
      limit: 100,
      remaining: 0,
      retry_after_ms: 12_000
    });
    const app = createServer({ authRateLimiter: { claimRequest } });

    const response = await app.inject({
      method: "GET",
      url: "/v1/github/installation",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(429);
    expect(response.json()).toEqual({ error: "rate_limited" });
    expect(response.headers["retry-after"]).toBe("12");
    expect(claimRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: "management-read",
        subject: "member:usr_123",
        limit: 200
      })
    );
  });
});
