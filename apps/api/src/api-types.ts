import type { ReportAllowanceStore } from "../../../packages/storage/src/report-allowance-store.js";
import type { createImprovementReviewSettingsStore } from "../../../packages/storage/src/improvement-review-settings.js";
import type { createImprovementReviewStore } from "../../../packages/storage/src/improvement-review-store.js";
import type { createImprovementReviewAllowance } from "../../../packages/storage/src/improvement-review-allowance.js";
import type { ReferralManagement } from "../../../packages/referrals/src/referral-management.js";
import type { ReportRunAdmissionStore } from "../../../packages/storage/src/report-run-admission.js";
import type { ReportRunManagementStore } from "../../../packages/storage/src/report-run-management.js";
import type { ReportContentStore } from "../../../packages/storage/src/report-content-store.js";
import type { ReportPdfStore } from "../../../packages/storage/src/report-pdf-store.js";
import type { ReportEmailStore } from "../../../packages/storage/src/report-email-store.js";
import type { OrganizationManagementStore } from "../../../packages/storage/src/organization-management-types.js";
import type { ProjectJobInitiator } from "../../../packages/storage/src/project-job-authorization.js";
import type {
  CaptureRule,
  CaptureRuleCreate,
  CapturePolicyRecord,
  CapturePolicyUpdate,
  CaptureRuleUpdate,
  EventEnvelope,
  AlertScope
} from "../../../packages/shared-types/src/index.js";
import type {
  AccountDeletionChallengeService,
  AuthEmailSender,
  GitHubCliAuthService,
  WebSessionAuthService
} from "../../../packages/auth/src/index.js";
import type { EmailMessage } from "../../../packages/email/src/index.js";
import type {
  AuditLogStore,
  AgentTokenStore,
  AlertChannel,
  AlertConditionType,
  AlertGroupInspectionStore,
  AuthRateLimiter,
  IngestionRateLimiter,
  IncidentRetrievalRecord,
  ServiceRetrievalRecord,
  IngestionMetadataService,
  IngestionPersistenceService,
  AnalyticsIngestionPersistenceService,
  ObjectStoreClient,
  ObjectStoreReader,
  MemberAuthService,
  WeeklyReportChannel,
  WeeklyReportChannelRecord,
  WeeklyReportScheduleDayOfWeek,
  AccountAnalyticsStore,
  AdminAnalyticsSummary,
  IngestionRejectionDiagnosticStore,
  AdminMalformedRejectionBreakdown,
  OperationalEmailDeliveryStore,
  WebhookEventType,
  WebhookDeliveryStore
} from "../../../packages/storage/src/index.js";
import type { ApiAnalyticsDependencies } from "./api-analytics-types.js";
import type { ApiManagementDependencies } from "./api-management-types.js";
import type { OpenAiHostedReadDependencies } from "./openai-mcp-operations.js";

export interface ApiDependencies extends ApiAnalyticsDependencies, ApiManagementDependencies {
  projectMerges?: import("../../../packages/storage/src/project-merge-store.js").ProjectMergeStore;
  serviceDefinitions?: import("../../../packages/storage/src/service-definition-store.js").ServiceDefinitionStore;
  notificationPreferences?: Pick<
    import("../../../packages/storage/src/notification-preferences-store.js").NotificationPreferencesStore,
    "get" | "update"
  >;
  publicStatusPages?: import("../../../packages/storage/src/public-status-store.js").PublicStatusPageStore;
  publicStatusBaseUrl?: string;
  publicStatusTrustProxy?: boolean;
  alertGroupInspection?: AlertGroupInspectionStore;
  ingestionPersistence: Pick<IngestionPersistenceService, "persistAndEnqueue"> &
    Partial<Pick<IngestionPersistenceService, "claimEvidenceReceipt">> &
    Partial<AnalyticsIngestionPersistenceService>;
  ingestionMetadata: Pick<IngestionMetadataService, "resolveProjectByTokenHash"> & {
    resolveCredentialServiceScopes?: (
      input: import("../../../packages/storage/src/project-ingestion-scope.js").CredentialServiceScope
    ) => Promise<
      import("../../../packages/storage/src/project-ingestion-scope.js").CredentialServiceResolution[]
    >;
  };
  accountAnalytics?: Pick<AccountAnalyticsStore, "recordMetricDeltas"> | undefined;
  ingestionRejectionDiagnostics?:
    | Pick<IngestionRejectionDiagnosticStore, "recordRejectedDiagnostics">
    | undefined;
  adminAnalytics?:
    | {
        isOperatorAllowed(input: { email: string }): boolean;
        getSummary(input: { now: string }): Promise<AdminAnalyticsSummary>;
        getMalformedRejectionBreakdown(input: {
          now: string;
          limit: number;
        }): Promise<AdminMalformedRejectionBreakdown>;
      }
    | undefined;
  ingestionRateLimiter?: Pick<IngestionRateLimiter, "claimEvents"> | undefined;
  authRateLimiter?:
    | Pick<
        AuthRateLimiter,
        | "claimRequest"
        | "checkAvailability"
        | "acquireConcurrency"
        | "releaseConcurrency"
        | "getOpenAiCimdResponse"
        | "setOpenAiCimdResponse"
        | "claimOpenAiClientAssertionJti"
      >
    | undefined;
  auditLogging?: Pick<AuditLogStore, "createAuditLog"> | undefined;
  memberAuth: Pick<MemberAuthService, "resolveMemberByTokenHash">;
  agentTokens?: AgentTokenStore;
  agentReads?: OpenAiHostedReadDependencies;
  agentDashboardBaseUrl?: string;
  webAuth?:
    | Pick<
        WebSessionAuthService,
        | "requestEmailCode"
        | "verifyEmailCode"
        | "beginGithubAuth"
        | "completeGithubAuth"
        | "acceptInviteForSession"
        | "resolveSessionByToken"
        | "revokeSessionByToken"
      >
    | undefined;
  githubCliAuth?:
    | Pick<
        GitHubCliAuthService,
        "beginDeviceAuth" | "pollDeviceAuth" | "claimDeviceAuth" | "exchangeGitHubAccessToken"
      >
    | undefined;
  accountDeletionAuth?:
    | Pick<AccountDeletionChallengeService, "requestDeletionOtp" | "verifyDeletionOtp">
    | undefined;
  inviteEmails?: Pick<AuthEmailSender, "sendProjectInviteEmail">;
  organizationManagement?: OrganizationManagementStore;
  referrals?: ReferralManagement;
  reportDefinitions?: ReportDefinitionStore;
  improvementReviewsEnabled?: boolean;
  improvementReviews?: {
    settings: ReturnType<typeof createImprovementReviewSettingsStore>;
    store: ReturnType<typeof createImprovementReviewStore>;
    allowance: ReturnType<typeof createImprovementReviewAllowance>;
  };
  reportAllowance?: ReportAllowanceStore;
  reportGenerationEnabled?: boolean;
  reportContent?: ReportContentStore;
  reportPdf?: ReportPdfStore;
  reportEmail?: Pick<ReportEmailStore, "list">;
  reportDashboardBaseUrl?: string;
  reportRuns?: { admission: ReportRunAdmissionStore; management: ReportRunManagementStore };
  organizationEmails?: { send: NonNullable<AuthEmailSender["sendOrganizationAccessEmail"]> };
  billingEmails?: {
    getBillingContactForOrganization(input: { organization_id: string }): Promise<{
      organizationName: string;
      recipientEmail: string;
    } | null>;
    send(message: EmailMessage): Promise<void>;
  };
  incidentRetrieval: {
    listIncidentsForOrganization(input: {
      organization_id: string;
      user_id?: string;
      project_id?: string;
      origin_project_ids?: string[];
      environment?: string;
      service?: string;
      status?: "active" | "open" | "resolved" | "regressed";
      severity?: "low" | "medium" | "high" | "critical";
      cursor?: { last_seen_at: string; incident_id: string };
      limit: number;
    }): Promise<IncidentRetrievalRecord[]>;
    countIncidentsForOrganization?(
      input: Parameters<ApiDependencies["incidentRetrieval"]["listIncidentsForOrganization"]>[0]
    ): Promise<number>;
    getIncidentForOrganization(input: {
      organization_id: string;
      incident_id: string;
      user_id?: string;
      project_id?: string;
      origin_project_ids?: string[];
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
    getBundleFailureReasonForOrganization?(input: {
      organization_id: string;
      incident_id: string;
    }): Promise<string | null>;
    getBundleSourceForOrganization?(input: {
      organization_id: string;
      incident_id: string;
    }): Promise<{
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
      offset?: number;
    }): Promise<ServiceRetrievalRecord[] | null>;
    listIncidentLogsForOrganization(input: {
      organization_id: string;
      user_id?: string;
      incident_id: string;
      level?: string;
      cursor?: { occurred_at: string; event_id: string };
      limit: number;
    }): Promise<
      Array<{
        event_id: string;
        event_type: EventEnvelope["event_type"];
        occurred_at: string;
        is_sampled: boolean;
        level: string | null;
      }>
    >;
  };
  objectStoreReader: Pick<ObjectStoreReader, "getObject">;
  objectStoreWriter?: Pick<ObjectStoreClient, "putObject">;
  bundleRegeneration?: {
    requestRegeneration(input: {
      initiating_authority?: ProjectJobInitiator;
      organization_id: string;
      project_id: string;
      incident_id: string;
    }): Promise<boolean>;
  };
  improvementBundleRegeneration?: {
    requestRegeneration(input: {
      initiating_authority?: ProjectJobInitiator;
      organization_id: string;
      project_id: string;
      opportunity_id: string;
    }): Promise<boolean>;
  };
  alertManagement?:
    | {
        listAlertsForOrganization(input: {
          organization_id: string;
          project_id: string;
          limit: number;
          include_scope?: boolean;
        }): Promise<Array<{
          scope?: AlertScope | null;
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
        }> | null>;
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
          project_scope?: "current_project";
          organization_id: string;
          alert_id: string;
          project_id?: string;
          actor_user_id?: string;
          actor_role?: "owner" | "admin" | "member" | "viewer";
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
          actor_role?: "owner" | "admin" | "member" | "viewer";
        }): Promise<{ alert_id: string } | null>;
      }
    | undefined;
  weeklyReportManagement?:
    | {
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
      }
    | undefined;
  webhookDelivery: Pick<WebhookDeliveryStore, "listDeliveriesForWebhookInOrganization"> & {
    retryDeliveryForOrganization?: WebhookDeliveryStore["retryDeliveryForOrganization"];
  };
  webhookTesting?:
    | {
        triggerTestDelivery(input: {
          organization_id: string;
          project_id?: string;
          webhook_id: string;
          event_type: WebhookEventType;
          actor_user_id?: string;
          actor_role?: "owner" | "admin" | "member" | "viewer";
        }): Promise<{ delivery_id: string; event_type: WebhookEventType } | null>;
      }
    | undefined;
  webhookManagement?:
    | Pick<
        WebhookDeliveryStore,
        | "listWebhooksForOrganization"
        | "createWebhookForOrganization"
        | "getWebhookForOrganization"
        | "updateWebhookForOrganization"
        | "deleteWebhookForOrganization"
      >
    | undefined;
  operationalEmailDelivery?:
    | Pick<OperationalEmailDeliveryStore, "queueProjectOperationalEmailDelivery">
    | undefined;
  /** Optional CDN cache purge function, called with project_id after probe activate/deactivate. */
  cdnPurge?: ((projectId: string) => void | Promise<void>) | undefined;
  probeManagement?:
    | {
        listActiveProbesForProject(input: {
          project_id: string;
          now: string;
          scope_origin_ids?: string[];
        }): Promise<
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
        }): Promise<{
          organization_plan: string;
          activations: Array<{
            activation_id: string;
            label_pattern: string;
            service: string;
            environment: string;
            expires_at: string;
            trigger_expires_at: string;
          }>;
        } | null>;
        createProbeActivationForProjectInOrganization(input: {
          organization_id: string;
          project_id: string;
          created_by_member_id: string;
          sdk_project_id?: string;
          sdk_token_id?: string;
          sdk_service?: string;
          label_pattern: string;
          service: string;
          environment: string;
          expires_at: string;
          trigger_expires_at: string;
        }): Promise<{
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
          runtime_project_id?: string;
          runtime_scope_origin_ids?: string[];
          runtime_service?: string;
        } | null>;
        deactivateProbeActivationForProjectInOrganization(input: {
          organization_id: string;
          project_id: string;
          activation_id: string;
          deactivated_at: string;
          actor_user_id?: string;
        }): Promise<{
          organization_plan: string;
          deactivated: {
            activation_id: string;
            deactivated_at: string;
          };
        } | null>;
      }
    | undefined;
  capturePolicyManagement?:
    | {
        getCapturePolicyForProject(input: {
          organization_id: string;
          project_id: string;
        }): Promise<CapturePolicyRecord | null>;
        upsertCapturePolicyForProject(input: {
          organization_id: string;
          project_id: string;
          update: CapturePolicyUpdate;
        }): Promise<CapturePolicyRecord | null>;
      }
    | undefined;
  captureRuleManagement?:
    | {
        listCaptureRulesForProject(input: {
          organization_id: string;
          actor_user_id?: string;
          project_id: string;
        }): Promise<CaptureRule[]>;
        listActiveCaptureRulesForProject(input: {
          project_id: string;
          now: string;
        }): Promise<CaptureRule[]>;
        createCaptureRuleForProject(input: {
          organization_id: string;
          actor_user_id?: string;
          project_id: string;
          id: string;
          create: CaptureRuleCreate;
        }): Promise<CaptureRule | null>;
        updateCaptureRuleForProject(input: {
          organization_id: string;
          actor_user_id?: string;
          project_id: string;
          rule_id: string;
          update: CaptureRuleUpdate;
        }): Promise<CaptureRule | null>;
        deleteCaptureRuleForProject(input: {
          organization_id: string;
          actor_user_id?: string;
          project_id: string;
          rule_id: string;
        }): Promise<boolean>;
        recordCaptureRuleMatch?(input: {
          project_id: string;
          rule_id: string;
          matched_at: string;
        }): Promise<void>;
      }
    | undefined;
}

export interface ApiServerContext {
  startedAtMs: number;
  apiVersion: string;
  readinessCheck?: () => Promise<void>;
}
import type { ReportDefinitionStore } from "../../../packages/storage/src/report-definition-store.js";
