import { ProjectManagementApiError } from "../../../packages/project-management-client/src/index.js";

export const PROJECT_MCP_TOOL_NAMES = ["list_projects", "create_project", "update_project", "delete_project"] as const;

function mapMcpError(error: unknown): never {
  if (error instanceof ProjectManagementApiError) {
    throw new Error(`mcp_tool_error:${error.code}`);
  }

  throw new Error("mcp_tool_error:unknown_error");
}

export function createProjectMcpTools(api: {
  listProjects(input: { bearerToken: string; limit?: number }): Promise<unknown[]>;
  createProject(input: {
    bearerToken: string;
    name: string;
    slug: string;
    environmentDefault?: string;
  }): Promise<unknown>;
  updateProject(input: {
    bearerToken: string;
    projectId: string;
    name?: string;
    slug?: string;
    environmentDefault?: string;
  }): Promise<unknown>;
  deleteProject(input: { bearerToken: string; projectId: string }): Promise<unknown>;
}): Record<(typeof PROJECT_MCP_TOOL_NAMES)[number], (input: Record<string, unknown>) => Promise<unknown>> {
  return {
    async list_projects(input) {
      try {
        const requestInput: { bearerToken: string; limit?: number } = {
          bearerToken: String(input["bearerToken"])
        };
        if (typeof input["limit"] === "number") {
          requestInput.limit = input["limit"];
        }

        return { projects: await api.listProjects(requestInput) };
      } catch (error) {
        mapMcpError(error);
      }
    },

    async create_project(input) {
      try {
        const requestInput: {
          bearerToken: string;
          name: string;
          slug: string;
          environmentDefault?: string;
        } = {
          bearerToken: String(input["bearerToken"]),
          name: String(input["name"]),
          slug: String(input["slug"])
        };
        if (typeof input["environmentDefault"] === "string") {
          requestInput.environmentDefault = input["environmentDefault"];
        }

        return { project: await api.createProject(requestInput) };
      } catch (error) {
        mapMcpError(error);
      }
    },

    async update_project(input) {
      try {
        const requestInput: {
          bearerToken: string;
          projectId: string;
          name?: string;
          slug?: string;
          environmentDefault?: string;
        } = {
          bearerToken: String(input["bearerToken"]),
          projectId: String(input["projectId"])
        };
        if (typeof input["name"] === "string") {
          requestInput.name = input["name"];
        }
        if (typeof input["slug"] === "string") {
          requestInput.slug = input["slug"];
        }
        if (typeof input["environmentDefault"] === "string") {
          requestInput.environmentDefault = input["environmentDefault"];
        }

        return { project: await api.updateProject(requestInput) };
      } catch (error) {
        mapMcpError(error);
      }
    },

    async delete_project(input) {
      try {
        return {
          project: await api.deleteProject({
            bearerToken: String(input["bearerToken"]),
            projectId: String(input["projectId"])
          })
        };
      } catch (error) {
        mapMcpError(error);
      }
    }
  };
}