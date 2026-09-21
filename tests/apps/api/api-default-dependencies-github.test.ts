import { describe, expect, it, vi } from "vitest";
import {
  createPostgresBillingStoreMock,
  createPostgresMetadataStoreMock,
  createPostgresWebhookDeliveryStoreMock,
  createPostgresGitHubStoreMock,
  createPostgresGitHubMarketplaceStoreMock,
  createIngestionMetadataServiceMock
} from "../../helpers/api-default-dependency-mocks.js";
import { createApiDependencies } from "../../../apps/api/src/default-dependencies.ts";

describe("api-default-dependency-mocks github", () => {
  it("should return github installation status branches before listing repositories", async (): Promise<void> => {
    const githubStore = {
      getGitHubInstallationForOrganization: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ installation_id: 1, status: "suspended" })
        .mockResolvedValueOnce({ installation_id: 1, status: "removed" })
        .mockResolvedValueOnce({ installation_id: 42, status: "active" }),
      deleteGitHubInstallationForOrganization: vi.fn(),
      getProjectGitHubRepoForOrganization: vi.fn(),
      listProjectGitHubDeliveriesForOrganization: vi.fn(),
      retryProjectGitHubDeliveryForOrganization: vi.fn(),
      listProjectGitHubRulesForOrganization: vi.fn(),
      getProjectGitHubRuleForOrganization: vi.fn(),
      createProjectGitHubRuleForOrganization: vi.fn(),
      updateProjectGitHubRuleForOrganization: vi.fn(),
      deleteProjectGitHubRuleForOrganization: vi.fn(),
      setProjectGitHubRepoForOrganization: vi.fn(),
      removeProjectGitHubRepoForOrganization: vi.fn()
    };
    createPostgresGitHubStoreMock.mockReturnValue(githubStore);
    const listRepositories = vi.fn().mockResolvedValue([{ id: 1, full_name: "debugbundle/app" }]);

    const deps = createApiDependencies({
      objectStore: {
        putObject: vi.fn(),
        getObject: vi.fn(),
        deleteObjectsByPrefix: vi.fn()
      },
      queue: { enqueue: vi.fn() },
      db: { query: vi.fn() },
      githubAppClient: {
        getInstallUrl: vi.fn(),
        listRepositories,
        retryDelivery: vi.fn(),
        getInstallationClient: vi.fn()
      } as never
    });

    await expect(
      deps.githubManagement?.listRepositoriesForOrganization({ organization_id: "org_123" })
    ).resolves.toBe("installation_not_found");
    await expect(
      deps.githubManagement?.listRepositoriesForOrganization({ organization_id: "org_123" })
    ).resolves.toBe("installation_suspended");
    await expect(
      deps.githubManagement?.listRepositoriesForOrganization({ organization_id: "org_123" })
    ).resolves.toBe("installation_removed");
    await expect(
      deps.githubManagement?.listRepositoriesForOrganization({ organization_id: "org_123" })
    ).resolves.toEqual([{ id: 1, full_name: "debugbundle/app" }]);
    expect(listRepositories).toHaveBeenCalledWith({ installationId: 42 });
  });

  it("should enqueue webhook test deliveries and support the null branch", async (): Promise<void> => {
    const queue = {
      enqueue: vi.fn()
    };
    const webhookDeliveryStore = {
      listDeliveriesForWebhookInOrganization: vi.fn(),
      createTestDeliveryForOrganization: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ delivery_id: "del_456", event_type: "verification.failed" }),
      listWebhooksForOrganization: vi.fn(),
      createWebhookForOrganization: vi.fn(),
      getWebhookForOrganization: vi.fn(),
      updateWebhookForOrganization: vi.fn(),
      deleteWebhookForOrganization: vi.fn()
    };
    createPostgresWebhookDeliveryStoreMock.mockReturnValue(webhookDeliveryStore);

    const deps = createApiDependencies({
      objectStore: {
        putObject: vi.fn(),
        getObject: vi.fn(),
        deleteObjectsByPrefix: vi.fn()
      },
      queue,
      db: {
        query: vi.fn()
      },
      frequencyCounter: { recordOccurrence: vi.fn() }
    });

    await expect(
      deps.webhookTesting.triggerTestDelivery({
        organization_id: "org_123",
        webhook_id: "wh_123",
        event_type: "verification.passed"
      })
    ).resolves.toBeNull();
    await expect(
      deps.webhookTesting.triggerTestDelivery({
        organization_id: "org_123",
        webhook_id: "wh_123",
        event_type: "verification.failed"
      })
    ).resolves.toEqual({ delivery_id: "del_456", event_type: "verification.failed" });

    expect(queue.enqueue).toHaveBeenCalledWith("deliver-webhook", {
      delivery_id: "del_456",
      attempt: 1
    });
    expect(createIngestionMetadataServiceMock).toHaveBeenCalled();
  });

  it("should create a default dispatch rule when assigning a repo to a project with no existing rules", async (): Promise<void> => {
    const githubStore = {
      getGitHubInstallationForOrganization: vi.fn().mockResolvedValue({
        id: "ghi_1",
        installation_id: 42,
        account_login: "testorg",
        account_type: "Organization",
        status: "active"
      }),
      upsertProjectGitHubRepoForOrganization: vi.fn().mockResolvedValue({
        id: "pgr_1",
        project_id: "proj_1",
        installation_id: "ghi_1",
        repo_owner: "testorg",
        repo_name: "myrepo",
        default_branch: "main",
        created_at: "2026-03-26T00:00:00.000Z",
        updated_at: "2026-03-26T00:00:00.000Z"
      }),
      listProjectGitHubRulesForOrganization: vi.fn().mockResolvedValue([]),
      createProjectGitHubRuleForOrganization: vi.fn().mockResolvedValue({
        rule_id: "rule_default",
        project_id: "proj_1",
        name: "Default triage rule",
        enabled: true,
        event_types: ["bundle.created", "bundle.reopened"],
        environments: [],
        services: [],
        severity_min: "high",
        bundle_type: null,
        incident_status: "new_or_reopened",
        cooldown_seconds: 300,
        created_at: "2026-03-26T00:00:00.000Z",
        updated_at: "2026-03-26T00:00:00.000Z"
      }),
      deleteGitHubInstallationForOrganization: vi.fn(),
      deleteProjectGitHubRepoForOrganization: vi.fn(),
      getProjectGitHubRepoForOrganization: vi.fn(),
      getProjectGitHubRuleForOrganization: vi.fn(),
      updateProjectGitHubRuleForOrganization: vi.fn(),
      deleteProjectGitHubRuleForOrganization: vi.fn(),
      listProjectGitHubDeliveriesForOrganization: vi.fn(),
      retryGitHubDispatchDelivery: vi.fn(),
      upsertGitHubInstallationForOrganization: vi.fn()
    };
    createPostgresGitHubStoreMock.mockReturnValue(githubStore);

    const githubAppClient = {
      getInstallUrl: vi
        .fn()
        .mockResolvedValue("https://github.com/apps/debugbundle-automation/installations/new"),
      getInstallation: vi.fn().mockResolvedValue({
        installation_id: 42,
        account_login: "testorg",
        account_type: "Organization" as const
      }),
      listRepositories: vi
        .fn()
        .mockResolvedValue([
          {
            id: 1,
            owner: "testorg",
            name: "myrepo",
            full_name: "testorg/myrepo",
            default_branch: "main",
            private: false
          }
        ]),
      verifyWebhookSignature: vi.fn().mockReturnValue(true)
    };

    const deps = createApiDependencies({
      objectStore: { putObject: vi.fn(), getObject: vi.fn(), deleteObjectsByPrefix: vi.fn() },
      queue: { enqueue: vi.fn() },
      db: { query: vi.fn() },
      githubAppClient
    });

    const result = await deps.githubManagement!.setProjectRepoForOrganization({
      organization_id: "org_1",
      project_id: "proj_1",
      created_by_user_id: "usr_1",
      owner: "testorg",
      repo: "myrepo"
    });

    expect(typeof result).not.toBe("string");
    expect(githubStore.listProjectGitHubRulesForOrganization).toHaveBeenCalledWith({
      organization_id: "org_1",
      project_id: "proj_1"
    });
    expect(githubStore.createProjectGitHubRuleForOrganization).toHaveBeenCalledWith({
      organization_id: "org_1",
      project_id: "proj_1",
      created_by_user_id: "usr_1",
      name: "Default triage rule",
      enabled: true,
      event_types: ["bundle.created", "bundle.reopened"],
      environments: [],
      services: [],
      severity_min: "high",
      bundle_type: null,
      incident_status: "new_or_reopened",
      cooldown_seconds: 300
    });
  });

  it("should not create a default dispatch rule when the project already has rules", async (): Promise<void> => {
    const githubStore = {
      getGitHubInstallationForOrganization: vi.fn().mockResolvedValue({
        id: "ghi_1",
        installation_id: 42,
        account_login: "testorg",
        account_type: "Organization",
        status: "active"
      }),
      upsertProjectGitHubRepoForOrganization: vi.fn().mockResolvedValue({
        id: "pgr_1",
        project_id: "proj_1",
        installation_id: "ghi_1",
        repo_owner: "testorg",
        repo_name: "myrepo",
        default_branch: "main",
        created_at: "2026-03-26T00:00:00.000Z",
        updated_at: "2026-03-26T00:00:00.000Z"
      }),
      listProjectGitHubRulesForOrganization: vi
        .fn()
        .mockResolvedValue([{ rule_id: "rule_existing", name: "Existing rule" }]),
      createProjectGitHubRuleForOrganization: vi.fn(),
      deleteGitHubInstallationForOrganization: vi.fn(),
      deleteProjectGitHubRepoForOrganization: vi.fn(),
      getProjectGitHubRepoForOrganization: vi.fn(),
      getProjectGitHubRuleForOrganization: vi.fn(),
      updateProjectGitHubRuleForOrganization: vi.fn(),
      deleteProjectGitHubRuleForOrganization: vi.fn(),
      listProjectGitHubDeliveriesForOrganization: vi.fn(),
      retryGitHubDispatchDelivery: vi.fn(),
      upsertGitHubInstallationForOrganization: vi.fn()
    };
    createPostgresGitHubStoreMock.mockReturnValue(githubStore);

    const githubAppClient = {
      getInstallUrl: vi
        .fn()
        .mockResolvedValue("https://github.com/apps/debugbundle-automation/installations/new"),
      getInstallation: vi.fn().mockResolvedValue({
        installation_id: 42,
        account_login: "testorg",
        account_type: "Organization" as const
      }),
      listRepositories: vi
        .fn()
        .mockResolvedValue([
          {
            id: 1,
            owner: "testorg",
            name: "myrepo",
            full_name: "testorg/myrepo",
            default_branch: "main",
            private: false
          }
        ]),
      verifyWebhookSignature: vi.fn().mockReturnValue(true)
    };

    const deps = createApiDependencies({
      objectStore: { putObject: vi.fn(), getObject: vi.fn(), deleteObjectsByPrefix: vi.fn() },
      queue: { enqueue: vi.fn() },
      db: { query: vi.fn() },
      githubAppClient
    });

    const result = await deps.githubManagement!.setProjectRepoForOrganization({
      organization_id: "org_1",
      project_id: "proj_1",
      created_by_user_id: "usr_1",
      owner: "testorg",
      repo: "myrepo"
    });

    expect(typeof result).not.toBe("string");
    expect(githubStore.listProjectGitHubRulesForOrganization).toHaveBeenCalled();
    expect(githubStore.createProjectGitHubRuleForOrganization).not.toHaveBeenCalled();
  });

  it("should map github installation and retry failure states", async (): Promise<void> => {
    const githubAppClient = {
      getInstallUrl: vi
        .fn()
        .mockResolvedValue("https://github.com/apps/debugbundle-automation/installations/new"),
      getInstallation: vi.fn(),
      listRepositories: vi
        .fn()
        .mockResolvedValue([
          {
            id: 1,
            owner: "debugbundle",
            name: "app",
            full_name: "debugbundle/app",
            default_branch: "main",
            private: false
          }
        ]),
      verifyWebhookSignature: vi.fn().mockReturnValue(true)
    };
    const buildDeps = (githubStore: Record<string, unknown>) => {
      createPostgresGitHubStoreMock.mockReturnValueOnce(githubStore);

      return createApiDependencies({
        objectStore: { putObject: vi.fn(), getObject: vi.fn(), deleteObjectsByPrefix: vi.fn() },
        queue: { enqueue: vi.fn() },
        db: { query: vi.fn() },
        githubAppClient
      });
    };

    const installationMissingDeps = buildDeps({
      getGitHubInstallationForOrganization: vi.fn().mockResolvedValue(null)
    });
    const installationSuspendedDeps = buildDeps({
      getGitHubInstallationForOrganization: vi.fn().mockResolvedValue({ status: "suspended" })
    });
    const installationRemovedDeps = buildDeps({
      getGitHubInstallationForOrganization: vi.fn().mockResolvedValue({ status: "removed" })
    });
    const retryRepoMissingDeps = buildDeps({
      getGitHubInstallationForOrganization: vi.fn().mockResolvedValue({ status: "active" }),
      getProjectGitHubRepoForOrganization: vi.fn().mockResolvedValue(null),
      retryProjectGitHubDeliveryForOrganization: vi.fn()
    });
    const retryMissingDeliveryDeps = buildDeps({
      getGitHubInstallationForOrganization: vi.fn().mockResolvedValue({ status: "active" }),
      getProjectGitHubRepoForOrganization: vi.fn().mockResolvedValue({ project_id: "proj_1" }),
      retryProjectGitHubDeliveryForOrganization: vi.fn().mockResolvedValue(null)
    });
    const retrySuccessDeps = buildDeps({
      getGitHubInstallationForOrganization: vi
        .fn()
        .mockResolvedValue({ status: "active", installation_id: 42 }),
      getProjectGitHubRepoForOrganization: vi.fn().mockResolvedValue({ project_id: "proj_1" }),
      retryProjectGitHubDeliveryForOrganization: vi.fn().mockResolvedValue({
        delivery_id: "del_123",
        status: "retrying"
      })
    });

    await expect(
      installationMissingDeps.githubManagement?.listRepositoriesForOrganization({
        organization_id: "org_1"
      })
    ).resolves.toBe("installation_not_found");
    await expect(
      installationSuspendedDeps.githubManagement?.listRepositoriesForOrganization({
        organization_id: "org_1"
      })
    ).resolves.toBe("installation_suspended");
    await expect(
      installationRemovedDeps.githubManagement?.listRepositoriesForOrganization({
        organization_id: "org_1"
      })
    ).resolves.toBe("installation_removed");
    await expect(
      retryRepoMissingDeps.githubManagement?.retryProjectDeliveryForOrganization({
        organization_id: "org_1",
        project_id: "proj_1",
        delivery_id: "del_123"
      })
    ).resolves.toBe("repo_not_found");
    await expect(
      retryMissingDeliveryDeps.githubManagement?.retryProjectDeliveryForOrganization({
        organization_id: "org_1",
        project_id: "proj_1",
        delivery_id: "del_123"
      })
    ).resolves.toBe("delivery_not_found");
    await expect(
      retrySuccessDeps.githubManagement?.retryProjectDeliveryForOrganization({
        organization_id: "org_1",
        project_id: "proj_1",
        delivery_id: "del_123"
      })
    ).resolves.toEqual({
      delivery_id: "del_123",
      status: "retrying"
    });
  });

  it("should map github rule creation and installation webhook branches", async (): Promise<void> => {
    const updateGitHubInstallationStatus = vi.fn().mockResolvedValue(undefined);
    const upsertGitHubInstallationForOrganization = vi.fn().mockResolvedValue({
      id: "ghi_1",
      installation_id: 42,
      account_login: "debugbundle",
      account_type: "Organization",
      status: "active"
    });
    const githubStore = {
      getProjectGitHubRepoForOrganization: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ project_id: "proj_limit" })
        .mockResolvedValueOnce({ project_id: "proj_created" }),
      listProjectGitHubRulesForOrganization: vi
        .fn()
        .mockResolvedValueOnce([{ rule_id: "one" }, { rule_id: "two" }, { rule_id: "three" }])
        .mockResolvedValueOnce([]),
      createProjectGitHubRuleForOrganization: vi
        .fn()
        .mockResolvedValue({ rule_id: "rule_created" }),
      updateGitHubInstallationStatus,
      upsertGitHubInstallationForOrganization,
      getGitHubInstallationForOrganization: vi.fn(),
      deleteGitHubInstallationForOrganization: vi.fn(),
      deleteProjectGitHubRepoForOrganization: vi.fn(),
      getProjectGitHubRuleForOrganization: vi.fn(),
      updateProjectGitHubRuleForOrganization: vi.fn(),
      deleteProjectGitHubRuleForOrganization: vi.fn(),
      listProjectGitHubDeliveriesForOrganization: vi.fn(),
      retryProjectGitHubDeliveryForOrganization: vi.fn(),
      upsertProjectGitHubRepoForOrganization: vi.fn()
    };
    const linkOrganizationToMarketplaceAccountByInstallationId = vi.fn().mockResolvedValue(null);
    createPostgresGitHubStoreMock.mockReturnValue(githubStore);
    createPostgresGitHubMarketplaceStoreMock.mockReturnValueOnce({
      isEventProcessed: vi.fn(),
      markEventProcessed: vi.fn(),
      upsertMarketplaceAccount: vi.fn(),
      linkOrganizationToMarketplaceAccountByInstallationId
    });
    createPostgresMetadataStoreMock.mockReturnValueOnce({
      ...createPostgresMetadataStoreMock.getMockImplementation?.()?.(),
      listProjectsForOrganization: vi
        .fn()
        .mockResolvedValueOnce([{ project_id: "proj_repo_missing" }])
        .mockResolvedValueOnce([])
    });
    createPostgresBillingStoreMock.mockReturnValueOnce({
      getBillingSummaryForOrganization: vi.fn().mockResolvedValue({ plan: "free" }),
      getBillingSummaryForProject: vi.fn(),
      incrementOrgUsageCounter: vi.fn()
    });
    const githubAppClient = {
      getInstallUrl: vi
        .fn()
        .mockResolvedValue("https://github.com/apps/debugbundle-automation/installations/new"),
      getInstallation: vi.fn().mockResolvedValue({
        installation_id: 42,
        account_login: "debugbundle",
        account_type: "Organization" as const
      }),
      listRepositories: vi.fn().mockResolvedValue([]),
      verifyWebhookSignature: vi.fn().mockReturnValue(true)
    };

    const deps = createApiDependencies({
      objectStore: { putObject: vi.fn(), getObject: vi.fn(), deleteObjectsByPrefix: vi.fn() },
      queue: { enqueue: vi.fn() },
      db: { query: vi.fn() },
      githubAppClient
    });

    await expect(
      deps.githubManagement?.createProjectRuleForOrganization({
        organization_id: "org_1",
        project_id: "proj_repo_missing",
        created_by_user_id: "user_1",
        name: "Rule",
        enabled: true,
        event_types: ["bundle.created"],
        environments: [],
        services: [],
        severity_min: "high",
        bundle_type: "failure",
        incident_status: "new_or_reopened",
        cooldown_seconds: 300
      })
    ).resolves.toBe("repo_not_found");
    await expect(
      deps.githubManagement?.createProjectRuleForOrganization({
        organization_id: "org_1",
        project_id: "proj_missing",
        created_by_user_id: "user_1",
        name: "Rule",
        enabled: true,
        event_types: ["bundle.created"],
        environments: [],
        services: [],
        severity_min: "high",
        bundle_type: "failure",
        incident_status: "new_or_reopened",
        cooldown_seconds: 300
      })
    ).resolves.toBe("project_not_found");
    await expect(
      deps.githubManagement?.createProjectRuleForOrganization({
        organization_id: "org_1",
        project_id: "proj_limit",
        created_by_user_id: "user_1",
        name: "Rule",
        enabled: true,
        event_types: ["bundle.created"],
        environments: [],
        services: [],
        severity_min: "high",
        bundle_type: "failure",
        incident_status: "new_or_reopened",
        cooldown_seconds: 300
      })
    ).resolves.toBe("rule_limit_reached");
    await expect(
      deps.githubManagement?.createProjectRuleForOrganization({
        organization_id: "org_1",
        project_id: "proj_created",
        created_by_user_id: "user_1",
        name: "Rule",
        enabled: true,
        event_types: ["bundle.created"],
        environments: [],
        services: [],
        severity_min: "high",
        bundle_type: "failure",
        incident_status: "new_or_reopened",
        cooldown_seconds: 300
      })
    ).resolves.toEqual({ rule_id: "rule_created" });
    await expect(
      deps.githubManagement?.completeGithubInstallationForOrganization({
        organization_id: "org_1",
        installation_id: 42
      })
    ).resolves.toEqual(
      expect.objectContaining({
        installation_id: 42,
        status: "active"
      })
    );
    expect(linkOrganizationToMarketplaceAccountByInstallationId).toHaveBeenCalledWith({
      organization_id: "org_1",
      installation_id: 42
    });

    expect(
      deps.githubManagement?.verifyWebhookSignature({
        rawBody: Buffer.from("{}"),
        signature: "sha256=test"
      })
    ).toBe(true);

    await deps.githubManagement?.processWebhook({ eventName: "ping", payload: {} });
    await deps.githubManagement?.processWebhook({
      eventName: "installation",
      payload: {
        action: "deleted",
        installation: {
          id: 42,
          account: {
            login: "debugbundle",
            type: "Organization"
          }
        }
      }
    });
    await deps.githubManagement?.processWebhook({
      eventName: "installation",
      payload: {
        action: "unsuspend",
        installation: {
          id: 42,
          account: {
            login: "debugbundle",
            type: "User"
          }
        }
      }
    });
    await deps.githubManagement?.processWebhook({
      eventName: "installation",
      payload: {
        action: "unknown",
        installation: {
          id: 42
        }
      }
    });

    expect(updateGitHubInstallationStatus).toHaveBeenCalledTimes(2);
    expect(updateGitHubInstallationStatus).toHaveBeenCalledWith({
      installation_id: 42,
      status: "removed",
      account_login: "debugbundle",
      account_type: "Organization"
    });
    expect(updateGitHubInstallationStatus).toHaveBeenCalledWith({
      installation_id: 42,
      status: "active",
      account_login: "debugbundle",
      account_type: "User"
    });
  });

  it("should delegate through additional github management helpers", async (): Promise<void> => {
    const githubStore = {
      getGitHubInstallationForOrganization: vi.fn().mockResolvedValue({
        id: "ghi_1",
        installation_id: 42,
        account_login: "debugbundle",
        account_type: "Organization",
        status: "active"
      }),
      deleteGitHubInstallationForOrganization: vi.fn().mockResolvedValue(true),
      listProjectGitHubDeliveriesForOrganization: vi
        .fn()
        .mockResolvedValue([{ delivery_id: "del_123" }]),
      listProjectGitHubRulesForOrganization: vi.fn().mockResolvedValue([{ rule_id: "rule_123" }]),
      getProjectGitHubRuleForOrganization: vi.fn().mockResolvedValue({ rule_id: "rule_123" }),
      updateProjectGitHubRuleForOrganization: vi
        .fn()
        .mockResolvedValue({ rule_id: "rule_123", enabled: false }),
      deleteProjectGitHubRuleForOrganization: vi.fn().mockResolvedValue(true),
      deleteProjectGitHubRepoForOrganization: vi.fn().mockResolvedValue(true),
      getProjectGitHubRepoForOrganization: vi.fn().mockResolvedValue({ project_id: "proj_1" }),
      retryProjectGitHubDeliveryForOrganization: vi
        .fn()
        .mockResolvedValue({ delivery_id: "del_123", status: "retrying" }),
      upsertProjectGitHubRepoForOrganization: vi.fn(),
      createProjectGitHubRuleForOrganization: vi.fn(),
      updateGitHubInstallationStatus: vi.fn(),
      upsertGitHubInstallationForOrganization: vi.fn()
    };
    createPostgresGitHubStoreMock.mockReturnValue(githubStore);
    const githubAppClient = {
      getInstallUrl: vi
        .fn()
        .mockResolvedValue("https://github.com/apps/debugbundle-automation/installations/new"),
      getInstallation: vi.fn(),
      listRepositories: vi
        .fn()
        .mockResolvedValue([
          {
            id: 1,
            owner: "debugbundle",
            name: "app",
            full_name: "debugbundle/app",
            default_branch: "main",
            private: false
          }
        ]),
      verifyWebhookSignature: vi.fn().mockReturnValue(true)
    };

    const deps = createApiDependencies({
      objectStore: { putObject: vi.fn(), getObject: vi.fn(), deleteObjectsByPrefix: vi.fn() },
      queue: { enqueue: vi.fn() },
      db: { query: vi.fn() },
      githubAppClient
    });

    await expect(
      deps.githubManagement?.listRepositoriesForOrganization({ organization_id: "org_1" })
    ).resolves.toEqual([
      {
        id: 1,
        owner: "debugbundle",
        name: "app",
        full_name: "debugbundle/app",
        default_branch: "main",
        private: false
      }
    ]);
    await expect(
      deps.githubManagement?.getInstallationForOrganization({ organization_id: "org_1" })
    ).resolves.toEqual(expect.objectContaining({ installation_id: 42 }));
    await expect(
      deps.githubManagement?.disconnectInstallationForOrganization({ organization_id: "org_1" })
    ).resolves.toBe(true);
    await expect(
      deps.githubManagement?.listProjectDeliveriesForOrganization({
        organization_id: "org_1",
        project_id: "proj_1",
        status: "failed",
        limit: 5
      })
    ).resolves.toEqual([{ delivery_id: "del_123" }]);
    await expect(
      deps.githubManagement?.listProjectRulesForOrganization({
        organization_id: "org_1",
        project_id: "proj_1"
      })
    ).resolves.toEqual([{ rule_id: "rule_123" }]);
    await expect(
      deps.githubManagement?.getProjectRuleForOrganization({
        organization_id: "org_1",
        project_id: "proj_1",
        rule_id: "rule_123"
      })
    ).resolves.toEqual({ rule_id: "rule_123" });
    await expect(
      deps.githubManagement?.updateProjectRuleForOrganization({
        organization_id: "org_1",
        project_id: "proj_1",
        rule_id: "rule_123",
        enabled: false
      })
    ).resolves.toEqual({ rule_id: "rule_123", enabled: false });
    await expect(
      deps.githubManagement?.deleteProjectRuleForOrganization({
        organization_id: "org_1",
        project_id: "proj_1",
        rule_id: "rule_123"
      })
    ).resolves.toBe(true);
    await expect(
      deps.githubManagement?.removeProjectRepoForOrganization({
        organization_id: "org_1",
        project_id: "proj_1"
      })
    ).resolves.toBe(true);

    expect(githubStore.listProjectGitHubDeliveriesForOrganization).toHaveBeenCalledWith({
      organization_id: "org_1",
      project_id: "proj_1",
      status: "failed",
      limit: 5
    });
    expect(githubStore.updateProjectGitHubRuleForOrganization).toHaveBeenCalledWith({
      organization_id: "org_1",
      project_id: "proj_1",
      rule_id: "rule_123",
      enabled: false
    });
    expect(githubStore.deleteProjectGitHubRepoForOrganization).toHaveBeenCalledWith({
      organization_id: "org_1",
      project_id: "proj_1"
    });
  });
});
