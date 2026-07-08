import {
  ANALYTICS_BUNDLE_SCHEMA_VERSION,
  AnalyticsBundleV1Schema,
  type AnalyticsBundleAnalysisKind,
  type AnalyticsBundleConfidence,
  type AnalyticsBundleGranularity,
  type AnalyticsBundleSeverity,
  type AnalyticsBundleV1
} from "../../shared-types/src/index.js";

export interface AnalyticsBundleBuildInput {
  analysis_kind: AnalyticsBundleAnalysisKind;
  input_fingerprint: string;
  project: {
    project_id: string;
    service: string | null;
    environment: string | null;
  };
  analysis_window: {
    from: string;
    to: string;
    granularity: AnalyticsBundleGranularity;
  };
  summary: {
    title: string;
    description: string;
    confidence: AnalyticsBundleConfidence;
    severity: AnalyticsBundleSeverity;
  };
  metrics: {
    sessions_analyzed: number;
    affected_sessions: number | null;
    baseline?: Record<string, unknown> | undefined;
    current?: Record<string, unknown> | undefined;
  };
  segments?: Array<Record<string, unknown>> | undefined;
  journey_patterns?: Array<Record<string, unknown>> | undefined;
  representative_journeys?: Array<Record<string, unknown>> | undefined;
  linked_incidents?: Array<Record<string, unknown>> | undefined;
  linked_deploys?: Array<Record<string, unknown>> | undefined;
  recommendations?: Array<Record<string, unknown>> | undefined;
  redaction?: {
    rules_applied?: string[] | undefined;
    omitted_fields?: string[] | undefined;
  } | undefined;
}

type JsonLikeRecord = Record<string, unknown>;

const RECORD_LIMITS = {
  segments: 100,
  journey_patterns: 100,
  representative_journeys: 25,
  linked_incidents: 100,
  linked_deploys: 50,
  recommendations: 50
} as const;

const DEFAULT_OMITTED_FIELDS = [
  "form_values",
  "raw_click_text",
  "raw_dom_snapshot",
  "raw_url_query",
  "precise_coordinates",
  "raw_ip_address",
  "user_text"
] as const;

export function buildAnalyticsBundle(input: AnalyticsBundleBuildInput): AnalyticsBundleV1 {
  const bundle = {
    schema_version: ANALYTICS_BUNDLE_SCHEMA_VERSION,
    bundle_type: "analytics",
    analysis_kind: input.analysis_kind,
    project: {
      project_id: input.project.project_id,
      service: input.project.service,
      environment: input.project.environment
    },
    analysis_window: {
      from: toIsoTimestamp(input.analysis_window.from),
      to: toIsoTimestamp(input.analysis_window.to),
      granularity: input.analysis_window.granularity
    },
    summary: {
      title: input.summary.title,
      description: input.summary.description,
      confidence: input.summary.confidence,
      severity: input.summary.severity
    },
    metrics: {
      sessions_analyzed: input.metrics.sessions_analyzed,
      affected_sessions: input.metrics.affected_sessions,
      baseline: normalizeRecord(input.metrics.baseline ?? {}),
      current: normalizeRecord(input.metrics.current ?? {})
    },
    segments: normalizeRecordArray(input.segments ?? [], RECORD_LIMITS.segments),
    journey_patterns: normalizeRecordArray(input.journey_patterns ?? [], RECORD_LIMITS.journey_patterns),
    representative_journeys: normalizeRecordArray(
      input.representative_journeys ?? [],
      RECORD_LIMITS.representative_journeys
    ),
    linked_incidents: normalizeRecordArray(input.linked_incidents ?? [], RECORD_LIMITS.linked_incidents),
    linked_deploys: normalizeRecordArray(input.linked_deploys ?? [], RECORD_LIMITS.linked_deploys),
    recommendations: normalizeRecordArray(
      input.recommendations ?? buildDefaultRecommendations(input.analysis_kind),
      RECORD_LIMITS.recommendations
    ),
    redaction: {
      rules_applied: normalizeStringArray(input.redaction?.rules_applied ?? ["analytics-bundle-default-redaction"], 50),
      omitted_fields: normalizeStringArray(input.redaction?.omitted_fields ?? [...DEFAULT_OMITTED_FIELDS], 100)
    },
    metadata: {
      input_fingerprint: input.input_fingerprint
    }
  } satisfies AnalyticsBundleV1;

  return AnalyticsBundleV1Schema.parse(bundle);
}

export function stableSerializeAnalyticsBundle(value: unknown): string {
  return stableSerialize(normalizeJsonValue(value));
}

function buildDefaultRecommendations(analysisKind: AnalyticsBundleAnalysisKind): Array<Record<string, unknown>> {
  if (analysisKind === "funnel_dropoff") {
    return [
      {
        priority: 1,
        action: "inspect_highest_dropoff_step",
        rationale: "Compare the affected funnel step across device, referrer, and route segments before changing the flow."
      }
    ];
  }

  if (analysisKind === "journey_friction") {
    return [
      {
        priority: 1,
        action: "inspect_repeated_route_loops",
        rationale: "Review repeated route transitions and add clearer navigation or recovery paths where users loop."
      }
    ];
  }

  if (analysisKind === "incident_impact") {
    return [
      {
        priority: 1,
        action: "prioritize_incidents_by_affected_sessions",
        rationale: "Fix incidents that overlap with material user sessions or conversion paths first."
      }
    ];
  }

  return [
    {
      priority: 1,
      action: "review_analytics_evidence",
      rationale: "Use the aggregate metrics and representative journeys to choose the smallest product improvement."
    }
  ];
}

function normalizeRecordArray(records: Array<Record<string, unknown>>, limit: number): JsonLikeRecord[] {
  return records
    .map((record) => normalizeRecord(record))
    .sort((left, right) => stableSerialize(left).localeCompare(stableSerialize(right)))
    .slice(0, limit);
}

function normalizeRecord(record: Record<string, unknown>): JsonLikeRecord {
  const normalized = normalizeJsonValue(record);
  return isRecord(normalized) ? normalized : {};
}

function normalizeJsonValue(value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeJsonValue(item))
      .filter((item) => item !== undefined);
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, normalizeJsonValue(entryValue)])
        .filter(([, entryValue]) => entryValue !== undefined)
    );
  }

  return value;
}

function normalizeStringArray(values: string[], limit: number): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))]
    .sort((left, right) => left.localeCompare(right))
    .slice(0, limit);
}

function stableSerialize(value: unknown): string {
  if (value === undefined) {
    return "null";
  }

  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableSerialize(entryValue)}`).join(",")}}`;
}

function toIsoTimestamp(value: string): string {
  return new Date(value).toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
