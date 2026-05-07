import { describe, expect, it, vi } from "vitest";

import { CliAuthStateError } from "../../../apps/cli/src/auth-state.js";
import {
  deleteProjectCommand,
  deleteProjectWithAuthCommand,
  listProjectsCommand,
  createProjectCommand,
  updateProjectCommand
} from "../../../apps/cli/src/project-commands.js";
import { ProjectManagementApiError } from "../../../packages/project-management-client/src/index.js";

describe("cli project commands", () => {
  it("renders project list in human and json modes", async () => {
    const projects = [
      { project_id: "proj_1", name: "Main App", slug: "main-app" },
      { project_id: "proj_2", name: "API", slug: "api" }
    ];

    const humanResult = await listProjectsCommand(
      { bearerToken: "dbundle_mem_x" },
      { listProjects: vi.fn().mockResolvedValue(projects) }
    );
    expect(humanResult.exitCode).toBe(0);
    expect(humanResult.output).toContain("proj_1 Main App (main-app)");
    expect(humanResult.output).toContain("proj_2 API (api)");

    const jsonResult = await listProjectsCommand(
      { bearerToken: "dbundle_mem_x", json: true },
      { listProjects: vi.fn().mockResolvedValue(projects) }
    );
    expect(jsonResult.exitCode).toBe(0);
    expect(JSON.parse(jsonResult.output)).toEqual({ projects });

    const emptyResult = await listProjectsCommand(
      { bearerToken: "dbundle_mem_x" },
      { listProjects: vi.fn().mockResolvedValue([]) }
    );
    expect(emptyResult.exitCode).toBe(0);
    expect(emptyResult.output).toBe("No projects found.");
  });

  it("renders created project output", async () => {
    const result = await createProjectCommand(
      {
        bearerToken: "dbundle_mem_x",
        name: "New App",
        slug: "new-app"
      },
      {
        createProject: vi.fn().mockResolvedValue({
          project_id: "proj_3",
          name: "New App",
          slug: "new-app"
        })
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toBe("Project created: proj_3 New App (new-app)");
  });

  it("renders updated project output", async () => {
    const result = await updateProjectCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        name: "Renamed App"
      },
      {
        updateProject: vi.fn().mockResolvedValue({
          project_id: "proj_1",
          name: "Renamed App",
          slug: "main-app"
        })
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toBe("Project updated: proj_1 Renamed App (main-app)");
  });

  it("renders deleted project output in human mode", async () => {
    const result = await deleteProjectCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1"
      },
      {
        deleteProject: vi.fn().mockResolvedValue({
          project_id: "proj_1",
          name: "Main App",
          slug: "main-app"
        })
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toBe("Project deleted: proj_1 (Main App)");
  });

  it("loads stored auth state and forwards it into project deletion", async () => {
    const readAuthState = vi.fn().mockResolvedValue({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test"
    });
    const httpClient = { request: vi.fn() };
    const createHttpClient = vi.fn().mockReturnValue(httpClient);
    const deleteProject = vi.fn().mockResolvedValue({
      project_id: "proj_1",
      name: "Main App",
      slug: "main-app"
    });
    const createApi = vi.fn().mockReturnValue({
      listProjects: vi.fn(),
      createProject: vi.fn(),
      updateProject: vi.fn(),
      deleteProject
    });

    const result = await deleteProjectWithAuthCommand(
      {
        authFilePath: "/tmp/auth.json",
        projectId: "proj_1",
        json: true
      },
      {
        readAuthState,
        createHttpClient,
        createApi
      }
    );

    expect(createHttpClient).toHaveBeenCalledWith({
      baseUrl: "https://selfhost.debugbundle.test"
    });
    expect(deleteProject).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved",
      projectId: "proj_1"
    });
    expect(JSON.parse(result.output)).toEqual({
      project: {
        project_id: "proj_1",
        name: "Main App",
        slug: "main-app"
      }
    });
  });

  it("maps auth and api failures to deterministic exit codes", async () => {
    const authFailure = await deleteProjectWithAuthCommand(
      {
        projectId: "proj_1"
      },
      {
        readAuthState: vi.fn().mockRejectedValue(new CliAuthStateError("auth_state_missing", "Not logged in."))
      }
    );

    const apiFailure = await deleteProjectCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "missing"
      },
      {
        deleteProject: vi.fn().mockRejectedValue(new ProjectManagementApiError(404, "project_not_found"))
      }
    );

    const slugConflict = await updateProjectCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        slug: "taken"
      },
      {
        updateProject: vi.fn().mockRejectedValue(new ProjectManagementApiError(409, "project_slug_taken"))
      }
    );

    expect(authFailure.exitCode).toBe(2);
    expect(authFailure.output).toBe("Not logged in.");
    expect(apiFailure.exitCode).toBe(3);
    expect(apiFailure.output).toContain("project_not_found");
    expect(slugConflict.exitCode).toBe(5);
    expect(slugConflict.output).toContain("project_slug_taken");
  });
});