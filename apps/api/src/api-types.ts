import type {
  CaptureRule,
  CaptureRuleCreate,
  CapturePolicyRecord,
  CapturePolicyUpdate,
  CaptureRuleUpdate,
  EventEnvelope,
  ImprovementSettings,
  ImprovementSettingsUpdate,
  ProjectColorTag
} from "../../../packages/shared-types/src/index.js";
import type {
  AccountDeletionChallengeService,
  AuthEmailSender,
  GitHubCliAuthService,
  WebSessionAuthService
} from "../../../packages/auth/src/index.js";
import type { EmailMessage } from "../../../packages/email/src/index.js";
import type {
  AccountDeletionBlockedReason,
  AccountDataExportRecord,
  AvailabilityCheckDailyRollupRecord,
  AvailabilityCheckRecord,
  AvailabilityCheckResultRecord,
  AuditLogStore,
  BillingSummaryRecord,
  AlertChannel,
  AlertConditionType,
  CreateProjectInviteResult,
  DeletedAccountRecord,
  AuthRateLimiter,
  DeletedProjectRecord,
  IngestionRateLimiter,
  MemberTokenRecord,
  ProjectAccessRecord,
  ProjectInviteRecord,
  ProjectMemberRecord,
  ProjectTokenRecord,
  LeaveProjectMembershipResult,
  SlackDestinationRecord,
  IncidentRetrievalRecord,
  ImprovementRetrievalRecord,
  RemoveProjectMemberResult,
  ServiceRetrievalRecord,
  UpdateProjectMemberRoleResult,
  IngestionMetadataService,
  IngestionPersistenceService,
  AnalyticsIngestionPersistenceService,
  ObjectStoreClient,
  ObjectStoreReader,
  MemberAuthService,
  ProjectRecord,
  UserAvatarRecord,
  WeeklyReportChannel,
  WeeklyReportChannelRecord,
  WeeklyReportScheduleDayOfWeek,
  GitHubDispatchDeliveryRecord,
  GitHubDispatchRuleRecord,
  GitHubInstallationRecord,
  AccountAnalyticsStore,
  AdminAnalyticsSummary,
  GitHubRepositoryRecord,
  IngestionRejectionDiagnosticStore,
  AdminMalformedRejectionBreakdown,
  OperationalEmailDeliveryStore,
  ProjectGitHubRepoRecord,
  WebhookEventType,
  WebhookDeliveryStore
} from "../../../packages/storage/src/index.js";
import type { ApiAnalyticsDependencies } from "./api-analytics-types.js";

export interface ApiDependencies extends ApiAnalyticsDependencies {
  ingestionPersistence: Pick<IngestionPersistenceService, "persistAndEnqueue"> &
    Partial<AnalyticsIngestionPersistenceService>;
  ingestionMetadata: Pick<IngestionMetadataService, "resolveProjectByTokenHash">;
  accountAnalytics?: Pick<AccountAnalyticsStore, "recordMetricDeltas"> | undefined;
  ingestionRejectionDiagnostics?: Pick<
    IngestionRejectionDiagnosticStore,
    "recordRejectedDiagnostics"
  > | undefined;
  adminAnalytics?: {
    isOperatorAllowed(input: { email: string }): boolean;
    getSummary(input: { now: string }): Promise<AdminAnalyticsSummary>;
    getMalformedRejectionBreakdown(input: {
      now: string;
      limit: number;
    }): Promise<AdminMalformedRejectionBreakdown>;
  } | undefined;
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
  accountDeletionAuth?: Pick<AccountDeletionChallengeService, "requestDeletionOtp" | "verifyDeletionOtp"> | undefined;
  inviteEmails?: Pick<AuthEmailSender, "sendProjectInviteEmail">;
  billingEmails?: {
    getBillingContactForOrganization(input: { organization_id: string }): Promise<{
      organizationName: string;
      recipientEmail: string;
    } | null>;
    send(message: EmailMessage): Promise<void>;
  };
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
      allowed_origins: string[];
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
    resolveProjectAccessForUser?(input: {
      user_id: string;
      project_id: string;
    }): Promise<ProjectAccessRecord | null>;
    listProjectsForUser?(input: {
      user_id: string;
      now: string;
      limit: number;
    }): Promise<ProjectRecord[]>;
    createProjectForUser?(input: {
      user_id: string;
      organization_id: string;
      name: string;
      slug: string;
      environment_default: string;
      color_tag?: ProjectColorTag | null;
      weekly_report_timezone: string;
    }): Promise<ProjectRecord | null>;
    updateProjectForUser?(input: {
      user_id: string;
      project_id: string;
      name?: string;
      slug?: string;
      environment_default?: string;
      color_tag?: ProjectColorTag | null;
    }): Promise<ProjectRecord | "slug_taken" | null>;
    deleteProjectForUser?(input: {
      user_id: string;
      project_id: string;
    }): Promise<DeletedProjectRecord | null>;
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
      color_tag?: ProjectColorTag | null;
      weekly_report_timezone?: string;
    }): Promise<ProjectRecord | null>;
    updateProjectForOrganization(input: {
      organization_id: string;
      project_id: string;
      name?: string;
      slug?: string;
      environment_default?: string;
      color_tag?: ProjectColorTag | null;
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
    }): Promise<DeletedAccountRecord | AccountDeletionBlockedReason | null>;
    getUserAvatar(input: {
      user_id: string;
    }): Promise<UserAvatarRecord | null>;
    saveUserAvatar(input: {
      user_id: string;
      source: "github" | "gravatar";
      object_key: string;
      content_type: string;
      updated_at: string;
    }): Promise<UserAvatarRecord | null>;
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
    incrementProjectUsageCounter?(input: {
      project_id: string;
      period_starts_at: string;
      count: number;
    }): Promise<void>;
    startTrial?(input: {
      organization_id: string;
      target_plan: "solo" | "team";
      now: string;
    }): Promise<BillingSummaryRecord | "billing_not_found" | "trial_unavailable">;
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
  availabilityCheckManagement?: {
    listChecksForProjectInOrganization(input: {
      organization_id: string;
      project_id: string;
      limit: number;
    }): Promise<AvailabilityCheckRecord[] | null>;
    getCheckForProjectInOrganization(input: {
      organization_id: string;
      project_id: string;
      check_id: string;
    }): Promise<AvailabilityCheckRecord | null>;
    createCheckForProjectInOrganization(input: {
      organization_id: string;
      project_id: string;
      created_by_user_id: string;
      name: string;
      url: string;
      method: "GET" | "HEAD";
      expected_status_min: number;
      expected_status_max: number;
      timeout_ms: number;
      interval_seconds: number;
      failure_threshold: number;
      recovery_threshold: number;
      environment?: string | null;
      service_name?: string | null;
      enabled: boolean;
      now: string;
    }): Promise<AvailabilityCheckRecord | "project_not_found" | "limit_reached" | "interval_too_low">;
    updateCheckForProjectInOrganization(input: {
      organization_id: string;
      project_id: string;
      check_id: string;
      name?: string;
      url?: string;
      method?: "GET" | "HEAD";
      expected_status_min?: number;
      expected_status_max?: number;
      timeout_ms?: number;
      interval_seconds?: number;
      failure_threshold?: number;
      recovery_threshold?: number;
      environment?: string | null;
      service_name?: string | null;
      enabled?: boolean;
      now: string;
    }): Promise<AvailabilityCheckRecord | "check_not_found" | "interval_too_low">;
    deleteCheckForProjectInOrganization(input: {
      organization_id: string;
      project_id: string;
      check_id: string;
      deleted_at: string;
    }): Promise<boolean>;
    listResultsForCheckInOrganization(input: {
      organization_id: string;
      project_id: string;
      check_id: string;
      limit: number;
    }): Promise<AvailabilityCheckResultRecord[] | null>;
    listDailyRollupsForCheckInOrganization(input: {
      organization_id: string;
      project_id: string;
      check_id: string;
      limit: number;
    }): Promise<AvailabilityCheckDailyRollupRecord[] | null>;
    testCheck(input: {
      url: string;
      method: "GET" | "HEAD";
      expected_status_min: number;
      expected_status_max: number;
      timeout_ms: number;
    }): Promise<{
      normalized_url: string;
      result: {
        status: string;
        http_status: number | null;
        duration_ms: number;
        error_kind: string | null;
        error_message: string | null;
        checked_url_host: string;
        checked_url_path: string;
        checked_url_query: Record<string, string>;
        final_url: string;
        redirect_count: number;
      };
    }>;
  } | undefined;
  billingAdmin?: {
    isOperatorAllowed(input: { email: string }): boolean;
    overrideOrganizationBilling(input: {
      organization_id: string;
      plan: "free" | "solo" | "team";
      additional_capacity_units: number;
      now: string;
    }): Promise<BillingSummaryRecord | "billing_not_found">;
  } | undefined;
  projectCollaboration?: {
    listMembersForProject?(input: {
      project_id: string;
      user_id: string;
    }): Promise<{ owner_plan: string; members: ProjectMemberRecord[] } | null>;
    listPendingInvitesForProject?(input: {
      project_id: string;
      user_id: string;
      now: string;
    }): Promise<ProjectInviteRecord[] | null>;
    createInviteForProject?(input: {
      project_id: string;
      user_id: string;
      email: string;
      role: "admin" | "member";
      invited_by_user_id: string;
      invite_token_hash: string;
      expires_at: string;
    }): Promise<CreateProjectInviteResult | null>;
    cancelInviteForProject?(input: {
      project_id: string;
      user_id: string;
      invite_id: string;
    }): Promise<ProjectInviteRecord | null>;
    updateProjectMemberRole?(input: {
      project_id: string;
      actor_user_id: string;
      user_id: string;
      role: "admin" | "member";
    }): Promise<UpdateProjectMemberRoleResult | null>;
    removeProjectMember?(input: {
      project_id: string;
      actor_user_id: string;
      user_id: string;
    }): Promise<RemoveProjectMemberResult | null>;
    leaveProjectMembership?(input: {
      project_id: string;
      user_id: string;
    }): Promise<LeaveProjectMembershipResult | null>;
  } | undefined;
  improvementSettingsManagement?: {
    getImprovementSettingsForProject(input: {
      organization_id: string;
      project_id: string;
    }): Promise<ImprovementSettings | null>;
    updateImprovementSettingsForProject(input: {
      organization_id: string;
      project_id: string;
      update: ImprovementSettingsUpdate;
    }): Promise<ImprovementSettings | null>;
  } | undefined;
  improvementManagement?: {
    listImprovementsForOrganization(input: {
      organization_id: string;
      user_id?: string;
      project_id?: string;
      environment?: string;
      service?: string;
      status?: "open" | "resolved" | "snoozed";
      severity?: "low" | "medium" | "high" | "critical";
      kind?: "warning_hotspot" | "slow_request" | "request_failure_pattern" | "recurring_incident" | "post_deploy_regression";
      cursor?: { last_detected_at: string; improvement_id: string };
      limit: number;
    }): Promise<ImprovementRetrievalRecord[]>;
    getImprovementForOrganization(input: {
      organization_id: string;
      improvement_id: string;
      user_id?: string;
    }): Promise<ImprovementRetrievalRecord | null>;
    resolveImprovementForOrganization?(input: {
      organization_id: string;
      improvement_id: string;
      user_id?: string;
      resolved_by_member_id: string;
      resolved_at: string;
    }): Promise<ImprovementRetrievalRecord | null>;
    reopenImprovementForOrganization?(input: {
      organization_id: string;
      improvement_id: string;
      user_id?: string;
    }): Promise<ImprovementRetrievalRecord | null>;
    snoozeImprovementForOrganization?(input: {
      organization_id: string;
      improvement_id: string;
      user_id?: string;
      snoozed_until: string;
    }): Promise<ImprovementRetrievalRecord | null>;
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
      status?: "pending" | "retrying" | "delivered" | "failed" | "skipped";
      limit: number;
    }): Promise<GitHubDispatchDeliveryRecord[]>;
    retryProjectDeliveryForOrganization(input: {
      organization_id: string;
      project_id: string;
      delivery_id: string;
      actor_user_id?: string;
      actor_role?: "owner" | "admin" | "member";
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
      created_by_user_id: string;
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
      actor_user_id?: string;
      actor_role?: "owner" | "admin" | "member";
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
      actor_user_id?: string;
      actor_role?: "owner" | "admin" | "member";
    }): Promise<boolean>;
    setProjectRepoForOrganization(input: {
      organization_id: string;
      project_id: string;
      created_by_user_id: string;
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
      user_id?: string;
      project_id?: string;
      environment?: string;
      service?: string;
      status?: "active" | "open" | "resolved" | "regressed";
      severity?: "low" | "medium" | "high" | "critical";
      cursor?: { last_seen_at: string; incident_id: string };
      limit: number;
    }): Promise<IncidentRetrievalRecord[]>;
    getIncidentForOrganization(input: {
      organization_id: string;
      incident_id: string;
      user_id?: string;
    }): Promise<IncidentRetrievalRecord | null>;
    resolveIncidentForOrganization?(input: {
      organization_id: string;
      incident_id: string;
      user_id?: string;
      resolved_by_member_id: string;
      resolved_at: string;
    }): Promise<IncidentRetrievalRecord | null>;
    resolveIncidentsForOrganization?(input: {
      organization_id: string;
      incident_ids: string[];
      user_id?: string;
      resolved_by_member_id: string;
      resolved_at: string;
    }): Promise<IncidentRetrievalRecord[]>;
    reopenIncidentForOrganization?(input: {
      organization_id: string;
      incident_id: string;
      user_id?: string;
    }): Promise<IncidentRetrievalRecord | null>;
    reopenIncidentsForOrganization?(input: {
      organization_id: string;
      incident_ids: string[];
      user_id?: string;
    }): Promise<IncidentRetrievalRecord[]>;
    getBundleFailureReasonForOrganization?(input: { organization_id: string; incident_id: string }): Promise<string | null>;
    getBundleSourceForOrganization?(input: { organization_id: string; incident_id: string }): Promise<{
      event_id: string;
      occurred_at: string;
      occurrence_count: number;
      trigger: string;
    } | null>;
    listServicesForOrganization?(input: {
      organization_id: string;
      user_id?: string;
      project_id: string;
      limit: number;
    }): Promise<ServiceRetrievalRecord[] | null>;
    listIncidentLogsForOrganization(input: {
      organization_id: string;
      user_id?: string;
      incident_id: string;
      level?: string;
      cursor?: { occurred_at: string; event_id: string };
      limit: number;
    }): Promise<
      Array<{ event_id: string; event_type: EventEnvelope["event_type"]; occurred_at: string; is_sampled: boolean; level: string | null }>
    >;
  };
  objectStoreReader: Pick<ObjectStoreReader, "getObject">;
  objectStoreWriter?: Pick<ObjectStoreClient, "putObject">;
  bundleRegeneration?: {
    requestRegeneration(input: {
      organization_id: string;
      project_id: string;
      incident_id: string;
    }): Promise<boolean>;
  };
  improvementBundleRegeneration?: {
    requestRegeneration(input: {
      organization_id: string;
      project_id: string;
      opportunity_id: string;
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
        created_by_user_id: string;
        service_id: string | null;
        channel: AlertChannel;
        condition_type: AlertConditionType;
        severity_min: "low" | "medium" | "high" | "critical" | null;
        severity_lifecycle_scope: "new_incident" | "incident_regressed" | "both" | null;
        cooldown_seconds: number;
        config: Record<string, unknown>;
        is_enabled: boolean;
        created_at: string;
        updated_at: string;
      }> | null
    >;
    createAlertForOrganization(input: {
      organization_id: string;
      project_id: string;
      created_by_user_id: string;
      service_id?: string;
      channel: AlertChannel;
      condition_type: AlertConditionType;
      severity_min?: "low" | "medium" | "high" | "critical";
      severity_lifecycle_scope?: "new_incident" | "incident_regressed" | "both" | null;
      cooldown_seconds: number;
      config: Record<string, unknown>;
      is_enabled: boolean;
    }): Promise<{
      alert_id: string;
      project_id: string;
      created_by_user_id: string;
      service_id: string | null;
      channel: AlertChannel;
      condition_type: AlertConditionType;
      severity_min: "low" | "medium" | "high" | "critical" | null;
      severity_lifecycle_scope: "new_incident" | "incident_regressed" | "both" | null;
      cooldown_seconds: number;
      config: Record<string, unknown>;
      is_enabled: boolean;
      created_at: string;
      updated_at: string;
    } | null>;
    updateAlertForOrganization(input: {
      organization_id: string;
      alert_id: string;
      project_id?: string;
      actor_user_id?: string;
      actor_role?: "owner" | "admin" | "member";
      service_id?: string | null;
      channel?: AlertChannel;
      condition_type?: AlertConditionType;
      severity_min?: "low" | "medium" | "high" | "critical" | null;
      severity_lifecycle_scope?: "new_incident" | "incident_regressed" | "both" | null;
      cooldown_seconds?: number;
      config?: Record<string, unknown> | null;
      is_enabled?: boolean;
    }): Promise<{
      alert_id: string;
      project_id: string;
      created_by_user_id: string;
      service_id: string | null;
      channel: AlertChannel;
      condition_type: AlertConditionType;
      severity_min: "low" | "medium" | "high" | "critical" | null;
      severity_lifecycle_scope: "new_incident" | "incident_regressed" | "both" | null;
      cooldown_seconds: number;
      config: Record<string, unknown>;
      is_enabled: boolean;
      created_at: string;
      updated_at: string;
    } | null>;
    deleteAlertForOrganization(input: {
      organization_id: string;
      alert_id: string;
      project_id?: string;
      actor_user_id?: string;
      actor_role?: "owner" | "admin" | "member";
    }): Promise<{ alert_id: string } | null>;
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
    }): Promise<WeeklyReportChannelRecord | "email_channel_exists" | null>;
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
    getWeeklyReportChannelById?(input: {
      channel_id: string;
    }): Promise<WeeklyReportChannelRecord | null>;
  } | undefined;
  webhookDelivery: Pick<WebhookDeliveryStore, "listDeliveriesForWebhookInOrganization"> & {
    retryDeliveryForOrganization?: WebhookDeliveryStore["retryDeliveryForOrganization"];
  };
  webhookTesting?: {
    triggerTestDelivery(input: {
      organization_id: string;
      project_id?: string;
      webhook_id: string;
      event_type: WebhookEventType;
      actor_user_id?: string;
      actor_role?: "owner" | "admin" | "member";
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
  operationalEmailDelivery?: Pick<OperationalEmailDeliveryStore, "queueProjectOperationalEmailDelivery"> | undefined;
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
  captureRuleManagement?: {
    listCaptureRulesForProject(input: {
      organization_id: string;
      project_id: string;
    }): Promise<CaptureRule[]>;
    listActiveCaptureRulesForProject(input: {
      project_id: string;
      now: string;
    }): Promise<CaptureRule[]>;
    createCaptureRuleForProject(input: {
      organization_id: string;
      project_id: string;
      id: string;
      create: CaptureRuleCreate;
    }): Promise<CaptureRule | null>;
    updateCaptureRuleForProject(input: {
      organization_id: string;
      project_id: string;
      rule_id: string;
      update: CaptureRuleUpdate;
    }): Promise<CaptureRule | null>;
    deleteCaptureRuleForProject(input: {
      organization_id: string;
      project_id: string;
      rule_id: string;
    }): Promise<boolean>;
    recordCaptureRuleMatch?(input: {
      project_id: string;
      rule_id: string;
      matched_at: string;
    }): Promise<void>;
  } | undefined;
}

export interface ApiServerContext {
  startedAtMs: number;
  apiVersion: string;
  readinessCheck?: () => Promise<void>;
}
