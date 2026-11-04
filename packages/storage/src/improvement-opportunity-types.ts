import type {
  EventEnvelope,
  ImprovementBundleSensitivity,
  TierName
} from "../../shared-types/src/index.js";
import type { AccountAnalyticsStore } from "./account-analytics-store.js";
import type {
  ImprovementRetrievalRecord,
  ImprovementsCursor,
  RetainedBundleOwnerReference,
  ReopenImprovementForOrganizationInput,
  ResolveImprovementForOrganizationInput,
  SnoozeImprovementForOrganizationInput
} from "./types.js";

export type ImprovementOpportunityKind =
  | "warning_hotspot"
  | "slow_request"
  | "request_failure_pattern"
  | "recurring_incident"
  | "post_deploy_regression";
export type ImprovementOpportunityStatus = "open" | "resolved" | "snoozed";
export type ImprovementOpportunitySeverity = "low" | "medium" | "high" | "critical";
export type ImprovementBundleTrigger = "occurrence_threshold";

export interface ProjectImprovementExecutionSettings {
  plan: TierName;
  automated_improvement_bundles_enabled: boolean;
  improvement_bundle_sensitivity: ImprovementBundleSensitivity;
}

export interface ImprovementOpportunityRecord {
  opportunity_id: string;
  project_id: string;
  project_slug: string;
  service_id: string | null;
  service_name: string;
  service_runtime: string | null;
  service_framework: string | null;
  environment: string;
  kind: ImprovementOpportunityKind;
  status: ImprovementOpportunityStatus;
  severity: ImprovementOpportunitySeverity;
  confidence: number;
  fingerprint: string;
  title: string;
  summary: string;
  occurrence_count: number;
  evidence: Record<string, unknown>;
  related_incident_ids: string[];
  first_detected_at: string;
  last_detected_at: string;
  last_source_event_id: string | null;
  bundle_generation_number: number;
  bundle_created_at: string | null;
  bundle_updated_at: string | null;
  bundle_source_event_id: string | null;
  bundle_failure_reason: string | null;
}

export interface ImprovementEventReference {
  event_id: string;
  event_type: EventEnvelope["event_type"];
  occurred_at: string;
}

export interface RecordWarningHotspotInput {
  project_id: string;
  service_name: string;
  environment: string;
  normalized_message: string;
  source_event_id: string;
  occurred_at: string;
  severity: ImprovementOpportunitySeverity;
  confidence: number;
  threshold: number;
}

export interface RecordWarningHotspotResult {
  opportunity_id: string;
  occurrence_count: number;
  bundle_generation_number: number;
  should_generate_bundle: boolean;
}

export interface RecordRequestPatternInput {
  project_id: string;
  kind: "slow_request" | "request_failure_pattern";
  service_name: string;
  environment: string;
  route_template: string;
  http_method: string;
  response_status: number;
  duration_ms: number;
  source_event_id: string;
  occurred_at: string;
  severity: ImprovementOpportunitySeverity;
  confidence: number;
  threshold: number;
  slow_request_duration_threshold_ms?: number;
}

export interface RecordRequestPatternResult {
  opportunity_id: string;
  occurrence_count: number;
  bundle_generation_number: number;
  should_generate_bundle: boolean;
}

export interface RecordIncidentPatternInput {
  project_id: string;
  kind: "recurring_incident" | "post_deploy_regression";
  service_name: string;
  environment: string;
  incident_id: string;
  incident_title: string;
  incident_occurrence_count: number;
  incident_severity: ImprovementOpportunitySeverity;
  source_event_id: string;
  source_event_type: EventEnvelope["event_type"];
  occurred_at: string;
  confidence: number;
  threshold: number;
  regression_deploy?: {
    deployment_id: string;
    commit_sha: string | null;
    version: string | null;
    branch: string | null;
    deployed_at: string;
    minutes_since_deploy: number;
  } | null;
}

export interface RecordIncidentPatternResult {
  opportunity_id: string;
  occurrence_count: number;
  bundle_generation_number: number;
  should_generate_bundle: boolean;
}

export type PostgresImprovementOpportunityStoreOptions = {
  accountAnalyticsStore?: AccountAnalyticsStore;
};

export interface ReservedImprovementBundleGeneration {
  generation_number: number;
  created_at: string;
  updated_at: string;
  source_event_id: string;
  source_occurred_at: string;
  trigger: ImprovementBundleTrigger;
}

export interface ImprovementOpportunityStore {
  getImprovementExecutionSettings(
    projectId: string
  ): Promise<ProjectImprovementExecutionSettings | null>;
  recordWarningHotspot(
    input: RecordWarningHotspotInput
  ): Promise<RecordWarningHotspotResult | null>;
  recordRequestPattern(
    input: RecordRequestPatternInput
  ): Promise<RecordRequestPatternResult | null>;
  recordIncidentPattern?(
    input: RecordIncidentPatternInput
  ): Promise<RecordIncidentPatternResult | null>;
  listImprovementsForOrganization(input: {
    organization_id: string;
    user_id?: string;
    project_id?: string;
    origin_project_ids?: string[];
    environment?: string;
    service?: string;
    status?: ImprovementOpportunityStatus;
    severity?: ImprovementOpportunitySeverity;
    kind?: ImprovementOpportunityKind;
    cursor?: ImprovementsCursor;
    limit: number;
  }): Promise<ImprovementRetrievalRecord[]>;
  getImprovementForOrganization(input: {
    organization_id: string;
    improvement_id: string;
    user_id?: string;
    project_id?: string;
    origin_project_ids?: string[];
  }): Promise<ImprovementRetrievalRecord | null>;
  resolveImprovementForOrganization(
    input: ResolveImprovementForOrganizationInput
  ): Promise<ImprovementRetrievalRecord | null>;
  resolveIncidentDerivedImprovementsForIncident?(input: {
    organization_id: string;
    incident_id: string;
    resolved_by_member_id: string;
    resolved_at: string;
  }): Promise<number>;
  reopenImprovementForOrganization(
    input: ReopenImprovementForOrganizationInput
  ): Promise<ImprovementRetrievalRecord | null>;
  snoozeImprovementForOrganization?(
    input: SnoozeImprovementForOrganizationInput
  ): Promise<ImprovementRetrievalRecord | null>;
  getImprovementBundleBuildContext(input: {
    project_id: string;
    opportunity_id: string;
  }): Promise<ImprovementOpportunityRecord | null>;
  listImprovementEventReferences(input: {
    opportunity_id: string;
    limit: number;
  }): Promise<ImprovementEventReference[]>;
  hasImprovementBundleGenerationForSourceEvent(input: {
    opportunity_id: string;
    event_id: string;
  }): Promise<boolean>;
  reserveImprovementBundleGeneration(input: {
    opportunity_id: string;
    event_id: string;
    occurred_at: string;
    trigger: ImprovementBundleTrigger;
  }): Promise<ReservedImprovementBundleGeneration>;
  markImprovementBundleGenerationFailure(input: {
    opportunity_id: string;
    reason: string | null;
  }): Promise<void>;
  pruneRetainedBundleOwnersForProject(input: {
    project_id: string;
    retained_bundle_limit: number;
  }): Promise<RetainedBundleOwnerReference[]>;
}
