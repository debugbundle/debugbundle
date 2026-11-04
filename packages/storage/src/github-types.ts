import type { DeliverGitHubDispatchJob } from "./queue-types.js";

export interface GitHubInstallationRecord extends Record<string, unknown> {
  id: string;
  installation_id: number;
  account_login: string;
  account_type: "Organization" | "User";
  status: "active" | "suspended" | "removed";
  created_at: string;
  updated_at: string;
}

export interface GitHubMarketplaceAccountRecord extends Record<string, unknown> {
  id: string;
  organization_id: string | null;
  marketplace_account_id: number;
  marketplace_account_login: string;
  marketplace_account_type: "Organization" | "User";
  marketplace_account_node_id: string | null;
  marketplace_listing_plan_id: number;
  marketplace_listing_plan_name: string;
  marketplace_plan_price_model: string | null;
  billing_cycle: "monthly" | "yearly" | null;
  unit_count: number | null;
  on_free_trial: boolean;
  free_trial_ends_on: string | null;
  next_billing_date: string | null;
  effective_date: string;
  installation_id: number | null;
  marketplace_purchase_status:
    | "purchased"
    | "cancelled"
    | "pending_change"
    | "pending_change_cancelled"
    | "changed";
  last_event_id: string;
  last_event_action: string;
  created_at: string;
  updated_at: string;
}

export interface GitHubRepositoryRecord extends Record<string, unknown> {
  id: number;
  owner: string;
  name: string;
  full_name: string;
  default_branch: string;
  private: boolean;
}

export interface ProjectGitHubRepoRecord extends Record<string, unknown> {
  id: string;
  project_id: string;
  installation_id: string;
  repo_owner: string;
  repo_name: string;
  default_branch: string;
  created_at: string;
  updated_at: string;
}

export interface GitHubDispatchRuleRecord extends Record<string, unknown> {
  rule_id: string;
  project_id: string;
  created_by_user_id: string;
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

export interface GitHubDispatchDeliveryRecord extends Record<string, unknown> {
  delivery_id: string;
  rule_id: string;
  rule_name: string;
  incident_id: string | null;
  improvement_id: string | null;
  target_title: string;
  status: "pending" | "retrying" | "delivered" | "failed" | "skipped";
  attempt_count: number;
  last_attempt_at: string | null;
  last_error: string | null;
  github_status_code: number | null;
  created_at: string;
}

export interface MatchingGitHubDispatchRule {
  rule_id: string;
  rule_name: string;
  installation_id: number;
  repo_owner: string;
  repo_name: string;
  default_branch: string;
  cooldown_seconds: number;
}

export interface GitHubDispatchDeliveryIntent {
  delivery_id: string;
  rule_id: string;
  project_id: string;
  incident_id: string | null;
  improvement_id: string | null;
  installation_id: number;
  repo_owner: string;
  repo_name: string;
  status: "pending" | "retrying" | "delivered" | "failed" | "skipped";
  attempt_count: number;
  next_attempt_at: string | null;
  last_attempt_at: string | null;
  last_error: string | null;
  github_status_code: number | null;
  dispatch_payload: Record<string, unknown>;
}

export interface MarkGitHubDispatchDeliveryAttemptInput {
  delivery_id: string;
  attempt: number;
  delivered: boolean;
  error_message: string | null;
  github_status_code: number | null;
  retry_after_seconds?: number | null;
}

export interface MarkGitHubDispatchDeliveryAttemptResult {
  status: "retrying" | "delivered" | "failed";
  next_attempt: number | null;
}

export interface GitHubStore {
  getGitHubInstallationForOrganization(input: {
    organization_id: string;
  }): Promise<GitHubInstallationRecord | null>;
  upsertGitHubInstallationForOrganization(input: {
    organization_id: string;
    installation_id: number;
    account_login: string;
    account_type: "Organization" | "User";
    status: "active" | "suspended" | "removed";
  }): Promise<GitHubInstallationRecord>;
  updateGitHubInstallationStatus(input: {
    installation_id: number;
    account_login?: string;
    account_type?: "Organization" | "User";
    status: "active" | "suspended" | "removed";
  }): Promise<GitHubInstallationRecord | null>;
  deleteGitHubInstallationForOrganization(input: {
    organization_id: string;
    actor_user_id?: string;
  }): Promise<boolean>;
  getProjectGitHubRepoForOrganization(input: {
    organization_id: string;
    project_id: string;
  }): Promise<ProjectGitHubRepoRecord | null>;
  upsertProjectGitHubRepoForOrganization(input: {
    actor_user_id?: string;
    organization_id: string;
    project_id: string;
    installation_id: string;
    repo_owner: string;
    repo_name: string;
    default_branch: string;
  }): Promise<ProjectGitHubRepoRecord | null>;
  deleteProjectGitHubRepoForOrganization(input: {
    actor_user_id?: string;
    organization_id: string;
    project_id: string;
  }): Promise<boolean>;
  listProjectGitHubRulesForOrganization(input: {
    organization_id: string;
    project_id: string;
  }): Promise<GitHubDispatchRuleRecord[] | null>;
  getProjectGitHubRuleForOrganization(input: {
    organization_id: string;
    project_id: string;
    rule_id: string;
  }): Promise<GitHubDispatchRuleRecord | null>;
  createProjectGitHubRuleForOrganization(input: {
    organization_id: string;
    project_id: string;
    created_by_user_id: string;
    name: string;
    enabled: boolean;
    event_types: string[];
    environments: string[];
    services: string[];
    severity_min: "low" | "medium" | "high" | "critical" | null;
    bundle_type: "failure" | "improvement" | null;
    incident_status: "new_only" | "reopened_only" | "new_or_reopened";
    cooldown_seconds: number;
  }): Promise<GitHubDispatchRuleRecord | null>;
  updateProjectGitHubRuleForOrganization(input: {
    project_scope?: "current_project";
    organization_id: string;
    project_id: string;
    rule_id: string;
    actor_user_id?: string;
    actor_role?: "owner" | "admin" | "member";
    name?: string;
    enabled?: boolean;
    event_types?: string[];
    environments?: string[];
    services?: string[];
    severity_min?: "low" | "medium" | "high" | "critical" | null;
    bundle_type?: "failure" | "improvement" | null;
    incident_status?: "new_only" | "reopened_only" | "new_or_reopened";
    cooldown_seconds?: number;
  }): Promise<GitHubDispatchRuleRecord | null>;
  deleteProjectGitHubRuleForOrganization(input: {
    organization_id: string;
    project_id: string;
    rule_id: string;
    actor_user_id?: string;
    actor_role?: "owner" | "admin" | "member";
  }): Promise<boolean>;
  listProjectGitHubDeliveriesForOrganization(input: {
    organization_id: string;
    project_id: string;
    status?: "pending" | "retrying" | "delivered" | "failed" | "skipped";
    limit: number;
  }): Promise<GitHubDispatchDeliveryRecord[]>;
  retryProjectGitHubDeliveryForOrganization(input: {
    organization_id: string;
    project_id: string;
    delivery_id: string;
    actor_user_id?: string;
    actor_role?: "owner" | "admin" | "member";
  }): Promise<GitHubDispatchDeliveryRecord | null>;
  listMatchingGitHubDispatchRules(input: {
    project_id: string;
    event_type:
      | "bundle.created"
      | "bundle.updated"
      | "bundle.reopened"
      | "improvement_bundle.created"
      | "incident.spike_detected";
    environment: string;
    service_name: string;
    severity: "low" | "medium" | "high" | "critical";
    bundle_type: "failure" | "improvement";
    incident_status: "new_only" | "reopened_only" | "new_or_reopened";
  }): Promise<MatchingGitHubDispatchRule[]>;
  hasRecentGitHubDispatch(input: {
    rule_id: string;
    incident_fingerprint: string;
    cooldown_seconds: number;
  }): Promise<boolean>;
  countProjectGitHubDispatchesSince(input: { project_id: string; since: string }): Promise<number>;
  countInstallationGitHubDispatchesSince(input: {
    installation_id: number;
    since: string;
  }): Promise<number>;
  createGitHubDispatchDeliveryIntent(input: {
    rule_id: string;
    rule_name: string;
    project_id: string;
    incident_id: string | null;
    improvement_id: string | null;
    target_fingerprint: string;
    dedupe_key: string;
    installation_id: number;
    repo_owner: string;
    repo_name: string;
    dispatch_payload: Record<string, unknown>;
  }): Promise<{ delivery_id: string; created: boolean }>;
  createSkippedGitHubDispatchDelivery(input: {
    rule_id: string;
    rule_name: string;
    project_id: string;
    incident_id: string | null;
    improvement_id: string | null;
    target_fingerprint: string;
    dedupe_key: string;
    installation_id: number;
    repo_owner: string;
    repo_name: string;
    reason: "project_hourly_rate_limited" | "installation_hourly_rate_limited";
    dispatch_payload: Record<string, unknown>;
  }): Promise<{ delivery_id: string; created: boolean }>;
  claimDueGitHubDispatchDeliveries(limit: number): Promise<DeliverGitHubDispatchJob[]>;
  getGitHubDispatchDeliveryIntent(deliveryId: string): Promise<GitHubDispatchDeliveryIntent | null>;
  markGitHubDispatchDeliveryAttempt(
    input: MarkGitHubDispatchDeliveryAttemptInput
  ): Promise<MarkGitHubDispatchDeliveryAttemptResult>;
}

export interface GitHubMarketplaceAccountUpsertInput {
  organization_id: string | null;
  marketplace_account_id: number;
  marketplace_account_login: string;
  marketplace_account_type: "Organization" | "User";
  marketplace_account_node_id: string | null;
  marketplace_listing_plan_id: number;
  marketplace_listing_plan_name: string;
  marketplace_plan_price_model: string | null;
  billing_cycle: "monthly" | "yearly" | null;
  unit_count: number | null;
  on_free_trial: boolean;
  free_trial_ends_on: string | null;
  next_billing_date: string | null;
  effective_date: string;
  installation_id: number | null;
  marketplace_purchase_status:
    | "purchased"
    | "cancelled"
    | "pending_change"
    | "pending_change_cancelled"
    | "changed";
  last_event_id: string;
  last_event_action: string;
}

export interface GitHubMarketplaceStore {
  isEventProcessed(delivery_id: string): Promise<boolean>;
  markEventProcessed(input: {
    delivery_id: string;
    event_name: string;
    marketplace_account_id: number | null;
    action: string | null;
  }): Promise<void>;
  upsertMarketplaceAccount(
    input: GitHubMarketplaceAccountUpsertInput
  ): Promise<GitHubMarketplaceAccountRecord>;
  linkOrganizationToMarketplaceAccountByInstallationId(input: {
    organization_id: string;
    installation_id: number;
  }): Promise<GitHubMarketplaceAccountRecord | null>;
}
