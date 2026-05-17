import { describe, expect, it, vi } from "vitest";

import { createGitHubManagementApi, GitHubManagementApiError, type HttpClient } from "../../../packages/github-client/src/index.js";

describe("github management api client", () => {
  it("calls installation, repositories, and repo assignment routes", async () => {
    const request = vi
      .fn<HttpClient["request"]>()
      .mockResolvedValueOnce({
        status: 200,
        body: {
          installation: {
            id: "ghi_1",
            installation_id: 123,
            account_login: "debugbundle",
            account_type: "Organization",
            status: "active",
            created_at: "2026-03-26T00:00:00.000Z",
            updated_at: "2026-03-26T00:00:00.000Z"
          }
        }
      })
      .mockResolvedValueOnce({
        status: 200,
        body: {
          repositories: [
            {
              id: 1,
              owner: "debugbundle",
              name: "app",
              full_name: "debugbundle/app",
              default_branch: "main",
              private: true
            }
          ]
        }
      })
      .mockResolvedValueOnce({
        status: 200,
        body: {
          repo: {
            id: "pgr_1",
            project_id: "proj_1",
            installation_id: "ghi_1",
            repo_owner: "debugbundle",
            repo_name: "app",
            default_branch: "main",
            created_at: "2026-03-26T00:00:00.000Z",
            updated_at: "2026-03-26T00:00:00.000Z"
          }
        }
      })
      .mockResolvedValueOnce({ status: 204, body: null });

    const api = createGitHubManagementApi({ request });

    const installation = await api.getInstallation({ bearerToken: "dbundle_mem_x", projectId: "proj_1" });
    const repositories = await api.listRepositories({ bearerToken: "dbundle_mem_x", projectId: "proj_1" });
    const repo = await api.setProjectRepo({
      bearerToken: "dbundle_mem_x",
      projectId: "proj_1",
      owner: "debugbundle",
      repo: "app"
    });
    await api.removeProjectRepo({ bearerToken: "dbundle_mem_x", projectId: "proj_1" });

    expect(installation.installation_id).toBe(123);
    expect(repositories[0]?.full_name).toBe("debugbundle/app");
    expect(repo.repo_name).toBe("app");
    expect(request).toHaveBeenNthCalledWith(1, {
      method: "GET",
      path: "/v1/github/installation?project_id=proj_1",
      bearerToken: "dbundle_mem_x"
    });
    expect(request).toHaveBeenNthCalledWith(2, {
      method: "GET",
      path: "/v1/github/repositories?project_id=proj_1",
      bearerToken: "dbundle_mem_x"
    });
    expect(request).toHaveBeenNthCalledWith(3, {
      method: "PUT",
      path: "/v1/projects/proj_1/github/repo",
      bearerToken: "dbundle_mem_x",
      body: {
        owner: "debugbundle",
        repo: "app"
      }
    });
    expect(request).toHaveBeenNthCalledWith(4, {
      method: "DELETE",
      path: "/v1/projects/proj_1/github/repo",
      bearerToken: "dbundle_mem_x"
    });
  });

  it("throws structured api and shape errors", async () => {
    const apiErrorRequest = vi.fn<HttpClient["request"]>().mockResolvedValue({
      status: 404,
      body: { error: "installation_not_found" }
    });
    const invalidShapeRequest = vi.fn<HttpClient["request"]>().mockResolvedValue({
      status: 200,
      body: { installation: { invalid: true } }
    });

    await expect(
      createGitHubManagementApi({ request: apiErrorRequest }).getInstallation({ bearerToken: "dbundle_mem_x" })
    ).rejects.toEqual(new GitHubManagementApiError(404, "installation_not_found"));
    await expect(
      createGitHubManagementApi({ request: invalidShapeRequest }).getInstallation({ bearerToken: "dbundle_mem_x" })
    ).rejects.toEqual(new GitHubManagementApiError(200, "invalid_response_shape"));
  });

  it("calls github rule management routes", async () => {
    const request = vi
      .fn<HttpClient["request"]>()
      .mockResolvedValueOnce({
        status: 200,
        body: {
          rules: [
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
              created_by_user_id: "usr_1",
              created_at: "2026-03-26T00:00:00.000Z",
              updated_at: "2026-03-26T00:00:00.000Z"
            }
          ]
        }
      })
      .mockResolvedValueOnce({
        status: 201,
        body: {
          rule: {
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
            created_by_user_id: "usr_1",
            created_at: "2026-03-26T00:00:00.000Z",
            updated_at: "2026-03-26T00:00:00.000Z"
          }
        }
      })
      .mockResolvedValueOnce({
        status: 200,
        body: {
          rule: {
            rule_id: "11111111-1111-4111-8111-111111111111",
            project_id: "00000000-0000-4000-8000-000000000001",
            name: "Critical incidents only",
            enabled: false,
            event_types: ["bundle.created"],
            environments: ["production", "staging"],
            services: [],
            severity_min: "critical",
            bundle_type: "failure",
            incident_status: "new_only",
            cooldown_seconds: 900,
            created_by_user_id: "usr_1",
            created_at: "2026-03-26T00:00:00.000Z",
            updated_at: "2026-03-26T00:05:00.000Z"
          }
        }
      })
      .mockResolvedValueOnce({ status: 204, body: null });

    const api = createGitHubManagementApi({ request });

    const rules = await api.listProjectRules({
      bearerToken: "dbundle_mem_x",
      projectId: "00000000-0000-4000-8000-000000000001"
    });
    const created = await api.createProjectRule({
      bearerToken: "dbundle_mem_x",
      projectId: "00000000-0000-4000-8000-000000000001",
      name: "High severity incidents",
      eventTypes: ["bundle.created", "bundle.reopened"],
      environments: ["production"],
      services: ["checkout-api"],
      severityMin: "high",
      bundleType: "failure",
      incidentStatus: "new_or_reopened",
      cooldownSeconds: 300,
      enabled: true
    });
    const updated = await api.updateProjectRule({
      bearerToken: "dbundle_mem_x",
      projectId: "00000000-0000-4000-8000-000000000001",
      ruleId: "11111111-1111-4111-8111-111111111111",
      name: "Critical incidents only",
      eventTypes: ["bundle.created"],
      environments: ["production", "staging"],
      services: [],
      severityMin: "critical",
      bundleType: "failure",
      incidentStatus: "new_only",
      cooldownSeconds: 900,
      enabled: false
    });
    await api.deleteProjectRule({
      bearerToken: "dbundle_mem_x",
      projectId: "00000000-0000-4000-8000-000000000001",
      ruleId: "11111111-1111-4111-8111-111111111111"
    });

    expect(rules[0]?.name).toBe("High severity incidents");
    expect(created.cooldown_seconds).toBe(300);
    expect(updated.name).toBe("Critical incidents only");
    expect(request).toHaveBeenNthCalledWith(1, {
      method: "GET",
      path: "/v1/projects/00000000-0000-4000-8000-000000000001/github/rules",
      bearerToken: "dbundle_mem_x"
    });
    expect(request).toHaveBeenNthCalledWith(2, {
      method: "POST",
      path: "/v1/projects/00000000-0000-4000-8000-000000000001/github/rules",
      bearerToken: "dbundle_mem_x",
      body: {
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
    expect(request).toHaveBeenNthCalledWith(3, {
      method: "PATCH",
      path: "/v1/projects/00000000-0000-4000-8000-000000000001/github/rules/11111111-1111-4111-8111-111111111111",
      bearerToken: "dbundle_mem_x",
      body: {
        name: "Critical incidents only",
        event_types: ["bundle.created"],
        environments: ["production", "staging"],
        services: [],
        severity_min: "critical",
        bundle_type: "failure",
        incident_status: "new_only",
        cooldown_seconds: 900,
        enabled: false
      }
    });
    expect(request).toHaveBeenNthCalledWith(4, {
      method: "DELETE",
      path: "/v1/projects/00000000-0000-4000-8000-000000000001/github/rules/11111111-1111-4111-8111-111111111111",
      bearerToken: "dbundle_mem_x"
    });
  });

  it("calls github delivery history and retry routes", async () => {
    const request = vi
      .fn<HttpClient["request"]>()
      .mockResolvedValueOnce({
        status: 200,
        body: {
          deliveries: [
            {
              delivery_id: "22222222-2222-4222-8222-222222222222",
              rule_id: "11111111-1111-4111-8111-111111111111",
              rule_name: "High severity incidents",
              incident_id: "33333333-3333-4333-8333-333333333333",
              incident_title: "TypeError in checkout",
              status: "failed",
              attempt_count: 2,
              last_attempt_at: "2026-03-26T00:10:00.000Z",
              last_error: "Repository not found",
              github_status_code: 404,
              created_at: "2026-03-26T00:00:00.000Z"
            }
          ]
        }
      })
      .mockResolvedValueOnce({
        status: 200,
        body: {
          delivery: {
            delivery_id: "22222222-2222-4222-8222-222222222222",
            rule_id: "11111111-1111-4111-8111-111111111111",
            rule_name: "High severity incidents",
            incident_id: "33333333-3333-4333-8333-333333333333",
            incident_title: "TypeError in checkout",
            status: "retrying",
            attempt_count: 2,
            last_attempt_at: "2026-03-26T00:10:00.000Z",
            last_error: null,
            github_status_code: null,
            created_at: "2026-03-26T00:00:00.000Z"
          }
        }
      });

    const api = createGitHubManagementApi({ request });

    const deliveries = await api.listProjectDeliveries({
      bearerToken: "dbundle_mem_x",
      projectId: "00000000-0000-4000-8000-000000000001",
      status: "failed",
      limit: 5
    });
    const retried = await api.retryProjectDelivery({
      bearerToken: "dbundle_mem_x",
      projectId: "00000000-0000-4000-8000-000000000001",
      deliveryId: "22222222-2222-4222-8222-222222222222"
    });

    expect(deliveries[0]?.incident_title).toBe("TypeError in checkout");
    expect(retried.status).toBe("retrying");
    expect(request).toHaveBeenNthCalledWith(1, {
      method: "GET",
      path: "/v1/projects/00000000-0000-4000-8000-000000000001/github/deliveries?status=failed&limit=5",
      bearerToken: "dbundle_mem_x"
    });
    expect(request).toHaveBeenNthCalledWith(2, {
      method: "POST",
      path: "/v1/projects/00000000-0000-4000-8000-000000000001/github/deliveries/22222222-2222-4222-8222-222222222222/retry",
      bearerToken: "dbundle_mem_x",
      body: {}
    });
  });
});
