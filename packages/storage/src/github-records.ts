import type {
  GitHubDispatchDeliveryIntent,
  GitHubDispatchDeliveryRecord,
  GitHubDispatchRuleRecord,
  GitHubInstallationRecord,
  MatchingGitHubDispatchRule,
  ProjectGitHubRepoRecord
} from "./types.js";
export function mapGitHubInstallationRow(
  row: GitHubInstallationRecord & Record<string, unknown>
): GitHubInstallationRecord {
  return {
    id: row.id,
    installation_id: Number(row.installation_id),
    account_login: row.account_login,
    account_type: row.account_type,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export function mapProjectGitHubRepoRow(
  row: ProjectGitHubRepoRecord & Record<string, unknown>
): ProjectGitHubRepoRecord {
  return {
    id: row.id,
    project_id: row.project_id,
    installation_id: row.installation_id,
    repo_owner: row.repo_owner,
    repo_name: row.repo_name,
    default_branch: row.default_branch,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export function mapGitHubDispatchRuleRow(
  row: GitHubDispatchRuleRecord & Record<string, unknown>
): GitHubDispatchRuleRecord {
  return {
    rule_id: row.rule_id,
    project_id: row.project_id,
    created_by_user_id: row.created_by_user_id,
    name: row.name,
    enabled: row.enabled,
    event_types: Array.isArray(row.event_types)
      ? row.event_types.map((value) => String(value))
      : [],
    environments: Array.isArray(row.environments)
      ? row.environments.map((value) => String(value))
      : [],
    services: Array.isArray(row.services) ? row.services.map((value) => String(value)) : [],
    severity_min: row.severity_min,
    bundle_type: row.bundle_type,
    incident_status: row.incident_status,
    cooldown_seconds: Number(row.cooldown_seconds),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export function mapGitHubDispatchDeliveryRow(
  row: GitHubDispatchDeliveryRecord & Record<string, unknown>
): GitHubDispatchDeliveryRecord {
  return {
    delivery_id: row.delivery_id,
    rule_id: row.rule_id,
    rule_name: row.rule_name,
    incident_id: row.incident_id,
    improvement_id: row.improvement_id,
    target_title: row.target_title,
    status: row.status,
    attempt_count: Number(row.attempt_count),
    last_attempt_at: row.last_attempt_at,
    last_error: row.last_error,
    github_status_code: row.github_status_code === null ? null : Number(row.github_status_code),
    created_at: row.created_at
  };
}

export function mapMatchingGitHubDispatchRule(
  row: MatchingGitHubDispatchRule & Record<string, unknown>
): MatchingGitHubDispatchRule {
  return {
    rule_id: row.rule_id,
    rule_name: row.rule_name,
    installation_id: Number(row.installation_id),
    repo_owner: row.repo_owner,
    repo_name: row.repo_name,
    default_branch: row.default_branch,
    cooldown_seconds: Number(row.cooldown_seconds)
  };
}

export function mapGitHubDispatchDeliveryIntent(
  row: GitHubDispatchDeliveryIntent & Record<string, unknown>
): GitHubDispatchDeliveryIntent {
  return {
    delivery_id: row.delivery_id,
    rule_id: row.rule_id,
    project_id: row.project_id,
    incident_id: row.incident_id,
    improvement_id: row.improvement_id,
    installation_id: Number(row.installation_id),
    repo_owner: row.repo_owner,
    repo_name: row.repo_name,
    status: row.status,
    attempt_count: Number(row.attempt_count),
    next_attempt_at: row.next_attempt_at,
    last_attempt_at: row.last_attempt_at,
    last_error: row.last_error,
    github_status_code: row.github_status_code === null ? null : Number(row.github_status_code),
    dispatch_payload:
      typeof row.dispatch_payload === "object" && row.dispatch_payload !== null
        ? Object.fromEntries(Object.entries(row.dispatch_payload))
        : {}
  };
}
