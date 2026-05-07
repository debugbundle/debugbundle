import { describe, expect, it, vi } from "vitest";

import { ProjectManagementApiError } from "../../../packages/project-management-client/src/index.js";
import { createProjectMcpTools, PROJECT_MCP_TOOL_NAMES } from "../../../apps/mcp/src/project-tools.js";

describe("mcp project tools", () => {
  it("declares project tool parity", () => {
    expect(PROJECT_MCP_TOOL_NAMES).toEqual(["list_projects", "create_project", "update_project", "delete_project"]);
  });

  it("returns project payloads for all operations", async () => {
    const tools = createProjectMcpTools({
      listProjects: vi.fn().mockResolvedValue([{ project_id: "proj_1", name: "Main App" }]),
      createProject: vi.fn().mockResolvedValue({ project_id: "proj_2", name: "New App", slug: "new-app" }),
      updateProject: vi.fn().mockResolvedValue({ project_id: "proj_2", name: "Renamed App", slug: "new-app" }),
      deleteProject: vi.fn().mockResolvedValue({ project_id: "proj_1", name: "Main App" })
    });

    await expect(
      tools.list_projects({
        bearerToken: "dbundle_mem_x",
        limit: 10
      })
    ).resolves.toEqual({
      projects: [{ project_id: "proj_1", name: "Main App" }]
    });

    await expect(
      tools.create_project({
        bearerToken: "dbundle_mem_x",
        name: "New App",
        slug: "new-app"
      })
    ).resolves.toEqual({
      project: { project_id: "proj_2", name: "New App", slug: "new-app" }
    });

    await expect(
      tools.update_project({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_2",
        name: "Renamed App"
      })
    ).resolves.toEqual({
      project: { project_id: "proj_2", name: "Renamed App", slug: "new-app" }
    });

    await expect(
      tools.delete_project({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1"
      })
    ).resolves.toEqual({
      project: { project_id: "proj_1", name: "Main App" }
    });
  });

  it("maps api and unknown errors", async () => {
    const apiErrorTools = createProjectMcpTools({
      listProjects: vi.fn().mockRejectedValue(new ProjectManagementApiError(404, "project_not_found")),
      createProject: vi.fn().mockRejectedValue(new Error("network")),
      updateProject: vi.fn().mockRejectedValue(new ProjectManagementApiError(409, "project_slug_taken")),
      deleteProject: vi.fn().mockRejectedValue(new ProjectManagementApiError(404, "project_not_found"))
    });

    await expect(
      apiErrorTools.list_projects({ bearerToken: "dbundle_mem_x" })
    ).rejects.toThrow("mcp_tool_error:project_not_found");

    await expect(
      apiErrorTools.create_project({
        bearerToken: "dbundle_mem_x",
        name: "App",
        slug: "app"
      })
    ).rejects.toThrow("mcp_tool_error:unknown_error");

    await expect(
      apiErrorTools.update_project({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        slug: "taken-slug"
      })
    ).rejects.toThrow("mcp_tool_error:project_slug_taken");

    await expect(
      apiErrorTools.delete_project({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1"
      })
    ).rejects.toThrow("mcp_tool_error:project_not_found");
  });

  it("forwards optional fields through create and update tools", async () => {
    const api = {
      listProjects: vi.fn().mockResolvedValue([]),
      createProject: vi.fn().mockResolvedValue({ project_id: "proj_3" }),
      updateProject: vi.fn().mockResolvedValue({ project_id: "proj_3" }),
      deleteProject: vi.fn().mockResolvedValue({ project_id: "proj_3" })
    };
    const tools = createProjectMcpTools(api);

    await tools.create_project({
      bearerToken: "dbundle_mem_x",
      name: "App",
      slug: "app",
      environmentDefault: "staging"
    });

    expect(api.createProject).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_x",
      name: "App",
      slug: "app",
      environmentDefault: "staging"
    });

    await tools.update_project({
      bearerToken: "dbundle_mem_x",
      projectId: "proj_3",
      name: "Renamed",
      slug: "renamed",
      environmentDefault: "production"
    });

    expect(api.updateProject).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_x",
      projectId: "proj_3",
      name: "Renamed",
      slug: "renamed",
      environmentDefault: "production"
    });
  });
});