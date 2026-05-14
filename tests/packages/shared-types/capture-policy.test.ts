import { describe, expect, it } from "vitest";

import {
  EventClassSchema,
  EventClassValues,
  CapturePresetSchema,
  CapturePresetValues,
  CapturePolicySchema,
  CapturePolicyResponseSchema,
  CapturePolicyUpdateSchema,
  PRESET_DEFAULTS,
  RECOMMENDED_IMMEDIATE_CLIENT_ERROR_STATUSES,
  getRequestAnomalyThreshold,
  getCapturePolicyOverrides,
  classifyRequestStatus,
  normalizeImmediateClientErrorStatuses,
  resolvePolicy,
  getDefaultPreset,
  shouldCaptureEvent,
  type CapturePolicyRecord,
  type ResolvedCapturePolicy,
} from "../../../packages/shared-types/src/capture-policy.ts";

describe("event class", () => {
  it("defines three event classes", () => {
    expect(EventClassValues).toEqual(["incident_signal", "context_signal", "operational_signal"]);
  });

  it("validates valid event class values", () => {
    expect(EventClassSchema.safeParse("incident_signal").success).toBe(true);
    expect(EventClassSchema.safeParse("context_signal").success).toBe(true);
    expect(EventClassSchema.safeParse("operational_signal").success).toBe(true);
  });

  it("rejects invalid event class values", () => {
    expect(EventClassSchema.safeParse("unknown").success).toBe(false);
    expect(EventClassSchema.safeParse("").success).toBe(false);
  });
});

describe("capture preset", () => {
  it("defines three presets", () => {
    expect(CapturePresetValues).toEqual(["minimal", "balanced", "investigative"]);
  });

  it("validates valid preset values", () => {
    for (const preset of CapturePresetValues) {
      expect(CapturePresetSchema.safeParse(preset).success).toBe(true);
    }
  });

  it("rejects invalid preset values", () => {
    expect(CapturePresetSchema.safeParse("custom").success).toBe(false);
  });
});

describe("preset defaults", () => {
  it("defines defaults for all three presets", () => {
    expect(Object.keys(PRESET_DEFAULTS)).toEqual(["minimal", "balanced", "investigative"]);
  });

  it("minimal preset captures incident signals and buffers probes", () => {
    expect(PRESET_DEFAULTS.minimal).toEqual({
      capture_logs: "error",
      capture_request_events: "failures_only",
      capture_breadcrumbs: "local_only",
      capture_probe_events: "buffer_only",
      immediate_client_error_statuses: [],
    });
  });

  it("balanced preset captures warnings and failure requests", () => {
    expect(PRESET_DEFAULTS.balanced).toEqual({
      capture_logs: "warning",
      capture_request_events: "failures_only",
      capture_breadcrumbs: "exception_only",
      capture_probe_events: "buffer_only",
      immediate_client_error_statuses: [],
    });
  });

  it("investigative preset captures everything", () => {
    expect(PRESET_DEFAULTS.investigative).toEqual({
      capture_logs: "info",
      capture_request_events: "all",
      capture_breadcrumbs: "standalone",
      capture_probe_events: "standalone_when_activated",
      immediate_client_error_statuses: [...RECOMMENDED_IMMEDIATE_CLIENT_ERROR_STATUSES],
    });
  });
});

describe("capture policy schema", () => {
  const validRecord: CapturePolicyRecord = {
    project_id: "00000000-0000-4000-8000-000000000001",
    preset: "balanced",
    capture_logs: null,
    capture_request_events: null,
    capture_breadcrumbs: null,
    capture_probe_events: null,
    immediate_client_error_statuses: null,
    updated_at: "2026-03-19T00:00:00Z",
  };

  it("accepts a valid record with null overrides", () => {
    expect(CapturePolicySchema.safeParse(validRecord).success).toBe(true);
  });

  it("accepts a record with explicit overrides", () => {
    const withOverrides = {
      ...validRecord,
      capture_logs: "info",
      capture_request_events: "all",
      immediate_client_error_statuses: [422, 401, 422]
    };
    expect(CapturePolicySchema.safeParse(withOverrides).success).toBe(true);
  });

  it("rejects invalid preset", () => {
    const bad = { ...validRecord, preset: "custom" };
    expect(CapturePolicySchema.safeParse(bad).success).toBe(false);
  });

  it("rejects invalid override value", () => {
    const bad = { ...validRecord, capture_logs: "debug" };
    expect(CapturePolicySchema.safeParse(bad).success).toBe(false);
  });
});

describe("capture policy update schema", () => {
  it("accepts empty update (no fields)", () => {
    expect(CapturePolicyUpdateSchema.safeParse({}).success).toBe(true);
  });

  it("accepts preset-only update", () => {
    expect(CapturePolicyUpdateSchema.safeParse({ preset: "investigative" }).success).toBe(true);
  });

  it("accepts override-only update with null (clear override)", () => {
    expect(CapturePolicyUpdateSchema.safeParse({ capture_logs: null }).success).toBe(true);
  });

  it("normalizes client error status overrides", () => {
    const parsed = CapturePolicyUpdateSchema.parse({
      immediate_client_error_statuses: [422, 401, 422, 409]
    });

    expect(parsed.immediate_client_error_statuses).toEqual([401, 409, 422]);
  });

  it("rejects invalid values", () => {
    expect(CapturePolicyUpdateSchema.safeParse({ preset: "custom" }).success).toBe(false);
    expect(CapturePolicyUpdateSchema.safeParse({ immediate_client_error_statuses: [399] }).success).toBe(false);
  });
});

describe("resolvePolicy", () => {
  it("uses preset defaults when all overrides are null", () => {
    const record: CapturePolicyRecord = {
      project_id: "00000000-0000-4000-8000-000000000001",
      preset: "minimal",
      capture_logs: null,
      capture_request_events: null,
      capture_breadcrumbs: null,
      capture_probe_events: null,
      immediate_client_error_statuses: null,
      updated_at: "2026-03-19T00:00:00Z",
    };
    expect(resolvePolicy(record)).toEqual({
      preset: "minimal",
      ...PRESET_DEFAULTS.minimal,
    });
  });

  it("overrides take precedence over preset defaults", () => {
    const record: CapturePolicyRecord = {
      project_id: "00000000-0000-4000-8000-000000000001",
      preset: "minimal",
      capture_logs: "info",
      capture_request_events: "all",
      capture_breadcrumbs: null,
      capture_probe_events: null,
      immediate_client_error_statuses: [422, 403],
      updated_at: "2026-03-19T00:00:00Z",
    };
    const resolved = resolvePolicy(record);
    expect(resolved.capture_logs).toBe("info");
    expect(resolved.capture_request_events).toBe("all");
    expect(resolved.immediate_client_error_statuses).toEqual([403, 422]);
    // These should still come from preset defaults
    expect(resolved.capture_breadcrumbs).toBe("local_only");
    expect(resolved.capture_probe_events).toBe("buffer_only");
  });
});

describe("capture policy response schema", () => {
  it("accepts resolved policy plus raw overrides", () => {
    expect(CapturePolicyResponseSchema.safeParse({
      policy: {
        preset: "investigative",
        capture_logs: "info",
        capture_request_events: "all",
        capture_breadcrumbs: "standalone",
        capture_probe_events: "standalone_when_activated",
        immediate_client_error_statuses: [...RECOMMENDED_IMMEDIATE_CLIENT_ERROR_STATUSES]
      },
      overrides: {
        capture_logs: null,
        capture_request_events: null,
        capture_breadcrumbs: null,
        capture_probe_events: null,
        immediate_client_error_statuses: null
      }
    }).success).toBe(true);
  });
});

describe("client error status helpers", () => {
  it("normalizes immediate client error statuses", () => {
    expect(normalizeImmediateClientErrorStatuses([422, 401, 422, 409])).toEqual([401, 409, 422]);
  });

  it("returns raw capture policy overrides without coercing null", () => {
    const record: CapturePolicyRecord = {
      project_id: "00000000-0000-4000-8000-000000000001",
      preset: "balanced",
      capture_logs: null,
      capture_request_events: null,
      capture_breadcrumbs: null,
      capture_probe_events: null,
      immediate_client_error_statuses: [],
      updated_at: "2026-03-19T00:00:00Z",
    };

    expect(getCapturePolicyOverrides(record)).toEqual({
      capture_logs: null,
      capture_request_events: null,
      capture_breadcrumbs: null,
      capture_probe_events: null,
      immediate_client_error_statuses: []
    });
  });
});

describe("getDefaultPreset", () => {
  it("returns minimal for free tier", () => {
    expect(getDefaultPreset("free")).toBe("minimal");
  });

  it("returns balanced for solo tier", () => {
    expect(getDefaultPreset("solo")).toBe("balanced");
  });

  it("returns balanced for team tier", () => {
    expect(getDefaultPreset("team")).toBe("balanced");
  });

  it("returns minimal for unknown plan", () => {
    expect(getDefaultPreset("enterprise")).toBe("minimal");
  });

  it("returns minimal for undefined plan", () => {
    expect(getDefaultPreset(undefined)).toBe("minimal");
  });
});

describe("getRequestAnomalyThreshold", () => {
  it("returns no anomaly threshold for minimal preset contextual failures", () => {
    expect(getRequestAnomalyThreshold({ responseStatus: 404, capturePreset: "minimal" })).toBeNull();
  });

  it("returns the balanced threshold for repeated 404 request failures", () => {
    expect(getRequestAnomalyThreshold({ responseStatus: 404, capturePreset: "balanced" })).toEqual({
      minimum_occurrences_5m: 20,
      minimum_ratio_5m_to_1h: 3
    });
  });

  it("returns the higher balanced threshold for common 400-class volume", () => {
    expect(getRequestAnomalyThreshold({ responseStatus: 400, capturePreset: "balanced" })).toEqual({
      minimum_occurrences_5m: 50,
      minimum_ratio_5m_to_1h: 5
    });
  });

  it("returns the investigative threshold for repeated 409 request failures", () => {
    expect(getRequestAnomalyThreshold({ responseStatus: 409, capturePreset: "investigative" })).toEqual({
      minimum_occurrences_5m: 8,
      minimum_ratio_5m_to_1h: 2
    });
  });
});

describe("classifyRequestStatus", () => {
  it("treats configured client error statuses as immediate incidents", () => {
    expect(
      classifyRequestStatus({
        responseStatus: 403,
        capturePreset: "minimal",
        immediateClientErrorStatuses: [401, 403, 422]
      })
    ).toBe("incident_signal");
  });
});

describe("shouldCaptureEvent", () => {
  const minimal: ResolvedCapturePolicy = { preset: "minimal", ...PRESET_DEFAULTS.minimal };
  const balanced: ResolvedCapturePolicy = { preset: "balanced", ...PRESET_DEFAULTS.balanced };
  const investigative: ResolvedCapturePolicy = { preset: "investigative", ...PRESET_DEFAULTS.investigative };

  it("always accepts exceptions regardless of policy", () => {
    expect(shouldCaptureEvent(minimal, "backend_exception", {})).toBe(true);
    expect(shouldCaptureEvent(minimal, "frontend_exception", {})).toBe(true);
  });

  it("always accepts deploy_metadata and error_suppressed", () => {
    expect(shouldCaptureEvent(minimal, "deploy_metadata", {})).toBe(true);
    expect(shouldCaptureEvent(minimal, "error_suppressed", {})).toBe(true);
  });

  it("rejects all log_event when capture_logs is off", () => {
    const policy: ResolvedCapturePolicy = { ...minimal, capture_logs: "off" };
    expect(shouldCaptureEvent(policy, "log_event", { level: "error" })).toBe(false);
    expect(shouldCaptureEvent(policy, "log_event", { level: "info" })).toBe(false);
  });

  it("accepts only error/fatal/critical logs when capture_logs is error", () => {
    // minimal preset has capture_logs: "error"
    expect(shouldCaptureEvent(minimal, "log_event", { level: "error" })).toBe(true);
    expect(shouldCaptureEvent(minimal, "log_event", { level: "fatal" })).toBe(true);
    expect(shouldCaptureEvent(minimal, "log_event", { level: "critical" })).toBe(true);
    expect(shouldCaptureEvent(minimal, "log_event", { level: "warning" })).toBe(false);
    expect(shouldCaptureEvent(minimal, "log_event", { level: "info" })).toBe(false);
  });

  it("accepts warning and above logs when capture_logs is warning", () => {
    // balanced preset has capture_logs: "warning"
    expect(shouldCaptureEvent(balanced, "log_event", { level: "error" })).toBe(true);
    expect(shouldCaptureEvent(balanced, "log_event", { level: "warning" })).toBe(true);
    expect(shouldCaptureEvent(balanced, "log_event", { level: "info" })).toBe(false);
  });

  it("accepts all logs when capture_logs is info", () => {
    // investigative preset has capture_logs: "info"
    expect(shouldCaptureEvent(investigative, "log_event", { level: "info" })).toBe(true);
    expect(shouldCaptureEvent(investigative, "log_event", { level: "debug" })).toBe(true);
  });

  it("accepts selected client error incidents even when request events are otherwise off", () => {
    const policy: ResolvedCapturePolicy = {
      ...minimal,
      capture_request_events: "off",
      immediate_client_error_statuses: [403]
    };

    expect(shouldCaptureEvent(policy, "request_event", { response_status: 403 })).toBe(true);
  });

  it("always accepts immediate request incident statuses on minimal", () => {
    expect(shouldCaptureEvent({ ...minimal, capture_request_events: "off" }, "request_event", { response_status: 500 })).toBe(true);
    expect(shouldCaptureEvent({ ...minimal, capture_request_events: "off" }, "request_event", { response_status: 503 })).toBe(true);
    expect(shouldCaptureEvent({ ...minimal, capture_request_events: "off" }, "request_event", { response_status: 429 })).toBe(false);
    expect(shouldCaptureEvent(minimal, "request_event", { response_status: 200 })).toBe(false);
  });

  it("accepts balanced immediate request incident statuses even when capture_request_events is failures_only", () => {
    // balanced preset has capture_request_events: "failures_only"
    expect(shouldCaptureEvent(balanced, "request_event", { response_status: 500 })).toBe(true);
    expect(shouldCaptureEvent(balanced, "request_event", { response_status: 429 })).toBe(true);
    expect(shouldCaptureEvent(balanced, "request_event", { response_status: 408 })).toBe(true);
    expect(shouldCaptureEvent(balanced, "request_event", { response_status: 404 })).toBe(true);
    expect(shouldCaptureEvent(balanced, "request_event", { response_status: 409 })).toBe(true);
    expect(shouldCaptureEvent(balanced, "request_event", { response_status: 400 })).toBe(true);
    expect(shouldCaptureEvent(balanced, "request_event", { response_status: 200 })).toBe(false);
    expect(shouldCaptureEvent(balanced, "request_event", { response_status: 302 })).toBe(false);
  });

  it("treats filtered request_event capture as server-failed only until filters exist", () => {
    const filtered = { ...balanced, capture_request_events: "filtered" as const };

    expect(shouldCaptureEvent(filtered, "request_event", { response_status: 500 })).toBe(true);
    expect(shouldCaptureEvent(filtered, "request_event", { response_status: 404 })).toBe(false);
    expect(shouldCaptureEvent(filtered, "request_event", { response_status: 200 })).toBe(false);
  });

  it("accepts all requests when capture_request_events is all", () => {
    // investigative preset has capture_request_events: "all"
    expect(shouldCaptureEvent(investigative, "request_event", { response_status: 200 })).toBe(true);
    expect(shouldCaptureEvent(investigative, "request_event", { response_status: 500 })).toBe(true);
    expect(shouldCaptureEvent(investigative, "request_event", { response_status: 409 })).toBe(true);
  });

  it("rejects standalone breadcrumbs when capture_breadcrumbs is local_only", () => {
    // minimal preset has capture_breadcrumbs: "local_only"
    expect(shouldCaptureEvent(minimal, "frontend_breadcrumb", {})).toBe(false);
  });

  it("rejects standalone breadcrumbs when capture_breadcrumbs is exception_only", () => {
    // balanced preset has capture_breadcrumbs: "exception_only"
    expect(shouldCaptureEvent(balanced, "frontend_breadcrumb", {})).toBe(false);
  });

  it("accepts standalone breadcrumbs when capture_breadcrumbs is standalone", () => {
    // investigative preset has capture_breadcrumbs: "standalone"
    expect(shouldCaptureEvent(investigative, "frontend_breadcrumb", {})).toBe(true);
  });

  it("rejects standalone probe_event when capture_probe_events is buffer_only", () => {
    // minimal and balanced presets have capture_probe_events: "buffer_only"
    expect(shouldCaptureEvent(minimal, "probe_event", {})).toBe(false);
    expect(shouldCaptureEvent(balanced, "probe_event", {})).toBe(false);
  });

  it("accepts standalone probe_event when capture_probe_events is standalone_when_activated", () => {
    // investigative preset has capture_probe_events: "standalone_when_activated"
    expect(shouldCaptureEvent(investigative, "probe_event", {})).toBe(true);
  });

  it("accepts unknown event types by default", () => {
    expect(shouldCaptureEvent(minimal, "custom_event", {})).toBe(true);
  });
});
