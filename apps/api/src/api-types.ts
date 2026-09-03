import type {
  CaptureRule,
  CaptureRuleCreate,
  CapturePolicyRecord,
  CapturePolicyUpdate,
  CaptureRuleUpdate,
  EventEnvelope
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
  AlertChannel,
  AlertConditionType,
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

export interface ApiDependencies extends ApiAnalyticsDependencies, ApiManagementDependencies {
  ingestionPersistence: Pick<IngestionPersistenceService, "persistAndEnqueue"> &
    Partial<AnalyticsIngestionPersistenceService>;
  ingestionMetadata: Pick<IngestionMetadataService, "resolveProjectByTokenHash">;
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
  alertManagement?:
    | {
        listAlertsForOrganization(input: {
          organization_id: string;
          project_id: string;
          limit: number;
        }): Promise<Array<{
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
          actor_role?: "owner" | "admin" | "member";
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
        } | null>;
        deactivateProbeActivationForProjectInOrganization(input: {
          organization_id: string;
          project_id: string;
          activation_id: string;
          deactivated_at: string;
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
      }
    | undefined;
}

export interface ApiServerContext {
  startedAtMs: number;
  apiVersion: string;
  readinessCheck?: () => Promise<void>;
}
