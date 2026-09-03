import type {
  ImprovementSettings,
  ImprovementSettingsUpdate,
  ProjectColorTag
} from "../../../packages/shared-types/src/index.js";
import type {
  AccountDeletionBlockedReason,
  AccountDataExportRecord,
  AvailabilityCheckDailyRollupRecord,
  AvailabilityCheckRecord,
  AvailabilityCheckResultRecord,
  BillingSummaryRecord,
  CreateProjectInviteResult,
  DeletedAccountRecord,
  DeletedProjectRecord,
  MemberTokenRecord,
  ProjectAccessRecord,
  ProjectInviteRecord,
  ProjectMemberRecord,
  ProjectTokenRecord,
  LeaveProjectMembershipResult,
  SlackDestinationRecord,
  ImprovementRetrievalRecord,
  RemoveProjectMemberResult,
  UpdateProjectMemberRoleResult,
  ProjectRecord,
  UserAvatarRecord,
  GitHubDispatchDeliveryRecord,
  GitHubDispatchRuleRecord,
  GitHubInstallationRecord,
  GitHubRepositoryRecord,
  ProjectGitHubRepoRecord
} from "../../../packages/storage/src/index.js";

export interface ApiManagementDependencies {
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
  projectManagement?:
    | {
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
      }
    | undefined;
  accountManagement?:
    | {
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
        getUserAvatar(input: { user_id: string }): Promise<UserAvatarRecord | null>;
        saveUserAvatar(input: {
          user_id: string;
          source: "github" | "gravatar";
          object_key: string;
          content_type: string;
          updated_at: string;
        }): Promise<UserAvatarRecord | null>;
      }
    | undefined;
  billingManagement?:
    | {
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
        }): Promise<
          | BillingSummaryRecord
          | "billing_not_configured"
          | "billing_not_found"
          | "checkout_session_not_found"
          | "checkout_not_complete"
          | "billing_service_error"
        >;
        createPortalLink(input: {
          organization_id: string;
          current_plan: "solo" | "team";
        }): Promise<{ url: string } | null>;
        increaseCapacity?(input: {
          organization_id: string;
          target_additional_capacity_units: number;
          now: string;
        }): Promise<
          | BillingSummaryRecord
          | "billing_not_configured"
          | "billing_not_found"
          | "no_active_subscription"
          | "invalid_target_quantity"
          | "pending_capacity_reduction_exists"
        >;
        scheduleCapacityReduction?(input: {
          organization_id: string;
          target_additional_capacity_units: number;
          now: string;
        }): Promise<
          | BillingSummaryRecord
          | "billing_not_configured"
          | "billing_not_found"
          | "no_active_subscription"
          | "invalid_target_quantity"
        >;
        cancelCapacityReduction?(input: {
          organization_id: string;
          now: string;
        }): Promise<
          | BillingSummaryRecord
          | "billing_not_configured"
          | "billing_not_found"
          | "no_active_subscription"
          | "capacity_reduction_not_found"
        >;
      }
    | undefined;
  availabilityCheckManagement?:
    | {
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
        }): Promise<
          AvailabilityCheckRecord | "project_not_found" | "limit_reached" | "interval_too_low"
        >;
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
      }
    | undefined;
  billingAdmin?:
    | {
        isOperatorAllowed(input: { email: string }): boolean;
        overrideOrganizationBilling(input: {
          organization_id: string;
          plan: "free" | "solo" | "team";
          additional_capacity_units: number;
          now: string;
        }): Promise<BillingSummaryRecord | "billing_not_found">;
      }
    | undefined;
  projectCollaboration?:
    | {
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
      }
    | undefined;
  improvementSettingsManagement?:
    | {
        getImprovementSettingsForProject(input: {
          organization_id: string;
          project_id: string;
        }): Promise<ImprovementSettings | null>;
        updateImprovementSettingsForProject(input: {
          organization_id: string;
          project_id: string;
          update: ImprovementSettingsUpdate;
        }): Promise<ImprovementSettings | null>;
      }
    | undefined;
  improvementManagement?:
    | {
        listImprovementsForOrganization(input: {
          organization_id: string;
          user_id?: string;
          project_id?: string;
          environment?: string;
          service?: string;
          status?: "open" | "resolved" | "snoozed";
          severity?: "low" | "medium" | "high" | "critical";
          kind?:
            | "warning_hotspot"
            | "slow_request"
            | "request_failure_pattern"
            | "recurring_incident"
            | "post_deploy_regression";
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
      }
    | undefined;
  githubManagement?:
    | {
        getInstallUrl(): Promise<string>;
        getInstallationForOrganization(input: {
          organization_id: string;
        }): Promise<GitHubInstallationRecord | null>;
        disconnectInstallationForOrganization(input: { organization_id: string }): Promise<boolean>;
        listRepositoriesForOrganization(input: {
          organization_id: string;
        }): Promise<
          | GitHubRepositoryRecord[]
          | "installation_not_found"
          | "installation_suspended"
          | "installation_removed"
        >;
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
        }): Promise<
          | GitHubDispatchDeliveryRecord
          | "delivery_not_found"
          | "repo_not_found"
          | "installation_not_found"
          | "installation_suspended"
          | "installation_removed"
        >;
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
        }): Promise<
          GitHubDispatchRuleRecord | "project_not_found" | "repo_not_found" | "rule_limit_reached"
        >;
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
        }): Promise<
          | ProjectGitHubRepoRecord
          | "installation_not_found"
          | "installation_suspended"
          | "installation_removed"
          | "project_not_found"
          | "repo_not_found"
        >;
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
      }
    | undefined;
  slackManagement?:
    | {
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
      }
    | undefined;
}
