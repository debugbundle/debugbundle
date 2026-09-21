import {
  z,
  AlertListResponseSchema,
  AlertResponseSchema,
  BillingSummaryResponseSchema,
  BundleV1Schema,
  SharedCaptureRuleSuggestionsResponseSchema,
  SharedCaptureRuleCreateSchema,
  SharedCreateCaptureRuleFromSuggestionSchema,
  SharedCaptureRuleUpdateSchema,
  CapturePolicyUpdateSchema,
  AnalyticsSettingsResponseSchema,
  AnalyticsSettingsUpdateSchema,
  ImprovementSettingsResponseSchema,
  ImprovementSettingsUpdateSchema,
  ProjectCreateResponseSchema,
  ProjectDeleteResponseSchema,
  ProjectListResponseSchema,
  BulkIncidentResponseSchema,
  IncidentResponseSchema,
  IncidentsResponseSchema,
  ImprovementResponseSchema,
  ImprovementsResponseSchema,
  LogsResponseSchema,
  ReproductionResponseSchema,
  ServicesResponseSchema,
  TokenCreateResponseSchema,
  TokenListResponseSchema,
  RetryWebhookDeliveryResponseSchema,
  WebhookCreateResponseSchema,
  WebhookDeliveriesResponseSchema,
  WebhookResponseSchema,
  WebhookTestResponseSchema,
  WebhookListResponseSchema,
  WeeklyReportChannelListResponseSchema,
  WeeklyReportChannelResponseSchema,
  ImprovementSnoozeBodySchema,
  ApiErrorSchema,
  SuccessResponseSchema,
  BillingLinkResponseSchema,
  BundleFailureStatusSchema,
  AcceptInviteResponseSchema,
  SessionResponseSchema,
  GithubDeviceStartResponseSchema,
  GithubDevicePollResponseSchema,
  AccountExportResponseSchema,
  AccountDeletionResponseSchema,
  SlackInstallUrlResponseSchema,
  SlackDestinationListResponseSchema,
  SlackDestinationTestResponseSchema,
  ProjectMemberListResponseSchema,
  ProjectMemberResponseSchema,
  ProjectInviteListResponseSchema,
  ProjectInviteResponseSchema,
  ProjectUpdateResponseSchema,
  ProbeActivationResponseSchema,
  ProbeActivationListResponseSchema,
  ProbeDeactivationResponseSchema,
  CaptureRuleResponseSchema,
  CaptureRulesResponseSchema,
  CapturePolicyResponseSchema,
  SdkConfigResponseSchema,
  IngestionAcceptedResponseSchema,
  OpenApiIngestionRequestSchema,
  HealthResponseSchema,
  ReadyResponseSchema,
  NotReadyResponseSchema,
  LiveResponseSchema,
  AvailabilityCheckListResponseSchema,
  AvailabilityCheckResponseSchema,
  AvailabilityCheckMutationResponseSchema,
  AvailabilityCheckDeleteResponseSchema,
  AvailabilityCheckResultsResponseSchema,
  AvailabilityCheckDailyRollupsResponseSchema,
  AvailabilityCheckTestResponseSchema,
  component
} from "./openapi-model.js";

export const apiError = component("ApiError", ApiErrorSchema);
export const successResponse = component("SuccessResponse", SuccessResponseSchema);
export const sessionResponse = component("SessionResponse", SessionResponseSchema);
export const githubDeviceStartResponse = component(
  "GithubDeviceStartResponse",
  GithubDeviceStartResponseSchema
);
export const githubDevicePollResponse = component(
  "GithubDevicePollResponse",
  GithubDevicePollResponseSchema
);
export const acceptInviteResponse = component("AcceptInviteResponse", AcceptInviteResponseSchema);
export const accountExportResponse = component(
  "AccountExportResponse",
  AccountExportResponseSchema
);
export const accountDeletionResponse = component(
  "AccountDeletionResponse",
  AccountDeletionResponseSchema
);
export const avatarImageResponse = component("AvatarImageResponse", z.string());
export const ingestionRequest = component("IngestionRequest", OpenApiIngestionRequestSchema);
export const ingestionResponse = component(
  "IngestionAcceptedResponse",
  IngestionAcceptedResponseSchema
);
export const incidentListResponse = component("IncidentListResponse", IncidentsResponseSchema);
export const incidentResponse = component("IncidentResponse", IncidentResponseSchema);
export const bulkIncidentResponse = component("BulkIncidentResponse", BulkIncidentResponseSchema);
export const improvementListResponse = component(
  "ImprovementListResponse",
  ImprovementsResponseSchema
);
export const improvementResponse = component("ImprovementResponse", ImprovementResponseSchema);
export const improvementSnoozeBody = component(
  "ImprovementSnoozeBody",
  ImprovementSnoozeBodySchema
);
export const bundleResponse = component("BundleDocument", BundleV1Schema);
export const bundlePending = component(
  "PendingStatus",
  z.object({ status: z.literal("pending") }).strict()
);
export const bundleFailed = component("BundleFailedStatus", BundleFailureStatusSchema);
export const reproductionResponse = component("ReproductionResponse", ReproductionResponseSchema);
export const logsResponse = component("LogsResponse", LogsResponseSchema);
export const servicesResponse = component("ServicesResponse", ServicesResponseSchema);
export const memberListResponse = component(
  "ProjectMemberListResponse",
  ProjectMemberListResponseSchema
);
export const inviteListResponse = component(
  "ProjectInviteListResponse",
  ProjectInviteListResponseSchema
);
export const inviteResponse = component("ProjectInviteResponse", ProjectInviteResponseSchema);
export const memberResponse = component("ProjectMemberResponse", ProjectMemberResponseSchema);
export const projectListResponse = component("ProjectListResponse", ProjectListResponseSchema);
export const projectCreateResponse = component(
  "ProjectCreateResponse",
  ProjectCreateResponseSchema
);
export const projectUpdateResponse = component(
  "ProjectUpdateResponse",
  ProjectUpdateResponseSchema
);
export const projectDeleteResponse = component(
  "ProjectDeleteResponse",
  ProjectDeleteResponseSchema
);
export const slackInstallUrlResponse = component(
  "SlackInstallUrlResponse",
  SlackInstallUrlResponseSchema
);
export const slackDestinationListResponse = component(
  "SlackDestinationListResponse",
  SlackDestinationListResponseSchema
);
export const slackDestinationTestResponse = component(
  "SlackDestinationTestResponse",
  SlackDestinationTestResponseSchema
);
export const billingSummaryResponse = component(
  "BillingSummaryResponse",
  BillingSummaryResponseSchema
);
export const billingLinkResponse = component("BillingLinkResponse", BillingLinkResponseSchema);
export const tokenListResponse = component("TokenListResponse", TokenListResponseSchema);
export const tokenResponse = component("TokenResponse", TokenCreateResponseSchema);
export const alertsResponse = component("AlertListResponse", AlertListResponseSchema);
export const alertResponse = component("AlertResponse", AlertResponseSchema);
export const weeklyReportChannelsResponse = component(
  "WeeklyReportChannelListResponse",
  WeeklyReportChannelListResponseSchema
);
export const weeklyReportChannelResponse = component(
  "WeeklyReportChannelResponse",
  WeeklyReportChannelResponseSchema
);
export const webhookListResponse = component("WebhookListResponse", WebhookListResponseSchema);
export const webhookResponse = component("WebhookResponse", WebhookResponseSchema);
export const webhookCreateResponse = component(
  "WebhookCreateResponse",
  WebhookCreateResponseSchema
);
export const webhookDeliveriesResponse = component(
  "WebhookDeliveriesResponse",
  WebhookDeliveriesResponseSchema
);
export const webhookTestResponse = component("WebhookTestResponse", WebhookTestResponseSchema);
export const webhookRetryResponse = component(
  "WebhookRetryResponse",
  RetryWebhookDeliveryResponseSchema
);
export const probeActivationResponse = component(
  "ProbeActivationResponse",
  ProbeActivationResponseSchema
);
export const probeActivationListResponse = component(
  "ProbeActivationListResponse",
  ProbeActivationListResponseSchema
);
export const probeDeactivationResponse = component(
  "ProbeDeactivationResponse",
  ProbeDeactivationResponseSchema
);
export const captureRuleCreate = component("CaptureRuleCreate", SharedCaptureRuleCreateSchema);
export const createCaptureRuleFromSuggestion = component(
  "CreateCaptureRuleFromSuggestion",
  SharedCreateCaptureRuleFromSuggestionSchema
);
export const captureRuleUpdate = component("CaptureRuleUpdate", SharedCaptureRuleUpdateSchema);
export const captureRuleResponse = component("CaptureRuleResponse", CaptureRuleResponseSchema);
export const captureRulesResponse = component("CaptureRulesResponse", CaptureRulesResponseSchema);
export const captureRuleSuggestionsResponse = component(
  "CaptureRuleSuggestionsResponse",
  SharedCaptureRuleSuggestionsResponseSchema
);
export const capturePolicyUpdate = component("CapturePolicyUpdate", CapturePolicyUpdateSchema);
export const capturePolicyResponse = component(
  "CapturePolicyResponse",
  CapturePolicyResponseSchema
);
export const analyticsSettingsUpdate = component(
  "AnalyticsSettingsUpdate",
  AnalyticsSettingsUpdateSchema
);
export const analyticsSettingsResponse = component(
  "AnalyticsSettingsResponse",
  AnalyticsSettingsResponseSchema
);
export const improvementSettingsUpdate = component(
  "ImprovementSettingsUpdate",
  ImprovementSettingsUpdateSchema
);
export const improvementSettingsResponse = component(
  "ImprovementSettingsResponse",
  ImprovementSettingsResponseSchema
);
export const sdkConfigResponse = component("SdkConfigResponse", SdkConfigResponseSchema);
export const healthResponse = component("HealthResponse", HealthResponseSchema);
export const readyResponse = component("ReadyResponse", ReadyResponseSchema);
export const notReadyResponse = component("NotReadyResponse", NotReadyResponseSchema);
export const liveResponse = component("LiveResponse", LiveResponseSchema);
export const availabilityCheckListResponse = component(
  "AvailabilityCheckListResponse",
  AvailabilityCheckListResponseSchema
);
export const availabilityCheckResponse = component(
  "AvailabilityCheckResponse",
  AvailabilityCheckResponseSchema
);
export const availabilityCheckMutationResponse = component(
  "AvailabilityCheckMutationResponse",
  AvailabilityCheckMutationResponseSchema
);
export const availabilityCheckDeleteResponse = component(
  "AvailabilityCheckDeleteResponse",
  AvailabilityCheckDeleteResponseSchema
);
export const availabilityCheckResultsResponse = component(
  "AvailabilityCheckResultsResponse",
  AvailabilityCheckResultsResponseSchema
);
export const availabilityCheckDailyRollupsResponse = component(
  "AvailabilityCheckDailyRollupsResponse",
  AvailabilityCheckDailyRollupsResponseSchema
);
export const availabilityCheckTestResponse = component(
  "AvailabilityCheckTestResponse",
  AvailabilityCheckTestResponseSchema
);
