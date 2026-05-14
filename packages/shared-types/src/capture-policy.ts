import { z } from "zod";

// ---------------------------------------------------------------------------
// Event Classification
// ---------------------------------------------------------------------------

export const EventClassValues = [
  "incident_signal",
  "context_signal",
  "operational_signal",
] as const;

export const EventClassSchema = z.enum(EventClassValues);
export type EventClass = z.infer<typeof EventClassSchema>;

// ---------------------------------------------------------------------------
// Capture Presets
// ---------------------------------------------------------------------------

export const CapturePresetValues = [
  "minimal",
  "balanced",
  "investigative",
] as const;

export const CapturePresetSchema = z.enum(CapturePresetValues);
export type CapturePreset = z.infer<typeof CapturePresetSchema>;

// ---------------------------------------------------------------------------
// Capture Control Enums
// ---------------------------------------------------------------------------

export const CaptureLogsValues = ["off", "error", "warning", "info"] as const;
export const CaptureLogsSchema = z.enum(CaptureLogsValues);
export type CaptureLogs = z.infer<typeof CaptureLogsSchema>;

export const CaptureRequestEventsValues = ["off", "failures_only", "filtered", "all"] as const;
export const CaptureRequestEventsSchema = z.enum(CaptureRequestEventsValues);
export type CaptureRequestEvents = z.infer<typeof CaptureRequestEventsSchema>;

export const CaptureBreadcrumbsValues = ["local_only", "exception_only", "standalone"] as const;
export const CaptureBreadcrumbsSchema = z.enum(CaptureBreadcrumbsValues);
export type CaptureBreadcrumbs = z.infer<typeof CaptureBreadcrumbsSchema>;

export const CaptureProbeEventsValues = ["buffer_only", "standalone_when_activated"] as const;
export const CaptureProbeEventsSchema = z.enum(CaptureProbeEventsValues);
export type CaptureProbeEvents = z.infer<typeof CaptureProbeEventsSchema>;

export const RequestSignalClassificationValues = ["incident_signal", "context_signal"] as const;
export const RequestSignalClassificationSchema = z.enum(RequestSignalClassificationValues);
export type RequestSignalClassification = z.infer<typeof RequestSignalClassificationSchema>;

export interface RequestAnomalyThreshold {
  minimum_occurrences_5m: number;
  minimum_ratio_5m_to_1h: number;
}

export const RECOMMENDED_IMMEDIATE_CLIENT_ERROR_STATUSES = [401, 403, 409, 422] as const;

const ImmediateClientErrorStatusSchema = z.number().int().min(400).max(499);

export function normalizeImmediateClientErrorStatuses(statuses: readonly number[]): number[] {
  return Array.from(new Set(statuses)).sort((left, right) => left - right);
}

export const ImmediateClientErrorStatusesSchema = z
  .array(ImmediateClientErrorStatusSchema)
  .max(12)
  .transform((statuses) => normalizeImmediateClientErrorStatuses(statuses));

// ---------------------------------------------------------------------------
// Resolved Capture Policy (all controls have concrete values)
// ---------------------------------------------------------------------------

export interface ResolvedCapturePolicy {
  preset: CapturePreset;
  capture_logs: CaptureLogs;
  capture_request_events: CaptureRequestEvents;
  capture_breadcrumbs: CaptureBreadcrumbs;
  capture_probe_events: CaptureProbeEvents;
  immediate_client_error_statuses: number[];
}

export const ResolvedCapturePolicySchema = z.object({
  preset: CapturePresetSchema,
  capture_logs: CaptureLogsSchema,
  capture_request_events: CaptureRequestEventsSchema,
  capture_breadcrumbs: CaptureBreadcrumbsSchema,
  capture_probe_events: CaptureProbeEventsSchema,
  immediate_client_error_statuses: ImmediateClientErrorStatusesSchema
});

export interface CapturePolicyOverrides {
  capture_logs: CaptureLogs | null;
  capture_request_events: CaptureRequestEvents | null;
  capture_breadcrumbs: CaptureBreadcrumbs | null;
  capture_probe_events: CaptureProbeEvents | null;
  immediate_client_error_statuses: number[] | null;
}

export const CapturePolicyOverridesSchema = z.object({
  capture_logs: CaptureLogsSchema.nullable(),
  capture_request_events: CaptureRequestEventsSchema.nullable(),
  capture_breadcrumbs: CaptureBreadcrumbsSchema.nullable(),
  capture_probe_events: CaptureProbeEventsSchema.nullable(),
  immediate_client_error_statuses: ImmediateClientErrorStatusesSchema.nullable()
});

export interface CapturePolicyResponse {
  policy: ResolvedCapturePolicy;
  overrides: CapturePolicyOverrides;
}

export const CapturePolicyResponseSchema = z.object({
  policy: ResolvedCapturePolicySchema,
  overrides: CapturePolicyOverridesSchema
});

// ---------------------------------------------------------------------------
// Capture Policy Record (DB row — overrides are nullable)
// ---------------------------------------------------------------------------

export const CapturePolicySchema = z.object({
  project_id: z.string().uuid(),
  preset: CapturePresetSchema,
  capture_logs: CaptureLogsSchema.nullable(),
  capture_request_events: CaptureRequestEventsSchema.nullable(),
  capture_breadcrumbs: CaptureBreadcrumbsSchema.nullable(),
  capture_probe_events: CaptureProbeEventsSchema.nullable(),
  immediate_client_error_statuses: ImmediateClientErrorStatusesSchema.nullable(),
  updated_at: z.string().datetime(),
});

export type CapturePolicyRecord = z.infer<typeof CapturePolicySchema>;

// ---------------------------------------------------------------------------
// Capture Policy Update Input (for PATCH)
// ---------------------------------------------------------------------------

export const CapturePolicyUpdateSchema = z.object({
  preset: CapturePresetSchema.optional(),
  capture_logs: CaptureLogsSchema.nullable().optional(),
  capture_request_events: CaptureRequestEventsSchema.nullable().optional(),
  capture_breadcrumbs: CaptureBreadcrumbsSchema.nullable().optional(),
  capture_probe_events: CaptureProbeEventsSchema.nullable().optional(),
  immediate_client_error_statuses: ImmediateClientErrorStatusesSchema.nullable().optional(),
});

export type CapturePolicyUpdate = z.infer<typeof CapturePolicyUpdateSchema>;

// ---------------------------------------------------------------------------
// Preset Defaults — canonical preset → resolved control values
// ---------------------------------------------------------------------------

export const PRESET_DEFAULTS: Record<CapturePreset, Omit<ResolvedCapturePolicy, "preset">> = {
  minimal: {
    capture_logs: "error",
    capture_request_events: "failures_only",
    capture_breadcrumbs: "local_only",
    capture_probe_events: "buffer_only",
    immediate_client_error_statuses: [],
  },
  balanced: {
    capture_logs: "warning",
    capture_request_events: "failures_only",
    capture_breadcrumbs: "exception_only",
    capture_probe_events: "buffer_only",
    immediate_client_error_statuses: [],
  },
  investigative: {
    capture_logs: "info",
    capture_request_events: "all",
    capture_breadcrumbs: "standalone",
    capture_probe_events: "standalone_when_activated",
    immediate_client_error_statuses: [...RECOMMENDED_IMMEDIATE_CLIENT_ERROR_STATUSES],
  },
};

// ---------------------------------------------------------------------------
// Default preset per tier
// ---------------------------------------------------------------------------

export const DEFAULT_PRESET_BY_TIER: Record<string, CapturePreset> = {
  free: "balanced",
  solo: "balanced",
  team: "balanced",
};

/**
 * Resolve a capture policy record into a fully-resolved policy.
 * Override columns win over preset defaults when non-null.
 */
export function resolvePolicy(record: CapturePolicyRecord): ResolvedCapturePolicy {
  const defaults = PRESET_DEFAULTS[record.preset];
  return {
    preset: record.preset,
    capture_logs: record.capture_logs ?? defaults.capture_logs,
    capture_request_events: record.capture_request_events ?? defaults.capture_request_events,
    capture_breadcrumbs: record.capture_breadcrumbs ?? defaults.capture_breadcrumbs,
    capture_probe_events: record.capture_probe_events ?? defaults.capture_probe_events,
    immediate_client_error_statuses: normalizeImmediateClientErrorStatuses(
      record.immediate_client_error_statuses ?? defaults.immediate_client_error_statuses
    ),
  };
}

export function getCapturePolicyOverrides(record: CapturePolicyRecord): CapturePolicyOverrides {
  return {
    capture_logs: record.capture_logs,
    capture_request_events: record.capture_request_events,
    capture_breadcrumbs: record.capture_breadcrumbs,
    capture_probe_events: record.capture_probe_events,
    immediate_client_error_statuses:
      record.immediate_client_error_statuses === null
        ? null
        : normalizeImmediateClientErrorStatuses(record.immediate_client_error_statuses)
  };
}

/**
 * Get the default preset for a plan string. Unknown plans fall back to "minimal".
 */
export function getDefaultPreset(plan: string | undefined): CapturePreset {
  if (plan !== undefined && plan in DEFAULT_PRESET_BY_TIER) {
    return DEFAULT_PRESET_BY_TIER[plan]!;
  }
  return "minimal";
}

// ---------------------------------------------------------------------------
// Server-Side Capture Policy Enforcement (INV-16)
// ---------------------------------------------------------------------------

const LOG_LEVEL_SEVERITY: Record<string, number> = {
  info: 0,
  warning: 1,
  error: 2,
  fatal: 3,
  critical: 3,
};

const CAPTURE_LOGS_THRESHOLD: Record<CaptureLogs, number | null> = {
  off: null,
  error: 2,
  warning: 1,
  info: 0,
};

const BALANCED_IMMEDIATE_REQUEST_STATUSES = new Set([408, 423, 424, 425, 429]);
const INVESTIGATIVE_IMMEDIATE_REQUEST_STATUSES = new Set([...BALANCED_IMMEDIATE_REQUEST_STATUSES, 409]);
const BALANCED_STANDARD_ANOMALY_STATUSES = new Set([401, 403, 404, 409, 422]);
const BALANCED_HIGH_VOLUME_ANOMALY_STATUSES = new Set([400, 410]);
const INVESTIGATIVE_ANOMALY_STATUSES = new Set([...BALANCED_STANDARD_ANOMALY_STATUSES, ...BALANCED_HIGH_VOLUME_ANOMALY_STATUSES]);

export function classifyRequestStatus(input: {
  responseStatus: number | null;
  capturePreset: CapturePreset;
  immediateClientErrorStatuses?: readonly number[];
}): RequestSignalClassification {
  const { responseStatus, capturePreset, immediateClientErrorStatuses = [] } = input;

  if (responseStatus === null || !Number.isFinite(responseStatus)) {
    return "context_signal";
  }

  if (responseStatus >= 500) {
    return "incident_signal";
  }

  if (immediateClientErrorStatuses.includes(responseStatus)) {
    return "incident_signal";
  }

  if (capturePreset === "investigative") {
    return INVESTIGATIVE_IMMEDIATE_REQUEST_STATUSES.has(responseStatus) ? "incident_signal" : "context_signal";
  }

  if (capturePreset === "balanced") {
    return BALANCED_IMMEDIATE_REQUEST_STATUSES.has(responseStatus) ? "incident_signal" : "context_signal";
  }

  return "context_signal";
}

export function isImmediateRequestIncident(input: {
  responseStatus: number | null;
  capturePreset: CapturePreset;
  immediateClientErrorStatuses?: readonly number[];
}): boolean {
  return classifyRequestStatus(input) === "incident_signal";
}

export function getRequestAnomalyThreshold(input: {
  responseStatus: number | null;
  capturePreset: CapturePreset;
}): RequestAnomalyThreshold | null {
  const { responseStatus, capturePreset } = input;

  if (responseStatus === null || !Number.isFinite(responseStatus) || responseStatus < 400 || responseStatus >= 500) {
    return null;
  }

  if (capturePreset === "minimal") {
    return null;
  }

  if (capturePreset === "investigative") {
    return INVESTIGATIVE_ANOMALY_STATUSES.has(responseStatus)
      ? {
          minimum_occurrences_5m: 8,
          minimum_ratio_5m_to_1h: 2.0
        }
      : null;
  }

  if (BALANCED_STANDARD_ANOMALY_STATUSES.has(responseStatus)) {
    return {
      minimum_occurrences_5m: 20,
      minimum_ratio_5m_to_1h: 3.0
    };
  }

  if (BALANCED_HIGH_VOLUME_ANOMALY_STATUSES.has(responseStatus)) {
    return {
      minimum_occurrences_5m: 50,
      minimum_ratio_5m_to_1h: 5.0
    };
  }

  return null;
}

/**
 * Determine whether a given event should be captured (accepted) under the
 * provided resolved capture policy.
 *
 * Returns `true` if the event should be persisted, `false` if it must
 * be rejected with `capture_policy_rejected`.
 *
 * Exceptions (backend_exception, frontend_exception), deploy_metadata,
 * and error_suppressed are always accepted regardless of policy.
 */
export function shouldCaptureEvent(
  policy: ResolvedCapturePolicy,
  eventType: string,
  payload: Record<string, unknown>,
): boolean {
  switch (eventType) {
    // Incident signals and operational metadata — always accepted
    case "backend_exception":
    case "frontend_exception":
    case "deploy_metadata":
    case "error_suppressed":
      return true;

    case "log_event": {
      const threshold = CAPTURE_LOGS_THRESHOLD[policy.capture_logs];
      if (threshold === null) return false; // "off"
      const level = typeof payload["level"] === "string" ? payload["level"] : "";
      const severity = LOG_LEVEL_SEVERITY[level] ?? 0;
      return severity >= threshold;
    }

    case "request_event": {
      const status = typeof payload["response_status"] === "number" ? payload["response_status"] : null;
      if (
        isImmediateRequestIncident({
          responseStatus: status,
          capturePreset: policy.preset,
          immediateClientErrorStatuses: policy.immediate_client_error_statuses
        })
      ) {
        return true;
      }
      if (policy.capture_request_events === "off") return false;
      if (policy.capture_request_events === "failures_only") {
        return getRequestAnomalyThreshold({ responseStatus: status, capturePreset: policy.preset }) !== null;
      }
      if (policy.capture_request_events === "filtered") {
        return false;
      }
      return true; // "all"
    }

    case "frontend_breadcrumb":
      return policy.capture_breadcrumbs === "standalone";

    case "probe_event":
      return policy.capture_probe_events === "standalone_when_activated";

    default:
      // Unknown event types — accept to avoid silent drops
      return true;
  }
}
