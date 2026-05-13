import type { CapturePolicyRecord, CapturePolicyUpdate, EventEnvelope } from "../../../packages/shared-types/src/index.js";
import type { AuthEmailSender, GitHubCliAuthService, WebSessionAuthService } from "../../../packages/auth/src/index.js";
import type {
  AccountDataExportRecord,
  AuditLogStore,
  BillingSummaryRecord,
  AlertChannel,
  AlertConditionType,
  CreateOrganizationInviteResult,
  DeletedAccountRecord,
  AuthRateLimiter,
  DeletedProjectRecord,
  IngestionRateLimiter,
  MemberTokenRecord,
  OrganizationMemberRecord,
  OrganizationInviteRecord,
  ProjectTokenRecord,
  SlackDestinationRecord,
  IncidentRetrievalRecord,
  RemoveOrganizationMemberResult,
  ServiceRetrievalRecord,
  UpdateOrganizationMemberRoleResult,
  IngestionMetadataService,
  IngestionPersistenceService,
  ObjectStoreReader,
  MemberAuthService,
  ProjectRecord,
  WeeklyReportChannel,
  WeeklyReportChannelRecord,
  WeeklyReportScheduleDayOfWeek,
  GitHubDispatchDeliveryRecord,
  GitHubDispatchRuleRecord,
  GitHubInstallationRecord,
  GitHubRepositoryRecord,
  ProjectGitHubRepoRecord,
  WebhookEventType,
  WebhookDeliveryStore
} from "../../../packages/storage/src/index.js";

export interface ApiDependencies {
  ingestionPersistence: Pick<IngestionPersistenceService, "persistAndEnqueue">;
  ingestionMetadata: Pick<IngestionMetadataService, "resolveProjectByTokenHash">;
  ingestionRateLimiter?: Pick<IngestionRateLimiter, "claimEvents"> | undefined;
  authRateLimiter?: Pick<AuthRateLimiter, "claimRequest"> | undefined;
  auditLogging?: Pick<AuditLogStore, "createAuditLog"> | undefined;
  memberAuth: Pick<MemberAuthService, "resolveMemberByTokenHash">;
  webAuth?: Pick<
    WebSessionAuthService,
    | "requestEmailCode"
    | "verifyEmailCode"
    | "beginGithubAuth"
    | "completeGithubAuth"
    | "acceptInviteForSession"
    | "resolveSessionByToken"
    | "revokeSessionByToken"
  > | undefined;
  githubCliAuth?: Pick<
    GitHubCliAuthService,
    "beginDeviceAuth" | "pollDeviceAuth" | "claimDeviceAuth" | "exchangeGitHubAccessToken"
  > | undefined;
  inviteEmails?: Pick<AuthEmailSender, "sendOrganizationInviteEmail">;
  tokenManagement: {
    listProjectTokensForOrganization(input: {
      organization_id: string;
      project_id: string;
      limit: number;
    }): Promise<ProjectTokenRecord[] | null>;
    createProjectTokenForOrganization(input: {
      organization_id: string;
      project_id: string;
      label: string;
      token_hash: string;
    }): Promise<ProjectTokenRecord | null>;
    revokeProjectTokenForOrganization(input: {
      organization_id: string;
      project_id: string;
      token_id: string;
      revoked_at: string;
    }): Promise<ProjectTokenRecord | null>;
    listMemberTokensForOrganization(input: {
      organization_id: string;
      user_id: string;
      limit: number;
    }): Promise<MemberTokenRecord[]>;
    createMemberTokenForOrganization(input: {
      organization_id: string;
      user_id: string;
      label: string;
      token_hash: string;
    }): Promise<MemberTokenRecord>;
    revokeMemberTokenForOrganization(input: {
      organization_id: string;
      user_id: string;
      token_id: string;
      revoked_at: string;
    }): Promise<MemberTokenRecord | null>;
  };
  projectManagement?: {
    listProjectsForOrganization(input: {
      organization_id: string;
      now: string;
      limit: number;
    }): Promise<ProjectRecord[]>;
    createProjectForOrganization(input: {
      organization_id: string;
      name: string;
      slug: string;
      environment_default: string;
    }): Promise<ProjectRecord | null>;
    updateProjectForOrganization(input: {
      organization_id: string;
      project_id: string;
      name?: string;
      slug?: string;
      environment_default?: string;
    }): Promise<ProjectRecord | "slug_taken" | null>;
    deleteProjectForOrganization(input: {
      organization_id: string;
      project_id: string;
    }): Promise<DeletedProjectRecord | null>;
  } | undefined;
  accountManagement?: {
    exportAccountForOrganization(input: {
      organization_id: string;
      user_id: string;
      exported_at: string;
    }): Promise<AccountDataExportRecord | null>;
    deleteAccountForOrganization(input: {
      organization_id: string;
      user_id: string;
      deleted_at: string;
    }): Promise<DeletedAccountRecord | "other_owned_organizations_exist" | null>;
  } | undefined;
  billingManagement?: {
    getBillingSummaryForOrganization(input: {
      organization_id: string;
      now: string;
    }): Promise<BillingSummaryRecord | null>;
    getBillingSummaryForProject?(input: {
      project_id: string;
      now: string;
    }): Promise<BillingSummaryRecord | null>;
    incrementOrgUsageCounter?(input: {
      organization_id: string;
      period_starts_at: string;
      count: number;
    }): Promise<void>;
    createCheckoutLink(input: {
      organization_id: string;
      billing_email: string;
      current_plan: "free" | "solo" | "team";
      target_plan: "solo" | "team";
    }): Promise<{ url: string } | null>;
    confirmCheckoutSession?(input: {
      organization_id: string;
      session_id: string;
      now: string;
    }): Promise<BillingSummaryRecord | "billing_not_configured" | "billing_not_found" | "checkout_session_not_found" | "checkout_not_complete" | "billing_service_error">;
    createPortalLink(input: {
      organization_id: string;
      current_plan: "solo" | "team";
    }): Promise<{ url: string } | null>;
    increaseCapacity?(input: {
      organization_id: string;
      target_additional_capacity_units: number;
      now: string;
    }): Promise<BillingSummaryRecord | "billing_not_configured" | "billing_not_found" | "no_active_subscription" | "invalid_target_quantity" | "pending_capacity_reduction_exists">;
    scheduleCapacityReduction?(input: {
      organization_id: string;
      target_additional_capacity_units: number;
      now: string;
    }): Promise<BillingSummaryRecord | "billing_not_configured" | "billing_not_found" | "no_active_subscription" | "invalid_target_quantity">;
    cancelCapacityReduction?(input: {
      organization_id: string;
      now: string;
    }): Promise<BillingSummaryRecord | "billing_not_configured" | "billing_not_found" | "no_active_subscription" | "capacity_reduction_not_found">;
  } | undefined;
  organizationManagement?: {
    listMembersForOrganization(input: {
      organization_id: string;
    }): Promise<{ plan: string; members: OrganizationMemberRecord[] } | null>;
    listPendingInvitesForOrganization(input: {
      organization_id: string;
      now: string;
    }): Promise<OrganizationInviteRecord[] | null>;
    createInviteForOrganization(input: {
      organization_id: string;
      email: string;
      role: "member";
      invited_by_user_id: string;
      invite_token_hash: string;
      expires_at: string;
    }): Promise<CreateOrganizationInviteResult | null>;
    cancelInviteForOrganization(input: {
      organization_id: string;
      invite_id: string;
    }): Promise<OrganizationInviteRecord | null>;
    removeMemberFromOrganization(input: {
      organization_id: string;
      user_id: string;
      revoked_at: string;
    }): Promise<RemoveOrganizationMemberResult | null>;
    updateMemberRoleForOrganization(input: {
      organization_id: string;
      user_id: string;
      role: "owner" | "member";
    }): Promise<UpdateOrganizationMemberRoleResult | null>;
  } | undefined;
  githubManagement?: {
    getInstallUrl(): Promise<string>;
    getInstallationForOrganization(input: { organization_id: string }): Promise<GitHubInstallationRecord | null>;
    disconnectInstallationForOrganization(input: { organization_id: string }): Promise<boolean>;
    listRepositoriesForOrganization(input: {
      organization_id: string;
    }): Promise<GitHubRepositoryRecord[] | "installation_not_found" | "installation_suspended" | "installation_removed">;
    getProjectRepoForOrganization(input: {
      organization_id: string;
      project_id: string;
    }): Promise<ProjectGitHubRepoRecord | null>;
    listProjectDeliveriesForOrganization(input: {
      organization_id: string;
      project_id: string;
      status?: "pending" | "retrying" | "delivered" | "failed";
      limit: number;
    }): Promise<GitHubDispatchDeliveryRecord[]>;
    retryProjectDeliveryForOrganization(input: {
      organization_id: string;
      project_id: string;
      delivery_id: string;
    }): Promise<GitHubDispatchDeliveryRecord | "delivery_not_found" | "repo_not_found" | "installation_not_found" | "installation_suspended" | "installation_removed">;
    listProjectRulesForOrganization(input: {
      organization_id: string;
      project_id: string;
    }): Promise<GitHubDispatchRuleRecord[] | null>;
    getProjectRuleForOrganization(input: {
      organization_id: string;
      project_id: string;
      rule_id: string;
    }): Promise<GitHubDispatchRuleRecord | null>;
    createProjectRuleForOrganization(input: {
      organization_id: string;
      project_id: string;
      name: string;
      enabled: boolean;
      event_types: string[];
      environments: string[];
      services: string[];
      severity_min: "low" | "medium" | "high" | "critical";
      bundle_type: "failure" | "improvement";
      incident_status: "new_only" | "reopened_only" | "new_or_reopened";
      cooldown_seconds: number;
    }): Promise<GitHubDispatchRuleRecord | "project_not_found" | "repo_not_found" | "rule_limit_reached">;
    updateProjectRuleForOrganization(input: {
      organization_id: string;
      project_id: string;
      rule_id: string;
      name?: string;
      enabled?: boolean;
      event_types?: string[];
      environments?: string[];
      services?: string[];
      severity_min?: "low" | "medium" | "high" | "critical";
      bundle_type?: "failure" | "improvement";
      incident_status?: "new_only" | "reopened_only" | "new_or_reopened";
      cooldown_seconds?: number;
    }): Promise<GitHubDispatchRuleRecord | "rule_not_found">;
    deleteProjectRuleForOrganization(input: {
      organization_id: string;
      project_id: string;
      rule_id: string;
    }): Promise<boolean>;
    setProjectRepoForOrganization(input: {
      organization_id: string;
      project_id: string;
      owner: string;
      repo: string;
    }): Promise<ProjectGitHubRepoRecord | "installation_not_found" | "installation_suspended" | "installation_removed" | "project_not_found" | "repo_not_found">;
    removeProjectRepoForOrganization(input: {
      organization_id: string;
      project_id: string;
    }): Promise<boolean>;
    completeGithubInstallationForOrganization(input: {
      organization_id: string;
      installation_id: number;
    }): Promise<GitHubInstallationRecord | "github_not_configured">;
    verifyWebhookSignature(input: { rawBody: Buffer; signature: string }): boolean;
    processWebhook(input: {
      eventName: string;
      payload: Record<string, unknown>;
    }): Promise<void>;
  } | undefined;
  slackManagement?: {
    listSlackDestinationsForProjectInOrganization(input: {
      organization_id: string;
      project_id: string;
      limit: number;
    }): Promise<SlackDestinationRecord[] | null>;
    getSlackDestinationForOrganization(input: {
      organization_id: string;
      slack_destination_id: string;
    }): Promise<SlackDestinationRecord | null>;
    upsertSlackDestinationForOrganization(input: {
      organization_id: string;
      slack_team_id: string;
      slack_team_name?: string | null;
      slack_channel_id: string;
      slack_channel_name?: string | null;
      webhook_url_ciphertext: string;
      installed_by_member_id?: string | null;
    }): Promise<SlackDestinationRecord>;
    deleteSlackDestinationForProjectInOrganization(input: {
      organization_id: string;
      project_id: string;
      slack_destination_id: string;
    }): Promise<{ slack_destination_id: string } | "destination_in_use" | null>;
    getSlackDestinationSecretForOrganization?(input: {
      organization_id: string;
      slack_destination_id: string;
    }): Promise<{ webhook_url_ciphertext: string } | null>;
  } | undefined;
  incidentRetrieval: {
    listIncidentsForOrganization(input: {
      organization_id: string;
      project_id?: string;
      environment?: string;
      service?: string;
      status?: "open" | "resolved" | "regressed";
      severity?: "low" | "medium" | "high" | "critical";
      cursor?: { last_seen_at: string; incident_id: string };
      limit: number;
    }): Promise<IncidentRetrievalRecord[]>;
    getIncidentForOrganization(input: { organization_id: string; incident_id: string }): Promise<IncidentRetrievalRecord | null>;
    resolveIncidentForOrganization?(input: {
      organization_id: string;
      incident_id: string;
      resolved_by_member_id: string;
      resolved_at: string;
    }): Promise<IncidentRetrievalRecord | null>;
    reopenIncidentForOrganization?(input: {
      organization_id: string;
      incident_id: string;
    }): Promise<IncidentRetrievalRecord | null>;
    getBundleFailureReasonForOrganization?(input: { organization_id: string; incident_id: string }): Promise<string | null>;
    getBundleSourceForOrganization?(input: { organization_id: string; incident_id: string }): Promise<{
      event_id: string;
      occurred_at: string;
      occurrence_count: number;
      trigger: string;
    } | null>;
    listServicesForOrganization?(input: {
      organization_id: string;
      project_id: string;
      limit: number;
    }): Promise<ServiceRetrievalRecord[] | null>;
    listIncidentLogsForOrganization(input: {
      organization_id: string;
      incident_id: string;
      level?: string;
      cursor?: { occurred_at: string; event_id: string };
      limit: number;
    }): Promise<
      Array<{ event_id: string; event_type: EventEnvelope["event_type"]; occurred_at: string; is_sampled: boolean; level: string | null }>
    >;
  };
  objectStoreReader: Pick<ObjectStoreReader, "getObject">;
  bundleRegeneration?: {
    requestRegeneration(input: {
      organization_id: string;
      project_id: string;
      incident_id: string;
    }): Promise<boolean>;
  };
  alertManagement?: {
    listAlertsForOrganization(input: {
      organization_id: string;
      project_id: string;
      limit: number;
    }): Promise<
      Array<{
        alert_id: string;
        project_id: string;
        service_id: string | null;
        channel: AlertChannel;
        condition_type: AlertConditionType;
        severity_min: "low" | "medium" | "high" | "critical" | null;
        config: Record<string, unknown>;
        is_enabled: boolean;
        created_at: string;
        updated_at: string;
      }> | null
    >;
    createAlertForOrganization(input: {
      organization_id: string;
      project_id: string;
      service_id?: string;
      channel: AlertChannel;
      condition_type: AlertConditionType;
      severity_min?: "low" | "medium" | "high" | "critical";
      config: Record<string, unknown>;
      is_enabled: boolean;
    }): Promise<{
      alert_id: string;
      project_id: string;
      service_id: string | null;
      channel: AlertChannel;
      condition_type: AlertConditionType;
      severity_min: "low" | "medium" | "high" | "critical" | null;
      config: Record<string, unknown>;
      is_enabled: boolean;
      created_at: string;
      updated_at: string;
    } | null>;
    updateAlertForOrganization(input: {
      organization_id: string;
      alert_id: string;
      service_id?: string | null;
      channel?: AlertChannel;
      condition_type?: AlertConditionType;
      severity_min?: "low" | "medium" | "high" | "critical" | null;
      config?: Record<string, unknown> | null;
      is_enabled?: boolean;
    }): Promise<{
      alert_id: string;
      project_id: string;
      service_id: string | null;
      channel: AlertChannel;
      condition_type: AlertConditionType;
      severity_min: "low" | "medium" | "high" | "critical" | null;
      config: Record<string, unknown>;
      is_enabled: boolean;
      created_at: string;
      updated_at: string;
    } | null>;
    deleteAlertForOrganization(input: { organization_id: string; alert_id: string }): Promise<{ alert_id: string } | null>;
  } | undefined;
  weeklyReportManagement?: {
    listWeeklyReportChannelsForOrganization(input: {
      organization_id: string;
      project_id: string;
      limit: number;
    }): Promise<WeeklyReportChannelRecord[] | null>;
    createWeeklyReportChannelForOrganization(input: {
      organization_id: string;
      project_id: string;
      channel: WeeklyReportChannel;
      config: Record<string, unknown>;
      schedule: {
        day_of_week: WeeklyReportScheduleDayOfWeek;
        hour_of_day: number;
        timezone: string;
      };
      is_enabled: boolean;
    }): Promise<WeeklyReportChannelRecord | null>;
    updateWeeklyReportChannelForOrganization(input: {
      organization_id: string;
      channel_id: string;
      config?: Record<string, unknown>;
      schedule?: {
        day_of_week: WeeklyReportScheduleDayOfWeek;
        hour_of_day: number;
        timezone: string;
      };
      is_enabled?: boolean;
    }): Promise<WeeklyReportChannelRecord | null>;
    deleteWeeklyReportChannelForOrganization(input: {
      organization_id: string;
      channel_id: string;
    }): Promise<{ channel_id: string } | null>;
  } | undefined;
  webhookDelivery: Pick<WebhookDeliveryStore, "listDeliveriesForWebhookInOrganization"> & {
    retryDeliveryForOrganization?: WebhookDeliveryStore["retryDeliveryForOrganization"];
  };
  webhookTesting?: {
    triggerTestDelivery(input: {
      organization_id: string;
      webhook_id: string;
      event_type: WebhookEventType;
    }): Promise<{ delivery_id: string; event_type: WebhookEventType } | null>;
  } | undefined;
  webhookManagement?: Pick<
    WebhookDeliveryStore,
    | "listWebhooksForOrganization"
    | "createWebhookForOrganization"
    | "getWebhookForOrganization"
    | "updateWebhookForOrganization"
    | "deleteWebhookForOrganization"
  > | undefined;
  /** Optional CDN cache purge function, called with project_id after probe activate/deactivate. */
  cdnPurge?: ((projectId: string) => void | Promise<void>) | undefined;
  probeManagement?: {
    listActiveProbesForProject(input: { project_id: string; now: string }): Promise<
      Array<{
        activation_id: string;
        label_pattern: string;
        service: string;
        environment: string;
        expires_at: string;
        trigger_expires_at: string;
      }>
    >;
    listActiveProbesForProjectInOrganization(input: {
      organization_id: string;
      project_id: string;
      now: string;
    }): Promise<
      | {
          organization_plan: string;
          activations: Array<{
            activation_id: string;
            label_pattern: string;
            service: string;
            environment: string;
            expires_at: string;
            trigger_expires_at: string;
          }>;
        }
      | null
    >;
    createProbeActivationForProjectInOrganization(input: {
      organization_id: string;
      project_id: string;
      created_by_member_id: string;
      label_pattern: string;
      service: string;
      environment: string;
      expires_at: string;
      trigger_expires_at: string;
    }): Promise<
      | {
          organization_plan: string;
          activation: {
            activation_id: string;
            label_pattern: string;
            service: string;
            environment: string;
            expires_at: string;
            trigger_expires_at: string;
          };
          trigger_token: string;
          concurrent_limit_exceeded?: boolean;
        }
      | null
    >;
    deactivateProbeActivationForProjectInOrganization(input: {
      organization_id: string;
      project_id: string;
      activation_id: string;
      deactivated_at: string;
    }): Promise<
      | {
          organization_plan: string;
          deactivated: {
            activation_id: string;
            deactivated_at: string;
          };
        }
      | null
    >;
  } | undefined;
  capturePolicyManagement?: {
    getCapturePolicyForProject(input: {
      organization_id: string;
      project_id: string;
    }): Promise<CapturePolicyRecord | null>;
    upsertCapturePolicyForProject(input: {
      organization_id: string;
      project_id: string;
      update: CapturePolicyUpdate;
    }): Promise<CapturePolicyRecord | null>;
  } | undefined;
}

export interface ApiServerContext {
  startedAtMs: number;
  apiVersion: string;
  readinessCheck?: () => Promise<void>;
}
