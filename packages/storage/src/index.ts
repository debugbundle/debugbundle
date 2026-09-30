// Barrel re-export — all public symbols from sub-modules.
// External consumers continue importing from this file unchanged.

export * from "./types.js";
export type {
  AccountAnalyticsStore,
  AdminAnalyticsSummary,
  AdminAnalyticsTimeWindow,
  AccountMetricSummary,
  AccountMetricPeriodRecord,
  AccountMetricKey
} from "./account-analytics-store.js";
export {
  ACCOUNT_METRIC_KEYS,
  AccountMetricKeySchema,
  createPostgresAccountAnalyticsStore
} from "./account-analytics-store.js";
export type {
  AdminMalformedRejectionBreakdown,
  AdminMalformedRejectionFailure,
  AdminMalformedRejectionSource,
  IngestionRejectedDiagnosticReason,
  IngestionRejectionDiagnosticStore,
  RejectedIngestionDiagnosticEvent
} from "./ingestion-rejection-diagnostic-store.js";
export { createPostgresIngestionRejectionDiagnosticStore } from "./ingestion-rejection-diagnostic-store.js";
export * from "./integration-secret-crypto.js";
export * from "./openai-oidc-provider-adapter.js";
export * from "./openai-oauth-store.js";
export * from "./incident-context.js";
export * from "./incident-reason.js";
export type {
  BillingStore,
  BillingSummaryRecord,
  BillingState,
  BillingTrialPlan,
  BillingTrialSummary,
  BillingUsageMetric,
  BillingCapacityPendingReduction
} from "./billing-store.js";
export {
  buildRawEventObjectKey,
  buildAnalyticsRawEventObjectKey,
  buildSemanticAnalyticsRawEventObjectKey,
  buildBundleObjectKey,
  buildImprovementBundleObjectKey,
  buildAnalyticsJourneyObjectKey,
  buildAnalyticsBundleObjectKey,
  buildReproductionObjectKey,
  buildUserAvatarObjectKey,
  buildBundleRegenerationLeaseKey,
  buildImprovementBundleRegenerationLeaseKey,
  deleteProjectObjects,
  hashToken
} from "./helpers.js";
export type { BuildImprovementBundleJob } from "./improvement-bundle-jobs.js";
export * from "./alert-lifecycle.js";
export { createPostgresAlertDeliveryStore } from "./alert-delivery-store.js";
export {
  createPostgresAlertGroupInspectionStore,
  type AlertGroupCursor,
  type AlertGroupInspectionStore,
  type AlertGroupKind,
  type AlertGroupMember,
  type AlertGroupSummary
} from "./alert-group-inspection.js";
export { createPostgresAccountStore } from "./account-store.js";
export { createPostgresAuditLogStore } from "./audit-log-store.js";
export { createPostgresAuthStore } from "./auth-store.js";
export { createPostgresBillingStore } from "./billing-store.js";
export type { BillingSyncStore, BillingEntitlementUpdate } from "./billing-sync-store.js";
export { createPostgresBillingSyncStore } from "./billing-sync-store.js";
export type { CapturePolicyStore } from "./capture-policy-store.js";
export { createPostgresCapturePolicyStore } from "./capture-policy-store.js";
export type { CaptureRuleStore } from "./capture-rule-store.js";
export { createPostgresCaptureRuleStore } from "./capture-rule-store.js";
export type { ImprovementSettingsStore } from "./improvement-settings-store.js";
export { createPostgresImprovementSettingsStore } from "./improvement-settings-store.js";
export type { AnalyticsSettingsStore } from "./analytics-settings-store.js";
export { createPostgresAnalyticsSettingsStore } from "./analytics-settings-store.js";
export type {
  AnalyticsSavedFunnelStore,
  CreateAnalyticsSavedFunnelResult
} from "./analytics-saved-funnel-store.js";
export { createPostgresAnalyticsSavedFunnelStore } from "./analytics-saved-funnel-store.js";
export { createAnalyticsSpaceStore } from "./analytics-space-store.js";
export {
  readSpaceAnalyticsIdentityNamespace,
  previewSpaceAnalyticsIdentityNamespaceChange,
  applySpaceAnalyticsIdentityNamespaceChange
} from "./analytics-space-identity-namespace-store.js";
export { loadSpacePlanCatalogSnapshot } from "./analytics-space-plan-snapshot.js";
export type { SpacePlanCatalogSnapshot } from "./analytics-space-plan-snapshot.js";
export { createAnalyticsWriterStore } from "./analytics-writer-store.js";
export { createAnalyticsProjectCatalogStore } from "./analytics-project-catalog-store.js";
export { createAnalyticsMeasurementPlanStore } from "./analytics-measurement-plan-store.js";
export {
  createAnalyticsSpacePlanStore,
  type AnalyticsSpacePlanStore
} from "./analytics-space-plan-store.js";
export { createSemanticAnalyticsReceiptStore } from "./semantic-analytics-receipt-store.js";
export { createSemanticAnalyticsRawRetentionService } from "./semantic-analytics-raw-retention.js";
export { createAnalyticsIdentityContextRetention } from "./analytics-identity-context-retention.js";
export type { SemanticAnalyticsRawRetentionService } from "./semantic-analytics-raw-retention.js";
export { createProjectObjectErasureService } from "./project-object-erasure.js";
export {
  persistProtectedSemanticAnalyticsEvent,
  persistCurrentProjectSemanticAnalyticsEvent
} from "./semantic-analytics-persistence.js";
export {
  loadCurrentProjectSemanticAnalyticsPolicy,
  recheckProjectSemanticAnalyticsAdmission
} from "./semantic-analytics-policy.js";
export { resolveCurrentProjectSemanticAnalyticsCapability } from "./semantic-analytics-capability.js";
export { loadVerifiedSemanticAnalyticsWorkerInput } from "./semantic-analytics-worker-input.js";
export type { VerifiedSemanticAnalyticsWorkerInput } from "./semantic-analytics-worker-input.js";
export { recordSemanticAnalyticsCatalogObservationInTransaction } from "./semantic-analytics-observation-store.js";
export type {
  SemanticAnalyticsAcceptedReceipt,
  SemanticAnalyticsReceiptInput,
  SemanticAnalyticsReceiptResult,
  SemanticAnalyticsReceiptStore
} from "./semantic-analytics-receipt-store.js";
export type {
  AnalyticsMeasurementPlanStore,
  AnalyticsProjectMeasurementPlanRecord,
  AnalyticsProjectMeasurementPlanPreview,
  AnalyticsProjectMeasurementPlanPreviewResult,
  AnalyticsProjectMeasurementPlanApplyResult
} from "./analytics-measurement-plan-store.js";
export type {
  AnalyticsProjectCatalogStore,
  AnalyticsProjectCatalogChange,
  AnalyticsProjectCatalogRecord,
  AnalyticsProjectCatalogPreview,
  AnalyticsProjectCatalogPreviewResult,
  AnalyticsProjectCatalogApplyResult
} from "./analytics-project-catalog-store.js";
export type {
  AnalyticsWriterStore,
  AnalyticsWriterChangeInput,
  AnalyticsWriterMutationResult,
  AnalyticsWriterPreviewResult
} from "./analytics-writer-store.js";
export type {
  AnalyticsSpaceStore,
  AnalyticsSpaceChangeInput,
  AnalyticsSpaceMutationResult,
  AnalyticsSpacePreviewResult
} from "./analytics-space-store.js";
export type { AnalyticsRollupStore } from "./analytics-rollup-store.js";
export { createPostgresAnalyticsRollupStore } from "./analytics-rollup-store.js";
export type {
  AnalyticsCorrelationStore,
  AnalyticsIncidentCorrelationInput,
  AnalyticsRouteSessionCorrelationInput
} from "./analytics-correlation-store.js";
export {
  createPostgresAnalyticsCorrelationStore,
  hashAnalyticsCorrelationValue,
  hashAnalyticsSessionSubject
} from "./analytics-correlation-store.js";
export type {
  AnalyticsMetricsStore,
  AnalyticsUsageSummaryInput
} from "./analytics-metrics-store.js";
export { createPostgresAnalyticsMetricsStore } from "./analytics-metrics-store.js";
export type {
  AnalyticsAllowanceClaimInput,
  AnalyticsAllowanceClaimResult,
  AnalyticsAllowanceIdempotencyClaim,
  AnalyticsAllowanceMetric,
  AnalyticsAllowanceReleaseInput,
  AnalyticsAllowanceUsageSummary,
  AnalyticsUsageStore
} from "./analytics-usage-store.js";
export { createPostgresAnalyticsUsageStore } from "./analytics-usage-store.js";
export type {
  AnalyticsJourneySampleRecord,
  AnalyticsJourneySamplesCursor,
  AnalyticsJourneySampleStore
} from "./analytics-journey-sample-store.js";
export {
  buildAnalyticsJourneySamplesCursor,
  createPostgresAnalyticsJourneySampleStore
} from "./analytics-journey-sample-store.js";
export type {
  BuildAnalyticsBundleJob,
  BuildAnalyticsBundleTrigger
} from "./analytics-bundle-jobs.js";
export type {
  AnalyticsBundleGenerationRecord,
  AnalyticsBundleGenerationListFilters,
  AnalyticsBundleGenerationInventoryRecord,
  AnalyticsBundleGenerationStatus,
  AnalyticsBundleGenerationStore,
  ReserveAnalyticsBundleGenerationInput
} from "./analytics-bundle-generation-store.js";
export type { AnalyticsIncidentImpactInput } from "./analytics-incident-impact-metrics.js";
export {
  buildAnalyticsBundleGenerationCursor,
  buildAnalyticsBundleInputFingerprint,
  createPostgresAnalyticsBundleGenerationStore
} from "./analytics-bundle-generation-store.js";
export type {
  AnalyticsOpportunityListFilters,
  AnalyticsOpportunitiesCursor,
  AnalyticsOpportunityStore
} from "./analytics-opportunity-store.js";
export { createPostgresAnalyticsOpportunityStore } from "./analytics-opportunity-store.js";
export type {
  AnalyticsOpportunityEvaluationInput,
  AnalyticsOpportunityEvaluationResult,
  AnalyticsOpportunityEvaluator
} from "./analytics-opportunity-evaluator.js";
export type { EvaluateAnalyticsOpportunitiesJob } from "./analytics-opportunity-jobs.js";
export type { AnalyticsOpportunitySchedulerStore } from "./analytics-opportunity-scheduler-store.js";
export { createPostgresAnalyticsOpportunitySchedulerStore } from "./analytics-opportunity-scheduler-store.js";
export {
  createPostgresAnalyticsOpportunityEvaluator,
  evaluateAnalyticsDeployConversionOpportunities,
  evaluateAnalyticsFunnelDropoffOpportunities,
  evaluateAnalyticsIncidentImpactOpportunities,
  evaluateAnalyticsMarkerFrictionOpportunities,
  evaluateAnalyticsJourneyFrictionOpportunities,
  evaluateAnalyticsRouteExitOpportunities,
  resolveStaleAnalyticsOpportunities
} from "./analytics-opportunity-evaluator.js";
export type {
  AggregateAnalyticsEventsJob,
  AnalyticsIngestionPersistenceService,
  AnalyticsQueueClient
} from "./analytics-ingestion-jobs.js";
export type {
  ImprovementOpportunityKind,
  ImprovementOpportunityStatus,
  ImprovementOpportunitySeverity,
  ImprovementBundleTrigger,
  ProjectImprovementExecutionSettings,
  ImprovementOpportunityRecord,
  ImprovementEventReference,
  RecordRequestPatternInput,
  RecordRequestPatternResult,
  RecordWarningHotspotInput,
  RecordWarningHotspotResult,
  ReservedImprovementBundleGeneration,
  ImprovementOpportunityStore
} from "./improvement-opportunity-store.js";
export { createPostgresImprovementOpportunityStore } from "./improvement-opportunity-store.js";
export { createPostgresGitHubStore } from "./github-store.js";
export { createPostgresGitHubMarketplaceStore } from "./github-marketplace-store.js";
export { createIncidentLifecycleService } from "./incident-lifecycle-service.js";
export { createPostgresMetadataStore } from "./metadata-store.js";
export { createPostgresOperationalEmailDeliveryStore } from "./operational-email-delivery-store.js";
export type {
  AvailabilityCheckDailyRollupRecord,
  AvailabilityCheckHealthStatus,
  AvailabilityCheckRecord,
  AvailabilityCheckResultRecord,
  AvailabilityCheckStore,
  ClaimedAvailabilityCheck,
  RecordedAvailabilityCheckExecution
} from "./availability-check-store-types.js";
export { createPostgresAvailabilityCheckStore } from "./availability-check-store.js";
export {
  executeAvailabilityCheck,
  validateAvailabilityCheckDefinition,
  AvailabilityCheckValidationError
} from "./availability-check-executor.js";
export type { OrganizationPlanCleanupService } from "./plan-downgrade-cleanup.js";
export { createOrganizationPlanCleanupService } from "./plan-downgrade-cleanup.js";
export {
  isPlanDowngrade,
  normalizePlanForDowngradeAudit,
  recordPlanDowngradeCleanupAudit
} from "./plan-downgrade-audit.js";
export type { PlanDowngradeTriggerSource } from "./plan-downgrade-audit.js";
export { runInTransaction } from "./transaction.js";
export {
  getAllowanceLimitBehavior,
  getAllowanceMeterLabel,
  queueAllowanceLimitReachedNotification,
  queueAllowanceThresholdNotifications,
  queueRetentionRotationNotice
} from "./operational-email-notifications.js";
export { createPostgresRetentionStore, createRetentionCleanupService } from "./retention-store.js";
export type {
  SlackDestinationRecord,
  SlackDestinationSecretRecord,
  DeleteSlackDestinationResult,
  SlackDestinationStore
} from "./slack-destination-store.js";
export { createPostgresSlackDestinationStore } from "./slack-destination-store.js";
export { createPostgresWeeklyReportChannelStore } from "./weekly-report-channel-store.js";
export { createPostgresWeeklyReportDeliveryStore } from "./weekly-report-delivery-store.js";
export { createPostgresWebhookDeliveryStore } from "./webhook-delivery-store.js";
export { createRedisAuthRateLimiter } from "./auth-rate-limiter.js";
export { createRedisIncidentFrequencyCounter } from "./frequency-counter.js";
export { createRedisRequestAnomalyCounter } from "./frequency-counter.js";
export { createRedisIngestionRateLimiter } from "./ingestion-rate-limiter.js";
export {
  buildIngestionMetricBatch,
  countsTowardMonthlyIngestAllowance
} from "./ingestion-analytics.js";
export {
  createIngestionMetadataService,
  createMemberAuthService,
  createIngestionPersistenceService
} from "./ingestion-services.js";
export { createS3ObjectStoreClient } from "./s3-client.js";
export { buildGravatarAvatarUrl, importUserAvatarFromUrl } from "./user-avatar-service.js";
export { createRedisQueueClient } from "./redis-queue.js";
export {
  migrateStorageSchema,
  seedStorageMigrationLedgerForCurrentSchema,
  assertStorageSchemaMigrationsApplied,
  STORAGE_SCHEMA_MIGRATIONS
} from "./schema-migrations.js";
export {
  createAgentTokenStore,
  type AgentTokenStore,
  type AgentTokenRecord
} from "./agent-token-store.js";
