import type {
  AnalyticsBundleAnalysisKind,
  AnalyticsBundleV1,
  ProjectColorTag
} from "../../../../packages/shared-types/src/index.js";
export type {
  AnalyticsBundleAnalysisKind,
  AnalyticsSavedFunnel,
  AnalyticsSavedFunnelCreate,
  AnalyticsSavedFunnelResponse,
  AnalyticsSavedFunnelsResponse,
  AnalyticsSavedFunnelStep,
  AnalyticsSavedFunnelUpdate
} from "../../../../packages/shared-types/src/index.js";

export type AnalyticsPrivacyMode = "strict" | "standard" | "custom";

export interface ProjectAnalyticsSettings {
  enabled: boolean;
  privacy_mode: AnalyticsPrivacyMode;
  consent_required: boolean;
  capture_page_views: boolean;
  capture_route_changes: boolean;
  capture_actions: boolean;
  capture_friction_signals: boolean;
  journey_sample_rate: number;
  raw_retention_days: number;
  sample_retention_days: number;
  hourly_retention_days: number;
  aggregate_retention_months: number;
  max_saved_funnels: number;
  max_custom_dimensions: number;
  approved_custom_dimensions: string[];
}

export interface ProjectAnalyticsSettingsResponse {
  access_mode: "manage" | "preview";
  analytics_available: boolean;
  settings: ProjectAnalyticsSettings;
}

export type ProjectAnalyticsSettingsUpdate = Partial<ProjectAnalyticsSettings>;

export interface AnalyticsMetricsQuery {
  last?: "7d" | "30d" | "90d";
  granularity?: "hour" | "day";
  service?: string;
  environment?: string;
  limit?: number;
}

export interface AnalyticsMetricsSegment {
  value: string;
  sessions: number;
  pageviews: number;
}

export interface ProjectAnalyticsMetricsWindow {
  project_id: string;
  from: string;
  to: string;
  granularity: "hour" | "day";
  service: string | null;
  environment: string | null;
}

export interface ProjectAnalyticsUsageSummaryResponse {
  summary: ProjectAnalyticsMetricsWindow & {
    sessions: number;
    pageviews: number;
    active_visitors: number;
    new_visitors: number;
    returning_visitors: number;
    exits: number;
    conversions: number;
  };
  breakdowns: {
    device_types: AnalyticsMetricsSegment[];
    browsers: AnalyticsMetricsSegment[];
    os: AnalyticsMetricsSegment[];
    languages: AnalyticsMetricsSegment[];
    referrers: AnalyticsMetricsSegment[];
    auth_states: AnalyticsMetricsSegment[];
  };
}

export interface ProjectAnalyticsRouteMetric {
  route_key: string;
  pageviews: number;
  unique_sessions: number;
  entrances: number;
  exits: number;
  bounces: number;
  linked_incident_sessions: number;
}

export interface ProjectAnalyticsRouteMetricsResponse {
  window: ProjectAnalyticsMetricsWindow;
  routes: ProjectAnalyticsRouteMetric[];
}

export interface ProjectAnalyticsDeviceMetricsResponse {
  window: ProjectAnalyticsMetricsWindow;
  device_types: AnalyticsMetricsSegment[];
  browsers: AnalyticsMetricsSegment[];
  os: AnalyticsMetricsSegment[];
  languages: AnalyticsMetricsSegment[];
}

export interface ProjectAnalyticsReferrerMetricsResponse {
  window: ProjectAnalyticsMetricsWindow;
  referrers: AnalyticsMetricsSegment[];
  utm_sources: AnalyticsMetricsSegment[];
  utm_mediums: AnalyticsMetricsSegment[];
  utm_campaigns: AnalyticsMetricsSegment[];
}

export interface ProjectAnalyticsFunnelMetric {
  funnel_key: string;
  sessions_entered: number;
  sessions_completed: number;
  dropoffs: number;
  conversion_rate: number;
}

export interface ProjectAnalyticsFunnelsResponse {
  window: ProjectAnalyticsMetricsWindow;
  funnels: ProjectAnalyticsFunnelMetric[];
}

export interface ProjectAnalyticsFunnelStepMetric {
  step_key: string;
  step_order: number;
  sessions_entered: number;
  sessions_completed: number;
  dropoffs: number;
  conversion_rate: number;
}

export interface ProjectAnalyticsFunnelAnalysisResponse {
  funnel: ProjectAnalyticsMetricsWindow & ProjectAnalyticsFunnelMetric;
  steps: ProjectAnalyticsFunnelStepMetric[];
}

export interface ProjectAnalyticsJourneyPattern {
  from_route_key: string;
  to_route_key: string;
  transition_count: number;
  unique_sessions: number;
  transition_share: number;
  sample_ids: string[];
}

export interface ProjectAnalyticsJourneyPatternsResponse {
  window: ProjectAnalyticsMetricsWindow;
  patterns: ProjectAnalyticsJourneyPattern[];
}

export interface ProjectAnalyticsIncidentImpactResponse {
  incident_id: string;
  window: ProjectAnalyticsMetricsWindow;
  affected_sessions: number;
  affected_routes: Array<{ route_key: string; affected_sessions: number }>;
  affected_funnels: Array<{ funnel_key: string; affected_sessions: number }>;
  top_device_types: Array<{ value: string; affected_sessions: number }>;
  top_browsers: Array<{ value: string; affected_sessions: number }>;
  journey_patterns: Array<{
    from_route_key: string;
    to_route_key: string;
    affected_sessions: number;
    sample_ids: string[];
  }>;
  conversion_delta: {
    availability: "available" | "unavailable";
    value: number | null;
    unit: "percentage_points";
  };
  analytics_bundle: {
    status: "not_requested" | AnalyticsBundleGenerationStatus;
    generation_id: string | null;
    failure_reason: string | null;
  };
}

export interface ProjectAnalyticsJourneySampleMetadata {
  sample_id: string;
  project_id: string;
  service: string | null;
  environment: string | null;
  session_id_hash: string;
  visitor_id_hash: string | null;
  analysis_tags: string[];
  first_seen_at: string;
  last_seen_at: string;
  dimensions_summary: Record<string, unknown>;
  has_artifact: boolean;
  expires_at: string;
  created_at: string;
}

export interface ProjectAnalyticsJourneySampleResponse {
  sample: ProjectAnalyticsJourneySampleMetadata;
  journey: Record<string, unknown>;
}

export type AnalyticsOpportunityKind =
  | "usage_summary"
  | "route_health"
  | "funnel_dropoff"
  | "journey_friction"
  | "feature_usage"
  | "incident_impact"
  | "deploy_comparison"
  | "conversion_path";

export interface AnalyticsOpportunityRecord {
  opportunity_id: string;
  project_id: string;
  project_name: string;
  project_color_tag: ProjectColorTag | null;
  service: string | null;
  environment: string | null;
  kind: AnalyticsOpportunityKind;
  status: "open" | "resolved" | "snoozed";
  severity: "low" | "medium" | "high";
  confidence: number;
  title: string;
  summary: string;
  evidence: Record<string, unknown>;
  related_incident_ids: string[];
  related_deploy_ids: string[];
  first_detected_at: string;
  last_detected_at: string;
  resolved_at: string | null;
  snoozed_until: string | null;
  bundle_generation_id: string | null;
  bundle_status: "not_requested" | "pending" | "running" | "completed" | "failed";
  bundle_created_at: string | null;
  bundle_updated_at: string | null;
  bundle_failure_reason: string | null;
}

export interface AnalyticsOpportunitiesListResponse {
  opportunities: AnalyticsOpportunityRecord[];
  next_cursor: string | null;
}

export interface AnalyticsOpportunityResponse {
  opportunity: AnalyticsOpportunityRecord;
}

export interface AnalyticsOpportunityInventoryQuery {
  projectId?: string;
  status?: AnalyticsOpportunityRecord["status"] | "all";
  kind?: AnalyticsOpportunityKind;
  service?: string;
  environment?: string;
  severity?: AnalyticsOpportunityRecord["severity"];
  bundleStatus?: AnalyticsOpportunityRecord["bundle_status"];
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

export type AnalyticsBundleGenerationStatus = "pending" | "running" | "completed" | "failed";

export interface AnalyticsBundleGenerationRecord {
  generation_id: string;
  project_id: string;
  project_name?: string;
  project_color_tag?: ProjectColorTag | null;
  opportunity_id: string | null;
  requested_by_user_id: string | null;
  analysis_kind: AnalyticsOpportunityKind;
  analysis_spec: Record<string, unknown>;
  input_fingerprint: string;
  status: AnalyticsBundleGenerationStatus;
  has_artifact: boolean;
  failure_reason: string | null;
  created_at: string;
  claimed_at: string | null;
  completed_at: string | null;
  updated_at: string;
}

export interface AnalyticsBundleGenerationsListResponse {
  bundles: AnalyticsBundleGenerationRecord[];
  next_cursor: string | null;
}

export interface AnalyticsBundleInventoryQuery {
  projectId?: string;
  status?: AnalyticsBundleGenerationStatus | "all";
  kind?: AnalyticsOpportunityKind;
  service?: string;
  environment?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

export type ProjectAnalyticsBundleResponse =
  | AnalyticsBundleV1
  | { status: "pending"; bundle_generation_id: string }
  | { status: "failed"; reason: string };

export interface ProjectAnalyticsBundleCreateInput {
  analysisKind: AnalyticsBundleAnalysisKind;
  opportunityId?: string;
  last?: "7d" | "30d" | "90d";
  from?: string;
  to?: string;
  funnel?: string;
  route?: string;
  incidentId?: string;
  deployId?: string;
  service?: string;
  environment?: string;
}

export interface ProjectAnalyticsBundleCreateResult {
  bundle: ProjectAnalyticsBundleResponse;
  generationId: string | null;
}
