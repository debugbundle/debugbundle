import { describe, expect, it, vi } from "vitest";

import { CliAuthStateError } from "../../../apps/cli/src/auth-state.js";
import {
  createProjectGitHubRuleCommand,
  getGitHubStatusCommand,
  getGitHubStatusWithAuthCommand,
  listProjectGitHubDeliveriesCommand,
  listProjectGitHubRulesCommand,
  listGitHubRepositoriesCommand,
  deleteProjectGitHubRuleCommand,
  removeProjectGitHubRepoCommand,
  retryProjectGitHubDeliveryCommand,
  setProjectGitHubRepoCommand,
  updateProjectGitHubRuleCommand
} from "../../../apps/cli/src/github-commands.js";
import { GitHubManagementApiError } from "../../../packages/github-client/src/index.js";

describe("cli github commands", () => {
  it("renders github status in human and json modes", async () => {
    const installation = {
      id: "ghi_1",
      installation_id: 123,
      account_login: "debugbundle",
      account_type: "Organization" as const,
      status: "active" as const,
      created_at: "2026-03-26T00:00:00.000Z",
      updated_at: "2026-03-26T00:00:00.000Z"
    };
    const repo = {
      id: "pgr_1",
      project_id: "proj_1",
      installation_id: "ghi_1",
      repo_owner: "debugbundle",
      repo_name: "app",
      default_branch: "main",
      created_at: "2026-03-26T00:00:00.000Z",
      updated_at: "2026-03-26T00:00:00.000Z"
    };

    const getInstallation = vi.fn().mockResolvedValue(installation);
    const getProjectRepo = vi.fn().mockResolvedValue(repo);
    const humanResult = await getGitHubStatusCommand(
      { bearerToken: "dbundle_mem_x", projectId: "proj_1" },
      {
        getInstallation,
        getProjectRepo
      }
    );
    const jsonResult = await getGitHubStatusCommand(
      { bearerToken: "dbundle_mem_x", json: true },
      {
        getInstallation: vi.fn().mockResolvedValue(installation)
      }
    );

    expect(humanResult.exitCode).toBe(0);
    expect(humanResult.output).toContain("GitHub installation: debugbundle");
    expect(humanResult.output).toContain("Assigned repo: debugbundle/app");
    expect(JSON.parse(jsonResult.output)).toEqual({ installation });
    expect(getInstallation).toHaveBeenCalledWith({ bearerToken: "dbundle_mem_x", projectId: "proj_1" });
    expect(getProjectRepo).toHaveBeenCalledWith({ bearerToken: "dbundle_mem_x", projectId: "proj_1" });
  });

  it("renders repository list, repo set, and repo remove output", async () => {
    const listRepositories = vi.fn().mockResolvedValue([
      {
        id: 1,
        owner: "debugbundle",
        name: "app",
        full_name: "debugbundle/app",
        default_branch: "main",
        private: true
      }
    ]);
    const listResult = await listGitHubRepositoriesCommand(
      { bearerToken: "dbundle_mem_x", projectId: "proj_1" },
      {
        listRepositories
      }
    );
    const setResult = await setProjectGitHubRepoCommand(
      { bearerToken: "dbundle_mem_x", projectId: "proj_1", repoRef: "debugbundle/app" },
      {
        setProjectRepo: vi.fn().mockResolvedValue({
          id: "pgr_1",
          project_id: "proj_1",
          installation_id: "ghi_1",
          repo_owner: "debugbundle",
          repo_name: "app",
          default_branch: "main",
          created_at: "2026-03-26T00:00:00.000Z",
          updated_at: "2026-03-26T00:00:00.000Z"
        })
      }
    );
    const removeResult = await removeProjectGitHubRepoCommand(
      { bearerToken: "dbundle_mem_x", projectId: "proj_1", json: true },
      {
        removeProjectRepo: vi.fn().mockResolvedValue(undefined)
      }
    );

    expect(listResult.exitCode).toBe(0);
    expect(listResult.output).toContain("debugbundle/app (main)");
    expect(listRepositories).toHaveBeenCalledWith({ bearerToken: "dbundle_mem_x", projectId: "proj_1" });
    expect(setResult.output).toContain("Project repo set: Assigned repo: debugbundle/app");
    expect(JSON.parse(removeResult.output)).toEqual({ removed: true, project_id: "proj_1" });
  });

  it("maps auth, api, and invalid repo ref failures to deterministic exit codes", async () => {
    const authFailure = await getGitHubStatusWithAuthCommand(
      {},
      {
        readAuthState: vi.fn().mockRejectedValue(new CliAuthStateError("auth_state_missing", "Not logged in."))
      }
    );
    const apiFailure = await listGitHubRepositoriesCommand(
      { bearerToken: "dbundle_mem_x" },
      {
        listRepositories: vi.fn().mockRejectedValue(new GitHubManagementApiError(404, "installation_not_found"))
      }
    );
    const invalidRef = await setProjectGitHubRepoCommand(
      { bearerToken: "dbundle_mem_x", projectId: "proj_1", repoRef: "not-valid" },
      {
        setProjectRepo: vi.fn()
      }
    );

    expect(authFailure.exitCode).toBe(2);
    expect(authFailure.output).toBe("Not logged in.");
    expect(apiFailure.exitCode).toBe(3);
    expect(apiFailure.output).toContain("installation_not_found");
    expect(invalidRef.exitCode).toBe(4);
    expect(invalidRef.output).toBe("Repository must be provided as owner/repo.");
  });

  it("renders github rule list and mutation output", async () => {
    const listResult = await listProjectGitHubRulesCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "00000000-0000-4000-8000-000000000001"
      },
      {
        listProjectRules: vi.fn().mockResolvedValue([
          {
            rule_id: "11111111-1111-4111-8111-111111111111",
            project_id: "00000000-0000-4000-8000-000000000001",
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
        ])
      }
    );
    const createResult = await createProjectGitHubRuleCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "00000000-0000-4000-8000-000000000001",
        name: "High severity incidents",
        eventTypes: ["bundle.created", "bundle.reopened"],
        environments: ["production"],
        services: ["checkout-api"],
        severityMin: "high",
        bundleType: "failure",
        incidentStatus: "new_or_reopened",
        cooldownSeconds: 300
      },
      {
        createProjectRule: vi.fn().mockResolvedValue({
          rule_id: "11111111-1111-4111-8111-111111111111",
          project_id: "00000000-0000-4000-8000-000000000001",
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
        })
      }
    );
    const updateResult = await updateProjectGitHubRuleCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "00000000-0000-4000-8000-000000000001",
        ruleId: "11111111-1111-4111-8111-111111111111",
        name: "Critical incidents only",
        enabled: false,
        json: true
      },
      {
        updateProjectRule: vi.fn().mockResolvedValue({
          rule_id: "11111111-1111-4111-8111-111111111111",
          project_id: "00000000-0000-4000-8000-000000000001",
          name: "Critical incidents only",
          enabled: false,
          event_types: ["bundle.created"],
          environments: ["production"],
          services: [],
          severity_min: "critical",
          bundle_type: "failure",
          incident_status: "new_only",
          cooldown_seconds: 900,
          created_at: "2026-03-26T00:00:00.000Z",
          updated_at: "2026-03-26T00:05:00.000Z"
        })
      }
    );
    const deleteResult = await deleteProjectGitHubRuleCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "00000000-0000-4000-8000-000000000001",
        ruleId: "11111111-1111-4111-8111-111111111111",
        json: true
      },
      {
        deleteProjectRule: vi.fn().mockResolvedValue(undefined)
      }
    );

    expect(listResult.output).toContain("High severity incidents | enabled | bundle.created,bundle.reopened | high | 300s");
    expect(createResult.output).toContain("GitHub rule created: 11111111-1111-4111-8111-111111111111");
    expect(JSON.parse(updateResult.output).rule.name).toBe("Critical incidents only");
    expect(JSON.parse(deleteResult.output)).toEqual({
      deleted: true,
      project_id: "00000000-0000-4000-8000-000000000001",
      rule_id: "11111111-1111-4111-8111-111111111111"
    });
  });

  it("renders github delivery list and retry output", async () => {
    const listResult = await listProjectGitHubDeliveriesCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        status: "failed"
      },
      {
        listProjectDeliveries: vi.fn().mockResolvedValue([
          {
            delivery_id: "del_1",
            rule_id: "rule_1",
            rule_name: "High severity incidents",
            incident_id: "inc_1",
            incident_title: "TypeError in checkout",
            status: "failed",
            attempt_count: 2,
            last_attempt_at: "2026-03-26T00:10:00.000Z",
            last_error: "Repository not found",
            github_status_code: 404,
            created_at: "2026-03-26T00:00:00.000Z"
          }
        ])
      }
    );
    const retryResult = await retryProjectGitHubDeliveryCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        deliveryId: "del_1",
        json: true
      },
      {
        retryProjectDelivery: vi.fn().mockResolvedValue({
          delivery_id: "del_1",
          rule_id: "rule_1",
          rule_name: "High severity incidents",
          incident_id: "inc_1",
          incident_title: "TypeError in checkout",
          status: "retrying",
          attempt_count: 2,
          last_attempt_at: "2026-03-26T00:10:00.000Z",
          last_error: null,
          github_status_code: null,
          created_at: "2026-03-26T00:00:00.000Z"
        })
      }
    );

    expect(listResult.output).toContain("High severity incidents | failed | TypeError in checkout | attempts: 2");
    expect(JSON.parse(retryResult.output)).toEqual({
      delivery: expect.objectContaining({
        delivery_id: "del_1",
        status: "retrying"
      })
    });
  });
});
