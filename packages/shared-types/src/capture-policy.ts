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

// ---------------------------------------------------------------------------
// Resolved Capture Policy (all controls have concrete values)
// ---------------------------------------------------------------------------

export interface ResolvedCapturePolicy {
  preset: CapturePreset;
  capture_logs: CaptureLogs;
  capture_request_events: CaptureRequestEvents;
  capture_breadcrumbs: CaptureBreadcrumbs;
  capture_probe_events: CaptureProbeEvents;
}

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
});

export type CapturePolicyUpdate = z.infer<typeof CapturePolicyUpdateSchema>;

// ---------------------------------------------------------------------------
// Preset Defaults — canonical preset → resolved control values
// ---------------------------------------------------------------------------

export const PRESET_DEFAULTS: Record<CapturePreset, Omit<ResolvedCapturePolicy, "preset">> = {
  minimal: {
    capture_logs: "error",
    capture_request_events: "off",
    capture_breadcrumbs: "local_only",
    capture_probe_events: "buffer_only",
  },
  balanced: {
    capture_logs: "warning",
    capture_request_events: "failures_only",
    capture_breadcrumbs: "exception_only",
    capture_probe_events: "buffer_only",
  },
  investigative: {
    capture_logs: "info",
    capture_request_events: "all",
    capture_breadcrumbs: "standalone",
    capture_probe_events: "standalone_when_activated",
  },
};

// ---------------------------------------------------------------------------
// Default preset per tier
// ---------------------------------------------------------------------------

export const DEFAULT_PRESET_BY_TIER: Record<string, CapturePreset> = {
  free: "minimal",
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
      if (policy.capture_request_events === "off") return false;
      if (policy.capture_request_events === "failures_only") {
        const status = typeof payload["response_status"] === "number" ? payload["response_status"] : 0;
        return status >= 400;
      }
      return true; // "filtered" | "all"
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
