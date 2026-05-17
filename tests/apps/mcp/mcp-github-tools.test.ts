import { describe, expect, it, vi } from "vitest";

import { createGitHubMcpTools, GITHUB_MCP_TOOL_NAMES } from "../../../apps/mcp/src/github-tools.js";
import { GitHubManagementApiError } from "../../../packages/github-client/src/index.js";

describe("mcp github tools", () => {
  it("declares github tool parity", () => {
    expect(GITHUB_MCP_TOOL_NAMES).toEqual([
      "get_github_status",
      "list_github_repositories",
      "list_github_dispatch_rules",
      "create_github_dispatch_rule",
      "update_github_dispatch_rule",
      "delete_github_dispatch_rule",
      "list_github_deliveries",
      "retry_github_delivery",
      "set_project_github_repo",
      "remove_project_github_repo"
    ]);
  });

  it("returns github payloads for slice-one operations", async () => {
    const getInstallation = vi.fn().mockResolvedValue({ account_login: "debugbundle", status: "active" });
    const listRepositories = vi.fn().mockResolvedValue([{ full_name: "debugbundle/app", default_branch: "main" }]);
    const tools = createGitHubMcpTools({
      getInstallation,
      listRepositories,
      getProjectRepo: vi.fn().mockResolvedValue({ repo_owner: "debugbundle", repo_name: "app" }),
      setProjectRepo: vi.fn().mockResolvedValue({ repo_owner: "debugbundle", repo_name: "app" }),
      removeProjectRepo: vi.fn().mockResolvedValue(undefined)
    });

    await expect(
      tools.get_github_status({ bearerToken: "dbundle_mem_x", projectId: "proj_1" })
    ).resolves.toEqual({
      installation: { account_login: "debugbundle", status: "active" },
      repo: { repo_owner: "debugbundle", repo_name: "app" }
    });
    expect(getInstallation).toHaveBeenCalledWith({ bearerToken: "dbundle_mem_x", projectId: "proj_1" });

    await expect(
      tools.list_github_repositories({ bearerToken: "dbundle_mem_x", projectId: "proj_1" })
    ).resolves.toEqual({
      repositories: [{ full_name: "debugbundle/app", default_branch: "main" }]
    });
    expect(listRepositories).toHaveBeenCalledWith({ bearerToken: "dbundle_mem_x", projectId: "proj_1" });

    await expect(
      tools.set_project_github_repo({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        owner: "debugbundle",
        repo: "app"
      })
    ).resolves.toEqual({
      repo: { repo_owner: "debugbundle", repo_name: "app" }
    });

    await expect(
      tools.remove_project_github_repo({ bearerToken: "dbundle_mem_x", projectId: "proj_1" })
    ).resolves.toEqual({ removed: true, project_id: "proj_1" });
  });

  it("maps api and unknown errors", async () => {
    const tools = createGitHubMcpTools({
      getInstallation: vi.fn().mockRejectedValue(new GitHubManagementApiError(404, "installation_not_found")),
      listRepositories: vi.fn().mockRejectedValue(new Error("network")),
      setProjectRepo: vi.fn().mockRejectedValue(new GitHubManagementApiError(404, "repo_not_found")),
      removeProjectRepo: vi.fn().mockRejectedValue(new GitHubManagementApiError(404, "repo_not_found"))
    });

    await expect(tools.get_github_status({ bearerToken: "dbundle_mem_x" })).rejects.toThrow(
      "mcp_tool_error:installation_not_found"
    );
    await expect(tools.list_github_repositories({ bearerToken: "dbundle_mem_x" })).rejects.toThrow(
      "mcp_tool_error:unknown_error"
    );
    await expect(
      tools.set_project_github_repo({ bearerToken: "dbundle_mem_x", projectId: "proj_1", owner: "debugbundle", repo: "app" })
    ).rejects.toThrow("mcp_tool_error:repo_not_found");
    await expect(
      tools.remove_project_github_repo({ bearerToken: "dbundle_mem_x", projectId: "proj_1" })
    ).rejects.toThrow("mcp_tool_error:repo_not_found");
  });

  it("returns github rule payloads", async () => {
    const tools = createGitHubMcpTools({
      getInstallation: vi.fn().mockResolvedValue({}),
      listRepositories: vi.fn().mockResolvedValue([]),
      getProjectRepo: vi.fn(),
      listProjectRules: vi.fn().mockResolvedValue([{ rule_id: "rule_1", name: "High severity incidents" }]),
      createProjectRule: vi.fn().mockResolvedValue({ rule_id: "rule_1", name: "High severity incidents" }),
      updateProjectRule: vi.fn().mockResolvedValue({ rule_id: "rule_1", enabled: false }),
      deleteProjectRule: vi.fn().mockResolvedValue(undefined),
      setProjectRepo: vi.fn().mockResolvedValue({}),
      removeProjectRepo: vi.fn().mockResolvedValue(undefined)
    });

    await expect(
      tools.list_github_dispatch_rules({ bearerToken: "dbundle_mem_x", projectId: "proj_1" })
    ).resolves.toEqual({ rules: [{ rule_id: "rule_1", name: "High severity incidents" }] });

    await expect(
      tools.create_github_dispatch_rule({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        name: "High severity incidents",
        eventTypes: ["bundle.created", "bundle.reopened"],
        environments: ["production"],
        services: ["checkout-api"],
        severityMin: "high",
        bundleType: "failure",
        incidentStatus: "new_or_reopened",
        cooldownSeconds: 300,
        enabled: true
      })
    ).resolves.toEqual({ rule: { rule_id: "rule_1", name: "High severity incidents" } });

    await expect(
      tools.update_github_dispatch_rule({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        ruleId: "rule_1",
        enabled: false
      })
    ).resolves.toEqual({ rule: { rule_id: "rule_1", enabled: false } });

    await expect(
      tools.delete_github_dispatch_rule({ bearerToken: "dbundle_mem_x", projectId: "proj_1", ruleId: "rule_1" })
    ).resolves.toEqual({ deleted: true, project_id: "proj_1", rule_id: "rule_1" });
  });

  it("returns github delivery payloads", async () => {
    const tools = createGitHubMcpTools({
      getInstallation: vi.fn().mockResolvedValue({}),
      listRepositories: vi.fn().mockResolvedValue([]),
      setProjectRepo: vi.fn().mockResolvedValue({}),
      removeProjectRepo: vi.fn().mockResolvedValue(undefined),
      listProjectDeliveries: vi.fn().mockResolvedValue([{ delivery_id: "del_1", status: "failed" }]),
      retryProjectDelivery: vi.fn().mockResolvedValue({ delivery_id: "del_1", status: "retrying" })
    });

    await expect(
      tools.list_github_deliveries({ bearerToken: "dbundle_mem_x", projectId: "proj_1", status: "failed", limit: 5 })
    ).resolves.toEqual({ deliveries: [{ delivery_id: "del_1", status: "failed" }] });

    await expect(
      tools.retry_github_delivery({ bearerToken: "dbundle_mem_x", projectId: "proj_1", deliveryId: "del_1" })
    ).resolves.toEqual({ delivery: { delivery_id: "del_1", status: "retrying" } });
  });
});
