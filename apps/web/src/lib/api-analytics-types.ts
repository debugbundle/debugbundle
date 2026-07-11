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
  project_color_tag: string | null;
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
