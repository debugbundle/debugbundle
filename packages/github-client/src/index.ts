import { z } from "zod";

export const GitHubInstallationSchema = z
  .object({
    id: z.string(),
    installation_id: z.number().int(),
    account_login: z.string(),
    account_type: z.enum(["Organization", "User"]),
    status: z.enum(["active", "suspended", "removed"]),
    created_at: z.string(),
    updated_at: z.string()
  })
  .strict();

export const GitHubRepositorySchema = z
  .object({
    id: z.number().int(),
    owner: z.string(),
    name: z.string(),
    full_name: z.string(),
    default_branch: z.string(),
    private: z.boolean()
  })
  .strict();

export const ProjectGitHubRepoSchema = z
  .object({
    id: z.string(),
    project_id: z.string(),
    installation_id: z.string(),
    repo_owner: z.string(),
    repo_name: z.string(),
    default_branch: z.string(),
    created_at: z.string(),
    updated_at: z.string()
  })
  .strict();

export const GitHubDispatchRuleSchema = z
  .object({
    rule_id: z.string(),
    project_id: z.string(),
    name: z.string(),
    enabled: z.boolean(),
    event_types: z.array(z.string().min(1)),
    environments: z.array(z.string()),
    services: z.array(z.string()),
    severity_min: z.enum(["low", "medium", "high", "critical"]).nullable(),
    bundle_type: z.enum(["failure", "improvement"]).nullable(),
    incident_status: z.enum(["new_only", "reopened_only", "new_or_reopened"]),
    cooldown_seconds: z.number().int(),
    created_at: z.string(),
    updated_at: z.string()
  })
  .strict();

export const GitHubDispatchDeliverySchema = z
  .object({
    delivery_id: z.string(),
    rule_id: z.string(),
    rule_name: z.string(),
    incident_id: z.string(),
    incident_title: z.string(),
    status: z.enum(["pending", "retrying", "delivered", "failed"]),
    attempt_count: z.number().int(),
    last_attempt_at: z.string().nullable(),
    last_error: z.string().nullable(),
    github_status_code: z.number().int().nullable(),
    created_at: z.string()
  })
  .strict();

export const GitHubInstallationResponseSchema = z
  .object({
    installation: GitHubInstallationSchema
  })
  .strict();

export const GitHubRepositoriesResponseSchema = z
  .object({
    repositories: z.array(GitHubRepositorySchema)
  })
  .strict();

export const ProjectGitHubRepoResponseSchema = z
  .object({
    repo: ProjectGitHubRepoSchema
  })
  .strict();

export const GitHubDispatchRulesResponseSchema = z
  .object({
    rules: z.array(GitHubDispatchRuleSchema)
  })
  .strict();

export const GitHubDispatchRuleResponseSchema = z
  .object({
    rule: GitHubDispatchRuleSchema
  })
  .strict();

export const GitHubDispatchDeliveriesResponseSchema = z
  .object({
    deliveries: z.array(GitHubDispatchDeliverySchema)
  })
  .strict();

export const GitHubDispatchDeliveryResponseSchema = z
  .object({
    delivery: GitHubDispatchDeliverySchema
  })
  .strict();

export const ApiErrorResponseSchema = z
  .object({
    error: z.string()
  })
  .strict();

export type GitHubInstallation = z.infer<typeof GitHubInstallationSchema>;
export type GitHubRepository = z.infer<typeof GitHubRepositorySchema>;
export type ProjectGitHubRepo = z.infer<typeof ProjectGitHubRepoSchema>;
export type GitHubDispatchRule = z.infer<typeof GitHubDispatchRuleSchema>;
export type GitHubDispatchDelivery = z.infer<typeof GitHubDispatchDeliverySchema>;

export interface HttpRequestInput {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  bearerToken: string;
  body?: unknown;
}

export interface HttpResponse {
  status: number;
  body: unknown;
}

export interface HttpClient {
  request(input: HttpRequestInput): Promise<HttpResponse>;
}

export class GitHubManagementApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(`github_management_api_error: ${status}:${code}`);
    this.status = status;
    this.code = code;
  }
}

function parseApiError(status: number, body: unknown): never {
  const parsed = ApiErrorResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new GitHubManagementApiError(status, "unknown_error");
  }

  throw new GitHubManagementApiError(status, parsed.data.error);
}

async function expectInstallation(responsePromise: Promise<HttpResponse>): Promise<GitHubInstallation> {
  const response = await responsePromise;
  if (response.status < 200 || response.status >= 300) {
    parseApiError(response.status, response.body);
  }

  const parsed = GitHubInstallationResponseSchema.safeParse(response.body);
  if (!parsed.success) {
    throw new GitHubManagementApiError(response.status, "invalid_response_shape");
  }

  return parsed.data.installation;
}

async function expectRepositories(responsePromise: Promise<HttpResponse>): Promise<GitHubRepository[]> {
  const response = await responsePromise;
  if (response.status < 200 || response.status >= 300) {
    parseApiError(response.status, response.body);
  }

  const parsed = GitHubRepositoriesResponseSchema.safeParse(response.body);
  if (!parsed.success) {
    throw new GitHubManagementApiError(response.status, "invalid_response_shape");
  }

  return parsed.data.repositories;
}

async function expectProjectRepo(responsePromise: Promise<HttpResponse>): Promise<ProjectGitHubRepo> {
  const response = await responsePromise;
  if (response.status < 200 || response.status >= 300) {
    parseApiError(response.status, response.body);
  }

  const parsed = ProjectGitHubRepoResponseSchema.safeParse(response.body);
  if (!parsed.success) {
    throw new GitHubManagementApiError(response.status, "invalid_response_shape");
  }

  return parsed.data.repo;
}

async function expectProjectRules(responsePromise: Promise<HttpResponse>): Promise<GitHubDispatchRule[]> {
  const response = await responsePromise;
  if (response.status < 200 || response.status >= 300) {
    parseApiError(response.status, response.body);
  }

  const parsed = GitHubDispatchRulesResponseSchema.safeParse(response.body);
  if (!parsed.success) {
    throw new GitHubManagementApiError(response.status, "invalid_response_shape");
  }

  return parsed.data.rules;
}

async function expectProjectRule(responsePromise: Promise<HttpResponse>): Promise<GitHubDispatchRule> {
  const response = await responsePromise;
  if (response.status < 200 || response.status >= 300) {
    parseApiError(response.status, response.body);
  }

  const parsed = GitHubDispatchRuleResponseSchema.safeParse(response.body);
  if (!parsed.success) {
    throw new GitHubManagementApiError(response.status, "invalid_response_shape");
  }

  return parsed.data.rule;
}

async function expectProjectDeliveries(responsePromise: Promise<HttpResponse>): Promise<GitHubDispatchDelivery[]> {
  const response = await responsePromise;
  if (response.status < 200 || response.status >= 300) {
    parseApiError(response.status, response.body);
  }

  const parsed = GitHubDispatchDeliveriesResponseSchema.safeParse(response.body);
  if (!parsed.success) {
    throw new GitHubManagementApiError(response.status, "invalid_response_shape");
  }

  return parsed.data.deliveries;
}

async function expectProjectDelivery(responsePromise: Promise<HttpResponse>): Promise<GitHubDispatchDelivery> {
  const response = await responsePromise;
  if (response.status < 200 || response.status >= 300) {
    parseApiError(response.status, response.body);
  }

  const parsed = GitHubDispatchDeliveryResponseSchema.safeParse(response.body);
  if (!parsed.success) {
    throw new GitHubManagementApiError(response.status, "invalid_response_shape");
  }

  return parsed.data.delivery;
}

async function expectNoContent(responsePromise: Promise<HttpResponse>): Promise<void> {
  const response = await responsePromise;
  if (response.status === 204) {
    return;
  }
  if (response.status < 200 || response.status >= 300) {
    parseApiError(response.status, response.body);
  }

  throw new GitHubManagementApiError(response.status, "invalid_response_shape");
}

export function createGitHubManagementApi(client: HttpClient): {
  getInstallation(input: { bearerToken: string }): Promise<GitHubInstallation>;
  listRepositories(input: { bearerToken: string }): Promise<GitHubRepository[]>;
  getProjectRepo(input: { bearerToken: string; projectId: string }): Promise<ProjectGitHubRepo>;
  listProjectDeliveries(input: {
    bearerToken: string;
    projectId: string;
    status?: "pending" | "retrying" | "delivered" | "failed";
    limit?: number;
  }): Promise<GitHubDispatchDelivery[]>;
  retryProjectDelivery(input: { bearerToken: string; projectId: string; deliveryId: string }): Promise<GitHubDispatchDelivery>;
  listProjectRules(input: { bearerToken: string; projectId: string }): Promise<GitHubDispatchRule[]>;
  createProjectRule(input: {
    bearerToken: string;
    projectId: string;
    name: string;
    eventTypes: string[];
    environments: string[];
    services: string[];
    severityMin: "low" | "medium" | "high" | "critical";
    bundleType: "failure" | "improvement";
    incidentStatus: "new_only" | "reopened_only" | "new_or_reopened";
    cooldownSeconds: number;
    enabled?: boolean;
  }): Promise<GitHubDispatchRule>;
  updateProjectRule(input: {
    bearerToken: string;
    projectId: string;
    ruleId: string;
    name?: string;
    eventTypes?: string[];
    environments?: string[];
    services?: string[];
    severityMin?: "low" | "medium" | "high" | "critical";
    bundleType?: "failure" | "improvement";
    incidentStatus?: "new_only" | "reopened_only" | "new_or_reopened";
    cooldownSeconds?: number;
    enabled?: boolean;
  }): Promise<GitHubDispatchRule>;
  deleteProjectRule(input: { bearerToken: string; projectId: string; ruleId: string }): Promise<void>;
  setProjectRepo(input: { bearerToken: string; projectId: string; owner: string; repo: string }): Promise<ProjectGitHubRepo>;
  removeProjectRepo(input: { bearerToken: string; projectId: string }): Promise<void>;
} {
  return {
    async getInstallation(input) {
      return expectInstallation(
        client.request({
          method: "GET",
          path: "/v1/github/installation",
          bearerToken: input.bearerToken
        })
      );
    },

    async listRepositories(input) {
      return expectRepositories(
        client.request({
          method: "GET",
          path: "/v1/github/repositories",
          bearerToken: input.bearerToken
        })
      );
    },

    async getProjectRepo(input) {
      return expectProjectRepo(
        client.request({
          method: "GET",
          path: `/v1/projects/${input.projectId}/github/repo`,
          bearerToken: input.bearerToken
        })
      );
    },

    async listProjectDeliveries(input) {
      const searchParams = new URLSearchParams();
      if (input.status !== undefined) {
        searchParams.set("status", input.status);
      }
      if (input.limit !== undefined) {
        searchParams.set("limit", String(input.limit));
      }
      const query = searchParams.toString();

      return expectProjectDeliveries(
        client.request({
          method: "GET",
          path: `/v1/projects/${input.projectId}/github/deliveries${query.length === 0 ? "" : `?${query}`}`,
          bearerToken: input.bearerToken
        })
      );
    },

    async retryProjectDelivery(input) {
      return expectProjectDelivery(
        client.request({
          method: "POST",
          path: `/v1/projects/${input.projectId}/github/deliveries/${input.deliveryId}/retry`,
          bearerToken: input.bearerToken,
          body: {}
        })
      );
    },

    async listProjectRules(input) {
      return expectProjectRules(
        client.request({
          method: "GET",
          path: `/v1/projects/${input.projectId}/github/rules`,
          bearerToken: input.bearerToken
        })
      );
    },

    async createProjectRule(input) {
      return expectProjectRule(
        client.request({
          method: "POST",
          path: `/v1/projects/${input.projectId}/github/rules`,
          bearerToken: input.bearerToken,
          body: {
            name: input.name,
            event_types: input.eventTypes,
            environments: input.environments,
            services: input.services,
            severity_min: input.severityMin,
            bundle_type: input.bundleType,
            incident_status: input.incidentStatus,
            cooldown_seconds: input.cooldownSeconds,
            ...(input.enabled === undefined ? {} : { enabled: input.enabled })
          }
        })
      );
    },

    async updateProjectRule(input) {
      return expectProjectRule(
        client.request({
          method: "PATCH",
          path: `/v1/projects/${input.projectId}/github/rules/${input.ruleId}`,
          bearerToken: input.bearerToken,
          body: {
            ...(input.name === undefined ? {} : { name: input.name }),
            ...(input.eventTypes === undefined ? {} : { event_types: input.eventTypes }),
            ...(input.environments === undefined ? {} : { environments: input.environments }),
            ...(input.services === undefined ? {} : { services: input.services }),
            ...(input.severityMin === undefined ? {} : { severity_min: input.severityMin }),
            ...(input.bundleType === undefined ? {} : { bundle_type: input.bundleType }),
            ...(input.incidentStatus === undefined ? {} : { incident_status: input.incidentStatus }),
            ...(input.cooldownSeconds === undefined ? {} : { cooldown_seconds: input.cooldownSeconds }),
            ...(input.enabled === undefined ? {} : { enabled: input.enabled })
          }
        })
      );
    },

    async deleteProjectRule(input) {
      return expectNoContent(
        client.request({
          method: "DELETE",
          path: `/v1/projects/${input.projectId}/github/rules/${input.ruleId}`,
          bearerToken: input.bearerToken
        })
      );
    },

    async setProjectRepo(input) {
      return expectProjectRepo(
        client.request({
          method: "PUT",
          path: `/v1/projects/${input.projectId}/github/repo`,
          bearerToken: input.bearerToken,
          body: {
            owner: input.owner,
            repo: input.repo
          }
        })
      );
    },

    async removeProjectRepo(input) {
      return expectNoContent(
        client.request({
          method: "DELETE",
          path: `/v1/projects/${input.projectId}/github/repo`,
          bearerToken: input.bearerToken
        })
      );
    }
  };
}