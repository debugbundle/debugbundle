import { ProjectManagementApiError } from "../../../packages/project-management-client/src/index.js";

import { createAuthenticatedProjectManagementApi, runAuthenticatedCliCommand } from "./auth-context.js";
import type { CliCommandResult } from "./token-commands.js";

interface ProjectLike {
  project_id: string;
  name: string;
  slug: string;
}

interface DeletedProjectLike {
  project_id: string;
  name: string;
  slug: string;
}

function mapErrorToExitCode(error: unknown): number {
  if (!(error instanceof ProjectManagementApiError)) {
    return 1;
  }

  if (error.status === 401) {
    return 2;
  }
  if (error.status === 404) {
    return 3;
  }
  if (error.status === 400) {
    return 4;
  }
  if (error.status === 409) {
    return 5;
  }

  return 1;
}

function formatProject(project: ProjectLike): string {
  return `${project.project_id} ${project.name} (${project.slug})`;
}

export async function listProjectsCommand(
  input: {
    bearerToken: string;
    limit?: number;
    json?: boolean;
  },
  api: {
    listProjects(input: { bearerToken: string; limit?: number }): Promise<ProjectLike[]>;
  }
): Promise<CliCommandResult> {
  try {
    const requestInput: { bearerToken: string; limit?: number } = {
      bearerToken: input.bearerToken
    };
    if (input.limit !== undefined) {
      requestInput.limit = input.limit;
    }

    const projects = await api.listProjects(requestInput);
    return {
      exitCode: 0,
      output: input.json
        ? JSON.stringify({ projects })
        : projects.length === 0
          ? "No projects found."
          : projects.map(formatProject).join("\n")
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: error instanceof Error ? error.message : String(error) };
  }
}

export async function createProjectCommand(
  input: {
    bearerToken: string;
    name: string;
    slug: string;
    environmentDefault?: string;
    json?: boolean;
  },
  api: {
    createProject(input: {
      bearerToken: string;
      name: string;
      slug: string;
      environmentDefault?: string;
    }): Promise<ProjectLike>;
  }
): Promise<CliCommandResult> {
  try {
    const requestInput: {
      bearerToken: string;
      name: string;
      slug: string;
      environmentDefault?: string;
    } = {
      bearerToken: input.bearerToken,
      name: input.name,
      slug: input.slug
    };
    if (input.environmentDefault !== undefined) {
      requestInput.environmentDefault = input.environmentDefault;
    }

    const project = await api.createProject(requestInput);
    return {
      exitCode: 0,
      output: input.json ? JSON.stringify({ project }) : `Project created: ${formatProject(project)}`
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: error instanceof Error ? error.message : String(error) };
  }
}

export async function updateProjectCommand(
  input: {
    bearerToken: string;
    projectId: string;
    name?: string;
    slug?: string;
    environmentDefault?: string;
    json?: boolean;
  },
  api: {
    updateProject(input: {
      bearerToken: string;
      projectId: string;
      name?: string;
      slug?: string;
      environmentDefault?: string;
    }): Promise<ProjectLike>;
  }
): Promise<CliCommandResult> {
  try {
    const requestInput: {
      bearerToken: string;
      projectId: string;
      name?: string;
      slug?: string;
      environmentDefault?: string;
    } = {
      bearerToken: input.bearerToken,
      projectId: input.projectId
    };
    if (input.name !== undefined) {
      requestInput.name = input.name;
    }
    if (input.slug !== undefined) {
      requestInput.slug = input.slug;
    }
    if (input.environmentDefault !== undefined) {
      requestInput.environmentDefault = input.environmentDefault;
    }

    const project = await api.updateProject(requestInput);
    return {
      exitCode: 0,
      output: input.json ? JSON.stringify({ project }) : `Project updated: ${formatProject(project)}`
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: error instanceof Error ? error.message : String(error) };
  }
}

export async function deleteProjectCommand(
  input: {
    bearerToken: string;
    projectId: string;
    json?: boolean;
  },
  api: {
    deleteProject(input: { bearerToken: string; projectId: string }): Promise<DeletedProjectLike>;
  }
): Promise<CliCommandResult> {
  try {
    const project = await api.deleteProject({
      bearerToken: input.bearerToken,
      projectId: input.projectId
    });

    return {
      exitCode: 0,
      output: input.json ? JSON.stringify({ project }) : `Project deleted: ${project.project_id} (${project.name})`
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: error instanceof Error ? error.message : String(error) };
  }
}

export async function listProjectsWithAuthCommand(
  input: { authFilePath?: string; limit?: number; json?: boolean },
  dependencies?: Parameters<typeof createAuthenticatedProjectManagementApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedProjectManagementApi,
    dependencies,
    runCommand: (authState, api) => {
      const commandInput: { bearerToken: string; limit?: number; json?: boolean } = {
        bearerToken: authState.bearer_token
      };
      if (input.limit !== undefined) {
        commandInput.limit = input.limit;
      }
      if (input.json !== undefined) {
        commandInput.json = input.json;
      }

      return listProjectsCommand(commandInput, {
        listProjects: (requestInput) => api.listProjects(requestInput)
      });
    }
  });
}

export async function createProjectWithAuthCommand(
  input: {
    authFilePath?: string;
    name: string;
    slug: string;
    environmentDefault?: string;
    json?: boolean;
  },
  dependencies?: Parameters<typeof createAuthenticatedProjectManagementApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedProjectManagementApi,
    dependencies,
    runCommand: (authState, api) => {
      const commandInput: {
        bearerToken: string;
        name: string;
        slug: string;
        environmentDefault?: string;
        json?: boolean;
      } = {
        bearerToken: authState.bearer_token,
        name: input.name,
        slug: input.slug
      };
      if (input.environmentDefault !== undefined) {
        commandInput.environmentDefault = input.environmentDefault;
      }
      if (input.json !== undefined) {
        commandInput.json = input.json;
      }

      return createProjectCommand(commandInput, {
        createProject: (requestInput) => api.createProject(requestInput)
      });
    }
  });
}

export async function updateProjectWithAuthCommand(
  input: {
    authFilePath?: string;
    projectId: string;
    name?: string;
    slug?: string;
    environmentDefault?: string;
    json?: boolean;
  },
  dependencies?: Parameters<typeof createAuthenticatedProjectManagementApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedProjectManagementApi,
    dependencies,
    runCommand: (authState, api) => {
      const commandInput: {
        bearerToken: string;
        projectId: string;
        name?: string;
        slug?: string;
        environmentDefault?: string;
        json?: boolean;
      } = {
        bearerToken: authState.bearer_token,
        projectId: input.projectId
      };
      if (input.name !== undefined) {
        commandInput.name = input.name;
      }
      if (input.slug !== undefined) {
        commandInput.slug = input.slug;
      }
      if (input.environmentDefault !== undefined) {
        commandInput.environmentDefault = input.environmentDefault;
      }
      if (input.json !== undefined) {
        commandInput.json = input.json;
      }

      return updateProjectCommand(commandInput, {
        updateProject: (requestInput) => api.updateProject(requestInput)
      });
    }
  });
}

export async function deleteProjectWithAuthCommand(
  input: { authFilePath?: string; projectId: string; json?: boolean },
  dependencies?: Parameters<typeof createAuthenticatedProjectManagementApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedProjectManagementApi,
    dependencies,
    runCommand: (authState, api) => {
      const commandInput: { bearerToken: string; projectId: string; json?: boolean } = {
        bearerToken: authState.bearer_token,
        projectId: input.projectId
      };
      if (input.json !== undefined) {
        commandInput.json = input.json;
      }

      return deleteProjectCommand(commandInput, {
        deleteProject: (requestInput) => api.deleteProject(requestInput)
      });
    }
  });
}