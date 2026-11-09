import type { MemberTokenPolicy } from "../../shared-types/src/index.js";
import type { ProjectColorTag, TierName } from "../../shared-types/src/index.js";
import type {
  AccountDataExportRecord,
  AccountDeletionBlockedReason,
  CreateProjectInviteResult,
  DeletedAccountRecord,
  DeletedProjectRecord,
  LeaveProjectMembershipResult,
  MemberTokenRecord,
  ProjectInviteRecord,
  ProjectMemberRecord,
  ProjectRecord,
  ProjectTokenRecord,
  RemoveProjectMemberResult,
  UpdateProjectMemberRoleResult
} from "./types.js";

export interface WeeklyReportTopSpikingIncident {
  incident_id: string;
  title: string;
  occurrence_count: number;
  spike_detected_at: string;
}

export interface WeeklyProjectReportSummary {
  project_id: string;
  project_name: string;
  window_start: string;
  window_end: string;
  bundle_counts: {
    failure: number;
    improvement: number;
  };
  new_incidents: number;
  resolved_incidents: number;
  opened_incidents_resolved: number;
  regressions: number;
  top_spiking_incidents: WeeklyReportTopSpikingIncident[];
}

export interface WeeklyReportingStore {
  listProjectsWithWeeklyActivity(input: {
    window_start: string;
    window_end: string;
    limit: number;
  }): Promise<string[]>;
  getWeeklyProjectReport(input: {
    delivery_id?: string;
    project_id: string;
    window_start: string;
    window_end: string;
  }): Promise<WeeklyProjectReportSummary | null>;
}

export type WeeklyReportChannel = "email" | "slack";

export type WeeklyReportScheduleDayOfWeek =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export interface WeeklyReportChannelRecord {
  channel_id: string;
  project_id: string;
  channel: WeeklyReportChannel;
  config: Record<string, unknown>;
  schedule: {
    day_of_week: WeeklyReportScheduleDayOfWeek;
    hour_of_day: number;
    timezone: string;
  };
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface DeleteWeeklyReportChannelResult {
  channel_id: string;
}

export interface WeeklyReportChannelStore {
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
  }): Promise<DeleteWeeklyReportChannelResult | null>;
  listEnabledWeeklyReportChannels(input: { limit: number }): Promise<WeeklyReportChannelRecord[]>;
  getWeeklyReportChannelById(input: {
    channel_id: string;
  }): Promise<WeeklyReportChannelRecord | null>;
}

export interface WeeklyReportDeliveryStore {
  claimWeeklyReportDelivery(input: {
    weekly_report_channel_id: string;
    project_id: string;
    window_start: string;
    window_end: string;
    channel: WeeklyReportChannel;
  }): Promise<{
    delivery_id: string;
    created: boolean;
    project_id?: string;
    weekly_report_channel_id?: string;
  }>;
  markWeeklyReportDeliveryResult(input: {
    delivery_id: string;
    delivered: boolean;
    error_message: string | null;
  }): Promise<{ status: "delivered" | "failed" }>;
}

export type OperationalEmailDeliveryKind =
  | "webhook_auto_disabled"
  | "allowance_warning_80"
  | "allowance_limit_reached"
  | "retention_rotation_notice";

export type OperationalEmailDeliveryStatus = "pending" | "retrying" | "delivered" | "failed";

export interface OperationalEmailDeliveryRecord {
  delivery_id: string;
  organization_id: string;
  project_id: string;
  kind: OperationalEmailDeliveryKind;
  dedupe_key: string;
  payload: Record<string, unknown>;
  status: OperationalEmailDeliveryStatus;
  attempt_count: number;
  next_attempt_at: string | null;
  last_error: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OperationalEmailRecipientContext {
  organization_name: string;
  project_name: string;
  recipient_email: string;
}

export interface MarkOperationalEmailDeliveryAttemptInput {
  delivery_id: string;
  attempt: number;
  delivered: boolean;
  error_message: string | null;
}

export interface MarkOperationalEmailDeliveryAttemptResult {
  status: "retrying" | "delivered" | "failed";
  next_attempt: number | null;
}

export interface OperationalEmailDeliveryStore {
  queueProjectOperationalEmailDelivery(input: {
    project_id: string;
    kind: OperationalEmailDeliveryKind;
    dedupe_key: string;
    payload: Record<string, unknown>;
  }): Promise<{ delivery_id: string | null; created: boolean }>;
  claimDueOperationalEmailDeliveries(
    limit: number
  ): Promise<Array<{ delivery_id: string; attempt: number }>>;
  getOperationalEmailDelivery(input: {
    delivery_id: string;
  }): Promise<OperationalEmailDeliveryRecord | null>;
  resolveOperationalEmailRecipientContext(input: {
    organization_id: string;
    project_id: string;
  }): Promise<OperationalEmailRecipientContext | null>;
  markOperationalEmailDeliveryAttempt(
    input: MarkOperationalEmailDeliveryAttemptInput
  ): Promise<MarkOperationalEmailDeliveryAttemptResult>;
}

export interface TokenManagementStore {
  listProjectTokensForOrganization(input: {
    actor_user_id?: string;
    organization_id: string;
    project_id: string;
    limit: number;
  }): Promise<ProjectTokenRecord[] | null>;
  createProjectTokenForOrganization(input: {
    actor_user_id?: string;
    organization_id: string;
    project_id: string;
    label: string;
    allowed_origins: string[];
    token_hash: string;
  }): Promise<ProjectTokenRecord | null>;
  revokeProjectTokenForOrganization(input: {
    actor_user_id?: string;
    organization_id: string;
    project_id: string;
    token_id: string;
    revoked_at: string;
  }): Promise<ProjectTokenRecord | null>;
  listMemberTokensForOrganization(input: {
    organization_id: string;
    user_id: string;
    limit: number;
    include_scope?: boolean;
  }): Promise<MemberTokenRecord[]>;
  createMemberTokenForOrganization(input: {
    organization_id: string;
    user_id: string;
    label: string;
    token_hash: string;
    scope?: MemberTokenPolicy;
    expires_at?: string;
  }): Promise<MemberTokenRecord>;
  revokeMemberTokenForOrganization(input: {
    organization_id: string;
    user_id: string;
    token_id: string;
    revoked_at: string;
  }): Promise<MemberTokenRecord | null>;
}

export interface ProjectManagementStore {
  listProjectsForUser?(input: {
    user_id: string;
    now: string;
    limit: number;
    project_id?: string;
    include_organization_grants?: boolean;
    origin_project_ids?: string[];
    organization_scope_id?: string;
  }): Promise<ProjectRecord[]>;
  createProjectForUser?(input: {
    user_id: string;
    organization_id: string;
    name: string;
    slug: string;
    environment_default: string;
    color_tag?: ProjectColorTag | null;
    weekly_report_timezone: string;
    include_organization_grants?: boolean;
  }): Promise<ProjectRecord | null>;
  updateProjectForUser?(input: {
    user_id: string;
    project_id: string;
    name?: string;
    slug?: string;
    environment_default?: string;
    color_tag?: ProjectColorTag | null;
    include_organization_grants?: boolean;
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

export interface AccountLifecycleStore {
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

export interface UserAvatarRecord {
  user_id: string;
  source: "github" | "gravatar";
  object_key: string;
  content_type: string;
  updated_at: string;
}

export * from "./github-types.js";

export interface ProjectCollaborationStore {
  listMembersForProject?(input: {
    project_id: string;
    user_id: string;
    include_organization_grants?: boolean;
  }): Promise<{ owner_plan: TierName; members: ProjectMemberRecord[] } | null>;
  listPendingInvitesForProject?(input: {
    project_id: string;
    user_id: string;
    now: string;
    include_organization_grants?: boolean;
  }): Promise<ProjectInviteRecord[] | null>;
  createInviteForProject?(input: {
    project_id: string;
    user_id: string;
    email: string;
    role: "admin" | "member" | "viewer";
    invited_by_user_id: string;
    invite_token_hash: string;
    expires_at: string;
    include_organization_grants?: boolean;
  }): Promise<CreateProjectInviteResult | null>;
  cancelInviteForProject?(input: {
    project_id: string;
    user_id: string;
    invite_id: string;
    include_organization_grants?: boolean;
  }): Promise<ProjectInviteRecord | null>;
  acceptProjectInviteForUser?(input: {
    invite_token_hash: string;
    user_id: string;
    email: string;
    accepted_at: string;
  }): Promise<
    | {
        kind: "accepted";
        membership: ProjectMemberRecord & { project_id: string };
      }
    | {
        kind:
          | "invalid_token"
          | "email_mismatch"
          | "shared_access_suspended"
          | "collaborator_limit_reached";
      }
  >;
  updateProjectMemberRole?(input: {
    project_id: string;
    actor_user_id: string;
    user_id: string;
    role: "admin" | "member" | "viewer";
    include_organization_grants?: boolean;
  }): Promise<UpdateProjectMemberRoleResult | null>;
  removeProjectMember?(input: {
    project_id: string;
    actor_user_id: string;
    user_id: string;
    include_organization_grants?: boolean;
  }): Promise<RemoveProjectMemberResult | null>;
  leaveProjectMembership?(input: {
    project_id: string;
    user_id: string;
  }): Promise<LeaveProjectMembershipResult | null>;
}

export * from "./webhook-types.js";
