import {
  API_BASE,
  buildBrowserSessionHeaders,
  readJson
} from "./api-client.js";
import type {
  GitHubDispatchDeliveryRecord,
  GitHubDispatchRuleRecord,
  GitHubInstallationRecord,
  GitHubRepositoryRecord,
  ProjectGitHubRepoRecord
} from "./api-types.js";

interface GitHubInstallUrlResponse {
  install_url: string;
}

export async function getGitHubInstallation(
  projectId?: string
): Promise<GitHubInstallationRecord | null> {
  const searchParams = new URLSearchParams();
  if (projectId !== undefined) {
    searchParams.set("project_id", projectId);
  }

  const body = await readJson<{ installation: GitHubInstallationRecord | null }>(
    await fetch(
      `${API_BASE}/v1/github/installation${searchParams.size === 0 ? "" : `?${searchParams.toString()}`}`,
      {
        credentials: "include"
      }
    )
  );

  return body.installation;
}

export async function getGitHubInstallUrl(
  returnTo?: string,
  projectId?: string
): Promise<string> {
  const searchParams = new URLSearchParams();
  if (returnTo !== undefined) {
    searchParams.set("return_to", returnTo);
  }
  if (projectId !== undefined) {
    searchParams.set("project_id", projectId);
  }

  const body = await readJson<GitHubInstallUrlResponse>(
    await fetch(
      `${API_BASE}/v1/github/app/install-url${searchParams.size === 0 ? "" : `?${searchParams.toString()}`}`,
      {
        credentials: "include"
      }
    )
  );

  return body.install_url;
}

export async function listGitHubRepositories(
  projectId?: string
): Promise<GitHubRepositoryRecord[]> {
  const searchParams = new URLSearchParams();
  if (projectId !== undefined) {
    searchParams.set("project_id", projectId);
  }

  const body = await readJson<{ repositories: GitHubRepositoryRecord[] }>(
    await fetch(
      `${API_BASE}/v1/github/repositories${searchParams.size === 0 ? "" : `?${searchParams.toString()}`}`,
      {
        credentials: "include"
      }
    )
  );

  return body.repositories;
}

export async function getProjectGitHubRepo(
  projectId: string
): Promise<ProjectGitHubRepoRecord | null> {
  const body = await readJson<{ repo: ProjectGitHubRepoRecord | null }>(
    await fetch(`${API_BASE}/v1/projects/${projectId}/github/repo`, {
      credentials: "include"
    })
  );

  return body.repo;
}

export async function listProjectGitHubRules(
  projectId: string
): Promise<GitHubDispatchRuleRecord[]> {
  const body = await readJson<{ rules: GitHubDispatchRuleRecord[] }>(
    await fetch(`${API_BASE}/v1/projects/${projectId}/github/rules`, {
      credentials: "include"
    })
  );

  return body.rules;
}

export async function createProjectGitHubRule(
  projectId: string,
  payload: {
    name: string;
    event_types: string[];
    environments: string[];
    services: string[];
    severity_min: "low" | "medium" | "high" | "critical" | null;
    bundle_type: "failure" | "improvement" | null;
    incident_status: "new_only" | "reopened_only" | "new_or_reopened";
    cooldown_seconds: number;
    enabled?: boolean;
  }
): Promise<GitHubDispatchRuleRecord> {
  const body = await readJson<{ rule: GitHubDispatchRuleRecord }>(
    await fetch(`${API_BASE}/v1/projects/${projectId}/github/rules`, {
      method: "POST",
      credentials: "include",
      headers: buildBrowserSessionHeaders(true),
      body: JSON.stringify({
        ...payload,
        enabled: payload.enabled ?? true
      })
    })
  );

  return body.rule;
}

export async function updateProjectGitHubRule(
  projectId: string,
  ruleId: string,
  payload: {
    name?: string;
    event_types?: string[];
    environments?: string[];
    services?: string[];
    severity_min?: "low" | "medium" | "high" | "critical" | null;
    bundle_type?: "failure" | "improvement" | null;
    incident_status?: "new_only" | "reopened_only" | "new_or_reopened";
    cooldown_seconds?: number;
    enabled?: boolean;
  }
): Promise<GitHubDispatchRuleRecord> {
  const body = await readJson<{ rule: GitHubDispatchRuleRecord }>(
    await fetch(`${API_BASE}/v1/projects/${projectId}/github/rules/${ruleId}`, {
      method: "PATCH",
      credentials: "include",
      headers: buildBrowserSessionHeaders(true),
      body: JSON.stringify(payload)
    })
  );

  return body.rule;
}

export async function deleteProjectGitHubRule(
  projectId: string,
  ruleId: string
): Promise<void> {
  const response = await fetch(`${API_BASE}/v1/projects/${projectId}/github/rules/${ruleId}`, {
    method: "DELETE",
    credentials: "include",
    headers: buildBrowserSessionHeaders()
  });

  if (!response.ok) {
    await readJson(response);
  }
}

export async function listProjectGitHubDeliveries(
  projectId: string,
  limit = 20
): Promise<GitHubDispatchDeliveryRecord[]> {
  const searchParams = new URLSearchParams({
    limit: String(limit)
  });

  const body = await readJson<{ deliveries: GitHubDispatchDeliveryRecord[] }>(
    await fetch(
      `${API_BASE}/v1/projects/${projectId}/github/deliveries?${searchParams.toString()}`,
      {
        credentials: "include"
      }
    )
  );

  return body.deliveries;
}

export async function retryProjectGitHubDelivery(
  projectId: string,
  deliveryId: string
): Promise<GitHubDispatchDeliveryRecord> {
  const body = await readJson<{ delivery: GitHubDispatchDeliveryRecord }>(
    await fetch(`${API_BASE}/v1/projects/${projectId}/github/deliveries/${deliveryId}/retry`, {
      method: "POST",
      credentials: "include",
      headers: buildBrowserSessionHeaders(true),
      body: JSON.stringify({})
    })
  );

  return body.delivery;
}

export async function setProjectGitHubRepo(
  projectId: string,
  payload: { owner: string; repo: string }
): Promise<ProjectGitHubRepoRecord> {
  const body = await readJson<{ repo: ProjectGitHubRepoRecord }>(
    await fetch(`${API_BASE}/v1/projects/${projectId}/github/repo`, {
      method: "PUT",
      credentials: "include",
      headers: buildBrowserSessionHeaders(true),
      body: JSON.stringify(payload)
    })
  );

  return body.repo;
}

export async function removeProjectGitHubRepo(projectId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/v1/projects/${projectId}/github/repo`, {
    method: "DELETE",
    credentials: "include",
    headers: buildBrowserSessionHeaders()
  });

  if (!response.ok) {
    await readJson(response);
  }
}
