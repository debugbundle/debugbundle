import { GitHubManagementApiError } from "../../../packages/github-client/src/index.js";

export const GITHUB_MCP_TOOL_NAMES = [
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
] as const;

function mapMcpError(error: unknown): never {
  if (error instanceof GitHubManagementApiError) {
    throw new Error(`mcp_tool_error:${error.code}`);
  }

  throw new Error("mcp_tool_error:unknown_error");
}

export function createGitHubMcpTools(api: {
  getInstallation(input: { bearerToken: string; projectId?: string }): Promise<unknown>;
  listRepositories(input: { bearerToken: string; projectId?: string }): Promise<unknown[]>;
  getProjectRepo?(input: { bearerToken: string; projectId: string }): Promise<unknown>;
  listProjectDeliveries?(input: {
    bearerToken: string;
    projectId: string;
    status?: "pending" | "retrying" | "delivered" | "failed";
    limit?: number;
  }): Promise<unknown[]>;
  retryProjectDelivery?(input: { bearerToken: string; projectId: string; deliveryId: string }): Promise<unknown>;
  listProjectRules?(input: { bearerToken: string; projectId: string }): Promise<unknown[]>;
  createProjectRule?(input: {
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
  }): Promise<unknown>;
  updateProjectRule?(input: {
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
  }): Promise<unknown>;
  deleteProjectRule?(input: { bearerToken: string; projectId: string; ruleId: string }): Promise<void>;
  setProjectRepo(input: { bearerToken: string; projectId: string; owner: string; repo: string }): Promise<unknown>;
  removeProjectRepo(input: { bearerToken: string; projectId: string }): Promise<void>;
}): Record<(typeof GITHUB_MCP_TOOL_NAMES)[number], (input: Record<string, unknown>) => Promise<unknown>> {
  return {
    async get_github_status(input) {
      try {
        const bearerToken = String(input["bearerToken"]);
        const projectId = typeof input["projectId"] === "string" ? input["projectId"] : undefined;
        const installation = await api.getInstallation({
          bearerToken,
          ...(projectId === undefined ? {} : { projectId })
        });
        const repo =
          projectId === undefined || api.getProjectRepo === undefined
            ? undefined
            : await api.getProjectRepo({ bearerToken, projectId });

        return repo === undefined ? { installation } : { installation, repo };
      } catch (error) {
        mapMcpError(error);
      }
    },

    async list_github_repositories(input) {
      try {
        return {
          repositories: await api.listRepositories({
            bearerToken: String(input["bearerToken"]),
            ...(typeof input["projectId"] === "string" ? { projectId: input["projectId"] } : {})
          })
        };
      } catch (error) {
        mapMcpError(error);
      }
    },

    async list_github_dispatch_rules(input) {
      try {
        return {
          rules: await api.listProjectRules!({
            bearerToken: String(input["bearerToken"]),
            projectId: String(input["projectId"])
          })
        };
      } catch (error) {
        mapMcpError(error);
      }
    },

    async create_github_dispatch_rule(input) {
      try {
        return {
          rule: await api.createProjectRule!({
            bearerToken: String(input["bearerToken"]),
            projectId: String(input["projectId"]),
            name: String(input["name"]),
            eventTypes: Array.isArray(input["eventTypes"]) ? input["eventTypes"].map((value) => String(value)) : [],
            environments: Array.isArray(input["environments"]) ? input["environments"].map((value) => String(value)) : [],
            services: Array.isArray(input["services"]) ? input["services"].map((value) => String(value)) : [],
            severityMin: String(input["severityMin"]) as "low" | "medium" | "high" | "critical",
            bundleType: String(input["bundleType"]) as "failure" | "improvement",
            incidentStatus: String(input["incidentStatus"]) as "new_only" | "reopened_only" | "new_or_reopened",
            cooldownSeconds: Number(input["cooldownSeconds"]),
            ...(typeof input["enabled"] === "boolean" ? { enabled: input["enabled"] } : {})
          })
        };
      } catch (error) {
        mapMcpError(error);
      }
    },

    async update_github_dispatch_rule(input) {
      try {
        return {
          rule: await api.updateProjectRule!({
            bearerToken: String(input["bearerToken"]),
            projectId: String(input["projectId"]),
            ruleId: String(input["ruleId"]),
            ...(typeof input["name"] === "string" ? { name: input["name"] } : {}),
            ...(Array.isArray(input["eventTypes"]) ? { eventTypes: input["eventTypes"].map((value) => String(value)) } : {}),
            ...(Array.isArray(input["environments"]) ? { environments: input["environments"].map((value) => String(value)) } : {}),
            ...(Array.isArray(input["services"]) ? { services: input["services"].map((value) => String(value)) } : {}),
            ...(typeof input["severityMin"] === "string"
              ? { severityMin: input["severityMin"] as "low" | "medium" | "high" | "critical" }
              : {}),
            ...(typeof input["bundleType"] === "string"
              ? { bundleType: input["bundleType"] as "failure" | "improvement" }
              : {}),
            ...(typeof input["incidentStatus"] === "string"
              ? { incidentStatus: input["incidentStatus"] as "new_only" | "reopened_only" | "new_or_reopened" }
              : {}),
            ...(typeof input["cooldownSeconds"] === "number" ? { cooldownSeconds: input["cooldownSeconds"] } : {}),
            ...(typeof input["enabled"] === "boolean" ? { enabled: input["enabled"] } : {})
          })
        };
      } catch (error) {
        mapMcpError(error);
      }
    },

    async delete_github_dispatch_rule(input) {
      try {
        await api.deleteProjectRule!({
          bearerToken: String(input["bearerToken"]),
          projectId: String(input["projectId"]),
          ruleId: String(input["ruleId"])
        });

        return {
          deleted: true,
          project_id: String(input["projectId"]),
          rule_id: String(input["ruleId"])
        };
      } catch (error) {
        mapMcpError(error);
      }
    },

    async list_github_deliveries(input) {
      try {
        return {
          deliveries: await api.listProjectDeliveries!({
            bearerToken: String(input["bearerToken"]),
            projectId: String(input["projectId"]),
            ...(typeof input["status"] === "string"
              ? { status: input["status"] as "pending" | "retrying" | "delivered" | "failed" }
              : {}),
            ...(typeof input["limit"] === "number" ? { limit: input["limit"] } : {})
          })
        };
      } catch (error) {
        mapMcpError(error);
      }
    },

    async retry_github_delivery(input) {
      try {
        return {
          delivery: await api.retryProjectDelivery!({
            bearerToken: String(input["bearerToken"]),
            projectId: String(input["projectId"]),
            deliveryId: String(input["deliveryId"])
          })
        };
      } catch (error) {
        mapMcpError(error);
      }
    },

    async set_project_github_repo(input) {
      try {
        return {
          repo: await api.setProjectRepo({
            bearerToken: String(input["bearerToken"]),
            projectId: String(input["projectId"]),
            owner: String(input["owner"]),
            repo: String(input["repo"])
          })
        };
      } catch (error) {
        mapMcpError(error);
      }
    },

    async remove_project_github_repo(input) {
      try {
        await api.removeProjectRepo({
          bearerToken: String(input["bearerToken"]),
          projectId: String(input["projectId"])
        });

        return {
          removed: true,
          project_id: String(input["projectId"])
        };
      } catch (error) {
        mapMcpError(error);
      }
    }
  };
}
