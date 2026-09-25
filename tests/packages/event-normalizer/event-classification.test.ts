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

  it("keeps redirected Java stack continuations as context instead of separate incidents", () => {
    const lines = [
      "java.util.concurrent.ExecutionException: java.util.ConcurrentModificationException",
      ...Array.from({ length: 45 }, (_, index) => `    at example.ChartService.render(ChartService.java:${index + 10})`),
      "Caused by: java.util.ConcurrentModificationException",
      ...Array.from({ length: 46 }, (_, index) => `\tat example.ChartModel.read(ChartModel.java:${index + 20})`),
      "    ... 12 more"
    ];
    expect(lines).toHaveLength(94);
    expect(lines.map((message) => classifyEvent("log_event", "error", undefined, {
      message,
      attributes: { logger: "org.jboss.stdio" }
    }, "minimal", [], [], "java")).filter((result) => result === "incident_signal")).toHaveLength(1);
    expect(classifyEvent("log_event", "error", undefined, {
      message: "Caused by: java.lang.IllegalStateException",
      attributes: { throwable: { class: "java.lang.IllegalStateException" } }
    })).toBe("incident_signal");
  });

  it("does not demote an unrelated runtime's error merely because its message resembles a Java frame", () => {
    expect(classifyEvent("log_event", "error", undefined, {
      message: "at example.ChartService.render(ChartService.java:42)"
    }, "minimal", [], [], "node")).toBe("incident_signal");
  });

  it("keeps redirected Java cause and suppressed headers with diagnostic messages as context", () => {
    for (const logger of ["stderr", "org.jboss.stdio", "org.jboss.stdio.Stderr"]) {
      for (const message of [
        "Caused by: java.lang.IllegalStateException: database unavailable",
        "\tSuppressed: java.io.IOException: close failed",
        "Caused by: java.lang.IllegalArgumentException: bad input: expected a number"
      ]) {
        expect(classifyEvent("log_event", "error", undefined, {
          message,
          attributes: { logger }
        }, "minimal", [], [], "java")).toBe("context_signal");
        expect(classifyEvent("log_event", "error", undefined, {
          message,
          attributes: { logger: "com.example.Payments" }
        }, "minimal", [], [], "java")).toBe("incident_signal");
      }
    }
  });

  it("does not demote an application Java error that only resembles a stderr continuation", () => {
    for (const attributes of [{ logger: "com.example.Payments" }, { logger: "x".repeat(257) }, {}]) {
      expect(classifyEvent("log_event", "error", undefined, {
        message: "Caused by: java.lang.IllegalStateException",
        attributes
      }, "minimal", [], [], "java")).toBe("incident_signal");
    }
  });

  it("recognizes the supported Java stderr logger identities", () => {
    for (const logger of ["stderr", "org.jboss.stdio", "org.jboss.stdio.Stderr"]) {
      expect(classifyEvent("log_event", "error", undefined, {
        message: "\tat example.ChartService.render(ChartService.java:42)",
        attributes: { logger }
      }, "minimal", [], [], "java")).toBe("context_signal");
    }
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

  it("classifies 5xx request_event as incident_signal", () => {
    expect(classifyEvent("request_event", undefined, undefined, { response_status: 500 })).toBe("incident_signal");
    expect(classifyEvent("request_event", undefined, undefined, { response_status: 503 })).toBe("incident_signal");
  });

  it("classifies balanced request failure statuses below 500 as incident_signal", () => {
    expect(classifyEvent("request_event", undefined, undefined, { response_status: 429 }, "balanced")).toBe("incident_signal");
    expect(classifyEvent("request_event", undefined, undefined, { response_status: 408 }, "balanced")).toBe("incident_signal");
  });

  it("classifies investigative-only 409 request_event as incident_signal", () => {
    expect(classifyEvent("request_event", undefined, undefined, { response_status: 409 }, "investigative")).toBe("incident_signal");
  });

  it("classifies non-promoted request_event as context_signal", () => {
    expect(classifyEvent("request_event", undefined, undefined, { response_status: 429 }, "minimal")).toBe("context_signal");
    expect(classifyEvent("request_event", undefined, undefined, { response_status: 404 })).toBe("context_signal");
    expect(classifyEvent("request_event", undefined, undefined, { response_status: 409 }, "balanced")).toBe("context_signal");
    expect(classifyEvent("request_event", undefined, undefined, { response_status: 200 })).toBe("context_signal");
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
