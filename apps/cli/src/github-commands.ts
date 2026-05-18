import { GitHubManagementApiError } from "../../../packages/github-client/src/index.js";

import { createAuthenticatedGitHubManagementApi, runAuthenticatedCliCommand } from "./auth-context.js";
import type { CliCommandResult } from "./token-commands.js";

interface InstallationLike {
  id: string;
  installation_id: number;
  account_login: string;
  account_type: "Organization" | "User";
  status: "active" | "suspended" | "removed";
  created_at: string;
  updated_at: string;
}

interface RepositoryLike {
  id: number;
  owner: string;
  name: string;
  full_name: string;
  default_branch: string;
  private: boolean;
}

interface ProjectRepoLike {
  id: string;
  project_id: string;
  installation_id: string;
  repo_owner: string;
  repo_name: string;
  default_branch: string;
  created_at: string;
  updated_at: string;
}

interface GitHubDispatchRuleLike {
  rule_id: string;
  project_id: string;
  name: string;
  enabled: boolean;
  event_types: string[];
  environments: string[];
  services: string[];
  severity_min: "low" | "medium" | "high" | "critical" | null;
  bundle_type: "failure" | "improvement" | null;
  incident_status: "new_only" | "reopened_only" | "new_or_reopened";
  cooldown_seconds: number;
  created_at: string;
  updated_at: string;
}

interface GitHubDispatchDeliveryLike {
  delivery_id: string;
  rule_id: string;
  rule_name: string;
  incident_id: string;
  incident_title: string;
  status: "pending" | "retrying" | "delivered" | "failed" | "skipped";
  attempt_count: number;
  last_attempt_at: string | null;
  last_error: string | null;
  github_status_code: number | null;
  created_at: string;
}

function mapErrorToExitCode(error: unknown): number {
  if (!(error instanceof GitHubManagementApiError)) {
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
  if (error.status === 403 || error.status === 409) {
    return 5;
  }

  return 1;
}

function formatInstallation(installation: InstallationLike): string {
  return [
    `GitHub installation: ${installation.account_login}`,
    `Installation ID: ${installation.installation_id}`,
    `Account type: ${installation.account_type}`,
    `Status: ${installation.status}`
  ].join("\n");
}

function formatProjectRepo(repo: ProjectRepoLike): string {
  return `Assigned repo: ${repo.repo_owner}/${repo.repo_name} (${repo.default_branch})`;
}

function formatGitHubRuleTable(rules: GitHubDispatchRuleLike[]): string {
  if (rules.length === 0) {
    return "No GitHub rules found.";
  }

  return rules
    .map(
      (rule) =>
        `${rule.name} | ${rule.enabled ? "enabled" : "disabled"} | ${rule.event_types.join(",")}`
        + ` | ${rule.severity_min ?? "none"} | ${rule.cooldown_seconds}s`
    )
    .join("\n");
}

function formatGitHubDeliveryTable(deliveries: GitHubDispatchDeliveryLike[]): string {
  if (deliveries.length === 0) {
    return "No GitHub deliveries found.";
  }

  return deliveries
    .map(
      (delivery) =>
        `${delivery.rule_name} | ${delivery.status} | ${delivery.incident_title} | attempts: ${delivery.attempt_count}`
    )
    .join("\n");
}

export async function getGitHubStatusCommand(
  input: {
    bearerToken: string;
    projectId?: string;
    json?: boolean;
  },
  api: {
    getInstallation(input: { bearerToken: string; projectId?: string }): Promise<InstallationLike>;
    getProjectRepo?(input: { bearerToken: string; projectId: string }): Promise<ProjectRepoLike>;
  }
): Promise<CliCommandResult> {
  try {
    const installation = await api.getInstallation({
      bearerToken: input.bearerToken,
      ...(input.projectId === undefined ? {} : { projectId: input.projectId })
    });
    const repo =
      input.projectId === undefined || api.getProjectRepo === undefined
        ? null
        : await api.getProjectRepo({ bearerToken: input.bearerToken, projectId: input.projectId });

    if (input.json) {
      return {
        exitCode: 0,
        output: JSON.stringify(repo === null ? { installation } : { installation, repo })
      };
    }

    return {
      exitCode: 0,
      output: repo === null ? formatInstallation(installation) : `${formatInstallation(installation)}\n${formatProjectRepo(repo)}`
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: error instanceof Error ? error.message : String(error) };
  }
}

export async function listGitHubRepositoriesCommand(
  input: {
    bearerToken: string;
    projectId?: string;
    json?: boolean;
  },
  api: {
    listRepositories(input: { bearerToken: string; projectId?: string }): Promise<RepositoryLike[]>;
  }
): Promise<CliCommandResult> {
  try {
    const repositories = await api.listRepositories({
      bearerToken: input.bearerToken,
      ...(input.projectId === undefined ? {} : { projectId: input.projectId })
    });
    return {
      exitCode: 0,
      output: input.json
        ? JSON.stringify({ repositories })
        : repositories.length === 0
          ? "No GitHub repositories found."
          : repositories.map((repository) => `${repository.full_name} (${repository.default_branch})`).join("\n")
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: error instanceof Error ? error.message : String(error) };
  }
}

export async function setProjectGitHubRepoCommand(
  input: {
    bearerToken: string;
    projectId: string;
    repoRef: string;
    json?: boolean;
  },
  api: {
    setProjectRepo(input: { bearerToken: string; projectId: string; owner: string; repo: string }): Promise<ProjectRepoLike>;
  }
): Promise<CliCommandResult> {
  try {
    const [owner, repo] = input.repoRef.split("/");
    if (owner === undefined || owner.length === 0 || repo === undefined || repo.length === 0 || input.repoRef.includes("//")) {
      return {
        exitCode: 4,
        output: "Repository must be provided as owner/repo."
      };
    }

    const assignedRepo = await api.setProjectRepo({
      bearerToken: input.bearerToken,
      projectId: input.projectId,
      owner,
      repo
    });

    return {
      exitCode: 0,
      output: input.json ? JSON.stringify({ repo: assignedRepo }) : `Project repo set: ${formatProjectRepo(assignedRepo)}`
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: error instanceof Error ? error.message : String(error) };
  }
}

export async function removeProjectGitHubRepoCommand(
  input: {
    bearerToken: string;
    projectId: string;
    json?: boolean;
  },
  api: {
    removeProjectRepo(input: { bearerToken: string; projectId: string }): Promise<void>;
  }
): Promise<CliCommandResult> {
  try {
    await api.removeProjectRepo({ bearerToken: input.bearerToken, projectId: input.projectId });
    return {
      exitCode: 0,
      output: input.json ? JSON.stringify({ removed: true, project_id: input.projectId }) : `Project repo removed: ${input.projectId}`
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: error instanceof Error ? error.message : String(error) };
  }
}

export async function listProjectGitHubRulesCommand(
  input: {
    bearerToken: string;
    projectId: string;
    json?: boolean;
  },
  api: {
    listProjectRules(input: { bearerToken: string; projectId: string }): Promise<GitHubDispatchRuleLike[]>;
  }
): Promise<CliCommandResult> {
  try {
    const rules = await api.listProjectRules({
      bearerToken: input.bearerToken,
      projectId: input.projectId
    });

    return {
      exitCode: 0,
      output: input.json ? JSON.stringify({ rules }) : formatGitHubRuleTable(rules)
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: error instanceof Error ? error.message : String(error) };
  }
}

export async function listProjectGitHubDeliveriesCommand(
  input: {
    bearerToken: string;
    projectId: string;
    status?: "pending" | "retrying" | "delivered" | "failed" | "skipped";
    limit?: number;
    json?: boolean;
  },
  api: {
    listProjectDeliveries(input: {
      bearerToken: string;
      projectId: string;
      status?: "pending" | "retrying" | "delivered" | "failed" | "skipped";
      limit?: number;
    }): Promise<GitHubDispatchDeliveryLike[]>;
  }
): Promise<CliCommandResult> {
  try {
    const deliveries = await api.listProjectDeliveries({
      bearerToken: input.bearerToken,
      projectId: input.projectId,
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(input.limit === undefined ? {} : { limit: input.limit })
    });

    return {
      exitCode: 0,
      output: input.json ? JSON.stringify({ deliveries }) : formatGitHubDeliveryTable(deliveries)
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: error instanceof Error ? error.message : String(error) };
  }
}

export async function retryProjectGitHubDeliveryCommand(
  input: {
    bearerToken: string;
    projectId: string;
    deliveryId: string;
    json?: boolean;
  },
  api: {
    retryProjectDelivery(input: { bearerToken: string; projectId: string; deliveryId: string }): Promise<GitHubDispatchDeliveryLike>;
  }
): Promise<CliCommandResult> {
  try {
    const delivery = await api.retryProjectDelivery({
      bearerToken: input.bearerToken,
      projectId: input.projectId,
      deliveryId: input.deliveryId
    });

    return {
      exitCode: 0,
      output: input.json ? JSON.stringify({ delivery }) : `GitHub delivery retried: ${delivery.delivery_id} | ${delivery.status}`
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: error instanceof Error ? error.message : String(error) };
  }
}

export async function createProjectGitHubRuleCommand(
  input: {
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
    json?: boolean;
  },
  api: {
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
    }): Promise<GitHubDispatchRuleLike>;
  }
): Promise<CliCommandResult> {
  try {
    const rule = await api.createProjectRule({
      bearerToken: input.bearerToken,
      projectId: input.projectId,
      name: input.name,
      eventTypes: input.eventTypes,
      environments: input.environments,
      services: input.services,
      severityMin: input.severityMin,
      bundleType: input.bundleType,
      incidentStatus: input.incidentStatus,
      cooldownSeconds: input.cooldownSeconds,
      ...(input.enabled === undefined ? {} : { enabled: input.enabled })
    });

    return {
      exitCode: 0,
      output: input.json ? JSON.stringify({ rule }) : `GitHub rule created: ${rule.rule_id}`
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: error instanceof Error ? error.message : String(error) };
  }
}

export async function updateProjectGitHubRuleCommand(
  input: {
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
    json?: boolean;
  },
  api: {
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
    }): Promise<GitHubDispatchRuleLike>;
  }
): Promise<CliCommandResult> {
  try {
    const rule = await api.updateProjectRule({
      bearerToken: input.bearerToken,
      projectId: input.projectId,
      ruleId: input.ruleId,
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.eventTypes === undefined ? {} : { eventTypes: input.eventTypes }),
      ...(input.environments === undefined ? {} : { environments: input.environments }),
      ...(input.services === undefined ? {} : { services: input.services }),
      ...(input.severityMin === undefined ? {} : { severityMin: input.severityMin }),
      ...(input.bundleType === undefined ? {} : { bundleType: input.bundleType }),
      ...(input.incidentStatus === undefined ? {} : { incidentStatus: input.incidentStatus }),
      ...(input.cooldownSeconds === undefined ? {} : { cooldownSeconds: input.cooldownSeconds }),
      ...(input.enabled === undefined ? {} : { enabled: input.enabled })
    });

    return {
      exitCode: 0,
      output: input.json ? JSON.stringify({ rule }) : `GitHub rule updated: ${rule.rule_id}`
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: error instanceof Error ? error.message : String(error) };
  }
}

export async function deleteProjectGitHubRuleCommand(
  input: {
    bearerToken: string;
    projectId: string;
    ruleId: string;
    json?: boolean;
  },
  api: {
    deleteProjectRule(input: { bearerToken: string; projectId: string; ruleId: string }): Promise<void>;
  }
): Promise<CliCommandResult> {
  try {
    await api.deleteProjectRule({
      bearerToken: input.bearerToken,
      projectId: input.projectId,
      ruleId: input.ruleId
    });
    return {
      exitCode: 0,
      output: input.json
        ? JSON.stringify({ deleted: true, project_id: input.projectId, rule_id: input.ruleId })
        : `GitHub rule deleted: ${input.ruleId}`
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: error instanceof Error ? error.message : String(error) };
  }
}

export async function getGitHubStatusWithAuthCommand(
  input: { authFilePath?: string; projectId?: string; json?: boolean },
  dependencies?: Parameters<typeof createAuthenticatedGitHubManagementApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedGitHubManagementApi,
    dependencies,
    runCommand: (authState, api) => {
      const commandInput: { bearerToken: string; projectId?: string; json?: boolean } = {
        bearerToken: authState.bearer_token
      };
      if (input.projectId !== undefined) {
        commandInput.projectId = input.projectId;
      }
      if (input.json !== undefined) {
        commandInput.json = input.json;
      }

      return getGitHubStatusCommand(commandInput, api);
    }
  });
}

export async function listGitHubRepositoriesWithAuthCommand(
  input: { authFilePath?: string; json?: boolean },
  dependencies?: Parameters<typeof createAuthenticatedGitHubManagementApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedGitHubManagementApi,
    dependencies,
    runCommand: (authState, api) =>
      listGitHubRepositoriesCommand(
        {
          bearerToken: authState.bearer_token,
          ...(input.json === undefined ? {} : { json: input.json })
        },
        api
      )
  });
}

export async function setProjectGitHubRepoWithAuthCommand(
  input: { authFilePath?: string; projectId: string; repoRef: string; json?: boolean },
  dependencies?: Parameters<typeof createAuthenticatedGitHubManagementApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedGitHubManagementApi,
    dependencies,
    runCommand: (authState, api) =>
      setProjectGitHubRepoCommand(
        {
          bearerToken: authState.bearer_token,
          projectId: input.projectId,
          repoRef: input.repoRef,
          ...(input.json === undefined ? {} : { json: input.json })
        },
        api
      )
  });
}

export async function removeProjectGitHubRepoWithAuthCommand(
  input: { authFilePath?: string; projectId: string; json?: boolean },
  dependencies?: Parameters<typeof createAuthenticatedGitHubManagementApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedGitHubManagementApi,
    dependencies,
    runCommand: (authState, api) =>
      removeProjectGitHubRepoCommand(
        {
          bearerToken: authState.bearer_token,
          projectId: input.projectId,
          ...(input.json === undefined ? {} : { json: input.json })
        },
        api
      )
  });
}

export async function listProjectGitHubRulesWithAuthCommand(
  input: { authFilePath?: string; projectId: string; json?: boolean },
  dependencies?: Parameters<typeof createAuthenticatedGitHubManagementApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedGitHubManagementApi,
    dependencies,
    runCommand: (authState, api) =>
      listProjectGitHubRulesCommand(
        {
          bearerToken: authState.bearer_token,
          projectId: input.projectId,
          ...(input.json === undefined ? {} : { json: input.json })
        },
        api
      )
  });
}

export async function createProjectGitHubRuleWithAuthCommand(
  input: {
    authFilePath?: string;
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
    json?: boolean;
  },
  dependencies?: Parameters<typeof createAuthenticatedGitHubManagementApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedGitHubManagementApi,
    dependencies,
    runCommand: (authState, api) =>
      createProjectGitHubRuleCommand(
        {
          bearerToken: authState.bearer_token,
          projectId: input.projectId,
          name: input.name,
          eventTypes: input.eventTypes,
          environments: input.environments,
          services: input.services,
          severityMin: input.severityMin,
          bundleType: input.bundleType,
          incidentStatus: input.incidentStatus,
          cooldownSeconds: input.cooldownSeconds,
          ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
          ...(input.json === undefined ? {} : { json: input.json })
        },
        api
      )
  });
}

export async function updateProjectGitHubRuleWithAuthCommand(
  input: {
    authFilePath?: string;
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
    json?: boolean;
  },
  dependencies?: Parameters<typeof createAuthenticatedGitHubManagementApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedGitHubManagementApi,
    dependencies,
    runCommand: (authState, api) =>
      updateProjectGitHubRuleCommand(
        {
          bearerToken: authState.bearer_token,
          projectId: input.projectId,
          ruleId: input.ruleId,
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.eventTypes === undefined ? {} : { eventTypes: input.eventTypes }),
          ...(input.environments === undefined ? {} : { environments: input.environments }),
          ...(input.services === undefined ? {} : { services: input.services }),
          ...(input.severityMin === undefined ? {} : { severityMin: input.severityMin }),
          ...(input.bundleType === undefined ? {} : { bundleType: input.bundleType }),
          ...(input.incidentStatus === undefined ? {} : { incidentStatus: input.incidentStatus }),
          ...(input.cooldownSeconds === undefined ? {} : { cooldownSeconds: input.cooldownSeconds }),
          ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
          ...(input.json === undefined ? {} : { json: input.json })
        },
        api
      )
  });
}

export async function deleteProjectGitHubRuleWithAuthCommand(
  input: { authFilePath?: string; projectId: string; ruleId: string; json?: boolean },
  dependencies?: Parameters<typeof createAuthenticatedGitHubManagementApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedGitHubManagementApi,
    dependencies,
    runCommand: (authState, api) =>
      deleteProjectGitHubRuleCommand(
        {
          bearerToken: authState.bearer_token,
          projectId: input.projectId,
          ruleId: input.ruleId,
          ...(input.json === undefined ? {} : { json: input.json })
        },
        api
      )
  });
}

export async function listProjectGitHubDeliveriesWithAuthCommand(
  input: {
    authFilePath?: string;
    projectId: string;
    status?: "pending" | "retrying" | "delivered" | "failed" | "skipped";
    limit?: number;
    json?: boolean;
  },
  dependencies?: Parameters<typeof createAuthenticatedGitHubManagementApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedGitHubManagementApi,
    dependencies,
    runCommand: (authState, api) =>
      listProjectGitHubDeliveriesCommand(
        {
          bearerToken: authState.bearer_token,
          projectId: input.projectId,
          ...(input.status === undefined ? {} : { status: input.status }),
          ...(input.limit === undefined ? {} : { limit: input.limit }),
          ...(input.json === undefined ? {} : { json: input.json })
        },
        api
      )
  });
}

export async function retryProjectGitHubDeliveryWithAuthCommand(
  input: { authFilePath?: string; projectId: string; deliveryId: string; json?: boolean },
  dependencies?: Parameters<typeof createAuthenticatedGitHubManagementApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedGitHubManagementApi,
    dependencies,
    runCommand: (authState, api) =>
      retryProjectGitHubDeliveryCommand(
        {
          bearerToken: authState.bearer_token,
          projectId: input.projectId,
          deliveryId: input.deliveryId,
          ...(input.json === undefined ? {} : { json: input.json })
        },
        api
      )
  });
}
