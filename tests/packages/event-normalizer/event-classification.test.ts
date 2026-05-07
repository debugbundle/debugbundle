import { describe, expect, it } from "vitest";

import { classifyEvent } from "../../../packages/event-normalizer/src/index.js";

describe("classifyEvent", () => {
  it("classifies backend_exception as incident_signal", () => {
    expect(classifyEvent("backend_exception")).toBe("incident_signal");
  });

  it("classifies frontend_exception as incident_signal", () => {
    expect(classifyEvent("frontend_exception")).toBe("incident_signal");
  });

  it("classifies error-level log_event as incident_signal", () => {
    expect(classifyEvent("log_event", "error")).toBe("incident_signal");
  });

  it("classifies fatal-level log_event as incident_signal", () => {
    expect(classifyEvent("log_event", "fatal")).toBe("incident_signal");
  });

  it("classifies critical-level log_event as incident_signal", () => {
    expect(classifyEvent("log_event", "critical")).toBe("incident_signal");
  });

  it("classifies warning-level log_event as context_signal", () => {
    expect(classifyEvent("log_event", "warning")).toBe("context_signal");
  });

  it("classifies info-level log_event as context_signal", () => {
    expect(classifyEvent("log_event", "info")).toBe("context_signal");
  });

  it("classifies log_event with no level as context_signal", () => {
    expect(classifyEvent("log_event")).toBe("context_signal");
  });

  it("classifies request_event as context_signal", () => {
    expect(classifyEvent("request_event")).toBe("context_signal");
  });

  it("classifies frontend_breadcrumb as context_signal", () => {
    expect(classifyEvent("frontend_breadcrumb")).toBe("context_signal");
  });

  it("classifies deploy_metadata as context_signal", () => {
    expect(classifyEvent("deploy_metadata")).toBe("context_signal");
  });

  it("classifies error_suppressed as operational_signal", () => {
    expect(classifyEvent("error_suppressed")).toBe("operational_signal");
  });

  it("classifies probe_event without activation_id as context_signal (error-flush)", () => {
    expect(classifyEvent("probe_event", undefined, null)).toBe("context_signal");
  });

  it("classifies probe_event with activation_id as operational_signal (standalone)", () => {
    expect(classifyEvent("probe_event", undefined, "00000000-0000-4000-8000-000000000001")).toBe("operational_signal");
  });

  it("returns context_signal for unknown event types as safe default", () => {
    expect(classifyEvent("unknown_type" as never)).toBe("context_signal");
  });
});
